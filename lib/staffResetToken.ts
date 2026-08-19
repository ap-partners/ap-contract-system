// ===== マイページ：認証コード確認後・パスワード設定前の短命トークン =====
// 2026-07-17新設。/api/staff/verify-code で認証コードの確認に成功した直後だけ発行し、
// 続く/api/staff/set-passwordで「このリクエストは確かにコード確認済みである」ことを
// 示すために使う（lib/pdfAccessToken.tsと同じHMAC署名方式。新しい依存関係は増やさない）。
import crypto from 'crypto'
import { getRequiredSessionSigningSecret } from './requiredEnv'

const EXPIRY_MS = 15 * 60 * 1000 // 15分（コード確認からパスワード設定までの猶予として十分）

// B-08対応（2026-08-06）：lib/pdfAccessToken.tsと同じ秘密鍵・同じペイロード形式を使い回して
// いたため、種別タグを付けて区別する（詳細はpdfAccessToken.tsのコメント参照）。
const TOKEN_KIND = 'staffreset'

// 改善提案#15対応（2026-08-19）：署名鍵をservice roleキーの流用からSESSION_SIGNING_SECRET
// 専用鍵に変更（詳細はlib/requiredEnv.tsのコメント参照）。
function sign(payload: string): string {
  return crypto.createHmac('sha256', getRequiredSessionSigningSecret()).update(payload).digest('hex')
}

export function createStaffResetToken(staffId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS
  const payload = `${TOKEN_KIND}.${staffId}.${expiresAt}`
  const sig = sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyStaffResetToken(token: string, staffId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 4) return false
    const [kind, tokenStaffId, expiresAtStr, sig] = parts
    if (kind !== TOKEN_KIND) return false
    if (tokenStaffId !== staffId) return false
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
    const expectedSig = sign(`${kind}.${tokenStaffId}.${expiresAtStr}`)
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
