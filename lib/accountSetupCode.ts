// ===== アカウント管理：新規アカウント初回設定／パスワード再設定用の6桁認証コード共通処理 =====
// 2026-07-24新設。lib/signAuthCode.ts（/sign/[id]用）と同じ考え方を、管理部ダッシュボードの
// 「アカウント管理」機能で作成する担当営業・SSC・管理部アカウント（Supabase Auth本体を使う
// ログイン）向けに流用する。対象が別（契約単位ではなくアカウント単位）のため別ファイルとして新設。

import { randomInt } from 'crypto'

// 有効期限：発行から2日間（sign/staffの既存コードと統一）
export const ACCOUNT_SETUP_CODE_EXPIRY_DAYS = 2

// 試行回数上限：5回間違えると失効
export const ACCOUNT_SETUP_MAX_ATTEMPTS = 5

// 再発行のクールダウン：連打によるメール連投防止
export const ACCOUNT_SETUP_REISSUE_COOLDOWN_MINUTES = 3

export function generateAccountSetupCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function computeAccountSetupCodeExpiry(from: Date = new Date()): string {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + ACCOUNT_SETUP_CODE_EXPIRY_DAYS)
  return expires.toISOString()
}
