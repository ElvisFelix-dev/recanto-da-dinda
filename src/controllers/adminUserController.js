import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Admin from '../models/Admin.js'
import { logAudit } from '../services/auditService.js'

const validRoles = ['admin', 'manager']
const isValidId = (id) => mongoose.isValidObjectId(id)

export async function listAdmins(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const filters = {}

    if (req.query.role) {
      if (!validRoles.includes(req.query.role)) {
        return res.status(400).json({ success: false, message: 'Perfil inválido.' })
      }
      filters.role = req.query.role
    }

    if (req.query.isActive !== undefined) {
      if (!['true', 'false'].includes(String(req.query.isActive))) {
        return res.status(400).json({ success: false, message: 'Filtro de situação inválido.' })
      }
      filters.isActive = req.query.isActive === 'true'
    }

    if (req.query.search) {
      const escaped = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'i')
      filters.$or = [{ name: regex }, { email: regex }]
    }

    const [admins, total] = await Promise.all([
      Admin.find(filters)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Admin.countDocuments(filters),
    ])

    return res.json({
      success: true,
      data: admins,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    return next(error)
  }
}

export async function createAdminUser(req, res, next) {
  try {
    const { name, email, password, role = 'manager' } = req.body

    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 120) {
      return res.status(400).json({ success: false, message: 'Informe um nome entre 3 e 120 caracteres.' })
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Informe um e-mail válido.' })
    }
    if (typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 12 caracteres.' })
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Perfil informado é inválido.' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const existing = await Admin.findOne({ email: normalizedEmail }).select('_id')
    if (existing) {
      return res.status(409).json({ success: false, message: 'Já existe um usuário com este e-mail.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const admin = await Admin.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      isActive: true,
    })

    await logAudit({
      req,
      action: 'admin.created',
      entity: 'admin',
      entityId: admin._id,
      description: `Usuário ${admin.name} criado.`,
      metadata: { role: admin.role, email: admin.email },
    })

    return res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso.',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Já existe um usuário com este e-mail.' })
    }
    return next(error)
  }
}

export async function updateAdminUser(req, res, next) {
  try {
    const { id } = req.params
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'ID de usuário inválido.' })
    }

    const admin = await Admin.findById(id)
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' })
    }

    const { name, email, role, isActive } = req.body
    const changes = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 120) {
        return res.status(400).json({ success: false, message: 'Nome inválido.' })
      }
      admin.name = name.trim()
      changes.name = admin.name
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ success: false, message: 'E-mail inválido.' })
      }
      admin.email = email.trim().toLowerCase()
      changes.email = admin.email
    }

    if (role !== undefined) {
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Perfil inválido.' })
      }
      if (String(admin._id) === String(req.admin._id) && role !== admin.role) {
        return res.status(400).json({ success: false, message: 'Você não pode alterar o próprio perfil.' })
      }
      if (admin.role === 'admin' && role !== 'admin' && admin.isActive) {
        const activeAdmins = await Admin.countDocuments({ role: 'admin', isActive: true })
        if (activeAdmins <= 1) {
          return res.status(400).json({ success: false, message: 'Não é possível rebaixar o último administrador ativo.' })
        }
      }
      admin.role = role
      changes.role = role
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, message: 'A situação deve ser true ou false.' })
      }
      if (String(admin._id) === String(req.admin._id) && isActive === false) {
        return res.status(400).json({ success: false, message: 'Você não pode desativar a própria conta.' })
      }
      if (admin.role === 'admin' && isActive === false && admin.isActive) {
        const activeAdmins = await Admin.countDocuments({ role: 'admin', isActive: true })
        if (activeAdmins <= 1) {
          return res.status(400).json({ success: false, message: 'Não é possível desativar o último administrador ativo.' })
        }
      }
      admin.isActive = isActive
      changes.isActive = isActive
    }

    await admin.save()

    await logAudit({
      req,
      action: 'admin.updated',
      entity: 'admin',
      entityId: admin._id,
      description: `Usuário ${admin.name} atualizado.`,
      metadata: changes,
    })

    return res.json({
      success: true,
      message: 'Usuário atualizado com sucesso.',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        lastLoginAt: admin.lastLoginAt,
        updatedAt: admin.updatedAt,
      },
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Este e-mail já está em uso.' })
    }
    return next(error)
  }
}

export async function changeAdminPassword(req, res, next) {
  try {
    const { id } = req.params
    const { password } = req.body

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'ID de usuário inválido.' })
    }
    if (typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 12 caracteres.' })
    }

    const admin = await Admin.findById(id).select('+passwordHash')
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' })
    }

    admin.passwordHash = await bcrypt.hash(password, 12)
    await admin.save()

    await logAudit({
      req,
      action: 'admin.password_changed',
      entity: 'admin',
      entityId: admin._id,
      description: `Senha do usuário ${admin.name} alterada.`,
    })

    return res.json({ success: true, message: 'Senha atualizada com sucesso.' })
  } catch (error) {
    return next(error)
  }
}
