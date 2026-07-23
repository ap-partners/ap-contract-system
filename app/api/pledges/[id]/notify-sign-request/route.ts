// ===== アルバイト誓約書：署名依頼通知API =====
// app/api/contracts/[id]/notify-sign-request/route.ts のpledges版。
// pledgesには雇用契約書のような「締結パターン（指定しない／対面／印刷）」の選択STEPが無いため、
// triggerパラメータでの分岐は行わない。SSC/管理部の承認直後に必ずこのAPIを呼び、
// 無条件で「SSC承認済み→署名待ち」へ遷移させ、従業員へマイページ案内メールを送る。
// フローは雇用契約書と同じ（申請→SSC承認→スタッフ署名）と過去のトーク履歴で確定済み
// （docs/SYSTEM_DESIGN.md 10章2026-06-18参照）のため、sign_action_typeは常に'signature'とする。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendStaffLoginCodeMail, sendStaffDocumentReadyMail } from '@/lib/mail'
import { generateSignAuthCode, computeSignAuthCodeExpiry } from '@/lib/signAuthCode'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLEDGE_DOCUMENT_LABEL = 'アルバイト誓約書'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || !staffAuth.role) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { id } = await context.params

  const { data: pledge, error } = await supabaseAdmin
    .from('pledges')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !pledge) {
    return NextResponse.json({ error: '申請データが見つかりませんでした。' }, { status: 404 })
  }

  if (pledge.status !== 'SSC承認済み') {
    // 二重送信防止のため何もしない（既に署名待ちに進んでいる等）。
    return NextResponse.json({ sent: false })
  }

  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('pledges')
    .update({
      status: '署名待ち',
      sign_requested_at: now,
      sign_action_type: 'signature',
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'SSC承認済み') // 二重実行の競合を避けるための条件付き更新
    .select()
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    return NextResponse.json({ sent: false })
  }

  const rollbackToApproved = async () => {
    await supabaseAdmin
      .from('pledges')
      .update({
        status: 'SSC承認済み',
        sign_requested_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', '署名待ち')
  }

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('id, email, name, employee_number, is_initial_login')
    .eq('id', updatedRow.staff_id)
    .maybeSingle()

  const toEmail = staffRow?.email
  if (!staffRow || !toEmail) {
    await rollbackToApproved()
    return NextResponse.json(
      { error: '送信先メールアドレスが取得できませんでした。ステータスは「SSC承認済み」に戻しました。スタッフのメールアドレス登録をご確認のうえ、もう一度お試しください。' },
      { status: 400 }
    )
  }

  try {
    if (staffRow.is_initial_login) {
      const authCode = generateSignAuthCode()
      const authCodeExpiresAt = computeSignAuthCodeExpiry()
      await supabaseAdmin
        .from('staff')
        .update({ login_auth_code: authCode, login_auth_code_expires_at: authCodeExpiresAt, login_auth_attempts: 0 })
        .eq('id', staffRow.id)
      await sendStaffLoginCodeMail(toEmail, staffRow.employee_number, authCode, staffRow.name, 'initial', PLEDGE_DOCUMENT_LABEL)
    } else {
      await sendStaffDocumentReadyMail(toEmail, staffRow.name, PLEDGE_DOCUMENT_LABEL)
    }
  } catch (e: any) {
    await rollbackToApproved()
    return NextResponse.json(
      { error: 'メール送信に失敗しました。ステータスは「SSC承認済み」に戻しましたので、もう一度お試しください：' + (e?.message || '') },
      { status: 500 }
    )
  }

  return NextResponse.json({ sent: true })
}
