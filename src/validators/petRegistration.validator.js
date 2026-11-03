import { z } from 'zod'
import { isValidCPF, normalizeCPF } from '../utils/validateCPF.js'

const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => value.length === 10 || value.length === 11, {
    message: 'Informe um telefone válido com DDD',
  })

const requiredAcceptance = z.literal(true, {
  errorMap: () => ({ message: 'Esta declaração precisa ser aceita' }),
})

const futureDateCheck = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const today = new Date()
  today.setHours(23, 59, 59, 999)

  return date <= today
}

export const petRegistrationSchema = z
  .object({
    guardian: z.object({
      name: z.string().trim().min(3).max(120),
      cpf: z
        .string()
        .transform(normalizeCPF)
        .refine(isValidCPF, 'CPF inválido'),
      rg: z.string().trim().min(5).max(20),
      address: z.string().trim().min(5).max(250),
      phone: phoneSchema,
      email: z
        .string()
        .trim()
        .email()
        .transform((value) => value.toLowerCase()),
      whatsappConsent: z.boolean().optional().default(false),
    }),

    pet: z.object({
      name: z.string().trim().min(1).max(80),
      breed: z.string().trim().min(2).max(100),
      sex: z.enum(['female', 'male']),
      neutered: z.boolean(),

      vaccines: z.object({
        polyvalent: requiredAcceptance,
        rabies: requiredAcceptance,
        giardia: requiredAcceptance,
        canineFlu: requiredAcceptance,
      }),

      lastDewormingDate: z
        .string()
        .refine(futureDateCheck, 'Data da vermifugação inválida ou futura'),

      fleaTreatmentProduct: z
        .string()
        .trim()
        .min(2, 'Informe o produto antipulgas utilizado')
        .max(120, 'O nome do produto deve ter no máximo 120 caracteres'),

      lastFleaTreatmentDate: z
        .string()
        .refine(futureDateCheck, 'Data do antipulgas inválida ou futura'),

      hasAllergies: z.boolean(),
      allergyDetails: z.string().trim().max(1000).optional().default(''),

      takesMedication: z.boolean(),
      medicationDetails: z.string().trim().max(1000).optional().default(''),

      veterinarian: z.object({
        clinic: z.string().trim().min(2).max(150),
        name: z.string().trim().min(2).max(120),
        phone: phoneSchema,
      }),

      emergencyAuthorization: requiredAcceptance,

      declarations: z.object({
        truthfulInformation: requiredAcceptance,
        adequateHealth: requiredAcceptance,
        requiredVaccines: requiredAcceptance,
        socializationRisks: requiredAcceptance,
        emergencyMeasures: requiredAcceptance,
        veterinaryExpenses: requiredAcceptance,
      }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.pet.hasAllergies && !data.pet.allergyDetails.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pet', 'allergyDetails'],
        message: 'Descreva as alergias do pet',
      })
    }

    if (data.pet.takesMedication && !data.pet.medicationDetails.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pet', 'medicationDetails'],
        message: 'Informe os medicamentos utilizados',
      })
    }
  })
