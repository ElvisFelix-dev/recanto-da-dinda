import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'

export async function authAdmin(req, res, next) {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Autenticação necessária.',
      })
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET não configurado.')
    }

    const token = authorization.slice(7).trim()
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const admin = await Admin.findById(decoded.sub)

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Administrador não autorizado.',
      })
    }

    // O perfil vem do banco, não do payload do token, para refletir alterações de permissão.
    req.admin = admin
    return next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Sessão inválida ou expirada.',
    })
  }
}
