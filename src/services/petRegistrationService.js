import mongoose from 'mongoose'
import Guardian from '../models/Guardian.js'
import Pet from '../models/Pet.js'

export async function registerPet({ guardian, pet }) {
  const session = await mongoose.startSession()

  try {
    let createdPet

    await session.withTransaction(async () => {
      const savedGuardian = await Guardian.findOneAndUpdate(
        { cpf: guardian.cpf },
        {
          $set: {
            name: guardian.name,
            rg: guardian.rg,
            address: guardian.address,
            phone: guardian.phone,
            email: guardian.email,
            whatsappConsent: {
              status: guardian.whatsappConsent ? 'granted' : 'denied',
              grantedAt: guardian.whatsappConsent ? new Date() : null,
              source: 'pet_registration_form',
            },
            isActive: true,
          },
          $setOnInsert: {
            cpf: guardian.cpf,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
          session,
        },
      )

      const [newPet] = await Pet.create(
        [
          {
            ...pet,
            guardian: savedGuardian._id,
            status: 'pending_review',

            // Histórico inicial do cadastro
            statusHistory: [
              {
                status: 'pending_review',
                notes: 'Cadastro recebido.',
                changedBy: null,
                changedAt: new Date(),
              },
            ],
          },
        ],
        { session },
      )

      createdPet = newPet
    })

    return createdPet
  } finally {
    await session.endSession()
  }
}
