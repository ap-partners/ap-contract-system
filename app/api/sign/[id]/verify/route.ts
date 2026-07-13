// ===== 署名画面：本人確認API =====
// /sign/[id] の入口で、社員番号＋6桁認証コードによる本人確認を行う（7-2章：ログイン画面は
// 使わない方式）。2026-07-09実装（フェーズ5）、2026-07-13に本人確認方式を「社員番号＋生年月日」
// から「社員番号＋メール記載の6桁認証コード」へ変更（docs/SYSTEM_DESIGN.md 10章 2026-07-13決定）。
// これに伴い、旧「URL有効期限7日間固定」はコード自体の2日間有効期限に一本化され廃止した。
//
// セキュリティ上の理由から、エラーメッセージは「社員番号が違うのかコードが違うのか」を
// 区別しない（総当たり攻撃のヒントを与えないため）。
// コードは5回間違えると失効し、以後は再発行（/api/sign/[id]/reissue）が必要になる。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SIGN_AUTH_MAX_ATTEMPTS } from '@/lib/signAuthCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  const authCode = (body?.authCode || '').trim()

  if (!employeeNumber || !authCode) {
    return NextResponse.json({ error: '社員番号と認証コードを入力してください。' }, { status: 400 })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, staff_id, status, document_type, contract_type, pattern, sign_requested_at, sign_action_type, sign_auth_code, sign_auth_code_expires_at, sign_auth_attempts')
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

  // コードの失効判定（5回間違えると失効。再発行が必要）
  if ((contract.sign_auth_attempts || 0) >= SIGN_AUTH_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: '認証コードの入力回数が上限を超えました。「認証コードを再発行する」からやり直してください。', reason: 'locked' },
      { status: 423 }
    )
  }

  // コードの有効期限判定（発行から2日間）
  if (!contract.sign_auth_code || !contract.sign_auth_code_expires_at || new Date(contract.sign_auth_code_expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: '認証コードの有効期限が切れています。「認証コードを再発行する」から新しいコードを取得してください。', reason: 'expired' },
      { status: 410 }
    )
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('name, employee_number')
    .eq('id', contract.staff_id)
    .maybeSingle()

  if (!staff || staff.employee_number !== employeeNumber || contract.sign_auth_code !== authCode) {
    // 失敗した試行回数を1つ加算する（5回で失効）
    const nextAttempts = (contract.sign_auth_attempts || 0) + 1
    await supabaseAdmin.from('contracts').update({ sign_auth_attempts: nextAttempts }).eq('id', id)
    const remaining = SIGN_AUTH_MAX_ATTEMPTS - nextAttempts
    if (remaining <= 0) {
      return NextResponse.json(
        { error: '認証コードの入力回数が上限を超えました。「認証コードを再発行する」からやり直してください。', reason: 'locked' },
        { status: 423 }
      )
    }
    return NextResponse.json(
      { error: `確認できませんでした。入力内容をご確認ください。（あと${remaining}回間違えると再発行が必要になります）`, reason: 'invalid' },
      { status: 401 }
    )
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
