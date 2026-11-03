export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin || !allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para realizar esta ação.',
      })
    }

    return next()
  }
}
