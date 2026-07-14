// ===== PDF取得API用：署名画面向けの短命アクセストークン =====
// 総合レビュー指摘1対応（2026-07-15）。/api/contracts/[id]/pdf は従来、契約UUIDさえ知っていれば
// 未ログインでも氏名・住所・給与を含むPDF（署名済みなら押印済み実物）を取得できてしまっていた。
// 対応として、社内ダッシュボード（Supabaseログイン）とは別に、署名画面（/sign/[id]）は
// 本人確認（社員番号＋6桁認証コード）に成功した直後だけ、この短命トークンを発行する。
// PDF取得APIはこのトークンか、社内ダッシュボードの認証ヘッダーのどちらかが無いと403にする。
import crypto from 'crypto'

const EXPIRY_MS = 30 * 60 * 1000 // 30分（プレビューを開いて確認する分には十分な長さ）

function getSecret(): string {
  // 専用の環境変数を新設せず、サーバー側にしか存在しないservice roleキーを鍵として流用する
  // （Vercelへの環境変数追加という追加のデプロイ手順を増やさないための判断）。
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-not-happen'
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

// 本人確認直後に発行する。契約IDと有効期限をpayloadに入れ、HMACで署名する。
export function createPdfAccessToken(contractId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS
  const payload = `${contractId}.${expiresAt}`
  const sig = sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

// PDF取得API側で検証する。対象の契約IDと一致し、期限内で、署名が正しいことを確認する。
export function verifyPdfAccessToken(token: string, contractId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return false
    const [tokenContractId, expiresAtStr, sig] = parts
    if (tokenContractId !== contractId) return false
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
    const expectedSig = sign(`${tokenContractId}.${expiresAtStr}`)
    // タイミング攻撃対策：長さが違うとtimingSafeEqualが例外を投げるため先にlengthを揃えて比較
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
