import { Router } from 'express'
import { createPetRegistration } from '../controllers/petRegistrationController.js'
import { uploadPetVaccinationCards } from '../middlewares/petVaccinationUpload.js'

const petRegistrationRoutes = Router()

petRegistrationRoutes.post(
  '/',
  uploadPetVaccinationCards,
  createPetRegistration,
)

export default petRegistrationRoutes
