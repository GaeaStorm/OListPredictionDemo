/**
 * Validates a Brazilian CEP (Código de Endereçamento Postal).
 * Accepts "00000-000" (with hyphen) or "00000000" (8 digits).
 */
export function validateBrazilCEP(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep.trim())
}

/** Normalizes CEP to the "00000-000" display format. */
export function normalizeCEP(cep: string): string {
  const digits = cep.replace(/\D/g, "")
  if (digits.length !== 8) return cep
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/** Strips the hyphen, returns 8-digit string. */
export function rawCEPDigits(cep: string): string {
  return cep.replace(/\D/g, "")
}
