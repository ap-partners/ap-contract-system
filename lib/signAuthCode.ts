// ===== /sign/[id] 本人確認用：6桁認証コード共通処理 =====
// 2026-07-13追加：本人確認方式を「社員番号＋生年月日」から「社員番号＋6桁認証コード」へ
// 変更したことに伴い、notify-sign-request（初回発行）・reissue（再発行）の両方で
// 同じロジックを使うため共通化する（docs/SYSTEM_DESIGN.md 10章 2026-07-13決定）。

import { randomInt } from 'crypto'

// 有効期限：発行から2日間（旧URL7日間固定案は不採用に一本化・伊藤さん決定）
export const SIGN_AUTH_CODE_EXPIRY_DAYS = 2

// 試行回数上限：5回間違えると失効（再発行が必要になる・伊藤さん決定）
export const SIGN_AUTH_MAX_ATTEMPTS = 5

// 再発行のクールダウン：連打によるメール連投・正規コードの意図しない無効化を防ぐため、
// 直近発行から一定時間内は再発行できないようにする（総合レビュー指摘8対応・2026-07-15）
export const SIGN_AUTH_REISSUE_COOLDOWN_MINUTES = 3

// 6桁の数字コードを生成する（先頭0埋め、"000000"〜"999999"）
// 総合レビュー指摘7対応（2026-07-15）：Math.random()は暗号論的に安全でないため、
// Node標準のcrypto.randomInt()（暗号論的に安全な乱数）に変更。
export function generateSignAuthCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function computeSignAuthCodeExpiry(from: Date = new Date()): string {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + SIGN_AUTH_CODE_EXPIRY_DAYS)
  return expires.toISOString()
}
