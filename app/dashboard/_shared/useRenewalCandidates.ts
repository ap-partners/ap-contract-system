// ===== 更新期限管理タブの共通データ取得・操作ロジック =====
// 管理部・担当営業ダッシュボードで共有する（docs/SYSTEM_DESIGN.md 10章 2026-07-14
// 「更新期限管理タブの仕様を確定」参照）。
//
// スコープ（今回のチャットで実装する範囲）：
// ①現場契約（work_place='現場'）のうち雇用期間終了日が45日以内（超過含む）の最新契約を検知し、
//   renewal_candidatesへ登録する。②スタッフ/クライアント意向のトグル入力。③CSV対象は新しい
// 派遣期間を自動検索して差異表示、CSV非対象（または「派遣先変更」で手入力に切替た場合）は
// 派遣期間を手入力→雇用期間へコピー。④CSVインポート依頼（requestsテーブル）。⑤一括ステータス更新。
// 対象外（次回以降）：自動メール通知、「全項目を編集」からのフル編集画面連携、送付・署名フローへの統合。
'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export const RENEWAL_ALERT_WINDOW_DAYS = 45

export type RenewalCandidate = {
  id: string
  source_contract_id: string
  employee_number: string
  staff_name: string | null
  dept_no: number | null
  work_location_name: string | null
  employ_end_date: string | null
  dispatch_end_date: string | null
  data_source: 'csv' | 'manual'
  csv_system: string | null
  staff_intent: 'unconfirmed' | 'renew' | 'end'
  client_intent: 'unconfirmed' | 'ok' | 'ng'
  no_renewal_reason: string | null
  manual_override: boolean
  manual_override_reason: string | null
  new_employ_start: string | null
  new_employ_end: string | null
  new_dispatch_start: string | null
  new_dispatch_end: string | null
  new_work_location_name: string | null
  new_work_address: string | null
  new_csv_raw_data_id: string | null
  status: 'pending' | 'csv_pending' | 'ready'
  created_at: string
  updated_at: string
}

// 残日数（マイナス＝超過）。基準日は雇用期間終了日を優先し、無ければ派遣期間終了日。
export function remainingDays(c: Pick<RenewalCandidate, 'employ_end_date' | 'dispatch_end_date'>): number | null {
  const target = c.employ_end_date || c.dispatch_end_date
  if (!target) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(target); end.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function useRenewalCandidates() {
  const [candidates, setCandidates] = useState<RenewalCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ①検知・登録：現場契約のうち、スタッフごとに最新の契約を対象に、雇用期間終了日が
  // 45日以内（超過含む）のものをrenewal_candidatesへupsertする。既存行のスタッフ/クライアント意向・
  // ステータス等（担当営業が入力した値）は上書きしない。退職済み・退職予定のスタッフは対象外。
  const syncCandidates = useCallback(async () => {
    setSyncing(true)
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, created_at, created_by_dept_no, csv_raw_data_id, input_data')
        .eq('work_place', '現場')
        .not('status', 'in', '("差し戻し中","取り下げ")')
        .order('created_at', { ascending: false })

      if (!contracts) return

      // スタッフ（社員番号）ごとに最新の1件だけを残す
      const latestByStaff = new Map<string, any>()
      for (const c of contracts) {
        const empNo = c.input_data?.staff?.employee_number
        if (!empNo) continue
        if (!latestByStaff.has(empNo)) latestByStaff.set(empNo, c)
      }

      const today = new Date(); today.setHours(0, 0, 0, 0)
      const rows: any[] = []
      for (const [empNo, c] of latestByStaff.entries()) {
        const f = c.input_data?.fields || {}
        const endDate = f.employEnd || f.dispatchEnd
        if (!endDate) continue
        const end = new Date(endDate); end.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > RENEWAL_ALERT_WINDOW_DAYS) continue

        rows.push({
          source_contract_id: c.id,
          employee_number: empNo,
          staff_name: c.input_data?.staff?.name || null,
          dept_no: c.created_by_dept_no,
          work_location_name: f.workLocationName || null,
          employ_end_date: f.employEnd || null,
          dispatch_end_date: f.dispatchEnd || null,
          data_source: c.input_data?.csvMeta?.csvMode === 'csv' ? 'csv' : 'manual',
          csv_system: c.input_data?.csvMeta?.csvSystem || null,
        })
      }

      if (rows.length === 0) return

      // 退職済み・退職予定のスタッフを除外
      const empNos = rows.map(r => r.employee_number)
      const { data: staffRows } = await supabase
        .from('staff')
        .select('employee_number, retired_at, retirement_scheduled_at')
        .in('employee_number', empNos)
      const todayStr = today.toISOString().split('T')[0]
      const retiredSet = new Set(
        (staffRows || [])
          .filter(s => (s.retired_at && s.retired_at < todayStr) || (s.retirement_scheduled_at && s.retirement_scheduled_at < todayStr))
          .map(s => s.employee_number)
      )
      const targetRows = rows.filter(r => !retiredSet.has(r.employee_number))
      if (targetRows.length === 0) return

      // 既存行（スタッフ入力済みの値）は上書きしないよう、スナップショット項目のみ更新
      await supabase
        .from('renewal_candidates')
        .upsert(targetRows, { onConflict: 'source_contract_id', ignoreDuplicates: false })
    } finally {
      setSyncing(false)
    }
  }, [])

  // ②一覧取得。deptNo指定時はその部門のみ（担当営業用）、nullは全部門（管理部・SSC用）
  const fetchCandidates = useCallback(async (deptNo: number | null) => {
    setLoading(true)
    let q = supabase.from('renewal_candidates').select('*').order('employ_end_date', { ascending: true })
    if (deptNo !== null) q = q.eq('dept_no', deptNo)
    const { data } = await q
    setCandidates((data || []) as RenewalCandidate[])
    setLoading(false)
  }, [])

  const updateCandidate = useCallback(async (id: string, patch: Partial<RenewalCandidate>) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    await supabase.from('renewal_candidates').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }, [])

  // ③CSV対象：新しい派遣期間（前回終了日の翌日を基準日として検索）を自動検索し、差異を反映する。
  // 見つからない場合はstatusを'csv_pending'にする（画面側でCSVインポート依頼ボタンを出す）。
  const searchCsvRenewal = useCallback(async (candidate: RenewalCandidate) => {
    if (!candidate.dispatch_end_date && !candidate.employ_end_date) return
    const baseEnd = candidate.dispatch_end_date || candidate.employ_end_date!
    const searchDate = addDays(baseEnd, 1)

    const { data: staffRow } = await supabase
      .from('staff')
      .select('crew_code')
      .eq('employee_number', candidate.employee_number)
      .maybeSingle()

    let staffCodeForSearch = candidate.employee_number
    if (candidate.csv_system === 'HRstation') staffCodeForSearch = `F3810${candidate.employee_number}`
    else if (candidate.csv_system === 'winworks') staffCodeForSearch = staffRow?.crew_code || ''

    if (!staffCodeForSearch) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const { data: rowsFound } = await supabase
      .from('csv_raw_data')
      .select('*')
      .eq('system_type', candidate.csv_system || '')
      .eq('staff_code', staffCodeForSearch)
      .lte('dispatch_start', searchDate)
      .gte('dispatch_end', searchDate)

    if (!rowsFound || rowsFound.length === 0) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const r = rowsFound[0]
    await updateCandidate(candidate.id, {
      new_dispatch_start: r.dispatch_start,
      new_dispatch_end: r.dispatch_end,
      new_employ_start: r.dispatch_start,
      new_employ_end: r.dispatch_end,
      new_work_location_name: r.work_location,
      new_work_address: r.work_address,
      new_csv_raw_data_id: r.id,
      status: 'pending',
    })
  }, [updateCandidate])

  // ④CSVインポート依頼（既存のrequestsテーブル・STEP2と同じ導線を流用）
  const requestCsvImport = useCallback(async (
    candidate: RenewalCandidate,
    requestedBy: string,
    requestedByDept: string | null
  ) => {
    const baseEnd = candidate.dispatch_end_date || candidate.employ_end_date!
    await supabase.from('requests').insert({
      request_type: 'csv_import',
      staff_name: candidate.staff_name,
      staff_code: candidate.employee_number,
      client_name: candidate.work_location_name,
      system_type: candidate.csv_system,
      dispatch_start_date: addDays(baseEnd, 1),
      requested_by: requestedBy,
      requested_by_dept: requestedByDept,
      staff_dept: requestedByDept,
    })
  }, [])

  // ⑤派遣先変更のため手入力に切り替える（例外操作・理由必須）
  const switchToManualOverride = useCallback(async (id: string, reason: string) => {
    await updateCandidate(id, { manual_override: true, manual_override_reason: reason, status: 'pending' })
  }, [updateCandidate])

  // 派遣期間を入力した際、雇用期間へコピーする（applyの雇用期間コピー機能と同じ考え方）
  const copyDispatchToEmploy = useCallback(async (id: string, dispatchStart: string, dispatchEnd: string) => {
    await updateCandidate(id, {
      new_dispatch_start: dispatchStart,
      new_dispatch_end: dispatchEnd,
      new_employ_start: dispatchStart,
      new_employ_end: dispatchEnd,
    })
  }, [updateCandidate])

  const bulkMarkReady = useCallback(async (ids: string[]) => {
    setCandidates(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: 'ready' } : c))
    await supabase.from('renewal_candidates').update({ status: 'ready', updated_at: new Date().toISOString() }).in('id', ids)
  }, [])

  return {
    candidates,
    loading,
    syncing,
    syncCandidates,
    fetchCandidates,
    updateCandidate,
    searchCsvRenewal,
    requestCsvImport,
    switchToManualOverride,
    copyDispatchToEmploy,
    bulkMarkReady,
  }
}
