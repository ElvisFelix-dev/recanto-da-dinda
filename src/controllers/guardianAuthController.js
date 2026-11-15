import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import Guardian from '../models/Guardian.js'
import { normalizeCPF } from '../utils/validateCPF.js'

function createToken(guardian) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado.')
  return jwt.sign(
    { sub: guardian._id.toString(), role: 'guardian', type: 'guardian' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )
}

export async function requestGuardianAccessCode(req, res, next) {
  try {
    const cpf = normalizeCPF(req.body.cpf || '')
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase()
    const generic = {
      success: true,
      message:
        'Se os dados corresponderem a um cadastro elegível, enviaremos um código para o e-mail informado.',
    }
    if (!cpf || !email) return res.status(200).json(generic)

    console.log('[BREVO CONFIG]', {
      apiKeyConfigured: Boolean(process.env.BREVO_API_KEY),
      senderConfigured: Boolean(process.env.BREVO_SENDER_EMAIL),
      emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    })

    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      return res.status(503).json({
        success: false,
        message:
          'O serviço de envio de e-mail está temporariamente indisponível.',
      })
    }
    const guardian = await Guardian.findOne({ cpf, email }).select(
      '+passwordHash',
    )
    if (!guardian || !guardian.isActive || guardian.passwordHash)
      return res.status(200).json(generic)

    const code = String(crypto.randomInt(100000, 1000000))
    guardian.accessCodeHash = crypto
      .createHash('sha256')
      .update(code)
      .digest('hex')
    guardian.accessCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
    guardian.accessCodeAttempts = 0
    await guardian.save()

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Recanto da Dinda',
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: guardian.email, name: guardian.name }],
        subject: 'Seu código de acesso — Recanto da Dinda',
        htmlContent: `<div style="font-family:Arial,sans-serif;color:#59301f;max-width:560px;margin:auto;padding:24px"><h2>Área do Tutor</h2><p>Olá, ${guardian.name.replace(/[&<>"']/g, '')}!</p><p>Use o código abaixo para criar sua senha. Ele expira em 10 minutos.</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#fff0e6;padding:20px;text-align:center;border-radius:12px">${code}</div><p>Se você não solicitou este acesso, ignore esta mensagem.</p></div>`,
      }),
    })
    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      throw new Error(
        details.message || `Brevo respondeu com HTTP ${response.status}.`,
      )
    }
    return res.status(200).json(generic)
  } catch (error) {
    next(error)
  }
}

export async function confirmGuardianAccess(req, res, next) {
  try {
    const cpf = normalizeCPF(req.body.cpf || '')
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase()
    const code = String(req.body.code || '').trim()
    const password = req.body.password
    if (
      !cpf ||
      !email ||
      !/^\d{6}$/.test(code) ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Informe CPF, e-mail, código de 6 dígitos e senha com pelo menos 8 caracteres.',
      })
    }
    const guardian = await Guardian.findOne({ cpf, email }).select(
      '+accessCodeHash +passwordHash',
    )
    if (
      !guardian ||
      !guardian.isActive ||
      guardian.passwordHash ||
      !guardian.accessCodeHash ||
      !guardian.accessCodeExpiresAt ||
      guardian.accessCodeExpiresAt < new Date() ||
      guardian.accessCodeAttempts >= 5
    ) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido ou expirado. Solicite um novo código.',
      })
    }
    const submittedHash = crypto.createHash('sha256').update(code).digest('hex')
    const valid = crypto.timingSafeEqual(
      Buffer.from(submittedHash),
      Buffer.from(guardian.accessCodeHash),
    )
    if (!valid) {
      guardian.accessCodeAttempts += 1
      await guardian.save()
      return res
        .status(400)
        .json({ success: false, message: 'Código inválido ou expirado.' })
    }
    guardian.passwordHash = await bcrypt.hash(password, 12)
    guardian.accessCodeHash = null
    guardian.accessCodeExpiresAt = null
    guardian.accessCodeAttempts = 0
    await guardian.save()
    return res.status(201).json({
      success: true,
      message: 'Senha criada. Bem-vindo à Área do Tutor!',
      data: {
        token: createToken(guardian),
        guardian: {
          id: guardian._id,
          name: guardian.name,
          email: guardian.email,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function loginGuardian(req, res, next) {
  try {
    const cpf = normalizeCPF(req.body.cpf || '')
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase()
    const password = req.body.password
    if (!cpf || !email || typeof password !== 'string')
      return res
        .status(400)
        .json({ success: false, message: 'Informe CPF, e-mail e senha.' })
    const guardian = await Guardian.findOne({ cpf, email }).select(
      '+passwordHash',
    )
    if (
      !guardian ||
      !guardian.isActive ||
      !guardian.passwordHash ||
      !(await bcrypt.compare(password, guardian.passwordHash))
    ) {
      return res
        .status(401)
        .json({ success: false, message: 'E-mail ou senha inválidos.' })
    }
    return res.json({
      success: true,
      data: {
        token: createToken(guardian),
        guardian: {
          id: guardian._id,
          name: guardian.name,
          email: guardian.email,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function getGuardianDashboard(req, res, next) {
  try {
    const Pet = (await import('../models/Pet.js')).default
    const HotelBooking = (await import('../models/HotelBooking.js')).default
    const Attendance = (await import('../models/Attendance.js')).default
    const [pets, bookings, attendance, activeAttendance] = await Promise.all([
      Pet.find({ guardian: req.guardian._id })
        .select('name breed sex avatar status')
        .lean(),
      HotelBooking.find({ guardian: req.guardian._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Attendance.find({ guardian: req.guardian._id })
        .sort({ checkInAt: -1 })
        .limit(10)
        .populate('pet', 'name')
        .lean(),
      Attendance.find({ guardian: req.guardian._id, checkOutAt: null })
        .populate('pet', 'name')
        .lean(),
    ])
    const bookedPets = bookings.map((item) => ({
      ...item.petSnapshot,
      bookingId: item._id,
      status: item.status,
      checkIn: item.requestedCheckIn,
      checkOut: item.requestedCheckOut,
    }))
    return res.json({
      success: true,
      data: {
        guardian: {
          id: req.guardian._id,
          name: req.guardian.name,
          email: req.guardian.email,
        },
        pets,
        hotelPets: bookedPets,
        bookings,
        attendance,
        activeAttendance,
      },
    })
  } catch (error) {
    next(error)
  }
}
