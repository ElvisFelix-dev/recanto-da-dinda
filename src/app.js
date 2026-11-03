import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import petRegistrationRoutes from './routes/petRegistration.routes.js'
import adminAuthRoutes from './routes/adminAuth.routes.js'
import adminRoutes from './routes/admin.routes.js'

const app = express()

app.use(helmet())

// Normaliza as origens: remove espaços e barras finais.
const normalizeOrigin = (value) => {
  if (!value) return null

  try {
    return new URL(value.trim()).origin
  } catch {
    return null
  }
}

const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
    'http://localhost:5173',
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
)

app.use(
  cors({
    origin(origin, callback) {
      // Permite chamadas sem Origin (ex.: servidor para servidor).
      if (!origin) return callback(null, true)

      const normalizedOrigin = normalizeOrigin(origin)

      if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true)
      }

      console.warn(`[CORS] Origem bloqueada: ${origin}`)
      return callback(new Error(`Origem não permitida pelo CORS: ${origin}`))
    },
  }),
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  return res.json({
    success: true,
    message: 'API do Recanto da Dinda funcionando!',
  })
})

// Cadastro público de tutores e pets (multipart/form-data)
app.use('/api/pet-registrations', petRegistrationRoutes)

// Login administrativo
app.use('/api/admin/auth', adminAuthRoutes)

// Rotas administrativas protegidas
app.use('/api/admin', adminRoutes)

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Rota não encontrada.',
  })
})

app.use((error, req, res, next) => {
  console.error('[API Error]', error)

  if (error?.name === 'MulterError') {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400

    return res.status(statusCode).json({
      success: false,
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Um dos arquivos excede o limite permitido de 10 MB.'
          : 'Não foi possível processar os arquivos enviados.',
    })
  }

  if (error?.message?.startsWith('Origem não permitida pelo CORS:')) {
    return res.status(403).json({
      success: false,
      message: 'Origem não autorizada.',
    })
  }

  const statusCode = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : Number.isInteger(error?.status)
      ? error.status
      : 500

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'Ocorreu um erro interno.'
        : error.message || 'Ocorreu um erro inesperado.',
  })
})

export default app
