import cloudinary from '../config/cloudinary.js'

export function uploadVaccinationCard(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'recanto-da-dinda/vaccination-cards',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error)
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: result.bytes,
        })
      },
    )
    uploadStream.end(file.buffer)
  })
}

export function uploadPetAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'recanto-da-dinda/pet-avatars',
        resource_type: 'image',
        transformation: [
          { width: 900, height: 900, crop: 'limit' },
          { quality: 'auto:good', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) return reject(error)
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        })
      },
    )
    uploadStream.end(file.buffer)
  })
}

export async function deleteCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId) return null
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
}

export async function deleteCloudinaryFiles(files = []) {
  return Promise.allSettled(
    files.map((file) => deleteCloudinaryAsset(
      file.publicId,
      file.resourceType || 'image',
    )),
  )
}
