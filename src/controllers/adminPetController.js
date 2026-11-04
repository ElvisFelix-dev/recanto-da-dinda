import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import { logAudit } from '../services/auditService.js'
import { deleteCloudinaryAsset, uploadPetAvatarFile } from '../services/cloudinaryService.js'
import { sendPetStatusEmail } from '../services/communicationService.js'
import { notifyAdminRoles } from '../services/notificationService.js'

import {
  listPetRegistrations,
  getPetRegistrationById,
  updatePetRegistrationStatus,
  getGuardianPets,
} from '../services/adminPetService.js'

const allowedStatuses = ['pending_review', 'approved', 'rejected']

export async function listRegistrations(req, res, next) {
  try {
    const status = req.query.status
    const search = String(req.query.search || '').trim()

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    )

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Filtro de status inválido.',
      })
    }

    const result = await listPetRegistrations({
      status,
      search,
      page,
      limit,
    })

    return res.json({
      success: true,
      data: result.registrations,
      pagination: result.pagination,
    })
  } catch (error) {
    next(error)
  }
}

export async function getRegistrationDetails(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID do cadastro inválido.',
      })
    }

    const registration = await getPetRegistrationById(req.params.id)

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Cadastro não encontrado.',
      })
    }

    return res.json({
      success: true,
      data: registration,
    })
  } catch (error) {
    next(error)
  }
}

export async function changeRegistrationStatus(req, res, next) {
  try {
    const { status, notes = '' } = req.body

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID do cadastro inválido.',
      })
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status informado é inválido.',
      })
    }

    if (typeof notes !== 'string' || notes.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Observação inválida ou muito longa.',
      })
    }

    if (status === 'rejected' && !notes.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Informe o motivo da rejeição.',
      })
    }

    const previousPet = await Pet.findById(req.params.id).select('status name')
    if (!previousPet) {
      return res.status(404).json({
        success: false,
        message: 'Cadastro não encontrado.',
      })
    }
    const previousStatus = previousPet.status
    const statusChanged = previousStatus !== status

    console.info(
      `[PET STATUS] Solicitação recebida. pet=${req.params.id} de=${previousStatus} para=${status} admin=${req.admin?._id || 'n/a'}`,
    )

    const registration = await updatePetRegistrationStatus({
      petId: req.params.id,
      status,
      notes: notes.trim(),
      adminId: req.admin._id,
    })

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Cadastro não encontrado.',
      })
    }

    await logAudit({
      req,
      action: `pet.status.${status}`,
      entity: 'pet',
      entityId: registration._id,
      description: `Status do pet ${registration.name} alterado para ${status}.`,
      metadata: { status, notes: notes.trim() },
    })

    let communication = null
    if (statusChanged && (status === 'approved' || status === 'rejected')) {
      console.info(`[PET STATUS] Status alterado. Iniciando e-mail de ${status} para pet=${registration._id}.`)
      try {
        const petWithGuardian = await Pet.findById(registration._id)
          .populate('guardian', 'name email phone whatsappConsent')

        if (!petWithGuardian) {
          throw new Error('Pet não encontrado após atualização do status.')
        }

        communication = await sendPetStatusEmail({
          pet: petWithGuardian,
          guardian: petWithGuardian.guardian,
          status,
          notes: notes.trim(),
        })
        console.info(`[PET STATUS] Resultado do e-mail. pet=${registration._id} status=${communication?.status || 'unknown'}${communication?.reason ? ` motivo=${communication.reason}` : ''}`)
      } catch (emailError) {
        communication = { status: 'failed', reason: emailError.message }
        console.error(`[PET STATUS] Falha inesperada na comunicação por e-mail. pet=${registration._id}:`, emailError)
      }

      await notifyAdminRoles({
        roles: ['admin', 'manager'],
        title: status === 'approved' ? 'Cadastro aprovado' : 'Cadastro reprovado',
        message: `O cadastro de ${registration.name} foi ${status === 'approved' ? 'aprovado' : 'reprovado'}.`,
        type: status === 'approved' ? 'pet_approved' : 'pet_rejected',
        entityType: 'pet',
        entityId: registration._id,
        link: `/admin/cadastros/${registration._id}`,
        dedupeKey: `pet:${registration._id}:status:${status}:${registration.reviewedAt?.getTime?.() || Date.now()}`,
      }).catch((notificationError) => console.error('[NOTIFICATIONS] Falha ao notificar status:', notificationError.message))
    } else if (!statusChanged) {
      console.info(`[PET STATUS] Nenhuma mudança de status detectada. E-mail não reenviado. pet=${registration._id} status=${status}`)
    }

    return res.json({
      success: true,
      message: 'Status atualizado com sucesso.',
      data: {
        id: registration._id,
        status: registration.status,
        reviewedAt: registration.reviewedAt,
        communication,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function listGuardianPets(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID do tutor inválido.',
      })
    }

    const result = await getGuardianPets(req.params.id)

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Tutor não encontrado.',
      })
    }

    return res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}


export async function updatePetAvatar(req, res, next) {
  let uploadedAvatar = null

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID do pet inválido.' })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Selecione uma foto para o pet.' })
    }

    const pet = await Pet.findById(req.params.id)
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet não encontrado.' })
    }

    uploadedAvatar = await uploadPetAvatarFile(req.file)
    const previousAvatar = pet.avatar?.publicId

    pet.avatar = uploadedAvatar
    await pet.save()

    if (previousAvatar) {
      await deleteCloudinaryAsset(previousAvatar).catch((error) => {
        console.error('[CLOUDINARY] Não foi possível remover avatar anterior:', error.message)
      })
    }

    await logAudit({
      req,
      action: 'pet.avatar.updated',
      entity: 'pet',
      entityId: pet._id,
      description: `Foto do pet ${pet.name} atualizada.`,
    })

    return res.json({
      success: true,
      message: 'Foto do pet atualizada com sucesso.',
      data: { id: pet._id, avatar: pet.avatar },
    })
  } catch (error) {
    if (uploadedAvatar?.publicId) {
      await deleteCloudinaryAsset(uploadedAvatar.publicId).catch(() => {})
    }
    return next(error)
  }
}

export async function removePetAvatar(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID do pet inválido.' })
    }

    const pet = await Pet.findById(req.params.id)
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet não encontrado.' })
    }

    const previousPublicId = pet.avatar?.publicId
    pet.avatar = { url: '', publicId: '' }
    await pet.save()

    if (previousPublicId) {
      await deleteCloudinaryAsset(previousPublicId).catch((error) => {
        console.error('[CLOUDINARY] Não foi possível remover avatar:', error.message)
      })
    }

    await logAudit({
      req,
      action: 'pet.avatar.removed',
      entity: 'pet',
      entityId: pet._id,
      description: `Foto do pet ${pet.name} removida.`,
    })

    return res.json({
      success: true,
      message: 'Foto do pet removida com sucesso.',
      data: { id: pet._id, avatar: pet.avatar },
    })
  } catch (error) {
    return next(error)
  }
}
