// ===== マイページ：セッションCookieからログイン中の従業員を特定する共通処理 =====
// 2026-07-17新設。lib/staffSession.tsのトークン検証をNextRequest/NextResponseから
// 使いやすくするための薄いラッパー。
// 2026-07-17修正：staffSession.tsをWeb Crypto API（非同期）へ書き換えたことに伴い、
// こちらの関数も非同期に変更（Edge Runtimeのmiddlewareから呼べるようにするため）。
import { NextRequest, NextResponse } from 'next/server'
import { STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, verifyStaffSessionToken, createStaffSessionToken } from './staffSession'

// リクエストのCookieからログイン中のstaff.idを取得する。未ログイン・無効な場合はnull。
export async function getStaffIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value
  return verifyStaffSessionToken(token)
}

// ログイン成功時にレスポンスへセッションCookieを設定する。
export async function setStaffSessionCookie(res: NextResponse, staffId: string): Promise<void> {
  const token = await createStaffSessionToken(staffId)
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
