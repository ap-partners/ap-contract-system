import crypto from 'crypto'

// ===== 認証コード等の定数時間比較 =====
// 総合レビュー指摘21対応（2026-07-27）。6桁認証コードの一致判定に通常の文字列比較（!==）が
// 使われており、理論上タイミング攻撃（レスポンス時間の差から1文字ずつ正解を絞り込む）が
// 成立しうるとの指摘。試行回数制限（指摘15・16対応）が別途あるため実害の可能性は低いが、
// 念のためNode標準のcrypto.timingSafeEqualに統一する。
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // 長さの違いによる早期returnそのものがタイミング差を生まないよう、
    // 同じ長さのダミー比較を1回行ってから不一致を返す。
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}
