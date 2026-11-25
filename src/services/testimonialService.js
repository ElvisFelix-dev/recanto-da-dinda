import mongoose from 'mongoose'
import Testimonial from '../models/Testimonial.js'
import Guardian from '../models/Guardian.js'
import Pet from '../models/Pet.js'
import { normalizeTestimonialPayload } from '../utils/testimonialValidation.js'

const publicPetFields = 'name avatar breed'

export function normalizeTestimonialInput(body = {}) {
  return normalizeTestimonialPayload(body, mongoose.isValidObjectId)
}

export async function createTestimonial({ body, adminId }) {
  const input = normalizeTestimonialInput(body)
  const [guardian, pets] = await Promise.all([
    Guardian.findById(input.guardianId).select('_id name isActive'),
    Pet.find({ guardian: input.guardianId, status: 'approved' }).select('_id').lean(),
  ])

  if (!guardian || !guardian.isActive) {
    throw Object.assign(new Error('Tutor não encontrado ou inativo.'), { statusCode: 404 })
  }
  if (!pets.length) {
    throw Object.assign(new Error('Este tutor não possui pets aprovados para vincular ao depoimento.'), { statusCode: 400 })
  }

  // Escolha aleatória persistida: o mesmo pet representa este depoimento em todas as visitas.
  const selectedPet = pets[Math.floor(Math.random() * pets.length)]

  return Testimonial.create({
    guardian: guardian._id,
    pet: selectedPet._id,
    text: input.text,
    rating: input.rating,
    authorization: input.authorization,
    createdBy: adminId,
  })
}

export async function listAdminTestimonials({ page = 1, limit = 20, status, search = '' }) {
  const filter = {}
  if (['pending', 'approved', 'hidden'].includes(status)) filter.status = status
  if (search.trim()) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matchingGuardians = await Guardian.find({ name: new RegExp(safe, 'i') }).distinct('_id')
    const matchingPets = await Pet.find({ name: new RegExp(safe, 'i') }).distinct('_id')
    filter.$or = [
      { text: new RegExp(safe, 'i') },
      { guardian: { $in: matchingGuardians } },
      { pet: { $in: matchingPets } },
    ]
  }
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    Testimonial.find(filter)
      .populate('guardian', 'name email phone')
      .populate('pet', publicPetFields)
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Testimonial.countDocuments(filter),
  ])
  return { items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }
}

export async function getAdminTestimonial(id) {
  return Testimonial.findById(id)
    .populate('guardian', 'name email phone')
    .populate('pet', publicPetFields)
    .lean()
}

export async function updateTestimonial({ id, body, adminId }) {
  const testimonial = await Testimonial.findById(id)
  if (!testimonial) return null

  if (body.text !== undefined) {
    if (typeof body.text !== 'string' || body.text.trim().length < 10 || body.text.trim().length > 1200) {
      throw Object.assign(new Error('O depoimento deve ter entre 10 e 1200 caracteres.'), { statusCode: 400 })
    }
    testimonial.text = body.text.trim()
  }
  if (body.adminNote !== undefined) {
    testimonial.adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim().slice(0, 500) : ''
  }
  if (body.rating !== undefined) {
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw Object.assign(new Error('A avaliação deve ser um número inteiro entre 1 e 5.'), { statusCode: 400 })
    }
    testimonial.rating = rating
  }
  if (body.authorization !== undefined) {
    if (body.authorization.testimonial !== true || body.authorization.petImage !== true) {
      throw Object.assign(new Error('As duas autorizações precisam permanecer válidas para publicação.'), { statusCode: 400 })
    }
    testimonial.authorization = {
      ...testimonial.authorization.toObject(),
      ...body.authorization,
      authorizedAt: body.authorization.authorizedAt ? new Date(body.authorization.authorizedAt) : testimonial.authorization.authorizedAt || new Date(),
    }
  }
  testimonial.updatedBy = adminId
  await testimonial.save()
  return getAdminTestimonial(id)
}

export async function changeTestimonialStatus({ id, status, adminId }) {
  if (!['pending', 'approved', 'hidden'].includes(status)) {
    throw Object.assign(new Error('Status inválido.'), { statusCode: 400 })
  }
  const testimonial = await Testimonial.findById(id)
  if (!testimonial) return null

  if (status === 'approved') {
    if (!testimonial.authorization?.testimonial || !testimonial.authorization?.petImage) {
      throw Object.assign(new Error('Não é possível aprovar sem as autorizações de publicação e imagem.'), { statusCode: 400 })
    }
    const pet = await Pet.findOne({ _id: testimonial.pet, guardian: testimonial.guardian, status: 'approved' }).select('_id')
    if (!pet) throw Object.assign(new Error('O pet vinculado não está mais aprovado ou não pertence ao tutor.'), { statusCode: 400 })
    testimonial.approvedAt = new Date()
    testimonial.approvedBy = adminId
  } else if (testimonial.status === 'approved') {
    testimonial.approvedAt = null
    testimonial.approvedBy = null
  }

  testimonial.status = status
  testimonial.updatedBy = adminId
  await testimonial.save()
  return getAdminTestimonial(id)
}

export async function deleteTestimonial(id) {
  return Testimonial.findByIdAndDelete(id)
}

export async function listPublicTestimonials({ limit = 12 } = {}) {
  const docs = await Testimonial.find({
    status: 'approved',
    'authorization.testimonial': true,
    'authorization.petImage': true,
  })
    .populate({ path: 'pet', select: 'name avatar breed status', match: { status: 'approved' } })
    .sort({ approvedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean()

  // Lista pública deliberadamente não retorna guardian, IDs do tutor ou dados de contato.
  return docs.filter((item) => item.pet).map((item) => ({
    _id: item._id,
    text: item.text,
    rating: item.rating,
    pet: {
      name: item.pet.name,
      avatar: item.pet.avatar?.url || '',
      breed: item.pet.breed || '',
    },
    approvedAt: item.approvedAt,
  }))
}

// Área do Tutor: a identidade do tutor vem exclusivamente do JWT validado.
export async function listGuardianTestimonials(guardianId) {
  return Testimonial.find({ guardian: guardianId })
    .populate({ path: 'pet', select: 'name avatar breed' })
    .sort({ createdAt: -1 })
    .lean()
    .then((items) => items.map((item) => ({
      _id: item._id,
      text: item.text,
      rating: item.rating,
      status: item.status,
      adminNote: item.adminNote || '',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      approvedAt: item.approvedAt,
      pet: item.pet ? {
        _id: item.pet._id,
        name: item.pet.name,
        avatar: item.pet.avatar?.url || '',
        breed: item.pet.breed || '',
      } : null,
    })))
}

export async function createGuardianTestimonial({ guardianId, body = {} }) {
  const petId = body.petId
  if (!mongoose.isValidObjectId(petId)) {
    throw Object.assign(new Error('Selecione um pet válido.'), { statusCode: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 10 || text.length > 1200) {
    throw Object.assign(new Error('O depoimento deve ter entre 10 e 1200 caracteres.'), { statusCode: 400 })
  }

  const rating = Number(body.rating ?? 5)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(new Error('A avaliação deve ser um número inteiro entre 1 e 5.'), { statusCode: 400 })
  }

  const authorization = body.authorization || {}
  if (authorization.testimonial !== true || authorization.petImage !== true) {
    throw Object.assign(new Error('É necessário autorizar a publicação do depoimento e da imagem do pet.'), { statusCode: 400 })
  }

  const pet = await Pet.findOne({
    _id: petId,
    guardian: guardianId,
    status: 'approved',
  }).select('_id name')

  if (!pet) {
    throw Object.assign(new Error('Pet não encontrado, não pertence à sua conta ou ainda não foi aprovado.'), { statusCode: 404 })
  }

  const item = await Testimonial.create({
    guardian: guardianId,
    pet: pet._id,
    text,
    rating,
    status: 'pending',
    authorization: {
      testimonial: true,
      petImage: true,
      authorizedAt: new Date(),
      source: 'guardian_portal',
      notes: '',
    },
    approvedAt: null,
    approvedBy: null,
    createdBy: null,
    updatedBy: null,
  })

  return Testimonial.findById(item._id)
    .populate({ path: 'pet', select: 'name avatar breed' })
    .lean()
    .then((doc) => ({
      _id: doc._id,
      text: doc.text,
      rating: doc.rating,
      status: doc.status,
      createdAt: doc.createdAt,
      pet: doc.pet ? {
        _id: doc.pet._id,
        name: doc.pet.name,
        avatar: doc.pet.avatar?.url || '',
        breed: doc.pet.breed || '',
      } : null,
    }))
}

