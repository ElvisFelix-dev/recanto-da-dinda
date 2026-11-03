import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import { logAudit } from '../services/auditService.js'
import { listPetCommunications, sendPetApprovalWhatsApp } from '../services/communicationService.js'

export async function getPetCommunications(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do pet inválido.' })
    const exists = await Pet.exists({ _id: req.params.id })
    if (!exists) return res.status(404).json({ success: false, message: 'Pet não encontrado.' })
    const data = await listPetCommunications(req.params.id)
    return res.json({ success: true, data })
  } catch (error) { return next(error) }
}

export async function sendApprovalWhatsApp(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'ID do pet inválido.' })
    const pet = await Pet.findById(req.params.id).populate('guardian', 'name email phone whatsappConsent')
    if (!pet) return res.status(404).json({ success: false, message: 'Pet não encontrado.' })
    if (pet.status !== 'approved') return res.status(409).json({ success: false, message: 'O WhatsApp de aprovação só pode ser enviado após a aprovação do pet.' })

    const result = await sendPetApprovalWhatsApp({ pet, guardian: pet.guardian, adminId: req.admin._id })
    await logAudit({
      req,
      action: 'communication.whatsapp.approval.sent',
      entity: 'pet',
      entityId: pet._id,
      description: `Mensagem de aprovação enviada pelo WhatsApp para ${pet.name}.`,
      metadata: { providerMessageId: result.messageId || '' },
    })
    return res.json({ success: true, message: 'Mensagem de aprovação enviada pelo WhatsApp.', data: result })
  } catch (error) {
    const statusCode = error.message?.includes('autorizou') ? 403 : error.message?.includes('Configure') ? 503 : 400
    return res.status(statusCode).json({ success: false, message: error.message || 'Não foi possível enviar a mensagem.' })
  }
}
