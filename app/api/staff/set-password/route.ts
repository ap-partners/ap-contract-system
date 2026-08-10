// ===== マイページ：パスワードの設定（初回ログイン／パスワード再設定の最終ステップ） =====
// 2026-07-17新設。/api/staff/verify-codeで発行されたresetTokenを検証したうえでパスワードを
// 保存し、そのままログインセッションを開始する（設定してすぐマイページに入れるように）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyStaffResetToken } from '@/lib/staffResetToken'
import { hashPassword, isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from '@/lib/staffPassword'
import { setStaffSessionCookie } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const resetToken = (body?.resetToken || '').trim()
  const newPassword = (body?.newPassword || '')

  if (!employeeNumber || !resetToken || !newPassword) {
    return NextResponse.json({ error: '入力内容をご確認ください。' }, { status: 400 })
  }
  if (!isPasswordValid(newPassword)) {
    return NextResponse.json({ error: PASSWORD_REQUIREMENT_MESSAGE }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('id, name')
    .eq('employee_number', employeeNumber)
    .maybeSingle()

  if (error || !staff) {
    return NextResponse.json({ error: '確認できませんでした。お手数ですが、最初からやり直してください。' }, { status: 401 })
  }

  if (!verifyStaffResetToken(resetToken, staff.id)) {
    return NextResponse.json({ error: '確認の有効期限が切れました。お手数ですが、最初からやり直してください。' }, { status: 401 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('staff')
    .update({
      password_hash: hashPassword(newPassword),
      is_initial_login: false,
      login_auth_code: null,
      login_auth_code_expires_at: null,
      login_auth_attempts: 0,
      login_password_attempts: 0,
      login_locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', staff.id)

  if (updateError) {
    return NextResponse.json({ error: 'パスワードの保存に失敗しました。' }, { status: 500 })
  }

  // 2026-08-10（B-07対応）：パスワードを変更した際、他の端末に残っている既存セッションを
  // 無効化するため、世代番号を繰り上げる。今回発行するセッションCookieは新しい世代番号を使う。
  const { data: newVersion, error: versionError } = await supabaseAdmin.rpc('revoke_staff_sessions', { p_staff_id: staff.id })
  if (versionError || typeof newVersion !== 'number') {
    return NextResponse.json(
      { error: 'パスワードは保存されましたが、ログイン処理に失敗しました。お手数ですが、ログイン画面から改めてログインしてください。' },
      { status: 500 }
    )
  }

  const res = NextResponse.json({ success: true, staffName: staff.name })
  await setStaffSessionCookie(res, staff.id, newVersion)
  return res
}
