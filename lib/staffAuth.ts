// ===== マイページ：セッションCookieからログイン中の従業員を特定する共通処理 =====
// 2026-07-17新設。lib/staffSession.tsのトークン検証をNextRequest/NextResponseから
// 使いやすくするための薄いラッパー。
// 2026-07-17修正：staffSession.tsをWeb Crypto API（非同期）へ書き換えたことに伴い、
// こちらの関数も非同期に変更（Edge Runtimeのmiddlewareから呼べるようにするため）。
//
// 2026-08-10（B-07・B-06対応）：getStaffIdFromRequestに、署名・有効期限の検証だけでなく
// DB照会による失効チェックを追加した。
//   ①staff.session_token_versionとCookie内の世代番号が一致しない
//     （＝パスワード変更・強制ログアウト以降に発行された古いセッション）
//   ②退職済み・退職予定日を過ぎている（＝B-06でログイン自体は防いでいても、退職前に
//     既に発行されていたセッションはそれだけでは無効化されないため、ここでも防御する）
// のいずれかに該当すれば無効として扱う。
// このファイルはNode runtimeのAPIルートからのみ呼ばれる（middleware.tsはEdge runtime
// のためDB照会を避け、staffSession.tsの署名検証のみを直接使う設計に据え置いている）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, verifyStaffSessionToken, createStaffSessionToken } from './staffSession'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// リクエストのCookieからログイン中のstaff.idを取得する。未ログイン・無効な場合はnull。
export async function getStaffIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value
  const session = await verifyStaffSessionToken(token)
  if (!session) return null

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('session_token_version, retired_at, retirement_scheduled_at')
    .eq('id', session.staffId)
    .maybeSingle()

  if (error || !staff) return null
  if ((staff.session_token_version ?? 1) !== session.tokenVersion) return null

  const today = new Date().toISOString().slice(0, 10)
  if (staff.retired_at && staff.retired_at < today) return null
  if (staff.retirement_scheduled_at && staff.retirement_scheduled_at < today) return null

  return session.staffId
}

// ログイン成功時にレスポンスへセッションCookieを設定する。
// 2026-08-10：tokenVersion引数を必須化（呼び出し元でstaff.session_token_versionを
// 渡す。取得済みのstaff行から渡すだけなので、ここでは追加のDB照会を行わない）。
export async function setStaffSessionCookie(res: NextResponse, staffId: string, tokenVersion: number): Promise<void> {
  const token = await createStaffSessionToken(staffId, tokenVersion)
  res.cookies.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  })
}

export function clearStaffSessionCookie(res: NextResponse): void {
  res.cookies.set(STAFF_SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
}
