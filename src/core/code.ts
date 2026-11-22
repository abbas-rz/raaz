// Invite codes: 8 characters from Crockford base32 (no I, L, O, U), so 40 bits.
// The code only lives for 15 minutes and is stretched with PBKDF2 before use.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const CODE_LENGTH = 8

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("")
}

// Accepts what people actually type: lowercase, spaces, dashes, and the
// letters that look like digits.
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V")
}

export function isValidCode(input: string): boolean {
  const c = normalizeCode(input)
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch))
}

export function formatCode(code: string): string {
  const c = normalizeCode(code)
  return `${c.slice(0, 4)}-${c.slice(4)}`
}
