// ===== マイページ：認証コード確認後・パスワード設定前の短命トークン =====
// 2026-07-17新設。/api/staff/verify-code で認証コードの確認に成功した直後だけ発行し、
// 続く/api/staff/set-passwordで「このリクエストは確かにコード確認済みである」ことを
// 示すために使う（lib/pdfAccessToken.tsと同じHMAC署名方式。新しい依存関係は増やさない）。
import crypto from 'crypto'

const EXPIRY_MS = 15 * 60 * 1000 // 15分（コード確認からパスワード設定までの猶予として十分）

function getSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-not-happen'
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function createStaffResetToken(staffId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS
  const payload = `${staffId}.${expiresAt}`
  const sig = sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyStaffResetToken(token: string, staffId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return false
    const [tokenStaffId, expiresAtStr, sig] = parts
    if (tokenStaffId !== staffId) return false
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
    const expectedSig = sign(`${tokenStaffId}.${expiresAtStr}`)
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
