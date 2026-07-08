// ===== 署名依頼通知API =====
// 呼び出し元は2箇所あり、trigger パラメータで区別する。
//   ① trigger=auto_approve（デフォルト）：SSC承認直後
//      （app/dashboard/ssc/contracts/[id]/page.tsx）。
//      締結パターンが「指定しない（自動送信）」かつ現在ステータスが「SSC承認済み」の
//      時だけ、ここで「署名待ち」へ自動遷移してメール送信する（9-1章タスク8の残課題・
//      2026-07-08フェーズ5でまとめて対応）。「対面」「印刷」パターンはここでは何もしない
//      （担当営業の「説明完了」ボタンを待つ）。
//   ② trigger=explain：担当営業の「説明完了」ボタン押下時
//      （app/dashboard/sales/page.tsx）。対面・印刷パターン専用で、現在ステータスが
//      「SSC承認済み」であれば無条件で「署名待ち」へ遷移してメール送信する。
// どちらの分岐も「SSC承認済み→署名待ち」という一方向の遷移が前提のため、
// 二重クリック等で既に「署名待ち」になっている場合は対象外（何もしない＝二重送信防止）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSignRequestMail } from '@/lib/mail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const trigger = req.nextUrl.searchParams.get('trigger') || 'auto_approve'

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  if (contract.status !== 'SSC承認済み') {
    // 対象外（既に署名待ちに進んでいる／差し戻し中等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false })
  }

  const shouldTransition =
    trigger === 'explain'
      ? contract.closing_pattern !== 'auto' // 対面・印刷パターンのみ
      : contract.closing_pattern === 'auto' // 指定しない（自動送信）のみ

  if (!shouldTransition) {
    return NextResponse.json({ sent: false })
  }

  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({ status: '署名待ち', sign_requested_at: now, updated_at: now })
    .eq('id', id)
    .eq('status', 'SSC承認済み') // 二重実行の競合を避けるための条件付き更新
    .select()
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    // 既に別の呼び出しで遷移済み（同時クリック等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false })
  }

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('email')
    .eq('id', updatedRow.staff_id)
    .maybeSingle()

  const toEmail = staffRow?.email
  if (!toEmail) {
    return NextResponse.json({ error: '送信先メールアドレスが取得できませんでした。' }, { status: 400 })
  }

  const isConfirmationOnly = updatedRow.document_type === '就業条件明示書'

  try {
    await sendSignRequestMail(toEmail, id, isConfirmationOnly)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
