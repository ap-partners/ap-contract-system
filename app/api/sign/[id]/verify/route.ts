// ===== 署名画面：本人確認API =====
// /sign/[id] の入口で、社員番号＋生年月日による本人確認を行う（7-2章：ログイン画面は使わない方式）。
// 2026-07-09実装（フェーズ5）。試行回数制限は今回のスコープ外（次チャット以降で検討。
// docs/SYSTEM_DESIGN.md 10章 2026-07-09の優先順位メモ参照）。
//
// セキュリティ上の理由から、エラーメッセージは「社員番号が違うのか生年月日が違うのか」を
// 区別しない（総当たり攻撃のヒントを与えないため）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// URL有効期限：送信から7日間固定（2026-07-08以前に確定済みの仕様。例外なし）
const SIGN_URL_EXPIRY_DAYS = 7

const PATTERN_C_DOCUMENT_TYPE = '雇用契約書 兼\n就業条件明示書'

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${documentType.replace(/\n/g, ' ')}${suffix}`
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const birthday = (body?.birthday || '').trim()

  if (!employeeNumber || !birthday) {
    return NextResponse.json({ error: '社員番号と生年月日を入力してください。' }, { status: 400 })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, staff_id, status, document_type, contract_type, pattern, sign_requested_at, sign_action_type')
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

  if (contract.sign_requested_at) {
    const expiresAt = new Date(contract.sign_requested_at)
    expiresAt.setDate(expiresAt.getDate() + SIGN_URL_EXPIRY_DAYS)
    if (expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'このリンクの有効期限が切れています。お手数ですが、担当営業までご連絡ください。' },
        { status: 410 }
      )
    }
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('name, employee_number, birthday')
    .eq('id', contract.staff_id)
    .maybeSingle()

  if (!staff || staff.employee_number !== employeeNumber || staff.birthday !== birthday) {
    return NextResponse.json({ error: '確認できませんでした。入力内容をご確認ください。' }, { status: 401 })
  }

  // sign_action_typeがまだ書き込まれていない古いデータ向けのフォールバック
  // （本来はnotify-sign-request APIで署名待ちに遷移した時点で確定・保存される）
  const signAction: 'signature' | 'confirmation' =
    contract.sign_action_type === 'signature' || contract.sign_action_type === 'confirmation'
      ? contract.sign_action_type
      : contract.document_type === '就業条件明示書'
        ? 'confirmation'
        : 'signature'

  return NextResponse.json({
    verified: true,
    staffName: staff.name,
    documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
    signAction,
    isPatternC: contract.document_type === PATTERN_C_DOCUMENT_TYPE,
  })
}
