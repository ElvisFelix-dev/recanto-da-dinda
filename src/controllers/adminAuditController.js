import { listAuditLogs } from '../services/auditService.js'

export async function getAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))

    if (req.query.from && Number.isNaN(Date.parse(req.query.from))) {
      return res.status(400).json({ success: false, message: 'Data inicial inválida.' })
    }
    if (req.query.to && Number.isNaN(Date.parse(req.query.to))) {
      return res.status(400).json({ success: false, message: 'Data final inválida.' })
    }

    const result = await listAuditLogs({
      page,
      limit,
      action: req.query.action,
      entity: req.query.entity,
      search: String(req.query.search || '').trim(),
      from: req.query.from,
      to: req.query.to,
    })

    return res.json({ success: true, data: result.items, pagination: result.pagination })
  } catch (error) {
    return next(error)
  }
}
