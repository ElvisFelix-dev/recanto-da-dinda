import mongoose from 'mongoose'
import AdminNotification from '../models/AdminNotification.js'
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from '../services/pushService.js'

export async function listNotifications(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const filter = { recipient: req.admin._id }
    if (req.query.unread === 'true') filter.readAt = null

    const [items, unreadCount, total] = await Promise.all([
      AdminNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AdminNotification.countDocuments({ recipient: req.admin._id, readAt: null }),
      AdminNotification.countDocuments(filter),
    ])

    return res.json({ success: true, data: items, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) { return next(error) }
}

export async function markNotificationRead(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Notificação inválida.' })
    const item = await AdminNotification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.admin._id },
      { $set: { readAt: new Date() } },
      { new: true },
    )
    if (!item) return res.status(404).json({ success: false, message: 'Notificação não encontrada.' })
    return res.json({ success: true, data: item })
  } catch (error) { return next(error) }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    await AdminNotification.updateMany({ recipient: req.admin._id, readAt: null }, { $set: { readAt: new Date() } })
    return res.json({ success: true, message: 'Notificações marcadas como lidas.' })
  } catch (error) { return next(error) }
}

export async function getPushPublicKey(req, res) {
  return res.json({ success: true, data: { publicKey: getVapidPublicKey(), enabled: Boolean(getVapidPublicKey()) } })
}

export async function subscribePush(req, res, next) {
  try {
    await savePushSubscription(req.admin._id, req.body?.subscription, req.headers['user-agent'] || '')
    return res.status(201).json({ success: true, message: 'Este dispositivo receberá notificações push.' })
  } catch (error) { return res.status(400).json({ success: false, message: error.message || 'Não foi possível ativar as notificações.' }) }
}

export async function unsubscribePush(req, res, next) {
  try {
    await removePushSubscription(req.admin._id, req.body?.endpoint)
    return res.json({ success: true, message: 'Notificações push desativadas neste dispositivo.' })
  } catch (error) { return next(error) }
}
