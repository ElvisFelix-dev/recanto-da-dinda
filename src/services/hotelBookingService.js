import Guardian from '../models/Guardian.js'
import Pet from '../models/Pet.js'
import HotelBooking from '../models/HotelBooking.js'
import { normalizeCPF } from '../utils/validateCPF.js'

export async function createHotelBooking({ payload, uploadedCards = [] }) {
  const cpf = normalizeCPF(payload.guardian.cpf)
  let guardian = await Guardian.findOne({ cpf })

  if (guardian) {
    guardian.name = payload.guardian.name
    guardian.rg = payload.guardian.rg
    guardian.address = payload.guardian.address
    guardian.phone = payload.guardian.phone
    guardian.email = payload.guardian.email
    guardian.isActive = true
    await guardian.save()
  } else {
    guardian = await Guardian.create({
      ...payload.guardian,
      cpf,
      whatsappConsent: { status: 'unknown', source: 'hotel_booking_form' },
    })
  }

  let linkedPet = null
  if (payload.pet.petId) {
    linkedPet = await Pet.findOne({ _id: payload.pet.petId, guardian: guardian._id })
    if (!linkedPet) {
      const error = new Error('O pet selecionado não pertence ao tutor informado.')
      error.statusCode = 400
      throw error
    }
  }

  const booking = await HotelBooking.create({
    guardian: guardian._id,
    pet: linkedPet?._id || null,
    petSnapshot: {
      name: payload.pet.name,
      breed: payload.pet.breed,
      sex: payload.pet.sex,
      neutered: payload.pet.neutered,
    },
    requestedCheckIn: new Date(payload.stay.checkIn),
    requestedCheckOut: new Date(payload.stay.checkOut),
    healthInformation: {
      ...payload.health,
      lastDewormingDate: new Date(payload.health.lastDewormingDate),
      vaccinationCards: uploadedCards,
    },
    declarations: payload.declarations,
  })

  return { booking, guardian }
}

export async function listHotelBookings({ status, page = 1, limit = 10 }) {
  const filter = status ? { status } : {}
  const [items, total] = await Promise.all([
    HotelBooking.find(filter)
      .populate('guardian', 'name email phone cpf')
      .populate('pet', 'name breed avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    HotelBooking.countDocuments(filter),
  ])
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
}
