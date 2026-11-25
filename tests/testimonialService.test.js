import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTestimonialPayload } from '../src/utils/testimonialValidation.js'

const guardianId = '507f1f77bcf86cd799439011'
const isValidId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))
const validPayload = {
  guardianId,
  text: 'A experiência no Recanto foi maravilhosa para nosso pet.',
  rating: 5,
  authorization: { testimonial: true, petImage: true, source: 'whatsapp' },
}

test('normaliza depoimento válido e registra autorização', () => {
  const result = normalizeTestimonialPayload(validPayload, isValidId)
  assert.equal(result.guardianId, guardianId)
  assert.equal(result.rating, 5)
  assert.equal(result.authorization.testimonial, true)
  assert.equal(result.authorization.petImage, true)
  assert.ok(result.authorization.authorizedAt instanceof Date)
})
test('rejeita tutor com ID inválido', () => {
  assert.throws(() => normalizeTestimonialPayload({ ...validPayload, guardianId: 'abc' }, isValidId), /tutor válido/i)
})
test('rejeita depoimento muito curto', () => {
  assert.throws(() => normalizeTestimonialPayload({ ...validPayload, text: 'Legal' }, isValidId), /entre 10 e 1200 caracteres/i)
})
test('rejeita avaliação fora do intervalo', () => {
  assert.throws(() => normalizeTestimonialPayload({ ...validPayload, rating: 6 }, isValidId), /entre 1 e 5/i)
})
test('exige autorização para depoimento e imagem do pet', () => {
  assert.throws(() => normalizeTestimonialPayload({ ...validPayload, authorization: { testimonial: true, petImage: false } }, isValidId), /autorização/i)
})
test('rejeita data de autorização inválida', () => {
  assert.throws(() => normalizeTestimonialPayload({ ...validPayload, authorization: { ...validPayload.authorization, authorizedAt: 'data-invalida' } }, isValidId), /data da autorização/i)
})
