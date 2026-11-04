import { ZodError } from 'zod'
import { petRegistrationSchema } from '../validators/petRegistration.validator.js'
import { registerPet } from '../services/petRegistrationService.js'
import { cloudinary } from '../middlewares/petVaccinationUpload.js'
import { notifyAdminRoles } from '../services/notificationService.js'
import Guardian from '../models/Guardian.js'
import { sendPetRegistrationReceivedEmail, sendAdminNewPetRegistrationEmail } from '../services/communicationService.js'

async function removeUploadedFiles(files = []) {
  await Promise.allSettled(
    files.map((file) =>
      cloudinary.uploader.destroy(file.filename, {
        resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'image',
      }),
    ),
  )
}

export async function createPetRegistration(req, res, next) {
  const uploadedFiles = [
    ...(req.files?.vaccinationCards || []),
    ...(req.files?.avatar || []),
  ]

  try {
    let payload

    try {
      payload =
        typeof req.body.payload === 'string'
          ? JSON.parse(req.body.payload)
          : req.body.payload
    } catch {
      await removeUploadedFiles(uploadedFiles)
      return res.status(400).json({
        success: false,
        message: 'O conteúdo do cadastro não está em um formato JSON válido.',
      })
    }

    if (!payload || typeof payload !== 'object') {
      await removeUploadedFiles(uploadedFiles)
      return res.status(400).json({
        success: false,
        message: 'Os dados do cadastro não foram enviados.',
      })
    }

    const validation = petRegistrationSchema.safeParse(payload)

    if (!validation.success) {
      await removeUploadedFiles(uploadedFiles)

      return res.status(400).json({
        success: false,
        message: 'Verifique os dados informados.',
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const vaccinationFiles = req.files?.vaccinationCards || []
    const avatarFile = req.files?.avatar?.[0] || null

    if (vaccinationFiles.length === 0) {
      await removeUploadedFiles(uploadedFiles)
      return res.status(400).json({
        success: false,
        message: 'Anexe a carteira de vacinação do seu pet.',
      })
    }

    const { guardian, pet } = validation.data

    const vaccinationCards = vaccinationFiles.map((file) => ({
      url: file.path,
      publicId: file.filename,
      resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image',
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }))

    const createdPet = await registerPet({
      guardian,
      pet: {
        ...pet,
        vaccinationCards,
        avatar: avatarFile
          ? { url: avatarFile.path, publicId: avatarFile.filename }
          : undefined,
      },
    })

    await notifyAdminRoles({
      roles: ['admin', 'manager'],
      title: 'Novo pet aguardando análise',
      message: `${createdPet.name} foi cadastrado e está aguardando avaliação.`,
      type: 'new_pet',
      entityType: 'pet',
      entityId: createdPet._id,
      link: `/admin/cadastros/${createdPet._id}`,
      dedupeKey: `pet:new:${createdPet._id}`,
    }).catch((notificationError) => {
      console.error('[NOTIFICATIONS] Não foi possível notificar a equipe:', notificationError.message)
    })

    // E-mails são enviados em segundo plano lógico: falhas de comunicação não desfazem o cadastro.
    const savedGuardian = await Guardian.findById(createdPet.guardian).select('name email')
    if (savedGuardian) {
      await Promise.allSettled([
        sendPetRegistrationReceivedEmail({ pet: createdPet, guardian: savedGuardian }),
        sendAdminNewPetRegistrationEmail({ pet: createdPet, guardian: savedGuardian }),
      ])
    }

    return res.status(201).json({
      success: true,
      message: 'Cadastro recebido com sucesso! Aguarde a análise da equipe.',
      data: {
        registrationId: createdPet._id,
        petName: createdPet.name,
        status: createdPet.status,
      },
    })
  } catch (error) {
    await removeUploadedFiles(uploadedFiles)

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          'Já existe um cadastro com esse CPF. Entre em contato com a equipe.',
      })
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos.',
      })
    }

    next(error)
  }
}
