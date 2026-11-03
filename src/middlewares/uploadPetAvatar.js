import multer from 'multer'

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('A foto do pet deve estar em JPG, PNG ou WebP.'))
    }
    return callback(null, true)
  },
})

export function uploadPetAvatar(req, res, next) {
  upload.single('avatar')(req, res, (error) => {
    if (!error) return next()
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'A foto do pet deve ter no máximo 5 MB.'
      : error.message || 'Não foi possível processar a foto.'
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      success: false,
      message,
    })
  })
}
