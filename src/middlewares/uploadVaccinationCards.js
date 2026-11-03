import multer from 'multer'

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

const uploadVaccinationCards = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB por arquivo
    files: 5,
  },

  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error('Formato inválido. Envie imagens ou arquivos PDF.'),
      )
    }

    callback(null, true)
  },
})

export default uploadVaccinationCards
