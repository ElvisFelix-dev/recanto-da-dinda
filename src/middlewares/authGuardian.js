import jwt from 'jsonwebtoken'
import Guardian from '../models/Guardian.js'

export async function authGuardian(req, res, next) {
  try {
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Autenticação necessária.' })
    }
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado.')
    const decoded = jwt.verify(authorization.slice(7).trim(), process.env.JWT_SECRET)
    const guardian = await Guardian.findById(decoded.sub)
    if (!guardian || !guardian.isActive) {
      return res.status(401).json({ success: false, message: 'Conta de tutor não autorizada.' })
    }
    req.guardian = guardian
    return next()
  } catch {
    return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' })
  }
}
