// ===== 更新期限管理：renewal_candidatesの同期ロジック（共通・framework非依存） =====
// 2026-08-12新設（B-17対応）。
//
// 【背景】従来この同期処理（最新の契約データからrenewal_candidates行を作り直す処理）は
// app/dashboard/_shared/useRenewalCandidates.tsのsyncCandidates()というReactフックの中に
// しか存在せず、3ダッシュボードのクライアント側initからしか呼べなかった。そのため、
// 誰もダッシュボードを開かない期間（連休・繁忙期）が続くと、本来45日前に検知されるはずの
// 契約の候補行自体が作られず、45/30/20日のしきい値通知がまとめて飛ばされて「残り7日」で
// 初めて1通届く、という事態が起きていた（外部総合品質監査レポートB-17）。
//
// この関数はReact hooksに依存しない純粋な非同期関数として切り出したもので、
// ①ブラウザ（useRenewalCandidates.tsのsyncCandidates、ログイン中ユーザーのセッション付きクライアント）
// ②サーバー（app/api/cron/renewal-notify/route.ts、service roleクライアント）
// の両方から同じロジックを呼べるようにする。呼び出し元がクライアントを用意して渡すだけで、
// RLSはそのクライアントの権限（ブラウザ側ならログイン中ユーザーのロール、サーバー側なら
// service role＝RLSバイパス）がそのまま適用される。
import type { SupabaseClient } from '@supabase/supabase-js'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'

export const RENEWAL_ALERT_WINDOW_DAYS = 45

// 2026-08-03追加：書類種別（document_type）を正として「雇用期間／派遣期間のどちらが
// 必要か」を判定する共通関数。document_typeが空（欠落データ等）の場合はresolved=falseを返し、
// 呼び出し側で旧来の「フィールドの有無」による判定にフォールバックできるようにする。
export function getDocumentPeriodFlags(documentType: string | null): { needsEmploy: boolean; needsDispatch: boolean; resolved: boolean } {
  const docType = (documentType || '').replace(/\n/g, ' ').trim()
  if (!docType) return { needsEmploy: false, needsDispatch: false, resolved: false }
  return { needsEmploy: docType.includes('雇用契約書'), needsDispatch: docType.includes('就業条件明示書'), resolved: true }
}

// 2026-08-04追加：正社員・無期契約は雇用期間が「期間の定めなし」（契約条件適用開始日のみ）であり、
// 有期契約・アルバイトのような開始日〜終了日の日付レンジという概念を持たない。
export function isIndefiniteEmployType(contractType: string | null | undefined): boolean {
  return contractType === '正社員' || contractType === '無期契約'
}

export type RenewalCandidatesSyncResult = { ok: true } | { ok: false; error: string }

// renewal_candidatesを最新の契約データから作り直す（元 useRenewalCandidates.ts の
// syncCandidates() 本体をそのまま移植。ロジック自体は変更していない）。
export async function runRenewalCandidatesSync(supabase: SupabaseClient): Promise<RenewalCandidatesSyncResult> {
  try {
    const { data: contracts, error: contractsError } = await supabase
      .rpc('get_latest_contracts_for_renewal')

    if (contractsError) return { ok: false, error: `更新候補の同期エラー（contracts取得）: ${contractsError.message}` }
    if (!contracts) return { ok: true }

    const latestRows: any[] = contracts.filter((c: any) => c.employee_number)

    // 契約が更新されると、同じスタッフでも新しいcontract_idで別行がupsertされる。
    // 旧契約に紐づく行は「その行のsource_contract_idが、今回DB関数が返した“どちらかの側面の
    // 最新契約”の契約ID集合に含まれているか」で判定し、含まれていなければ削除する。
    const empNosAll = Array.from(new Set(latestRows.map(r => r.employee_number)))
    if (empNosAll.length > 0) {
      const validContractIds = new Set(latestRows.map(r => r.id))
      const { data: existingRows, error: existingError } = await supabase
        .from('renewal_candidates')
        .select('id, employee_number, source_contract_id')
        .in('employee_number', empNosAll)
      if (existingError) {
        return { ok: false, error: `更新候補の同期エラー（既存行取得）: ${existingError.message}` }
      } else if (existingRows && existingRows.length > 0) {
        const staleIds = existingRows
          .filter(r => !validContractIds.has(r.source_contract_id))
          .map(r => r.id)
        if (staleIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('renewal_candidates')
            .delete()
            .in('id', staleIds)
          if (deleteError) return { ok: false, error: `更新候補の同期エラー（旧契約分の削除）: ${deleteError.message}` }
        }
      }
    }

    // 正社員・無期契約は雇用期間が「期間の定めなし」であり、employ_end自体が残骸データで
    // 非nullになっているケースもあるため、対象社員番号の雇用形態をあらかじめ取得しておく。
    const { data: contractTypeRows } = empNosAll.length > 0
      ? await supabase.from('staff').select('employee_number, contract_type').in('employee_number', empNosAll)
      : { data: [] as { employee_number: string; contract_type: string | null }[] }
    const contractTypeByEmpNo = new Map((contractTypeRows || []).map((r: any) => [r.employee_number, r.contract_type]))

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const rows: any[] = []
    for (const c of latestRows) {
      const docFlags = getDocumentPeriodFlags(c.document_type)
      const isIndefiniteEmployee = isIndefiniteEmployType(contractTypeByEmpNo.get(c.employee_number))
      const relevantEmployEnd = ((!docFlags.resolved || docFlags.needsEmploy) && !isIndefiniteEmployee) ? c.employ_end : null
      const relevantDispatchEnd = (!docFlags.resolved || docFlags.needsDispatch) ? c.dispatch_end : null
      const endDate = relevantEmployEnd || relevantDispatchEnd
      if (!endDate) continue
      const end = new Date(endDate); end.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > RENEWAL_ALERT_WINDOW_DAYS) continue

      rows.push({
        source_contract_id: c.id,
        employee_number: c.employee_number,
        staff_name: c.staff_name || null,
        dept_no: c.created_by_dept_no,
        work_location_name: c.work_location_name || null,
        work_location_address: c.work_location_address || null,
        employ_start_date: c.employ_start || null,
        employ_end_date: c.employ_end || null,
        contract_start_date: c.contract_start_date || null,
        dispatch_start_date: c.dispatch_start || null,
        dispatch_end_date: c.dispatch_end || null,
        data_source: c.csv_mode === 'csv' ? 'csv' : 'manual',
        csv_system: c.csv_system || null,
        work_place: c.work_place || '現場',
        document_type: c.document_type || null,
        previous_contact_fields: {
          cmd: { dept: c.cmd_dept || null, role: c.cmd_role || null, name: c.cmd_name || null, tel: c.cmd_tel || null },
          resp: { dept: c.resp_dept || null, role: c.resp_role || null, name: c.resp_name || null, tel: c.resp_tel || null },
          comp: { dept: c.comp_dept || null, role: c.comp_role || null, name: c.comp_name || null, tel: c.comp_tel || null },
        },
      })
    }

    if (rows.length === 0) return { ok: true }

    // 退職済み・退職予定のスタッフを除外する（クエリ段階で絞り込む）
    const empNos = rows.map(r => r.employee_number)
    const [retiredAtOk, retirementScheduledOk] = excludeRetiredStaffOr()
    const { data: staffRows } = await supabase
      .from('staff')
      .select('employee_number')
      .in('employee_number', empNos)
      .or(retiredAtOk).or(retirementScheduledOk)
    const activeEmpNoSet = new Set((staffRows || []).map((s: any) => s.employee_number))
    const targetRows = rows.filter(r => activeEmpNoSet.has(r.employee_number))
    if (targetRows.length === 0) return { ok: true }

    // 既存行（スタッフ入力済みの値）は上書きしないよう、スナップショット項目のみ更新
    const { error: upsertError } = await supabase
      .from('renewal_candidates')
      .upsert(targetRows, { onConflict: 'source_contract_id', ignoreDuplicates: false })
    if (upsertError) return { ok: false, error: `更新候補の同期エラー（upsert）: ${upsertError.message}` }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
