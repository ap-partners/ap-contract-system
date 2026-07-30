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

  // CSV反映項目の修正が無ければ何もしない
  if (!contract.csv_modified_fields || (Array.isArray(contract.csv_modified_fields) && contract.csv_modified_fields.length === 0)) {
    return NextResponse.json({ sent: false, reason: 'no_modified_fields' })
  }
  // 2026-07-30実機確認で発覚した不具合の修正：呼び出し元（handleApprove等）は
  // notify-sign-requestと本APIを連続して呼ぶ設計だが、notify-sign-request側が
  // 「SSC承認済み→署名待ち」への遷移を即座に行うため、本APIが呼ばれる時点では
  // 既にstatusが「署名待ち」（またはそれ以降）に進んでいることがある。
  // 「status==='SSC承認済み'」限定にすると、この一瞬の差でnot_approved扱いとなり
  // 通知が永久に飛ばなくなっていた（csv_modified_notified_atが常にnullのまま）。
  // 本APIは承認系ハンドラからのみ呼ばれる前提のため、「申請中」「差し戻し中」「取り下げ」
  // （＝まだ承認されていない、または承認前に取り下げられた状態）以外なら承認後とみなす。
  if (contract.status === '申請中' || contract.status === '差し戻し中' || contract.status === '取り下げ') {
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

  // 2026-07-30追加（伊藤さんフィードバック対応）：冒頭の承認者表記をSSC固定から実際の
  // 承認者ロールに応じた表記へ変更するため、approved_byをstaff_rolesで引く。
  // 何らかの理由でロールが取得できない場合は従来通り「SSC」表記にフォールバックする。
  const { data: approverRow } = contract.approved_by
    ? await supabaseAdmin.from('staff_roles').select('role').eq('id', contract.approved_by).maybeSingle()
    : { data: null }
  const approverRoleLabel = approverRow?.role || 'SSC'

  const systemType = contract.input_data?.csvMeta?.csvSystem || '(不明)'
  const documentLabel = getDocumentLabel(contract.document_type, contract.contract_type)
  // 2026-07-30追加：就業場所名・CSVデータ上の派遣期間を本文に追加表示するため、
  // 申請時にinput_data.fieldsへ保存済みの値（STEP2就業先情報・STEP3期間情報）を参照する。
  // 2026-07-30実機確認で発覚した不具合の修正：フィールドの実キー名は「workLocationName」
  // （STEP2 UIコンポーネント側の保存キー名）であり「locationName」ではなかったため、
  // 常に空欄（本文「―」表示）になっていた。実データで確認したキー名に修正。
  const workLocationName = contract.input_data?.fields?.workLocationName || ''
  const dispatchStart = contract.input_data?.fields?.dispatchStart || null
  const dispatchEnd = contract.input_data?.fields?.dispatchEnd || null
  // 2026-07-30追加：対象システムの下に契約番号（csv_raw_data.unique_key相当。
  // e-staffing=契約No／HRstation=契約番号／winworks=個別契約番号／Staffia=個別契約書番号）を追加表示。
  // app/apply/page.tsx申請時にinput_data.csvMeta.csvContractNoとして保存済みの値をそのまま使う。
  const contractNo = contract.input_data?.csvMeta?.csvContractNo || ''

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
      id,
      workLocationName,
      dispatchStart,
      dispatchEnd,
      approverRoleLabel,
      contractNo
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
