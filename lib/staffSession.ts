// ===== マイページ：従業員ログインセッション =====
// 2026-07-17新設。Supabase Authを使わない独自認証のため、lib/pdfAccessToken.tsと同じ
// 「HMAC署名付きトークンをCookieに入れる」方式を踏襲する（新規の環境変数・依存関係を
// 追加しない。SUPABASE_SERVICE_ROLE_KEYをサーバー専用の署名鍵として流用）。
// PDFトークン（30分・契約1件専用）と異なり、こちらは「ログインセッション」なので
// 有効期間を30日間に設定し、staffIdのみを積む。
//
// 2026-07-17実機確認で発見・修正：このモジュールはNext.jsのmiddleware（既定でEdge
// Runtime）からも呼ばれるが、Edge RuntimeはNode標準のcryptoモジュール
// （crypto.createHmac等）をサポートしていないため、当初のNode crypto実装では
// middleware内で常に検証に失敗し、有効なセッションでも/staff/loginへ強制的に
// 戻されてしまっていた。Edge・Node.js両方のランタイムで動作するWeb Crypto API
// （globalThis.crypto.subtle）に書き換えることで解消した。

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30日間
export const STAFF_SESSION_COOKIE = 'staff_session'

function getSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-not-happen'
}

async function importKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(getSecret())
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sign(payload: string): Promise<string> {
  const key = await importKey()
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(sigBuffer)
}

export async function createStaffSessionToken(staffId: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_EXPIRY_MS
  const payload = `${staffId}.${expiresAt}`
  const sig = await sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

// 検証に成功した場合はstaffIdを返す。失敗時はnull。
export async function verifyStaffSessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return null
    const [staffId, expiresAtStr, sig] = parts
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
    const expectedSig = await sign(`${staffId}.${expiresAtStr}`)
    // 長さが異なる場合は明らかに不一致（timingSafeEqual相当のWeb Crypto APIが無いため、
    // 文字列比較で十分な長さのハッシュ値同士の比較として扱う。値自体は毎回のHMAC計算
    // 結果でありランダムではないため、厳密なタイミング攻撃対策は他の防御層に委ねる）。
    if (sig.length !== expectedSig.length) return null
    let mismatch = 0
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    }
    if (mismatch !== 0) return null
    return staffId
  } catch {
    return null
  }
}

export const STAFF_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_EXPIRY_MS / 1000)
