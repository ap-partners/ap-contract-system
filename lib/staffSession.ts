// ===== マイページ：従業員ログインセッション =====
// 2026-07-17新設。Supabase Authを使わない独自認証のため、lib/pdfAccessToken.tsと同じ
// 「HMAC署名付きトークンをCookieに入れる」方式を踏襲する。
// PDFトークン（30分・契約1件専用）と異なり、こちらは「ログインセッション」なので
// 有効期間を設定し、staffIdを積む。
// 2026-08-19（改善提案#15対応）：署名鍵はSUPABASE_SERVICE_ROLE_KEYの流用からSESSION_SIGNING_SECRET
// 専用鍵に変更済み（下記importKey参照）。
//
// 2026-07-17実機確認で発見・修正：このモジュールはNext.jsのmiddleware（既定でEdge
// Runtime）からも呼ばれるが、Edge RuntimeはNode標準のcryptoモジュール
// （crypto.createHmac等）をサポートしていないため、当初のNode crypto実装では
// middleware内で常に検証に失敗し、有効なセッションでも/staff/loginへ強制的に
// 戻されてしまっていた。Edge・Node.js両方のランタイムで動作するWeb Crypto API
// （globalThis.crypto.subtle）に書き換えることで解消した。
//
// 2026-08-10（B-07対応）：以下2点を変更。
// ①有効期限を30日間→7日間に短縮。middleware.ts側でページ遷移のたびに有効期限を
//   延長する「スライディングセッション」にするため、日常的に使っていれば体感の不便は
//   増えない（無操作のまま7日を超えて初めて再ログインが必要になる）。
// ②payloadに世代番号（tokenVersion）を追加。パスワード変更・強制ログアウト時に
//   staff.session_token_versionをDB側で繰り上げることで、署名・有効期限が正しい
//   Cookieであっても「古い世代のセッション」として無効化できるようにする
//   （このモジュール自体はDBを見ないため、世代番号の照合はNode runtimeのAPIルート側
//   ＝lib/staffAuth.tsのgetStaffIdFromRequestで行う。middlewareは軽量に保つ）。

import { getRequiredSessionSigningSecret } from './requiredEnv'

const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7日間（2026-08-10：30日間から短縮）
export const STAFF_SESSION_COOKIE = 'staff_session'

export type StaffSessionPayload = { staffId: string; tokenVersion: number }

// 改善提案#15対応（2026-08-19）：署名鍵をservice roleキーの流用からSESSION_SIGNING_SECRET
// 専用鍵に変更（詳細はlib/requiredEnv.tsのコメント参照）。
async function importKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(getRequiredSessionSigningSecret())
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

export async function createStaffSessionToken(staffId: string, tokenVersion: number): Promise<string> {
  const expiresAt = Date.now() + SESSION_EXPIRY_MS
  const payload = `${staffId}.${tokenVersion}.${expiresAt}`
  const sig = await sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

// 検証に成功した場合はstaffId・tokenVersionを返す。失敗時はnull。
// 2026-08-10：戻り値をstaffId単体からStaffSessionPayloadに変更（世代番号を追加したため）。
export async function verifyStaffSessionToken(token: string | undefined | null): Promise<StaffSessionPayload | null> {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 4) return null
    const [staffId, tokenVersionStr, expiresAtStr, sig] = parts
    const expiresAt = Number(expiresAtStr)
    const tokenVersion = Number(tokenVersionStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
    if (!Number.isFinite(tokenVersion)) return null
    const expectedSig = await sign(`${staffId}.${tokenVersionStr}.${expiresAtStr}`)
    // 長さが異なる場合は明らかに不一致（timingSafeEqual相当のWeb Crypto APIが無いため、
    // 文字列比較で十分な長さのハッシュ値同士の比較として扱う。値自体は毎回のHMAC計算
    // 結果でありランダムではないため、厳密なタイミング攻撃対策は他の防御層に委ねる）。
    if (sig.length !== expectedSig.length) return null
    let mismatch = 0
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    }
    if (mismatch !== 0) return null
    return { staffId, tokenVersion }
  } catch {
    return null
  }
}

export const STAFF_SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_EXPIRY_MS / 1000)
