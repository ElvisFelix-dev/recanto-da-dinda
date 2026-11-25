import { Router } from 'express'
import { authAdmin } from '../middlewares/authAdmin.js'
import { requireRole } from '../middlewares/requireRole.js'
import {
  adminChangeTestimonialStatus,
  adminCreateTestimonial,
  adminDeleteTestimonial,
  adminGetTestimonial,
  adminListTestimonials,
  adminUpdateTestimonial,
  publicListTestimonials,
} from '../controllers/testimonialController.js'

const publicRouter = Router()
publicRouter.get('/', publicListTestimonials)

const adminRouter = Router()
adminRouter.use(authAdmin, requireRole('admin', 'manager'))
adminRouter.get('/', adminListTestimonials)
adminRouter.get('/:id', adminGetTestimonial)
adminRouter.post('/', adminCreateTestimonial)
adminRouter.patch('/:id', adminUpdateTestimonial)
adminRouter.patch('/:id/status', adminChangeTestimonialStatus)
adminRouter.delete('/:id', adminDeleteTestimonial)

export { publicRouter as testimonialPublicRoutes, adminRouter as testimonialAdminRoutes }
