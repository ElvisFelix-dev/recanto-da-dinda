import webpush from 'web-push'
import Admin from '../models/Admin.js'
import PushSubscription from '../models/PushSubscription.js'

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return true
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidConfigured = true
  return true
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || ''
}

export async function savePushSubscription(adminId, subscription, userAgent = '') {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Assinatura push inválida.')
  }

  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        admin: adminId,
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: subscription.keys,
        userAgent: String(userAgent).slice(0, 500),
      },
    },
    { upsert: true, new: true, runValidators: true },
  )
}

export async function removePushSubscription(adminId, endpoint) {
  if (endpoint) return PushSubscription.deleteOne({ admin: adminId, endpoint })
  return PushSubscription.deleteMany({ admin: adminId })
}

export async function sendPushToRoles(roles, payload) {
  if (!configureVapid()) return { sent: 0, skipped: true }

  const admins = await Admin.find({ role: { $in: roles }, isActive: true }).select('_id')
  const adminIds = admins.map((admin) => admin._id)
  if (!adminIds.length) return { sent: 0 }

  const subscriptions = await PushSubscription.find({ admin: { $in: adminIds } })
  let sent = 0

  await Promise.all(subscriptions.map(async (item) => {
    try {
      await webpush.sendNotification(
        { endpoint: item.endpoint, expirationTime: item.expirationTime, keys: item.keys },
        JSON.stringify(payload),
        { TTL: 60 * 60 },
      )
      sent += 1
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: item._id })
      } else {
        console.error('[WEB PUSH] Falha no envio:', error.message)
      }
    }
  }))

  return { sent }
}
