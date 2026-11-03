import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'
import { logAudit } from '../services/auditService.js'

export async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Informe e-mail e senha.',
      })
    }

    const admin = await Admin.findOne({
      email: email.trim().toLowerCase(),
    }).select('+passwordHash')

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha inválidos.',
      })
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash)

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha inválidos.',
      })
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET não configurado.')
    }

    const token = jwt.sign(
      { sub: admin._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '8h' },
    )

    admin.lastLoginAt = new Date()
    await admin.save()

    await logAudit({
      req,
      actor: admin,
      action: 'auth.login',
      entity: 'admin',
      entityId: admin._id,
      description: `Login realizado por ${admin.name}.`,
    })

    return res.status(200).json({
      success: true,
      message: 'Login realizado com sucesso.',
      data: {
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      },
    })
  } catch (error) {
    return next(error)
  }
}

export async function getCurrentAdmin(req, res) {
  return res.json({
    success: true,
    data: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      isActive: req.admin.isActive,
      lastLoginAt: req.admin.lastLoginAt,
    },
  })
}
