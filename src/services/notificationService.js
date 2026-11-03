import Admin from '../models/Admin.js'
import AdminNotification from '../models/AdminNotification.js'
import { emitToAdmin } from '../config/socket.js'
import { sendPushToRoles } from './pushService.js'

export async function notifyAdminRoles({ roles = ['admin', 'manager'], title, message, type = 'system', entityType = 'system', entityId = null, link = '/admin/notificacoes', dedupeKey = '' }) {
  const recipients = await Admin.find({ role: { $in: roles }, isActive: true }).select('_id role')
  const notifications = []

  for (const recipient of recipients) {
    try {
      const notification = await AdminNotification.create({
        recipient: recipient._id,
        title,
        message,
        type,
        entityType,
        entityId,
        link,
        dedupeKey: dedupeKey ? `${dedupeKey}:${recipient._id}` : undefined,
      })
      notifications.push(notification)
      emitToAdmin(recipient._id.toString(), 'admin:notification', notification.toObject())
    } catch (error) {
      if (error.code !== 11000) throw error
    }
  }

  await sendPushToRoles(roles, { title, body: message, url: link, type, entityId: entityId?.toString?.() || '' })
  return notifications
}
