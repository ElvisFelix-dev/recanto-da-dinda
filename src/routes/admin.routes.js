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
import { adminGetHotelBooking, adminListHotelBookings, adminUpdateHotelBooking } from '../controllers/hotelBookingController.js'
import { checkInPet, checkOutPet, listAttendance, listAttendanceRoster, checkInPetsBatch, checkOutAttendanceBatch } from '../controllers/attendanceController.js'
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

// Gestão de hospedagens e frequência: administrador e gerente.
router.get('/hotel/bookings', requireRole('admin', 'manager'), adminListHotelBookings)
router.get('/hotel/bookings/:id', requireRole('admin', 'manager'), adminGetHotelBooking)
router.patch('/hotel/bookings/:id/status', requireRole('admin', 'manager'), adminUpdateHotelBooking)
router.get('/attendance', requireRole('admin', 'manager'), listAttendance)
router.get('/attendance/roster', requireRole('admin', 'manager'), listAttendanceRoster)
router.post('/attendance/check-in-batch', requireRole('admin', 'manager'), checkInPetsBatch)
router.post('/attendance/check-out-batch', requireRole('admin', 'manager'), checkOutAttendanceBatch)
router.post('/pets/:petId/check-in', requireRole('admin', 'manager'), checkInPet)
router.patch('/attendance/:id/check-out', requireRole('admin', 'manager'), checkOutPet)

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
