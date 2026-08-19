// ===== 必須環境変数の取得（フェイルクローズ） =====
// 総合レビュー指摘17対応（2026-07-27）。lib/staffSession.ts・lib/pdfAccessToken.ts・
// lib/staffResetToken.tsは、署名鍵としてSUPABASE_SERVICE_ROLE_KEYを流用しているが、
// 従来は未設定時に固定文字列'fallback-secret-should-not-happen'へフォールバックしていた。
// これは環境変数の設定漏れがあった場合に「誰でも同じ固定文字列で正規のセッション・
// トークンを偽造できてしまう」フェイルオープンな設計だったため、未設定時は例外を投げて
// 即座にエラーとして検知できるフェイルクローズに変更する。Edge Runtime（middleware）・
// Node.js Runtimeの両方から呼ばれるため、process.envのみを参照する（Node固有のcrypto等には依存しない）。
export function getRequiredServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEYが設定されていません。')
  }
  return key
}

// ===== セッション・トークン署名専用の鍵（改善提案#15対応・2026-08-19） =====
// 従来、lib/pdfAccessToken.ts・lib/staffResetToken.ts・lib/staffSession.tsの3箇所は、
// DB全体へ直接アクセスできる最強の鍵SUPABASE_SERVICE_ROLE_KEYをHMAC署名鍵として流用していた
// （B-08対応時点では種別タグでの区別のみに留めていた）。外部監査の改善提案により、
// 「セッション・トークンの署名」という用途専用の鍵SESSION_SIGNING_SECRETに分離する。
// 万一この鍵をローテーションする必要が生じても、DBアクセス権限を持つservice roleキー
// 自体には影響を与えずに済む（責務の分離）。フェイルクローズ方針は上記と同じ。
export function getRequiredSessionSigningSecret(): string {
  const key = process.env.SESSION_SIGNING_SECRET
  if (!key) {
    throw new Error('SESSION_SIGNING_SECRETが設定されていません。')
  }
  return key
}
