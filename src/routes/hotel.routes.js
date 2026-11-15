import { Router } from 'express'
import { submitHotelBooking } from '../controllers/hotelBookingController.js'
import { uploadHotelVaccinationCards } from '../middlewares/petVaccinationUpload.js'

const router = Router()
router.post('/bookings', uploadHotelVaccinationCards, submitHotelBooking)
export default router
