import mongoose from 'mongoose'
import { logAudit } from '../services/auditService.js'
import {
  changeTestimonialStatus,
  createGuardianTestimonial,
  listGuardianTestimonials,
  createTestimonial,
  deleteTestimonial,
  getAdminTestimonial,
  listAdminTestimonials,
  listPublicTestimonials,
  updateTestimonial,
} from '../services/testimonialService.js'

const validId = (id) => mongoose.isValidObjectId(id)

export async function publicListTestimonials(req, res, next) {
  try {
    const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit, 10) || 12))
    const items = await listPublicTestimonials({ limit })
    return res.json({ success: true, data: items })
  } catch (error) { next(error) }
}

export async function adminListTestimonials(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const result = await listAdminTestimonials({ page, limit, status: req.query.status, search: String(req.query.search || '') })
    return res.json({ success: true, ...result })
  } catch (error) { next(error) }
}

export async function adminGetTestimonial(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do depoimento inválido.' })
    const item = await getAdminTestimonial(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Depoimento não encontrado.' })
    return res.json({ success: true, data: item })
  } catch (error) { next(error) }
}

export async function adminCreateTestimonial(req, res, next) {
  try {
    const item = await createTestimonial({ body: req.body, adminId: req.admin._id })
    await logAudit({ req, action: 'testimonial.created', entity: 'testimonial', entityId: item._id, description: 'Depoimento cadastrado.', metadata: { pet: item.pet, rating: item.rating } })
    return res.status(201).json({ success: true, message: 'Depoimento cadastrado como pendente.', data: await getAdminTestimonial(item._id) })
  } catch (error) { next(error) }
}

export async function adminUpdateTestimonial(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do depoimento inválido.' })
    const item = await updateTestimonial({ id: req.params.id, body: req.body, adminId: req.admin._id })
    if (!item) return res.status(404).json({ success: false, message: 'Depoimento não encontrado.' })
    await logAudit({ req, action: 'testimonial.updated', entity: 'testimonial', entityId: item._id, description: 'Depoimento atualizado.' })
    return res.json({ success: true, message: 'Depoimento atualizado.', data: item })
  } catch (error) { next(error) }
}

export async function adminChangeTestimonialStatus(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do depoimento inválido.' })
    const item = await changeTestimonialStatus({ id: req.params.id, status: req.body.status, adminId: req.admin._id })
    if (!item) return res.status(404).json({ success: false, message: 'Depoimento não encontrado.' })
    await logAudit({ req, action: `testimonial.status.${item.status}`, entity: 'testimonial', entityId: item._id, description: `Status do depoimento alterado para ${item.status}.`, metadata: { status: item.status } })
    return res.json({ success: true, message: 'Status do depoimento atualizado.', data: item })
  } catch (error) { next(error) }
}

export async function adminDeleteTestimonial(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do depoimento inválido.' })
    const item = await deleteTestimonial(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Depoimento não encontrado.' })
    await logAudit({ req, action: 'testimonial.deleted', entity: 'testimonial', entityId: item._id, description: 'Depoimento excluído.' })
    return res.json({ success: true, message: 'Depoimento excluído.' })
  } catch (error) { next(error) }
}


export async function guardianListTestimonials(req, res, next) {
  try {
    const items = await listGuardianTestimonials(req.guardian._id)
    return res.json({ success: true, data: items })
  } catch (error) { next(error) }
}

export async function guardianCreateTestimonial(req, res, next) {
  try {
    const item = await createGuardianTestimonial({
      guardianId: req.guardian._id,
      body: req.body,
    })
    return res.status(201).json({
      success: true,
      message: 'Depoimento enviado para análise. Assim que for aprovado, poderá aparecer no site.',
      data: item,
    })
  } catch (error) { next(error) }
}
