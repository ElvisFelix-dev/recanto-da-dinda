import { Router } from 'express'
import { getCurrentAdmin, loginAdmin } from '../controllers/adminAuthController.js'
import { authAdmin } from '../middlewares/authAdmin.js'

const router = Router()

router.post('/login', loginAdmin)
router.get('/me', authAdmin, getCurrentAdmin)

export default router
