export function normalizeCPF(cpf = '') {
  return String(cpf).replace(/\D/g, '')
}

export function isValidCPF(value) {
  const cpf = normalizeCPF(value)

  if (!/^\d{11}$/.test(cpf)) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0

  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i)
  }

  let firstDigit = (sum * 10) % 11
  if (firstDigit === 10) firstDigit = 0

  if (firstDigit !== Number(cpf[9])) return false

  sum = 0

  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i)
  }

  let secondDigit = (sum * 10) % 11
  if (secondDigit === 10) secondDigit = 0

  return secondDigit === Number(cpf[10])
}
