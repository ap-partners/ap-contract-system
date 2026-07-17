// ===== 更新期限管理タブの共通データ取得・操作ロジック =====
// 管理部・担当営業ダッシュボードで共有する（docs/SYSTEM_DESIGN.md 10章 2026-07-14
// 「更新期限管理タブの仕様を確定」参照）。
//
// スコープ：
// ①現場契約（work_place='現場'）のうち雇用期間終了日が45日以内（超過含む）の最新契約を検知し、
//   renewal_candidatesへ登録する。②CSV対象は新しい派遣期間を自動検索して差異表示、CSV非対象
// （または「派遣先変更」で手入力に切替た場合）は派遣期間を手入力→雇用期間へコピー。
// ③CSVインポート依頼（requestsテーブル）。
// 2026-07-16（意思決定ログ「更新期限管理タブの改修方針を確定」チャットA）：スタッフ意向・
// クライアント意向のトグルと、それに連動する「送付準備完了」への一括更新は廃止した。理由は
// 営業担当が手動で都度更新する自己申告データであり、実際の更新申請という確実な行動が発生する
// 新フロー（チャットC・D）では価値が薄いため。ステータスは pending（未対応）→
// not_renewing（更新しない・確定）の2つに単純化（チャットC・Dで「申請済み」を追加予定）。
// 対象外（次回以降）：チャットB（差異確認拡張・原契約confirmation画面・安全チェック）、
// チャットC（一括申請の実装）、チャットD（`/apply`プリフィル・個別申請の実装）。
'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { extractCsvFields } from '@/app/apply/_lib/helpers'
import { buildMergedFields } from './renewalFieldMap'
import { runAutoChecks, MinimumWageRow } from '@/lib/autoChecks'

export const RENEWAL_ALERT_WINDOW_DAYS = 45

// 2026-07-16追加（チャットB・④差異確認の表示範囲拡大）：指揮命令者・派遣先責任者・
// 苦情処理申出先の3グループ×(部署/役職/氏名/TEL)＝12項目。前回契約の値（previous）と
// 新しいCSVで見つかった値（new）を保持し、RenewalManagementTab側で変更有無を比較・表示する。
export type ContactFieldGroup = {
  dept: string | null
  role: string | null
  name: string | null
  tel: string | null
}
export type ContactFields = {
  cmd: ContactFieldGroup
  resp: ContactFieldGroup
  comp: ContactFieldGroup
}

export type RenewalCandidate = {
  id: string
  source_contract_id: string
  employee_number: string
  staff_name: string | null
  dept_no: number | null
  work_location_name: string | null
  employ_start_date: string | null
  employ_end_date: string | null
  dispatch_start_date: string | null
  dispatch_end_date: string | null
  data_source: 'csv' | 'manual'
  csv_system: string | null
  // 2026-07-16追加：前回契約の書類種別（就業条件明示書／雇用契約書 兼 就業条件明示書 等）。
  // 一覧カードに表示する。書類種別そのものを変える更新はチャットD（新規申請ルート）でのみ対応。
  document_type: string | null
  // 2026-07-16追加（チャットB）：指揮命令者・派遣先責任者・苦情処理申出先の前回値／新値
  previous_contact_fields: ContactFields | null
  new_contact_fields: ContactFields | null
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
  // 2026-07-17追加：'applied'は一括申請の実行によりcontracts行の作成が完了した状態
  // （このステータスになった行は一覧のKPI・件数集計から除外し、次回syncCandidates()の
  // 「旧契約分の削除」ロジックで自動的にクリーンアップされる想定）。
  status: 'pending' | 'csv_pending' | 'not_renewing' | 'applied'
  // 2026-07-17追加（チャットC・⑤一括申請）：一覧左側の仕分けフラグ。実行に副作用を持たない
  // 純粋なブックキーピング項目（伊藤さん確定・2026-07-17）。「一括申請」に切り替えられるのは
  // 新しい期間データ（雇用・派遣とも）が確定している行のみ（画面側でperiodReady()により制御）。
  triage_mode: 'undecided' | 'bulk' | 'individual'
  created_at: string
  updated_at: string
  // 2026-07-16追加：staffマスタの「今の」所属部署名・雇用形態（申請時点のスナップショットではない。
  // 伊藤さん確定）。DBには保存せず、fetchCandidates()で都度joinして付与するクライアント側のみの項目。
  current_dept_name?: string | null
  current_contract_type?: string | null
}

// 残日数（マイナス＝超過）。基準日は雇用期間終了日を優先し、無ければ派遣期間終了日。
export function remainingDays(c: Pick<RenewalCandidate, 'employ_end_date' | 'dispatch_end_date'>): number | null {
  const target = c.employ_end_date || c.dispatch_end_date
  if (!target) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(target); end.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function useRenewalCandidates() {
  const [candidates, setCandidates] = useState<RenewalCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ①検知・登録：現場契約のうち、スタッフごとに最新の契約を対象に、雇用期間終了日が
  // 45日以内（超過含む）のものをrenewal_candidatesへupsertする。既存行のステータス等
  // （担当営業が入力した値）は上書きしない。退職済み・退職予定のスタッフは対象外。
  const syncCandidates = useCallback(async () => {
    setSyncing(true)
    try {
      // 総合レビュー指摘31対応（2026-07-15）：以前はcontractsのinput_data（業務内容・住所等の
      // 長文フィールドを含む肥大化したJSON）を全件・全履歴分そのまま取得した上でJS側で
      // 「スタッフごとの最新1件」を絞り込んでいた。件数が増えるほど重くなる作り（3ダッシュボード
      // すべての初期化のたびに全ユーザーが実行）だったため、DB関数
      // `get_latest_genba_contracts_for_renewal()`にDISTINCT ONでの絞り込みを移し、
      // 必要な列だけをテキストとして受け取るように変更。RLSは呼び出しロールのものがそのまま
      // 適用される（関数はSECURITY INVOKERのデフォルトのまま）。
      const { data: contracts, error: contractsError } = await supabase
        .rpc('get_latest_genba_contracts_for_renewal')

      if (contractsError) { console.error('更新候補の同期エラー（contracts取得）:', contractsError); return }
      if (!contracts) return

      // DB関数側で既にスタッフ（社員番号）ごとの最新1件に絞り込み済み
      const latestByStaff = new Map<string, any>()
      for (const c of contracts) {
        const empNo = c.employee_number
        if (!empNo) continue
        latestByStaff.set(empNo, c)
      }

      // 総合レビュー指摘17対応（2026-07-15）：契約が更新されると、同じスタッフでも新しい
      // contract_idで別行がupsertされる（upsertのonConflictがsource_contract_id単位のため）。
      // 旧契約に紐づく行は削除されずに残り、同じスタッフのカードが2枚並んでしまっていた。
      // ここで、現時点の最新契約（latestByStaff）と食い違うsource_contract_idを持つ既存行を
      // employee_number単位で洗い出し、削除する（スタッフが入力済みの意向等も含めて丸ごと
      // 削除されるが、旧契約はもう有効ではないため妥当）。
      const empNosAll = Array.from(latestByStaff.keys())
      if (empNosAll.length > 0) {
        const { data: existingRows, error: existingError } = await supabase
          .from('renewal_candidates')
          .select('id, employee_number, source_contract_id')
          .in('employee_number', empNosAll)
        if (existingError) {
          console.error('更新候補の同期エラー（既存行取得）:', existingError)
        } else if (existingRows && existingRows.length > 0) {
          const staleIds = existingRows
            .filter(r => {
              const latest = latestByStaff.get(r.employee_number)
              return latest && latest.id !== r.source_contract_id
            })
            .map(r => r.id)
          if (staleIds.length > 0) {
            const { error: deleteError } = await supabase
              .from('renewal_candidates')
              .delete()
              .in('id', staleIds)
            if (deleteError) console.error('更新候補の同期エラー（旧契約分の削除）:', deleteError)
          }
        }
      }

      const today = new Date(); today.setHours(0, 0, 0, 0)
      const rows: any[] = []
      for (const [empNo, c] of latestByStaff.entries()) {
        const endDate = c.employ_end || c.dispatch_end
        if (!endDate) continue
        const end = new Date(endDate); end.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > RENEWAL_ALERT_WINDOW_DAYS) continue

        rows.push({
          source_contract_id: c.id,
          employee_number: empNo,
          staff_name: c.staff_name || null,
          dept_no: c.created_by_dept_no,
          work_location_name: c.work_location_name || null,
          // 開始日（自）も前回値として保存する（伊藤さんご指摘・2026-07-15：自と至は必ずセットで
          // 変わるため、差異表示で至だけでなく自も分かるようにしたい、への対応）
          employ_start_date: c.employ_start || null,
          employ_end_date: c.employ_end || null,
          dispatch_start_date: c.dispatch_start || null,
          dispatch_end_date: c.dispatch_end || null,
          data_source: c.csv_mode === 'csv' ? 'csv' : 'manual',
          csv_system: c.csv_system || null,
          // 2026-07-16追加：前回契約の書類種別（一覧カード表示用）
          document_type: c.document_type || null,
          // 2026-07-16追加（チャットB）：前回契約の指揮命令者・派遣先責任者・苦情処理申出先
          previous_contact_fields: {
            cmd: { dept: c.cmd_dept || null, role: c.cmd_role || null, name: c.cmd_name || null, tel: c.cmd_tel || null },
            resp: { dept: c.resp_dept || null, role: c.resp_role || null, name: c.resp_name || null, tel: c.resp_tel || null },
            comp: { dept: c.comp_dept || null, role: c.comp_role || null, name: c.comp_name || null, tel: c.comp_tel || null },
          },
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
      const { error: upsertError } = await supabase
        .from('renewal_candidates')
        .upsert(targetRows, { onConflict: 'source_contract_id', ignoreDuplicates: false })
      if (upsertError) console.error('更新候補の同期エラー（upsert）:', upsertError)
    } finally {
      setSyncing(false)
    }
  }, [])

  // ②一覧取得。deptNo指定時はその部門のみ（担当営業用）、nullは全部門（管理部・SSC用）
  // 登録後に退職・退職予定になったスタッフも、表示直前に再チェックして除外する
  // （syncCandidates側は登録時点のみのチェックのため、その後の退職登録には追従できない）。
  // 2026-07-16追加：一覧カードに「今の」所属部署名・雇用形態を出すため、staffマスタから
  // dept_no・contract_typeも取得し、department_masterで部署名に変換して各行に付与する
  // （申請時点のスナップショットではなく現在値を出す、という伊藤さんの確定に基づく）。
  const fetchCandidates = useCallback(async (deptNo: number | null) => {
    setLoading(true)
    let q = supabase.from('renewal_candidates').select('*').order('employ_end_date', { ascending: true })
    if (deptNo !== null) q = q.eq('dept_no', deptNo)
    const { data, error } = await q
    if (error) console.error('更新候補の取得エラー:', error)
    const rows = (data || []) as RenewalCandidate[]

    if (rows.length > 0) {
      const empNos = Array.from(new Set(rows.map(r => r.employee_number)))
      const { data: staffRows } = await supabase
        .from('staff')
        .select('employee_number, retired_at, retirement_scheduled_at, dept_no, contract_type')
        .in('employee_number', empNos)
      const todayStr = new Date().toISOString().split('T')[0]
      const retiredSet = new Set(
        (staffRows || [])
          .filter(s => (s.retired_at && s.retired_at < todayStr) || (s.retirement_scheduled_at && s.retirement_scheduled_at < todayStr))
          .map(s => s.employee_number)
      )

      const deptNosForStaff = Array.from(new Set((staffRows || []).map(s => s.dept_no).filter((n): n is number => n != null)))
      let deptNameByNo = new Map<number, string>()
      if (deptNosForStaff.length > 0) {
        const { data: deptRows } = await supabase
          .from('department_master')
          .select('dept_no, dept_name')
          .in('dept_no', deptNosForStaff)
        deptNameByNo = new Map((deptRows || []).map((d: any) => [d.dept_no, d.dept_name]))
      }
      const staffByEmpNo = new Map((staffRows || []).map(s => [s.employee_number, s]))

      setCandidates(
        rows
          .filter(r => !retiredSet.has(r.employee_number))
          .map(r => {
            const s = staffByEmpNo.get(r.employee_number)
            return {
              ...r,
              current_dept_name: s?.dept_no != null ? (deptNameByNo.get(s.dept_no) || null) : null,
              current_contract_type: s?.contract_type || null,
            }
          })
      )
    } else {
      setCandidates(rows)
    }
    setLoading(false)
  }, [])

  // 保存失敗（不正な日付形式・通信エラー等）を握りつぶさない。楽観的更新は行うが、
  // 実際の保存に失敗した場合は画面表示を元に戻し、担当者に必ず知らせる
  // （2026-07-14修正：以前はerrorを一切見ておらず、保存に失敗しても画面上は
  // 成功したように見え、再読み込みで静かに消えるという問題があった）。
  const updateCandidate = useCallback(async (id: string, patch: Partial<RenewalCandidate>) => {
    const prevSnapshot = candidates.find(c => c.id === id)
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    const { error } = await supabase
      .from('renewal_candidates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('更新候補の保存エラー:', error)
      if (prevSnapshot) setCandidates(prev => prev.map(c => c.id === id ? prevSnapshot : c))
      alert('保存に失敗しました。入力内容（特に日付の形式）をご確認の上、もう一度お試しください。')
    }
  }, [candidates])

  // ③CSV対象：新しい派遣期間（前回終了日の翌日を基準日として検索）を自動検索し、差異を反映する。
  // 見つからない場合はstatusを'csv_pending'にする（画面側でCSVインポート依頼ボタンを出す）。
  const searchCsvRenewal = useCallback(async (candidate: RenewalCandidate) => {
    if (!candidate.dispatch_end_date && !candidate.employ_end_date) return
    const baseEnd = candidate.dispatch_end_date || candidate.employ_end_date!
    const searchDate = addDays(baseEnd, 1)

    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('crew_code')
      .eq('employee_number', candidate.employee_number)
      .maybeSingle()
    if (staffError) console.error('CSV再検索エラー（staff取得）:', staffError)

    let staffCodeForSearch = candidate.employee_number
    if (candidate.csv_system === 'HRstation') staffCodeForSearch = `F3810${candidate.employee_number}`
    else if (candidate.csv_system === 'winworks') staffCodeForSearch = staffRow?.crew_code || ''

    if (!staffCodeForSearch) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const { data: rowsFound, error: csvError } = await supabase
      .from('csv_raw_data')
      .select('*')
      .eq('system_type', candidate.csv_system || '')
      .eq('staff_code', staffCodeForSearch)
      .lte('dispatch_start', searchDate)
      .gte('dispatch_end', searchDate)
    if (csvError) console.error('CSV再検索エラー（csv_raw_data取得）:', csvError)

    if (!rowsFound || rowsFound.length === 0) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const r = rowsFound[0]
    // 2026-07-16追加（チャットB）：CSVの生データから指揮命令者・派遣先責任者・苦情処理申出先の
    // 新しい値も抽出し、previous_contact_fieldsとの差異表示に使う
    const extracted = extractCsvFields(candidate.csv_system || '', r.raw_data) as Record<string, any>
    const newContactFields: ContactFields = {
      cmd: { dept: extracted.cmdDept || null, role: extracted.cmdRole || null, name: extracted.cmdName || null, tel: extracted.cmdTel || null },
      resp: { dept: extracted.respDept || null, role: extracted.respRole || null, name: extracted.respName || null, tel: extracted.respTel || null },
      comp: { dept: extracted.compDept || null, role: extracted.compRole || null, name: extracted.compName || null, tel: extracted.compTel || null },
    }
    await updateCandidate(candidate.id, {
      new_dispatch_start: r.dispatch_start,
      new_dispatch_end: r.dispatch_end,
      new_employ_start: r.dispatch_start,
      new_employ_end: r.dispatch_end,
      new_work_location_name: r.work_location,
      new_work_address: r.work_address,
      new_csv_raw_data_id: r.id,
      new_contact_fields: newContactFields,
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
    const { error } = await supabase.from('requests').insert({
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
    if (error) {
      console.error('CSVインポート依頼の保存エラー:', error)
      alert('インポート依頼の送信に失敗しました。もう一度お試しください。')
    }
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

  // 「更新しない」を確定する（担当営業・SSC・管理部の誰でも操作可能。理由入力必須。
  // 2026-07-16：以前は意向トグルの不一致時のみ出る導線だったが、意向トグル廃止に伴い
  // 常時操作可能なボタンに変更）
  const confirmNotRenewing = useCallback(async (id: string, reason: string) => {
    await updateCandidate(id, { status: 'not_renewing', no_renewal_reason: reason })
  }, [updateCandidate])

  // 2026-07-17追加（チャットC・⑤）：仕分けフラグの切り替え。副作用は一切無く、単に
  // triage_modeを保存するだけ。
  const setTriageMode = useCallback(async (id: string, mode: RenewalCandidate['triage_mode']) => {
    await updateCandidate(id, { triage_mode: mode })
  }, [updateCandidate])

  // ⑥一括申請の実行（チャットC・⑤の契約データ生成処理）。「一括申請」に仕分けた行を、
  // /apply の handleSubmitContract() と同じ構造のcontracts行として直接作成する
  // （STEP8の画面自体は経由しない。伊藤さんと確定済みの技術実装イメージ）。
  // 各行につき、前回契約のinput_data.fieldsを土台に、CSVから反映される最新内容
  // （extractCsvFields()。renewalFieldMap.tsの対応表で前回契約側のキー名に変換）で
  // 対応項目のみ上書きし、雇用期間・派遣期間・就業場所名/住所はrenewal_candidatesの
  // 確定済みnew_*カラム（一覧で表示していたものと同じ値）で上書きする。給与・備考など
  // CSVで管理していない項目は前回契約の値をそのまま引き継ぐ。
  // 1件ずつ処理し、失敗した行はスキップして結果に含める（1件の失敗で全体を止めない）。
  const executeBulkApply = useCallback(async (
    targets: RenewalCandidate[],
    submitterUserId: string,
    submitterEmail: string
  ): Promise<{ successIds: string[]; failed: { employeeNumber: string; staffName: string | null; reason: string }[] }> => {
    const successIds: string[] = []
    const failed: { employeeNumber: string; staffName: string | null; reason: string }[] = []

    const { data: submitterStaffRow } = await supabase
      .from('staff')
      .select('dept_no, name')
      .eq('email', submitterEmail)
      .limit(1)
      .maybeSingle()

    const { data: minimumWageRows } = await supabase
      .from('minimum_wage_master')
      .select('dept_no, hourly_wage, effective_from')

    for (const c of targets) {
      try {
        // 念のための再チェック（一覧表示後にCSVが再取込まれる等でデータが変わっている
        // 可能性への備え。「一括申請」に切り替えられる条件と同じ）
        if (c.status !== 'pending' || !c.new_employ_start || !c.new_employ_end || !c.new_dispatch_start || !c.new_dispatch_end) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '新しい雇用期間・派遣期間が確定していません' })
          continue
        }

        const { data: prevContract, error: prevError } = await supabase
          .from('contracts')
          .select('staff_id, pattern, contract_type, document_type, work_place, closing_pattern, input_data')
          .eq('id', c.source_contract_id)
          .maybeSingle()
        if (prevError || !prevContract) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '前回契約の取得に失敗しました' })
          continue
        }
        const prevFields = (prevContract.input_data as any)?.fields || {}

        let csvFields: Record<string, any> | null = null
        if (c.new_csv_raw_data_id) {
          const { data: csvRow } = await supabase
            .from('csv_raw_data')
            .select('raw_data')
            .eq('id', c.new_csv_raw_data_id)
            .maybeSingle()
          if (csvRow?.raw_data) {
            csvFields = extractCsvFields(c.csv_system || '', csvRow.raw_data) as Record<string, any>
          }
        }

        // 明示的にRecord<string, any>と型注釈しておかないと、TypeScriptがスプレッド元
        // （buildMergedFieldsの戻り値）のインデックスシグネチャを無視し、以下で追加している
        // 明示プロパティ（employStart等）だけの狭い型として推論してしまい、salaryType等
        // 他のプロパティへのアクセスがビルド時型エラーになる（2026-07-17 Vercelビルドで発覚）。
        const mergedFields: Record<string, any> = {
          ...buildMergedFields(prevFields, csvFields),
          employStart: c.new_employ_start,
          employEnd: c.new_employ_end,
          dispatchStart: c.new_dispatch_start,
          dispatchEnd: c.new_dispatch_end,
          workLocationName: c.new_work_location_name || prevFields.workLocationName,
          workLocationAddress: c.new_work_address || prevFields.workLocationAddress,
        }

        const { data: staffRow } = await supabase
          .from('staff')
          .select('employee_number, name, department, crew_code, address, dept_no, hired_at')
          .eq('employee_number', c.employee_number)
          .maybeSingle()

        const staffSnapshot = staffRow ? {
          employee_number: staffRow.employee_number,
          name: staffRow.name,
          department: staffRow.department,
          crew_code: staffRow.crew_code,
          address: staffRow.address || null,
        } : null

        const { results: autoCheckResults, overallLevel: warningLevel } = runAutoChecks({
          pattern: prevContract.pattern,
          workPlace: prevContract.work_place,
          contractType: prevContract.contract_type,
          salaryType: mergedFields.salaryType || '時給',
          basicSalary: Number(mergedFields.basicSalary) || 0,
          rolePay: Number(mergedFields.rolePay) || 0,
          skillPay: Number(mergedFields.skillPay) || 0,
          salesPay: Number(mergedFields.salesPay) || 0,
          housingPay: Number(mergedFields.housingPay) || 0,
          overtimePay: Number(mergedFields.overtimePay) || 0,
          hasEmployInsurance: Boolean(mergedFields.hasEmployInsurance),
          hasSocialInsurance: Boolean(mergedFields.hasSocialInsurance),
          workingHoursH: Number(mergedFields.workingHoursH) || 0,
          workingHoursM: Number(mergedFields.workingHoursM) || 0,
          monthlyStandardHours: mergedFields.monthlyStandardHours ?? null,
          deptNo: staffRow?.dept_no ?? null,
          staffHiredAt: staffRow?.hired_at ?? null,
          employStart: mergedFields.employStart,
          employEnd: mergedFields.employEnd,
          contractStartDate: mergedFields.contractStartDate || '',
          dispatchStart: mergedFields.dispatchStart,
          dispatchEnd: mergedFields.dispatchEnd,
          trialPeriod: mergedFields.trialPeriod || '',
          minimumWageRowsForDept: (minimumWageRows || []).filter((r: MinimumWageRow) => r.dept_no === staffRow?.dept_no),
        })

        const payload = {
          staff_id: prevContract.staff_id,
          pattern: prevContract.pattern,
          contract_type: prevContract.contract_type,
          document_type: prevContract.document_type,
          work_place: prevContract.work_place,
          status: '申請中',
          closing_pattern: prevContract.closing_pattern,
          created_by_dept_no: submitterStaffRow?.dept_no ?? null,
          created_by_name: submitterStaffRow?.name ?? null,
          csv_raw_data_id: c.new_csv_raw_data_id || null,
          input_data: { staff: staffSnapshot, fields: mergedFields, csvMeta: null },
          search_text: [staffSnapshot?.name, c.employee_number, mergedFields.workLocationName].filter(Boolean).join(' '),
          warning_confirmations: [],
          auto_check_results: autoCheckResults,
          warning_level: warningLevel,
          created_by: submitterUserId,
        }

        const { error: insertError } = await supabase.from('contracts').insert(payload)
        if (insertError) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '契約データの保存に失敗しました' })
          continue
        }

        // 一覧上は即座に「申請済み」扱いにする（次回syncCandidates()実行時に、最新契約が
        // 入れ替わったことを検知して自動的にクリーンアップされる）
        await updateCandidate(c.id, { status: 'applied', triage_mode: 'undecided' })
        successIds.push(c.id)
      } catch (e) {
        console.error('一括申請の実行エラー:', e)
        failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '予期しないエラーが発生しました' })
      }
    }

    return { successIds, failed }
  }, [updateCandidate])

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
    confirmNotRenewing,
    copyDispatchToEmploy,
    setTriageMode,
    executeBulkApply,
  }
}
