import Pet from '../models/Pet.js'
import { logAudit } from '../services/auditService.js'

function getDateRange(query) {
  const filters = {}
  let from
  let to

  if (query.from) {
    from = new Date(query.from)
    if (Number.isNaN(from.getTime())) throw new Error('Data inicial inválida.')
  }
  if (query.to) {
    to = new Date(query.to)
    if (Number.isNaN(to.getTime())) throw new Error('Data final inválida.')
    to.setHours(23, 59, 59, 999)
  }
  if (from && to && from > to) throw new Error('A data inicial deve ser anterior à data final.')

  if (from || to) {
    filters.createdAt = {}
    if (from) filters.createdAt.$gte = from
    if (to) filters.createdAt.$lte = to
  }
  return filters
}

export async function getReportOverview(req, res, next) {
  try {
    const filters = getDateRange(req.query)
    const [total, pending, approved, rejected, monthly] = await Promise.all([
      Pet.countDocuments(filters),
      Pet.countDocuments({ ...filters, status: 'pending_review' }),
      Pet.countDocuments({ ...filters, status: 'approved' }),
      Pet.countDocuments({ ...filters, status: 'rejected' }),
      Pet.aggregate([
        { $match: filters },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            total: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ])

    return res.json({
      success: true,
      data: {
        period: { from: req.query.from || null, to: req.query.to || null },
        totals: { total, pending, approved, rejected },
        registrationsByMonth: monthly.map((item) => ({
          year: item._id.year,
          month: item._id.month,
          total: item.total,
        })),
      },
    })
  } catch (error) {
    if (error.message.includes('Data ') || error.message.includes('A data ')) {
      return res.status(400).json({ success: false, message: error.message })
    }
    return next(error)
  }
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function exportRegistrationsCsv(req, res, next) {
  try {
    const filters = getDateRange(req.query)
    const pets = await Pet.find(filters)
      .populate('guardian', 'name cpf email phone')
      .sort({ createdAt: -1 })
      .lean()

    const headers = [
      'Pet', 'Raça', 'Sexo', 'Status', 'Tutor', 'CPF', 'E-mail',
      'Telefone', 'Data do cadastro', 'Data da revisão',
    ]
    const rows = pets.map((pet) => [
      pet.name,
      pet.breed,
      pet.sex,
      pet.status,
      pet.guardian?.name,
      pet.guardian?.cpf,
      pet.guardian?.email,
      pet.guardian?.phone,
      pet.createdAt ? new Date(pet.createdAt).toISOString() : '',
      pet.reviewedAt ? new Date(pet.reviewedAt).toISOString() : '',
    ])

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
    const filename = `relatorio-pets-${new Date().toISOString().slice(0, 10)}.csv`

    await logAudit({
      req,
      action: 'report.exported',
      entity: 'report',
      description: 'Relatório de cadastros exportado em CSV.',
      metadata: { format: 'csv', records: pets.length, from: req.query.from || null, to: req.query.to || null },
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(`\uFEFF${csv}`)
  } catch (error) {
    if (error.message.includes('Data ') || error.message.includes('A data ')) {
      return res.status(400).json({ success: false, message: error.message })
    }
    return next(error)
  }
}
