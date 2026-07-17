// ===== マイページ：従業員パスワードのハッシュ化・照合 =====
// 2026-07-17新設。当初設計（docs/SYSTEM_DESIGN.md 1-6章・10章）通りSupabase Authは使わず、
// staff.password_hash に保存する独自認証。新規の依存関係（bcrypt等）を追加せず、Node標準の
// crypto.scryptSync（暗号論的に安全なパスワードハッシュ関数）を使う。
// 保存形式："salt(hex 32文字):hash(hex 128文字)"
import crypto from 'crypto'

const SALT_BYTES = 16
const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  try {
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH)
    const stored = Buffer.from(hash, 'hex')
    if (candidate.length !== stored.length) return false
    return crypto.timingSafeEqual(candidate, stored)
  } catch {
    return false
  }
}

// パスワードの最低要件：8文字以上、かつ半角英大文字・半角英小文字・数字の3種類をすべて含む
// （2026-07-17伊藤さん指定）。
export function isPasswordValid(password: string): boolean {
  if (typeof password !== 'string' || password.length < 8) return false
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  return hasUpper && hasLower && hasDigit
}

export const PASSWORD_REQUIREMENT_MESSAGE = 'パスワードは8文字以上で、半角英大文字・小文字・数字をすべて含めてください。'
