import AdminAuditLog from '../models/AdminAuditLog.js'

export async function logAudit({
  req,
  actor = req?.admin,
  action,
  entity,
  entityId = null,
  description,
  metadata = {},
}) {
  try {
    return await AdminAuditLog.create({
      actor: actor?._id || null,
      actorName: actor?.name || 'Sistema',
      actorEmail: actor?.email || '',
      action,
      entity,
      entityId,
      description,
      metadata,
      ip: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || '',
      userAgent: req?.headers?.['user-agent'] || '',
    })
  } catch (error) {
    // A falha de auditoria não deve derrubar uma operação administrativa já concluída.
    console.error('[AUDIT] Não foi possível registrar atividade:', error.message)
    return null
  }
}

export async function listAuditLogs({
  page = 1,
  limit = 20,
  action,
  entity,
  search,
  from,
  to,
}) {
  const filters = {}
  if (action) filters.action = action
  if (entity) filters.entity = entity

  if (from || to) {
    filters.createdAt = {}
    if (from) filters.createdAt.$gte = new Date(from)
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      filters.createdAt.$lte = end
    }
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'i')
    filters.$or = [
      { actorName: regex },
      { actorEmail: regex },
      { description: regex },
      { action: regex },
      { entity: regex },
    ]
  }

  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    AdminAuditLog.find(filters)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminAuditLog.countDocuments(filters),
  ])

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}
