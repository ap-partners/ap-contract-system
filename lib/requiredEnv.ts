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
