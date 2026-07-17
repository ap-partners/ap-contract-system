// ===== マイページ：書類詳細の取得（セッションベース） =====
// 2026-07-17新設。/api/sign/[id]/verify（社員番号＋認証コード方式）のマイページ版。
// ログインセッションで本人確認済みのため、社員番号・認証コードの入力は不要。
// 署名待ち・署名済みどちらの書類も、ログイン中の本人のものであれば閲覧できる
// （署名済みの場合はPDFプレビュー用トークンのみ返す＝再度署名操作はさせない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStaffIdFromRequest } from '@/lib/staffAuth'
import { createPdfAccessToken } from '@/lib/pdfAccessToken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${(documentType || '').replace(/\n/g, ' ')}${suffix}`
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staffId = getStaffIdFromRequest(req)
  if (!staffId) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { id } = await context.params
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, staff_id, status, document_type, contract_type, sign_action_type')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '対象の書類が見つかりませんでした。' }, { status: 404 })
  }
  if (contract.staff_id !== staffId) {
    return NextResponse.json({ error: 'この書類を閲覧する権限がありません。' }, { status: 403 })
  }
  if (!['署名待ち', '署名済み', '完了'].includes(contract.status)) {
    return NextResponse.json({ error: '現在この書類は閲覧できない状態です。' }, { status: 409 })
  }

  const signAction: 'signature' | 'confirmation' =
    contract.sign_action_type === 'signature' || contract.sign_action_type === 'confirmation'
      ? contract.sign_action_type
      : contract.document_type === '就業条件明示書'
        ? 'confirmation'
        : 'signature'

  return NextResponse.json({
    documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
    signAction,
    status: contract.status,
    pdfToken: createPdfAccessToken(id),
  })
}
