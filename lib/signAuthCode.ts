// ===== /sign/[id] 本人確認用：6桁認証コード共通処理 =====
// 2026-07-13追加：本人確認方式を「社員番号＋生年月日」から「社員番号＋6桁認証コード」へ
// 変更したことに伴い、notify-sign-request（初回発行）・reissue（再発行）の両方で
// 同じロジックを使うため共通化する（docs/SYSTEM_DESIGN.md 10章 2026-07-13決定）。

// 有効期限：発行から2日間（旧URL7日間固定案は不採用に一本化・伊藤さん決定）
export const SIGN_AUTH_CODE_EXPIRY_DAYS = 2

// 試行回数上限：5回間違えると失効（再発行が必要になる・伊藤さん決定）
export const SIGN_AUTH_MAX_ATTEMPTS = 5

// 6桁の数字コードを生成する（先頭0埋め、"000000"〜"999999"）
export function generateSignAuthCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export function computeSignAuthCodeExpiry(from: Date = new Date()): string {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + SIGN_AUTH_CODE_EXPIRY_DAYS)
  return expires.toISOString()
}
