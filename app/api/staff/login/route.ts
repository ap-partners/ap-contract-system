// ===== マイページ：社員番号＋パスワードでのログイン =====
// 2026-07-17新設。パスワード未設定（is_initial_login=true）の場合はこのAPIではログインさせず、
// 認証コード側のフロー（/api/staff/request-code → verify-code → set-password）に誘導する。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPassword } from '@/lib/staffPassword'
import { setStaffSessionCookie } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 総当たり対策：10回連続で間違えたら、認証コードでの再設定が必要になる
// （画面側は「パスワードをお忘れの場合」導線に案内する）。
const MAX_PASSWORD_ATTEMPTS = 10

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const password = (body?.password || '')

  if (!employeeNumber || !password) {
    return NextResponse.json({ error: '社員番号とパスワードを入力してください。' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('id, name, employee_number, password_hash, is_initial_login, login_password_attempts')
    .eq('employee_number', employeeNumber)
    .maybeSingle()

  // 社員番号の存在有無を外部から推測されないよう、同じエラー文言で応答する。
  const genericError = '社員番号またはパスワードが正しくありません。'

  if (error || !staff) {
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  if (staff.is_initial_login) {
    return NextResponse.json(
      { error: 'まだパスワードが設定されていません。「初めての方・認証コードでログイン」からお手続きください。', reason: 'initial_login_required' },
      { status: 400 }
    )
  }

  if ((staff.login_password_attempts || 0) >= MAX_PASSWORD_ATTEMPTS) {
    return NextResponse.json(
      { error: 'パスワードの入力回数が上限を超えました。「パスワードをお忘れの場合」から再設定してください。', reason: 'locked' },
      { status: 423 }
    )
  }

  if (!verifyPassword(password, staff.password_hash)) {
    await supabaseAdmin
      .from('staff')
      .update({ login_password_attempts: (staff.login_password_attempts || 0) + 1 })
      .eq('id', staff.id)
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  await supabaseAdmin.from('staff').update({ login_password_attempts: 0 }).eq('id', staff.id)

  const res = NextResponse.json({ success: true, staffName: staff.name })
  setStaffSessionCookie(res, staff.id)
  return res
}
