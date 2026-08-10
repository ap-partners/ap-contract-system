// ===== マイページ：未ログイン時のアクセス保護 =====
// 2026-07-17新設。/staff/mypage 以下は、セッションCookieが無い／無効な場合に
// /staff/login へリダイレクトする。セッションの検証はHMAC署名の確認のみ（DBアクセスなし）
// のため軽量。
// 2026-07-17実機確認で発見・修正：当初lib/staffSession.tsがNode標準のcryptoモジュールを
// 使っており、既定のEdge Runtime（middlewareはこちらで動作）ではNode cryptoが使えず
// 常に検証失敗＝未ログイン扱いになっていた（有効なセッションでも/staff/loginへ
// 強制的に戻されていた）。staffSession.tsをWeb Crypto API（Edge・Node両対応）へ
// 書き換えて解消した。
//
// 2026-08-10（B-07対応）：セッション有効期限を30日間→7日間に短縮した代わりに、
// ここでページ遷移のたびに有効期限を延長する（スライディングセッション）。署名・
// 有効期限の検証のみでDB照会は行わない（Edge Runtimeを軽量に保つ設計を維持）。
// 世代番号（session_token_version）の照合・退職チェックはDB照会が必要なため、
// 各APIルート（Node runtime）側のlib/staffAuth.ts・getStaffIdFromRequestで行う。
// このため、強制ログアウト・退職から次にAPIを呼ぶまでの間は、mypageの画面の「殻」自体は
// 一瞬表示されうるが、実際のデータ取得APIはすべて401で弾かれる（意図した挙動）。
import { NextRequest, NextResponse } from 'next/server'
import { STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_AGE_SECONDS, verifyStaffSessionToken, createStaffSessionToken } from '@/lib/staffSession'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value
  const session = await verifyStaffSessionToken(token)
  if (!session) {
    const loginUrl = new URL('/staff/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  const res = NextResponse.next()
  const renewedToken = await createStaffSessionToken(session.staffId, session.tokenVersion)
  res.cookies.set(STAFF_SESSION_COOKIE, renewedToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  })
  return res
}

export const config = {
  matcher: ['/staff/mypage/:path*'],
}
