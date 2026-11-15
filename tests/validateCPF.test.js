import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidCPF, normalizeCPF } from '../src/utils/validateCPF.js'

test('normaliza CPF removendo pontuação', () => {
  assert.equal(normalizeCPF('529.982.247-25'), '52998224725')
})

test('valida CPF válido e rejeita sequência repetida ou dígito incorreto', () => {
  assert.equal(isValidCPF('529.982.247-25'), true)
  assert.equal(isValidCPF('111.111.111-11'), false)
  assert.equal(isValidCPF('529.982.247-24'), false)
})
