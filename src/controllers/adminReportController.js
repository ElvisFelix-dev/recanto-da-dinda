import Pet from '../models/Pet.js'
import HotelBooking from '../models/HotelBooking.js'
import Attendance from '../models/Attendance.js'
import { logAudit } from '../services/auditService.js'

function getDateRange(query) {
  let from
  let to

  if (query.from) {
    from = new Date(`${query.from}T00:00:00.000`)
    if (Number.isNaN(from.getTime())) throw new Error('Data inicial inválida.')
  }
  if (query.to) {
    to = new Date(`${query.to}T23:59:59.999`)
    if (Number.isNaN(to.getTime())) throw new Error('Data final inválida.')
  }
  if (from && to && from > to) throw new Error('A data inicial deve ser anterior à data final.')

  return { from, to }
}

function dateFilter(field, range) {
  const filter = {}
  if (range.from || range.to) {
    filter[field] = {}
    if (range.from) filter[field].$gte = range.from
    if (range.to) filter[field].$lte = range.to
  }
  return filter
}

function monthlyPipeline(field, range) {
  return [
    { $match: dateFilter(field, range) },
    {
      $group: {
        _id: {
          year: { $year: `$${field}` },
          month: { $month: `$${field}` },
        },
        total: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]
}

function normalizeMonthly(items) {
  return items.map((item) => ({
    year: item._id.year,
    month: item._id.month,
    total: item.total,
  }))
}

export async function getReportOverview(req, res, next) {
  try {
    const range = getDateRange(req.query)
    const petFilter = dateFilter('createdAt', range)
    const bookingFilter = dateFilter('createdAt', range)
    const attendanceFilter = dateFilter('checkInAt', range)

    const [
      totalPets, pendingPets, approvedPets, rejectedPets, registrationsByMonth,
      totalBookings, pendingBookings, approvedBookings, rejectedBookings,
      cancelledBookings, completedBookings, bookingsByMonth, bookingDates,
      totalAttendance, openAttendance, closedAttendance, attendanceByMonth,
      attendancePets,
    ] = await Promise.all([
      Pet.countDocuments(petFilter),
      Pet.countDocuments({ ...petFilter, status: 'pending_review' }),
      Pet.countDocuments({ ...petFilter, status: 'approved' }),
      Pet.countDocuments({ ...petFilter, status: 'rejected' }),
      Pet.aggregate(monthlyPipeline('createdAt', range)),
      HotelBooking.countDocuments(bookingFilter),
      HotelBooking.countDocuments({ ...bookingFilter, status: 'pending' }),
      HotelBooking.countDocuments({ ...bookingFilter, status: 'approved' }),
      HotelBooking.countDocuments({ ...bookingFilter, status: 'rejected' }),
      HotelBooking.countDocuments({ ...bookingFilter, status: 'cancelled' }),
      HotelBooking.countDocuments({ ...bookingFilter, status: 'completed' }),
      HotelBooking.aggregate(monthlyPipeline('createdAt', range)),
      HotelBooking.find(bookingFilter).select('requestedCheckIn requestedCheckOut status').lean(),
      Attendance.countDocuments(attendanceFilter),
      Attendance.countDocuments({ ...attendanceFilter, checkOutAt: null }),
      Attendance.countDocuments({ ...attendanceFilter, checkOutAt: { $ne: null } }),
      Attendance.aggregate(monthlyPipeline('checkInAt', range)),
      Attendance.aggregate([
        { $match: attendanceFilter },
        { $group: { _id: '$pet', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'pets', localField: '_id', foreignField: '_id', as: 'pet' } },
        { $unwind: { path: '$pet', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, petId: { $toString: '$_id' }, petName: '$pet.name', total: 1 } },
      ]),
    ])

    const requestedNights = bookingDates.reduce((sum, booking) => {
      const start = new Date(booking.requestedCheckIn)
      const end = new Date(booking.requestedCheckOut)
      const nights = Math.max(0, Math.ceil((end - start) / 86400000))
      return sum + nights
    }, 0)

    return res.json({
      success: true,
      data: {
        period: { from: req.query.from || null, to: req.query.to || null },
        totals: {
          total: totalPets,
          pending: pendingPets,
          approved: approvedPets,
          rejected: rejectedPets,
        },
        registrationsByMonth: normalizeMonthly(registrationsByMonth),
        hotel: {
          totals: {
            total: totalBookings,
            pending: pendingBookings,
            approved: approvedBookings,
            rejected: rejectedBookings,
            cancelled: cancelledBookings,
            completed: completedBookings,
            requestedNights,
          },
          bookingsByMonth: normalizeMonthly(bookingsByMonth),
        },
        daycare: {
          totals: {
            attendances: totalAttendance,
            presentNowOrWithoutCheckout: openAttendance,
            completed: closedAttendance,
            checkIns: totalAttendance,
            checkOuts: closedAttendance,
          },
          attendanceByMonth: normalizeMonthly(attendanceByMonth),
          topPets: attendancePets,
        },
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

function csvDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : ''
}

export async function exportRegistrationsCsv(req, res, next) {
  try {
    const range = getDateRange(req.query)
    const [pets, bookings, attendances] = await Promise.all([
      Pet.find(dateFilter('createdAt', range))
        .populate('guardian', 'name cpf email phone')
        .sort({ createdAt: -1 }).lean(),
      HotelBooking.find(dateFilter('createdAt', range))
        .populate('guardian', 'name cpf email phone')
        .populate('pet', 'name breed')
        .sort({ createdAt: -1 }).lean(),
      Attendance.find(dateFilter('checkInAt', range))
        .populate('pet', 'name breed')
        .populate('guardian', 'name phone email')
        .populate('checkedInBy', 'name')
        .populate('checkedOutBy', 'name')
        .sort({ checkInAt: -1 }).lean(),
    ])

    const rows = [
      ['RELATÓRIO RECANTO DA DINDA'],
      ['Período', req.query.from || 'Início', req.query.to || 'Hoje'],
      [],
      ['CADASTROS DE PETS'],
      ['Pet', 'Raça', 'Sexo', 'Status', 'Tutor', 'CPF', 'E-mail', 'Telefone', 'Data do cadastro', 'Data da revisão'],
      ...pets.map((pet) => [
        pet.name, pet.breed, pet.sex, pet.status, pet.guardian?.name,
        pet.guardian?.cpf, pet.guardian?.email, pet.guardian?.phone,
        csvDate(pet.createdAt), csvDate(pet.reviewedAt),
      ]),
      [],
      ['HOSPEDAGENS'],
      ['Pet', 'Raça', 'Status', 'Tutor', 'CPF', 'E-mail', 'Telefone', 'Check-in solicitado', 'Check-out solicitado', 'Solicitação criada', 'Observações'],
      ...bookings.map((booking) => [
        booking.pet?.name || booking.petSnapshot?.name,
        booking.pet?.breed || booking.petSnapshot?.breed,
        booking.status, booking.guardian?.name, booking.guardian?.cpf,
        booking.guardian?.email, booking.guardian?.phone,
        csvDate(booking.requestedCheckIn), csvDate(booking.requestedCheckOut),
        csvDate(booking.createdAt), booking.adminNotes,
      ]),
      [],
      ['DAYCARE / FREQUÊNCIA'],
      ['Pet', 'Raça', 'Tutor', 'Telefone do tutor', 'Entrada', 'Saída', 'Status', 'Registrado por', 'Saída registrada por', 'Observações de entrada', 'Observações de saída'],
      ...attendances.map((item) => [
        item.pet?.name, item.pet?.breed, item.guardian?.name, item.guardian?.phone,
        csvDate(item.checkInAt), csvDate(item.checkOutAt),
        item.checkOutAt ? 'Concluída' : 'Sem saída registrada',
        item.checkedInBy?.name, item.checkedOutBy?.name,
        item.checkInNotes, item.checkOutNotes,
      ]),
    ]

    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
    const filename = `relatorio-completo-recanto-${new Date().toISOString().slice(0, 10)}.csv`

    await logAudit({
      req,
      action: 'report.exported',
      entity: 'report',
      description: 'Relatório completo (cadastros, hospedagens e frequência) exportado em CSV.',
      metadata: {
        format: 'csv',
        pets: pets.length,
        hotelBookings: bookings.length,
        attendances: attendances.length,
        from: req.query.from || null,
        to: req.query.to || null,
      },
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
