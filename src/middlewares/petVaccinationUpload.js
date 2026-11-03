import multer from 'multer'
import crypto from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isAvatar = file.fieldname === 'avatar'
    return {
      folder: isAvatar
        ? 'recanto-da-dinda/pet-avatars'
        : 'recanto-da-dinda/vaccination-cards',
      resource_type: isAvatar
        ? 'image'
        : file.mimetype === 'application/pdf'
          ? 'raw'
          : 'image',
      public_id: `${Date.now()}-${crypto.randomUUID()}`,
    }
  },
})

const petUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, callback) => {
    if (file.fieldname === 'avatar') {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        return callback(new Error('A foto do pet deve estar em JPG, PNG ou WebP.'))
      }
      return callback(null, true)
    }

    if (file.fieldname !== 'vaccinationCards' || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Documento inválido. Envie JPG, PNG, WebP ou PDF.'))
    }
    return callback(null, true)
  },
})

export function uploadPetVaccinationCards(req, res, next) {
  petUpload.fields([
    { name: 'vaccinationCards', maxCount: 5 },
    { name: 'avatar', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) return next()

    if (error instanceof multer.MulterError) {
      const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(statusCode).json({
        success: false,
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Cada arquivo deve ter no máximo 10 MB.'
          : 'Não foi possível processar os arquivos enviados.',
      })
    }

    return res.status(400).json({
      success: false,
      message: error.message || 'Arquivo inválido.',
    })
  })
}

export { cloudinary }
