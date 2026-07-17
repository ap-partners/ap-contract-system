// ===== マイページ：未ログイン時のアクセス保護 =====
// 2026-07-17新設。/staff/mypage 以下は、セッションCookieが無い／無効な場合に
// /staff/login へリダイレクトする。セッションの検証はHMAC署名の確認のみ（DBアクセスなし）
// のため軽量。
// 2026-07-17実機確認で発見・修正：当初lib/staffSession.tsがNode標準のcryptoモジュールを
// 使っており、既定のEdge Runtime（middlewareはこちらで動作）ではNode cryptoが使えず
// 常に検証失敗＝未ログイン扱いになっていた（有効なセッションでも/staff/loginへ
// 強制的に戻されていた）。staffSession.tsをWeb Crypto API（Edge・Node両対応）へ
// 書き換えて解消した。
import { NextRequest, NextResponse } from 'next/server'
import { verifyStaffSessionToken } from '@/lib/staffSession'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('staff_session')?.value
  const staffId = await verifyStaffSessionToken(token)
  if (!staffId) {
    const loginUrl = new URL('/staff/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/staff/mypage/:path*'],
}
