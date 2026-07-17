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

// パスワードの最低要件：8文字以上（過度に複雑な要件は従業員にとって負担が大きいため、
// 長さのみをシンプルに要求する方針。2026-07-17決定）
export function isPasswordValid(password: string): boolean {
  return typeof password === 'string' && password.length >= 8
}
