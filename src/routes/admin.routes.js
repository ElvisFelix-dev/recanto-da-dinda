import { Router } from 'express'
import { authAdmin } from '../middlewares/authAdmin.js'
import { requireRole } from '../middlewares/requireRole.js'
import { uploadPetAvatar } from '../middlewares/uploadPetAvatar.js'

import {
  listRegistrations,
  getRegistrationDetails,
  changeRegistrationStatus,
  listGuardianPets,
  updatePetAvatar,
  removePetAvatar,
} from '../controllers/adminPetController.js'
import {
  listAdmins,
  createAdminUser,
  updateAdminUser,
  changeAdminPassword,
} from '../controllers/adminUserController.js'
import { getAuditLogs } from '../controllers/adminAuditController.js'
import { listNotifications, markNotificationRead, markAllNotificationsRead, getPushPublicKey, subscribePush, unsubscribePush } from '../controllers/adminNotificationController.js'
import { getPetCommunications, sendApprovalWhatsApp } from '../controllers/adminCommunicationController.js'
import {
  getReportOverview,
  exportRegistrationsCsv,
} from '../controllers/adminReportController.js'

const router = Router()

router.use(authAdmin)

// Notificações administrativas e push.
router.get('/notifications', listNotifications)
router.patch('/notifications/read-all', markAllNotificationsRead)
router.patch('/notifications/:id/read', markNotificationRead)
router.get('/notifications/push/public-key', getPushPublicKey)
router.post('/notifications/push/subscribe', subscribePush)
router.delete('/notifications/push/subscribe', unsubscribePush)

// Comunicação com tutores.
router.get('/pet-registrations/:id/communications', getPetCommunications)
router.post('/pet-registrations/:id/whatsapp-approval', sendApprovalWhatsApp)

// Gestão de cadastros e pets: administrador e gerente.
router.get('/pet-registrations', listRegistrations)
router.get('/pet-registrations/:id', getRegistrationDetails)
router.patch('/pet-registrations/:id/status', changeRegistrationStatus)
router.get('/guardians/:id/pets', listGuardianPets)
router.patch('/pets/:id/avatar', uploadPetAvatar, updatePetAvatar)
router.delete('/pets/:id/avatar', removePetAvatar)

// Gestão de usuários: somente administrador.
router.get('/users', requireRole('admin'), listAdmins)
router.post('/users', requireRole('admin'), createAdminUser)
router.patch('/users/:id', requireRole('admin'), updateAdminUser)
router.patch('/users/:id/password', requireRole('admin'), changeAdminPassword)

// Auditoria: somente administrador.
router.get('/activity', requireRole('admin'), getAuditLogs)

// Relatórios: administrador e gerente.
router.get('/reports/overview', requireRole('admin', 'manager'), getReportOverview)
router.get('/reports/registrations.csv', requireRole('admin', 'manager'), exportRegistrationsCsv)

export default router
