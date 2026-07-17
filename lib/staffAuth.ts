// ===== マイページ：セッションCookieからログイン中の従業員を特定する共通処理 =====
// 2026-07-17新設。lib/staffSession.tsのトークン検証をNextRequest/NextResponseから
// 使いやすくするための薄いラッパー。
import { NextRequest, NextResponse } from 'next/server'
import { STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, verifyStaffSessionToken, createStaffSessionToken } from './staffSession'

// リクエストのCookieからログイン中のstaff.idを取得する。未ログイン・無効な場合はnull。
export function getStaffIdFromRequest(req: NextRequest): string | null {
  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value
  return verifyStaffSessionToken(token)
}

// ログイン成功時にレスポンスへセッションCookieを設定する。
export function setStaffSessionCookie(res: NextResponse, staffId: string): void {
  const token = createStaffSessionToken(staffId)
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
