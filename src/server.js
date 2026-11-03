import 'dotenv/config'

import { createServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import app from './app.js'
import { connectDatabase } from './config/database.js'
import { setSocketServer } from './config/socket.js'
import Admin from './models/Admin.js'

const PORT = process.env.PORT || 3333

function getAllowedOrigins() {
  return [process.env.CLIENT_URL, ...(process.env.ALLOWED_ORIGINS || '').split(','), 'http://localhost:5173']
    .filter(Boolean)
    .map((value) => { try { return new URL(value.trim()).origin } catch { return null } })
    .filter(Boolean)
}

async function startServer() {
  try {
    await connectDatabase()

    const httpServer = createServer(app)
    const io = new Server(httpServer, {
      cors: { origin: getAllowedOrigins(), methods: ['GET', 'POST'], credentials: true },
    })

    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token
        if (!token || !process.env.JWT_SECRET) return next(new Error('Autenticação necessária.'))
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const admin = await Admin.findById(decoded.sub).select('_id role isActive')
        if (!admin || !admin.isActive) return next(new Error('Sessão administrativa inválida.'))
        socket.data.admin = { id: admin._id.toString(), role: admin.role }
        return next()
      } catch {
        return next(new Error('Sessão administrativa inválida.'))
      }
    })

    io.on('connection', (socket) => {
      socket.join(`admin:${socket.data.admin.id}`)
      socket.join(`role:${socket.data.admin.role}`)
    })

    setSocketServer(io)
    httpServer.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`)
      console.log(`http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error.message)
    process.exit(1)
  }
}

startServer()
