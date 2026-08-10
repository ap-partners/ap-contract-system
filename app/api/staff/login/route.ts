// ===== マイページ：社員番号＋パスワードでのログイン =====
// 2026-07-17新設。パスワード未設定（is_initial_login=true）の場合はこのAPIではログインさせず、
// 認証コード側のフロー（/api/staff/request-code → verify-code → set-password）に誘導する。
//
// 2026-08-10（B-05・B-06対応）：
// ①IP単位のレート制限を追加（社員番号を変えながら大量に試す総当たり・在籍者リストの
//   割り出しを防ぐ）。
// ②ログインの恒久ロック（パスワード再設定でしか解除できない）を、時間経過で自動解除する
//   方式（15分）に変更。全社員番号を総当たりされると全社ログイン不能になる問題への対応。
// ③退職者・退職予定日を過ぎたスタッフはログインできないようにする（存在しない社員番号と
//   同じ応答にして、在籍状況が外部から推測できないようにする）。
// ④ロック中・退職済みのいずれも、他の失敗（パスワード誤り等）と同じ汎用エラー文言・
//   ステータスコードで応答する（伊藤さん確認済み：ロック中・退職者とも同じ汎用文言）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPassword } from '@/lib/staffPassword'
import { setStaffSessionCookie } from '@/lib/staffAuth'
import { incrementAttemptCounter } from '@/lib/attemptCounter'
import { checkRateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/getClientIp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 総当たり対策：10回連続で間違えたら、一定時間ログインできなくなる（2026-08-10：
// 「パスワード再設定でしか解けない恒久ロック」から「時間経過で自動解除」に変更）。
const MAX_PASSWORD_ATTEMPTS = 10
const LOCK_DURATION_MINUTES = 15

// 社員番号の存在有無を外部から推測されないよう、同じエラー文言で応答する。
const genericError = '社員番号またはパスワードが正しくありません。'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const withinLimit = await checkRateLimit(supabaseAdmin, `staff-login:${ip}`, 30, 300)
  if (!withinLimit) {
    return NextResponse.json({ error: 'しばらく時間をおいてから、もう一度お試しください。' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const password = (body?.password || '')

  if (!employeeNumber || !password) {
    return NextResponse.json({ error: '社員番号とパスワードを入力してください。' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('id, name, employee_number, password_hash, is_initial_login, login_password_attempts, login_locked_until, session_token_version, retired_at, retirement_scheduled_at')
    .eq('employee_number', employeeNumber)
    .maybeSingle()

  if (error || !staff) {
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const isRetired = (staff.retired_at && staff.retired_at < today) || (staff.retirement_scheduled_at && staff.retirement_scheduled_at < today)
  if (isRetired) {
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  if (staff.is_initial_login) {
    return NextResponse.json(
      { error: 'まだパスワードが設定されていません。「初めての方・認証コードでログイン」からお手続きください。', reason: 'initial_login_required' },
      { status: 400 }
    )
  }

  if (staff.login_locked_until && new Date(staff.login_locked_until).getTime() > Date.now()) {
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  if (!verifyPassword(password, staff.password_hash)) {
    // 総合レビュー指摘15対応：DB側のアトミックなインクリメントに一本化し競合状態を回避
    const nextAttempts = await incrementAttemptCounter(supabaseAdmin, { table: 'staff', column: 'login_password_attempts' }, staff.id)
    if (nextAttempts >= MAX_PASSWORD_ATTEMPTS) {
      await supabaseAdmin
        .from('staff')
        .update({
          login_password_attempts: 0,
          login_locked_until: new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString(),
        })
        .eq('id', staff.id)
    }
    return NextResponse.json({ error: genericError }, { status: 401 })
  }

  await supabaseAdmin.from('staff').update({ login_password_attempts: 0, login_locked_until: null }).eq('id', staff.id)

  const res = NextResponse.json({ success: true, staffName: staff.name })
  await setStaffSessionCookie(res, staff.id, staff.session_token_version ?? 1)
  return res
}
