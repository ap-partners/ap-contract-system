// ===== PDF取得API用：署名画面向けの短命アクセストークン =====
// 総合レビュー指摘1対応（2026-07-15）。/api/contracts/[id]/pdf は従来、契約UUIDさえ知っていれば
// 未ログインでも氏名・住所・給与を含むPDF（署名済みなら押印済み実物）を取得できてしまっていた。
// 対応として、社内ダッシュボード（Supabaseログイン）とは別に、署名画面（/sign/[id]）は
// 本人確認（社員番号＋6桁認証コード）に成功した直後だけ、この短命トークンを発行する。
// PDF取得APIはこのトークンか、社内ダッシュボードの認証ヘッダーのどちらかが無いと403にする。
import crypto from 'crypto'
import { getRequiredServiceRoleKey } from './requiredEnv'

// 2026-08-14（外部総合品質監査レポート★2 L-11対応）：30分→10分に短縮。
// マイページ・署名画面ともPDFプレビューは開いてすぐ確認する用途がほとんどで、10分あれば
// 通常の確認操作には十分な長さを保ちつつ、URLが万一漏れた場合の悪用可能時間を短縮できる。
// トークンが失効しても、画面を開き直せば新しいトークン付きのリンクが再取得されるだけで
// 利用者側の操作は変わらない（そのままの一発リンクを何十分も貼っておく用途は想定していない）。
const EXPIRY_MS = 10 * 60 * 1000 // 10分

// B-08対応（2026-08-06）：このトークンとlib/staffResetToken.tsのトークンが、同じ秘密鍵
// （service roleキー）・同じペイロード形式（id.expiresAt.署名）を使い回しており、種別を
// 区別する仕組みが無かった（監査指摘）。現状はcontracts.idとstaff.idが独立したランダム
// UUIDのため直ちに悪用できるわけではないが、ペイロード先頭に種別タグを付けることで、
// 万一verify関数の呼び出し側を取り違えた場合でも別種別のトークンとして確実に弾かれる
// ようにする（トークン自体は30分の短命・都度発行のため後方互換は不要）。
const TOKEN_KIND = 'pdf'

function sign(payload: string): string {
  // 専用の環境変数を新設せず、サーバー側にしか存在しないservice roleキーを鍵として流用する
  // （Vercelへの環境変数追加という追加のデプロイ手順を増やさないための判断）。
  return crypto.createHmac('sha256', getRequiredServiceRoleKey()).update(payload).digest('hex')
}

// 本人確認直後に発行する。契約IDと有効期限をpayloadに入れ、HMACで署名する。
export function createPdfAccessToken(contractId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS
  const payload = `${TOKEN_KIND}.${contractId}.${expiresAt}`
  const sig = sign(payload)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

// PDF取得API側で検証する。対象の契約IDと一致し、期限内で、署名が正しいことを確認する。
export function verifyPdfAccessToken(token: string, contractId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 4) return false
    const [kind, tokenContractId, expiresAtStr, sig] = parts
    if (kind !== TOKEN_KIND) return false
    if (tokenContractId !== contractId) return false
    const expiresAt = Number(expiresAtStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
    const expectedSig = sign(`${kind}.${tokenContractId}.${expiresAtStr}`)
    // タイミング攻撃対策：長さが違うとtimingSafeEqualが例外を投げるため先にlengthを揃えて比較
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
