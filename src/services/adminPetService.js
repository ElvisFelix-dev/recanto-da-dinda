import Pet from '../models/Pet.js'
import Guardian from '../models/Guardian.js'

export async function listPetRegistrations({
  status,
  search,
  page = 1,
  limit = 10,
}) {
  const filters = {}

  if (status) {
    filters.status = status
  }

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

    const guardians = await Guardian.find({
      $or: [
        { name: regex },
        { email: regex },
        { cpf: search.replace(/\D/g, '') || '__none__' },
      ],
    }).select('_id')

    const guardianIds = guardians.map((guardian) => guardian._id)

    filters.$or = [{ name: regex }, { guardian: { $in: guardianIds } }]
  }

  const skip = (page - 1) * limit

  const [registrations, total] = await Promise.all([
    Pet.find(filters)
      .populate('guardian', 'name email phone cpf whatsappConsent')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Pet.countDocuments(filters),
  ])

  return {
    registrations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getPetRegistrationById(id) {
  return Pet.findById(id)
    .populate('guardian', 'name cpf rg address phone email whatsappConsent')
    .populate('reviewedBy', 'name email')
    .populate('statusHistory.changedBy', 'name email')
}

export async function updatePetRegistrationStatus({
  petId,
  status,
  notes,
  adminId,
}) {
  const pet = await Pet.findById(petId)

  if (!pet) {
    return null
  }

  pet.status = status
  pet.adminNotes = notes || ''

  pet.reviewedBy = status === 'pending_review' ? null : adminId
  pet.reviewedAt = status === 'pending_review' ? null : new Date()

  pet.statusHistory.push({
    status,
    notes: notes || '',
    changedBy: adminId,
    changedAt: new Date(),
  })

  await pet.save()

  return pet
}

export async function getGuardianPets(guardianId) {
  const guardian = await Guardian.findById(guardianId).select(
    'name cpf email phone whatsappConsent',
  )

  if (!guardian) {
    return null
  }

  const pets = await Pet.find({ guardian: guardianId })
    .select('name breed sex status avatar createdAt')
    .sort({ createdAt: -1 })

  return { guardian, pets }
}
