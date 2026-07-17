// ===== マイページ：従業員ログインセッション =====
// 2026-07-17新設。Supabase Authを使わない独自認証のため、lib/pdfAccessToken.tsと同じ
// 「HMAC署名付きトークンをCookieに入れる」方式を踏襲する（新規の環境変数・依存関係を
// 追加しない。SUPABASE_SERVICE_ROLE_KEYをサーバー専用の署名鍵として流用）。
// PDFトークン（30分・契約1件専用）と異なり、こちらは「ログインセッション」なので
// 有効期間を30日間に設定し、staffIdのみを積む。
import crypto from 'crypto'

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30日間
export const STAFF_SESSION_COOKIE = 'staff_session'

function getSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-not-happen'
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function createStaffSessionToken(staffId: string): string {
  const expiresAt = Date.now() + SESSION_EXPIRY_MS
  const payload = `${staffId}.${expiresAt}`
  const sig = sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

// 検証に成功した場合はstaffIdを返す。失敗時はnull。
export function verifyStaffSessionToken(token: string | undefined | null): string | null {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return null
    const [staffId, expiresAtStr, sig] = parts
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
    const expectedSig = sign(`${staffId}.${expiresAtStr}`)
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null
    return staffId
  } catch {
    return null
  }
}

export const STAFF_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_EXPIRY_MS / 1000)
