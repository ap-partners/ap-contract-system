// ===== 署名画面：認証コード再発行API =====
// 2026-07-13追加。/sign/[id]でコードの有効期限切れ（410）または試行回数上限（423）に
// なった場合、この API を呼んで新しいコードを発行し、メールを再送する
// （docs/SYSTEM_DESIGN.md 10章 2026-07-13決定：再発行後は新コードで再度2日間有効）。
//
// 誰でも任意のcontractIdに対して連打できてしまうと他人宛にメールを送りつけられるため、
// 社員番号での本人一致チェックを必須にする（社員番号は誰でも知り得る情報だが、この
// 契約に紐づく本人の社員番号と一致しない限り再発行は行わない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSignRequestMail } from '@/lib/mail'
import { generateSignAuthCode, computeSignAuthCodeExpiry } from '@/lib/signAuthCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()

  if (!employeeNumber) {
    return NextResponse.json({ error: '社員番号を入力してください。' }, { status: 400 })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, staff_id, status, document_type')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '対象の書類が見つかりませんでした。' }, { status: 404 })
  }

  if (contract.status === '署名済み' || contract.status === '完了') {
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }
  if (contract.status !== '署名待ち') {
    return NextResponse.json({ error: '現在この書類は署名・確認待ちの状態ではありません。' }, { status: 409 })
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('employee_number, email')
    .eq('id', contract.staff_id)
    .maybeSingle()

  if (!staff || staff.employee_number !== employeeNumber) {
    return NextResponse.json({ error: '確認できませんでした。社員番号をご確認ください。' }, { status: 401 })
  }

  const toEmail = staff.email
  if (!toEmail) {
    return NextResponse.json({ error: '送信先メールアドレスが取得できませんでした。' }, { status: 400 })
  }

  const authCode = generateSignAuthCode()
  const authCodeExpiresAt = computeSignAuthCodeExpiry()

  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      sign_auth_code: authCode,
      sign_auth_code_expires_at: authCodeExpiresAt,
      sign_auth_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: '認証コードの更新に失敗しました。' }, { status: 500 })
  }

  const isConfirmationOnly = contract.document_type === '就業条件明示書'

  try {
    await sendSignRequestMail(toEmail, id, isConfirmationOnly, authCode)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
