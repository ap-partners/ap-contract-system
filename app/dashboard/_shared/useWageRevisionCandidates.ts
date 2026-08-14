// ===== 最低賃金改定対応：既存契約の遡及チェック（2026-07-29新設） =====
// 伊藤さんの指摘：最低賃金マスタを改定した後、申請中・締結済みの既存契約のうち雇用期間が
// 改定日をまたぐものは、改定後の期間分について賃金を見直して再申請する必要があるが、
// これを見つける仕組みが無かった。
//
// 検知の方式は「専用テーブル＋Cron」ではなく、契約状況モニタリング（useContractMonitoring.ts）と
// 同じ「サブタブを開いた瞬間に現在のデータで動的に再計算する」方式を採用（2026-07-29伊藤さんと確認）。
// 理由：最低賃金改定は年1回程度と頻度が低く、常時監視の仕組みは過剰。
//
// 対象契約のフィルタ自体（担当営業＝自部門のみ・SSC/管理部＝全部門）は、contracts テーブルの
// 既存RLS（閲覧範囲ポリシー。created_by_dept_noがcurrent_dept_scope()に含まれるか等）にそのまま
// 委ねている。ここでは絞り込み条件（パターンA/C・現場・有効ステータス）を付けて素直にSELECTするだけでよい。
//
// 賃金の時給換算・適用する最低賃金マスタ行の選定ロジックは、新規申請時のチェック
// （lib/autoChecks.ts の checkMinimumWage）と完全に同じ計算式を使う必要があるため、
// 内部計算部分を computeWageCheckDetail() として切り出して再利用している（二重実装を避けるため）。
//
// 対象スタッフの「現在の」所属部門（最低賃金マスタの参照キー）は、申請時点のスナップショット
// （contracts.input_data.staff）ではなく、staffテーブルの最新のdept_noを都度参照する
// （申請後に異動していた場合、現在の部門の基準で判定するのが正しいため）。

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { computeWageCheckDetail, type MinimumWageRow } from '@/lib/autoChecks'

export type WageRevisionCandidate = {
  contractId: string
  staffId: string
  staffName: string
  employeeNumber: string
  deptNo: number
  deptName: string | null
  documentType: string
  pattern: string
  employStart: string | null
  employEnd: string | null
  contractStartDate: string | null
  // 2026-07-29追加：一覧表示で「時給換算後」の数字だけでなく元の給与形態・金額も見せるため
  // （日給・月給の場合、時給換算額だけでは担当営業が実際に何を直せばよいか分かりにくいとの指摘）。
  salaryType: string
  basicSalary: number
  hourlyEquivalent: number
  requiredWage: number
  effectiveFrom: string
}

// 「有効な」契約から除外するステータス（取り下げ・差し戻し中は対応不要のため対象外）
const EXCLUDED_STATUSES = '(取り下げ,差し戻し中)'

export function useWageRevisionCandidates() {
  const [rows, setRows] = useState<WageRevisionCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ① 対象契約を取得（RLSにより担当営業は自部門分のみ・SSC/管理部は全部門が返る）
      // M-12対応（2026-08-14）：select()にlimit/rangeが無く、PostgRESTの既定上限（1000件）に
      // 抵触すると1001件目以降が静かに切り捨てられ、最低賃金改定の再チェック対象から漏れる
      // 不具合があった（対象が増えるほど悪化する）。.range()で全件をページング取得する形に変更する。
      const contractRows: any[] = []
      {
        const PAGE_SIZE = 1000
        let from = 0
        for (let i = 0; i < 100; i++) { // 安全弁：本来あり得ない件数（最大10万件相当）に達したら打ち切る
          const { data, error: contractError } = await supabase
            .from('contracts')
            .select('id, staff_id, pattern, document_type, work_place, status, input_data')
            .in('pattern', ['A', 'C'])
            .eq('work_place', '現場')
            .not('status', 'in', EXCLUDED_STATUSES)
            .range(from, from + PAGE_SIZE - 1)
          if (contractError) throw contractError
          const page = data || []
          contractRows.push(...page)
          if (page.length < PAGE_SIZE) break
          from += PAGE_SIZE
        }
      }
      if (contractRows.length === 0) {
        setRows([])
        return
      }

      // ② 対象スタッフの現在の所属部門を取得
      const staffIds = Array.from(new Set(contractRows.map(c => c.staff_id).filter(Boolean)))
      if (staffIds.length === 0) {
        setRows([])
        return
      }
      const { data: staffRows, error: staffError } = await supabase
        .from('staff')
        .select('id, name, employee_number, dept_no')
        .in('id', staffIds)
      if (staffError) throw staffError
      const staffMap = new Map((staffRows || []).map(s => [s.id, s]))

      // ③ 部門名の解決
      const deptNos = Array.from(
        new Set((staffRows || []).map(s => s.dept_no).filter((d): d is number => d !== null && d !== undefined))
      )
      let deptNameMap = new Map<number, string>()
      if (deptNos.length > 0) {
        const { data: deptRows } = await supabase
          .from('department_master')
          .select('dept_no, dept_name')
          .in('dept_no', deptNos)
        deptNameMap = new Map((deptRows || []).map(d => [d.dept_no, d.dept_name]))
      }

      // ④ 現在の最低賃金マスタ全件を取得し、部門ごとにグルーピング
      const { data: wageRows, error: wageError } = await supabase
        .from('minimum_wage_master')
        .select('dept_no, hourly_wage, effective_from')
      if (wageError) throw wageError
      const wageByDept = new Map<number, MinimumWageRow[]>()
      for (const r of wageRows || []) {
        const list = wageByDept.get(r.dept_no) || []
        list.push(r)
        wageByDept.set(r.dept_no, list)
      }

      // ⑤ 契約ごとに現在の最低賃金マスタと突き合わせ、不足しているものだけを抽出
      const result: WageRevisionCandidate[] = []
      for (const c of contractRows) {
        const staffRow = staffMap.get(c.staff_id)
        if (!staffRow || staffRow.dept_no === null || staffRow.dept_no === undefined) continue
        const wageRowsForDept = wageByDept.get(staffRow.dept_no) || []
        if (wageRowsForDept.length === 0) continue

        const f: Record<string, any> = (c.input_data as any)?.fields || {}
        const detail = computeWageCheckDetail({
          salaryType: f.salaryType || '',
          basicSalary: Number(f.basicSalary) || 0,
          rolePay: Number(f.rolePay) || 0,
          skillPay: Number(f.skillPay) || 0,
          salesPay: Number(f.salesPay) || 0,
          housingPay: Number(f.housingPay) || 0,
          workingHoursH: Number(f.workingHoursH) || 0,
          workingHoursM: Number(f.workingHoursM) || 0,
          monthlyStandardHours: f.monthlyStandardHours ? Number(f.monthlyStandardHours) : null,
          employStart: f.employStart || '',
          employEnd: f.employEnd || '',
          contractStartDate: f.contractStartDate || '',
          minimumWageRowsForDept: wageRowsForDept,
        })
        if (!detail) continue
        if (detail.hourlyEquivalent >= detail.targetRow.hourly_wage) continue // 不足していないものは対象外

        result.push({
          contractId: c.id,
          staffId: c.staff_id,
          staffName: staffRow.name,
          employeeNumber: staffRow.employee_number,
          deptNo: staffRow.dept_no,
          deptName: deptNameMap.get(staffRow.dept_no) || null,
          documentType: c.document_type,
          pattern: c.pattern,
          employStart: f.employStart || null,
          employEnd: f.employEnd || null,
          contractStartDate: f.contractStartDate || null,
          salaryType: f.salaryType || '',
          basicSalary: Number(f.basicSalary) || 0,
          hourlyEquivalent: Math.floor(detail.hourlyEquivalent),
          requiredWage: detail.targetRow.hourly_wage,
          effectiveFrom: detail.targetRow.effective_from,
        })
      }

      result.sort((a, b) => (a.employEnd || a.contractStartDate || '').localeCompare(b.employEnd || b.contractStartDate || ''))
      setRows(result)
    } catch (e: any) {
      setError(e?.message || '確認処理に失敗しました。')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { rows, loading, error, fetchCandidates }
}
