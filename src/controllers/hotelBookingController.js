import mongoose from 'mongoose'
import { hotelBookingSchema } from '../validators/hotelBooking.validator.js'
import { createHotelBooking, listHotelBookings } from '../services/hotelBookingService.js'
import HotelBooking from '../models/HotelBooking.js'
import { cloudinary } from '../middlewares/petVaccinationUpload.js'
import { notifyAdminRoles } from '../services/notificationService.js'

export async function submitHotelBooking(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : []
  let persisted = false
  const cleanup = async () => Promise.allSettled(files.map((file) => cloudinary.uploader.destroy(file.filename, { resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'image' })))
  try {
    let raw
    try {
      raw = typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body.payload
    } catch {
      await cleanup()
      return res.status(400).json({ success: false, message: 'O formulário contém JSON inválido.' })
    }
    const parsed = hotelBookingSchema.safeParse(raw)
    if (!parsed.success) {
      await cleanup()
      return res.status(400).json({
        success: false,
        message: 'Verifique os dados informados.',
        errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      })
    }
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'Anexe a carteira de vacinação do pet.' })
    }

    const uploadedCards = files.map((file) => ({
      url: file.path,
      publicId: file.filename,
      resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image',
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }))
    const { booking, guardian } = await createHotelBooking({ payload: parsed.data, uploadedCards })
    persisted = true

    await notifyAdminRoles({
      roles: ['admin', 'manager'],
      title: 'Nova solicitação de hospedagem',
      message: `${booking.petSnapshot.name} — solicitação recebida para análise.`,
      type: 'hotel_booking',
      entityType: 'hotel_booking',
      entityId: booking._id,
      link: `/admin/hotel/${booking._id}`,
      dedupeKey: `hotel:booking:${booking._id}`,
    }).catch((error) => console.error('[NOTIFICATIONS] Falha ao notificar hospedagem:', error.message))

    return res.status(201).json({
      success: true,
      message: 'Solicitação de hospedagem enviada. Aguarde a confirmação da equipe.',
      data: { bookingId: booking._id, status: booking.status, guardianId: guardian._id },
    })
  } catch (error) {
    if (!persisted) await cleanup()
    next(error)
  }
}

export async function adminListHotelBookings(req, res, next) {
  try {
    const allowed = ['pending', 'approved', 'rejected', 'cancelled', 'completed']
    const status = req.query.status
    if (status && !allowed.includes(status)) return res.status(400).json({ success: false, message: 'Filtro de status inválido.' })
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10))
    const result = await listHotelBookings({ status, page, limit })
    return res.json({ success: true, data: result.items, pagination: result.pagination })
  } catch (error) { next(error) }
}


export async function adminGetHotelBooking(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'ID da hospedagem inválido.' })
    const booking = await HotelBooking.findById(req.params.id)
      .populate('guardian', 'name email phone cpf rg address')
      .populate('pet', 'name breed avatar sex neutered')
      .populate('reviewedBy', 'name email role')
      .lean()
    if (!booking) return res.status(404).json({ success: false, message: 'Hospedagem não encontrada.' })
    return res.json({ success: true, data: booking })
  } catch (error) { next(error) }
}

export async function adminUpdateHotelBooking(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'ID da hospedagem inválido.' })
    const { status, adminNotes } = req.body
    const allowed = ['pending', 'approved', 'rejected', 'cancelled', 'completed']
    if (status !== undefined && !allowed.includes(status)) return res.status(400).json({ success: false, message: 'Status inválido.' })
    if (adminNotes !== undefined && (typeof adminNotes !== 'string' || adminNotes.length > 2000)) return res.status(400).json({ success: false, message: 'Observação inválida.' })

    const booking = await HotelBooking.findById(req.params.id)
    if (!booking) return res.status(404).json({ success: false, message: 'Solicitação não encontrada.' })
    if (status !== undefined) {
      booking.status = status
      if (status !== 'pending') {
        booking.reviewedBy = req.admin._id
        booking.reviewedAt = new Date()
      }
    }
    if (adminNotes !== undefined) booking.adminNotes = adminNotes.trim()
    await booking.save()

    return res.json({ success: true, message: 'Solicitação atualizada.', data: booking })
  } catch (error) { next(error) }
}
