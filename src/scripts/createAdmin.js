import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Admin from '../models/Admin.js'

async function createAdmin() {
  try {
    const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env

    if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        'Configure MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD.',
      )
    }

    if (ADMIN_PASSWORD.length < 12) {
      throw new Error('A senha inicial deve ter pelo menos 12 caracteres.')
    }

    await mongoose.connect(MONGODB_URI)

    const email = ADMIN_EMAIL.trim().toLowerCase()

    const existingAdmin = await Admin.findOne({ email })

    if (existingAdmin) {
      console.log('Este administrador já está cadastrado.')
      return
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)

    await Admin.create({
      name: ADMIN_NAME,
      email,
      passwordHash,
      role: 'admin',
    })

    console.log('Administrador criado com sucesso!')
  } catch (error) {
    console.error('Erro ao criar administrador:', error.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

createAdmin()
