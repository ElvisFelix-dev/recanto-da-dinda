import { Router } from 'express'
import { requestGuardianAccessCode, confirmGuardianAccess, loginGuardian, getGuardianDashboard } from '../controllers/guardianAuthController.js'
import { listMyAttendance } from '../controllers/attendanceController.js'
import { authGuardian } from '../middlewares/authGuardian.js'
import { guardianCreateTestimonial, guardianListTestimonials } from '../controllers/testimonialController.js'

const router = Router()
router.post('/auth/request-access-code', requestGuardianAccessCode)
router.post('/auth/confirm-access', confirmGuardianAccess)
router.post('/auth/login', loginGuardian)
router.get('/me', authGuardian, getGuardianDashboard)
router.get('/me/attendance', authGuardian, listMyAttendance)
router.get('/testimonials', authGuardian, guardianListTestimonials)
router.post('/testimonials', authGuardian, guardianCreateTestimonial)
export default router
