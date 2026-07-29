// ===== CSV由来データ修正時の管理部通知API（2026-07-30追加・上司デモ指摘⑥対応） =====
// 担当営業がCSV自動反映項目（STEP2・3・4）をSTEP修正した状態のまま申請し、SSCが承認した
// 瞬間（＝「申請中→SSC承認済み」への遷移が実際に成功した瞬間）にこのAPIを呼び、
// contracts.csv_modified_fields（app/apply/page.tsx申請時点で計算済みの詳細diff）を
// app_labor@appart.co.jp（伊藤さん指定・固定）宛に通知する。
// notify-sign-request（SSC承認済み→署名待ちへの遷移）とは別イベント・別タイミングであるため、
// 承認直後の各呼び出し元（handleApprove／handleForceApprove／各ダッシュボードの一括承認）から
// notify-sign-requestと並べて両方呼ぶ形にする。
// 冪等性：csv_modified_notified_atが既に設定されていれば何もしない（二重送信防止）。
// この通知の成否は承認フロー自体をブロックしない（呼び出し元はtry/catchで失敗を無視する設計）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCsvModifiedNotifyMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

const MANAGEMENT_DEPT_NOTIFY_EMAIL = 'app_labor@appart.co.jp'

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${(documentType || '').replace(/\n/g, ' ')}${suffix}`
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || !staffAuth.role) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { id } = await context.params

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  // CSV反映項目の修正が無い、またはSSC承認直後（承認済み）以外の状態では何もしない
  if (!contract.csv_modified_fields || (Array.isArray(contract.csv_modified_fields) && contract.csv_modified_fields.length === 0)) {
    return NextResponse.json({ sent: false, reason: 'no_modified_fields' })
  }
  if (contract.status !== 'SSC承認済み') {
    return NextResponse.json({ sent: false, reason: 'not_approved' })
  }
  if (contract.csv_modified_notified_at) {
    // 既に送信済み（二重承認呼び出し・二重クリック等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false, reason: 'already_notified' })
  }

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('name, employee_number')
    .eq('id', contract.staff_id)
    .maybeSingle()

  const { data: deptRow } = contract.created_by_dept_no
    ? await supabaseAdmin.from('department_master').select('dept_name').eq('dept_no', contract.created_by_dept_no).maybeSingle()
    : { data: null }

  const systemType = contract.input_data?.csvMeta?.csvSystem || '(不明)'
  const documentLabel = getDocumentLabel(contract.document_type, contract.contract_type)

  // 条件付き更新（同時実行時の二重送信防止）：まだ通知していない場合のみ「送信済み」に更新してから送る
  const now = new Date().toISOString()
  const { data: updatedRow } = await supabaseAdmin
    .from('contracts')
    .update({ csv_modified_notified_at: now })
    .eq('id', id)
    .is('csv_modified_notified_at', null)
    .select('id')
    .maybeSingle()

  if (!updatedRow) {
    // 既に別の呼び出しが同時に処理していた（二重承認ガード等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false, reason: 'already_notified_race' })
  }

  try {
    await sendCsvModifiedNotifyMail(
      MANAGEMENT_DEPT_NOTIFY_EMAIL,
      systemType,
      deptRow?.dept_name || '(部門不明)',
      contract.created_by_name || '(申請者不明)',
      staffRow?.employee_number || '(社員番号不明)',
      staffRow?.name || '(氏名不明)',
      documentLabel,
      contract.csv_modified_fields,
      id
    )
  } catch (e: any) {
    // メール送信失敗時：通知フラグを戻し、次回の承認関連操作で再試行できるようにする。
    // 承認フロー自体はブロックしない（呼び出し元がtry/catchで失敗を無視する設計のため、ここでは
    // エラーレスポンスのみ返す）。
    await supabaseAdmin
      .from('contracts')
      .update({ csv_modified_notified_at: null })
      .eq('id', id)
    return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
