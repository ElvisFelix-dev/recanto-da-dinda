import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Attendance from '../models/Attendance.js'
import { logAudit } from '../services/auditService.js'

export async function checkInPet(req, res, next) {
  try {
    const { petId } = req.params
    if (!mongoose.isValidObjectId(petId)) return res.status(400).json({ success: false, message: 'ID do pet inválido.' })
    const pet = await Pet.findById(petId).select('guardian name status')
    if (!pet) return res.status(404).json({ success: false, message: 'Pet não encontrado.' })
    if (pet.status !== 'approved') return res.status(409).json({ success: false, message: 'Somente pets com cadastro aprovado podem receber frequência.' })
    const active = await Attendance.findOne({ pet: pet._id, checkOutAt: null })
    if (active) return res.status(409).json({ success: false, message: 'Este pet já possui uma entrada sem saída registrada.' })
    const checkInAt = req.body.checkInAt ? new Date(req.body.checkInAt) : new Date()
    if (Number.isNaN(checkInAt.getTime())) return res.status(400).json({ success: false, message: 'Data de entrada inválida.' })
    const attendance = await Attendance.create({ pet: pet._id, guardian: pet.guardian, checkInAt, checkInNotes: String(req.body.notes || '').slice(0, 1000), checkedInBy: req.admin._id })
    return res.status(201).json({ success: true, message: 'Entrada registrada.', data: attendance })
  } catch (error) { next(error) }
}

export async function checkOutPet(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'ID da frequência inválido.' })
    const attendance = await Attendance.findById(req.params.id)
    if (!attendance) return res.status(404).json({ success: false, message: 'Registro de frequência não encontrado.' })
    if (attendance.checkOutAt) return res.status(409).json({ success: false, message: 'A saída deste registro já foi realizada.' })
    attendance.checkOutAt = req.body.checkOutAt ? new Date(req.body.checkOutAt) : new Date()
    if (Number.isNaN(attendance.checkOutAt.getTime())) return res.status(400).json({ success: false, message: 'Data de saída inválida.' })
    attendance.checkOutNotes = String(req.body.notes || '').slice(0, 1000)
    attendance.checkedOutBy = req.admin._id
    if (attendance.checkOutAt <= attendance.checkInAt) return res.status(400).json({ success: false, message: 'A saída deve ser posterior à entrada.' })
    await attendance.save()
    return res.json({ success: true, message: 'Saída registrada.', data: attendance })
  } catch (error) { next(error) }
}

export async function listAttendance(req, res, next) {
  try {
    const filter = {}
    if (req.query.petId && mongoose.isValidObjectId(req.query.petId)) filter.pet = req.query.petId
    if (req.query.guardianId && mongoose.isValidObjectId(req.query.guardianId)) filter.guardian = req.query.guardianId
    if (req.query.from || req.query.to) {
      filter.checkInAt = {}
      if (req.query.from) filter.checkInAt.$gte = new Date(req.query.from)
      if (req.query.to) filter.checkInAt.$lte = new Date(req.query.to)
    }
    const items = await Attendance.find(filter).populate('pet', 'name breed avatar').populate('guardian', 'name phone email').populate('checkedInBy', 'name email role').populate('checkedOutBy', 'name email role').sort({ checkInAt: -1 }).limit(200).lean()
    return res.json({ success: true, data: items })
  } catch (error) { next(error) }
}

export async function listMyAttendance(req, res, next) {
  try {
    const items = await Attendance.find({ guardian: req.guardian._id }).populate('pet', 'name breed avatar').sort({ checkInAt: -1 }).limit(100).lean()
    return res.json({ success: true, data: items })
  } catch (error) { next(error) }
}

// Lista os pets aprovados e informa se cada um já está presente na creche.
export async function listAttendanceRoster(req, res, next) {
  try {
    const search = String(req.query.search || '').trim()
    const filter = { status: 'approved' }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.name = new RegExp(escaped, 'i')
    }

    const pets = await Pet.find(filter)
      .select('name breed avatar guardian')
      .populate('guardian', 'name phone')
      .sort({ name: 1 })
      .lean()

    const petIds = pets.map((pet) => pet._id)
    const activeRecords = await Attendance.find({
      pet: { $in: petIds },
      checkOutAt: null,
    }).select('_id pet checkInAt').lean()

    const activeByPet = new Map(activeRecords.map((record) => [String(record.pet), record]))
    const roster = pets.map((pet) => ({
      ...pet,
      activeAttendance: activeByPet.get(String(pet._id)) || null,
    }))

    return res.json({ success: true, data: roster })
  } catch (error) {
    next(error)
  }
}

// Registra entrada individual para cada pet selecionado. Falhas de um pet não impedem os demais.
export async function checkInPetsBatch(req, res, next) {
  try {
    const petIds = Array.isArray(req.body.petIds) ? [...new Set(req.body.petIds.map(String))] : []
    if (!petIds.length) return res.status(400).json({ success: false, message: 'Selecione pelo menos um pet.' })
    if (petIds.length > 100) return res.status(400).json({ success: false, message: 'É possível registrar até 100 pets por operação.' })
    const invalidIds = petIds.filter((id) => !mongoose.isValidObjectId(id))
    if (invalidIds.length) return res.status(400).json({ success: false, message: 'Um ou mais pets selecionados possuem identificador inválido.' })

    const pets = await Pet.find({ _id: { $in: petIds } }).select('name guardian status')
    const petById = new Map(pets.map((pet) => [String(pet._id), pet]))
    const results = []

    for (const petId of petIds) {
      const pet = petById.get(petId)
      if (!pet) {
        results.push({ petId, success: false, message: 'Pet não encontrado.' })
        continue
      }
      if (pet.status !== 'approved') {
        results.push({ petId, petName: pet.name, success: false, message: 'Cadastro do pet não está aprovado.' })
        continue
      }

      try {
        const attendance = await Attendance.create({
          pet: pet._id,
          guardian: pet.guardian,
          checkInAt: new Date(),
          checkedInBy: req.admin._id,
        })
        await logAudit({
          req,
          action: 'attendance.check_in',
          entity: 'attendance',
          entityId: attendance._id,
          description: `Entrada de ${pet.name} registrada.`,
          metadata: { petId: String(pet._id), batch: true },
        })
        results.push({ petId, petName: pet.name, success: true, attendanceId: String(attendance._id) })
      } catch (error) {
        if (error?.code === 11000) {
          results.push({ petId, petName: pet.name, success: false, message: 'Este pet já está com entrada registrada.' })
        } else {
          results.push({ petId, petName: pet.name, success: false, message: 'Não foi possível registrar a entrada.' })
          console.error(`[ATTENDANCE] Falha no check-in em lote para pet=${petId}:`, error)
        }
      }
    }

    const succeeded = results.filter((item) => item.success).length
    return res.status(200).json({
      success: true,
      message: `${succeeded} de ${results.length} entrada(s) registrada(s).`,
      data: { results, succeeded, failed: results.length - succeeded },
    })
  } catch (error) {
    next(error)
  }
}

// Registra saída individual para cada frequência ativa selecionada.
export async function checkOutAttendanceBatch(req, res, next) {
  try {
    const attendanceIds = Array.isArray(req.body.attendanceIds) ? [...new Set(req.body.attendanceIds.map(String))] : []
    if (!attendanceIds.length) return res.status(400).json({ success: false, message: 'Selecione pelo menos um pet presente.' })
    if (attendanceIds.length > 100) return res.status(400).json({ success: false, message: 'É possível registrar até 100 saídas por operação.' })
    if (attendanceIds.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Um ou mais registros possuem identificador inválido.' })
    }

    const records = await Attendance.find({ _id: { $in: attendanceIds } }).populate('pet', 'name')
    const recordById = new Map(records.map((record) => [String(record._id), record]))
    const results = []

    for (const attendanceId of attendanceIds) {
      const attendance = recordById.get(attendanceId)
      if (!attendance) {
        results.push({ attendanceId, success: false, message: 'Registro de frequência não encontrado.' })
        continue
      }
      if (attendance.checkOutAt) {
        results.push({ attendanceId, petName: attendance.pet?.name, success: false, message: 'A saída já foi registrada.' })
        continue
      }

      attendance.checkOutAt = new Date()
      attendance.checkedOutBy = req.admin._id
      try {
        await attendance.save()
        await logAudit({
          req,
          action: 'attendance.check_out',
          entity: 'attendance',
          entityId: attendance._id,
          description: `Saída de ${attendance.pet?.name || 'pet'} registrada.`,
          metadata: { petId: String(attendance.pet?._id || ''), batch: true },
        })
        results.push({ attendanceId, petName: attendance.pet?.name, success: true })
      } catch (error) {
        results.push({ attendanceId, petName: attendance.pet?.name, success: false, message: 'Não foi possível registrar a saída.' })
        console.error(`[ATTENDANCE] Falha no check-out em lote para registro=${attendanceId}:`, error)
      }
    }

    const succeeded = results.filter((item) => item.success).length
    return res.status(200).json({
      success: true,
      message: `${succeeded} de ${results.length} saída(s) registrada(s).`,
      data: { results, succeeded, failed: results.length - succeeded },
    })
  } catch (error) {
    next(error)
  }
}
