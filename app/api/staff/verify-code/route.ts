// ===== マイページ：認証コードの照合 =====
// 2026-07-17新設。初回ログイン・パスワード再設定の共通入口。社員番号＋6桁コードを照合し、
// 成功したら「続けてパスワードを設定してよい」という短命トークン（resetToken）を発行する
// （/sign/[id]の本人確認ロジックと同じ考え方：エラーメッセージは社員番号・コードどちらが
// 違うか区別しない。5回間違えると失効し、再度/api/staff/request-codeが必要）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SIGN_AUTH_MAX_ATTEMPTS } from '@/lib/signAuthCode'
import { createStaffResetToken } from '@/lib/staffResetToken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const authCode = (body?.authCode || '').trim()

  if (!employeeNumber || !authCode) {
    return NextResponse.json({ error: '社員番号と認証コードを入力してください。' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('id, employee_number, login_auth_code, login_auth_code_expires_at, login_auth_attempts')
    .eq('employee_number', employeeNumber)
    .maybeSingle()

  if (error || !staff) {
    return NextResponse.json({ error: '確認できませんでした。入力内容をご確認ください。', reason: 'invalid' }, { status: 401 })
  }

  if ((staff.login_auth_attempts || 0) >= SIGN_AUTH_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: '認証コードの入力回数が上限を超えました。\n「認証コードを再送する」から新しいコードを取得してください。', reason: 'locked' },
      { status: 423 }
    )
  }

  if (!staff.login_auth_code || !staff.login_auth_code_expires_at || new Date(staff.login_auth_code_expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: '認証コードの有効期限が切れています。\n「認証コードを再送する」から新しいコードを取得してください。', reason: 'expired' },
      { status: 410 }
    )
  }

  if (staff.login_auth_code !== authCode) {
    const nextAttempts = (staff.login_auth_attempts || 0) + 1
    await supabaseAdmin.from('staff').update({ login_auth_attempts: nextAttempts }).eq('id', staff.id)
    const remaining = SIGN_AUTH_MAX_ATTEMPTS - nextAttempts
    if (remaining <= 0) {
      return NextResponse.json(
        { error: '認証コードの入力回数が上限を超えました。\n「認証コードを再送する」から新しいコードを取得してください。', reason: 'locked' },
        { status: 423 }
      )
    }
    return NextResponse.json(
      { error: `確認できませんでした。入力内容をご確認ください。\nあと${remaining}回間違えると、再送が必要になります。`, reason: 'invalid' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    verified: true,
    resetToken: createStaffResetToken(staff.id),
  })
}
