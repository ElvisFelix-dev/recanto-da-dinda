import { z } from 'zod'
import { isValidCPF, normalizeCPF } from '../utils/validateCPF.js'

const phone = z.string().trim().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length >= 10 && v.length <= 11, 'Informe um telefone válido com DDD')
const yes = z.literal(true, { errorMap: () => ({ message: 'Esta declaração é obrigatória.' }) })

export const hotelBookingSchema = z.object({
  guardian: z.object({
    name: z.string().trim().min(3).max(120),
    cpf: z.string().transform(normalizeCPF).refine(isValidCPF, 'CPF inválido'),
    rg: z.string().trim().min(5).max(20),
    address: z.string().trim().min(5).max(250),
    phone,
    email: z.string().trim().email().transform((v) => v.toLowerCase()),
  }),
  pet: z.object({
    petId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'ID do pet inválido').optional().nullable(),
    name: z.string().trim().min(1).max(80),
    breed: z.string().trim().min(2).max(100),
    sex: z.enum(['female', 'male']),
    neutered: z.boolean(),
  }),
  stay: z.object({
    checkIn: z.string().min(1),
    checkOut: z.string().min(1),
  }),
  health: z.object({
    vaccinesUpToDate: z.boolean(),
    lastDewormingDate: z.string().min(1),
    fleaTreatment: z.string().trim().min(1).max(250),
    hasAllergies: z.boolean(),
    allergyDetails: z.string().trim().max(1000).optional().default(''),
    takesMedication: z.boolean(),
    medicationDetails: z.string().trim().max(1000).optional().default(''),
    veterinarian: z.object({
      clinic: z.string().trim().max(150).optional().default(''),
      name: z.string().trim().max(120).optional().default(''),
      phone: z.string().trim().optional().default(''),
    }).optional().default({}),
  }),
  declarations: z.object({
    emergencyAuthorization: yes,
    truthfulInformation: yes,
    adequateHealth: yes,
    disclosedConditions: yes,
    socializationRisks: yes,
    emergencyMeasures: yes,
    veterinaryExpenses: yes,
  }),
}).superRefine((data, ctx) => {
  const checkIn = new Date(data.stay.checkIn)
  const checkOut = new Date(data.stay.checkOut)
  if (Number.isNaN(checkIn.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stay', 'checkIn'], message: 'Informe uma data de entrada válida.' })
  }
  if (Number.isNaN(checkOut.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stay', 'checkOut'], message: 'Informe uma data de saída válida.' })
  }
  if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime()) && checkOut <= checkIn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stay', 'checkOut'], message: 'A saída deve ser posterior à entrada.' })
  }
  if (Number.isNaN(new Date(data.health.lastDewormingDate).getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['health', 'lastDewormingDate'], message: 'Informe uma data válida de vermifugação.' })
  }
  if (data.health.hasAllergies && !data.health.allergyDetails.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['health', 'allergyDetails'], message: 'Descreva as alergias do pet.' })
  }
  if (data.health.takesMedication && !data.health.medicationDetails.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['health', 'medicationDetails'], message: 'Informe os medicamentos utilizados.' })
  }
})
