// ===== マイページ：未ログイン時のアクセス保護 =====
// 2026-07-17新設。/staff/mypage 以下は、セッションCookieが無い／無効な場合に
// /staff/login へリダイレクトする。セッションの検証はHMAC署名の確認のみ（DBアクセスなし）
// のため、Edge Middlewareでも軽量に動作する。
import { NextRequest, NextResponse } from 'next/server'
import { verifyStaffSessionToken } from '@/lib/staffSession'

export function middleware(req: NextRequest) {
  const token = req.cookies.get('staff_session')?.value
  const staffId = verifyStaffSessionToken(token)
  if (!staffId) {
    const loginUrl = new URL('/staff/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/staff/mypage/:path*'],
}
