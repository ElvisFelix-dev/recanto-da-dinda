export function normalizeTestimonialPayload(body = {}, isValidId = () => false) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const rating = Number(body.rating ?? 5)
  const authorization = body.authorization || {}

  if (!isValidId(body.guardianId)) throw Object.assign(new Error('Selecione um tutor válido.'), { statusCode: 400 })
  if (text.length < 10 || text.length > 1200) throw Object.assign(new Error('O depoimento deve ter entre 10 e 1200 caracteres.'), { statusCode: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('A avaliação deve ser um número inteiro entre 1 e 5.'), { statusCode: 400 })
  if (authorization.testimonial !== true || authorization.petImage !== true) throw Object.assign(new Error('É necessário registrar autorização para publicar o depoimento e a imagem do pet.'), { statusCode: 400 })

  const authorizedAt = authorization.authorizedAt ? new Date(authorization.authorizedAt) : new Date()
  if (Number.isNaN(authorizedAt.getTime())) throw Object.assign(new Error('Data da autorização inválida.'), { statusCode: 400 })

  return {
    guardianId: body.guardianId,
    text,
    rating,
    authorization: {
      testimonial: true,
      petImage: true,
      authorizedAt,
      source: ['admin_recorded', 'written', 'whatsapp', 'other'].includes(authorization.source) ? authorization.source : 'admin_recorded',
      notes: typeof authorization.notes === 'string' ? authorization.notes.trim().slice(0, 500) : '',
    },
  }
}
