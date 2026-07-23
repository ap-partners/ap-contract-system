// ===== 契約状況モニタリング（フェーズ1・検知ロジック）=====
// docs/SYSTEM_DESIGN.md 10章 2026-07-23「(A) 契約状況モニタリング機能」参照。
// 管理部ダッシュボード「更新期限管理」タブに統合する新セクション。既存の更新期限管理
// （useRenewalCandidates.ts）が持つ4つのギャップ（起点がcontracts行必須のため契約実績ゼロの
// スタッフを検知できない・社内スタッフがスコープ外・書類種別ごとの網羅性チェックがない・
// ステータスそのものは見ていない）を補うのが目的。
//
// データ源：DB関数 get_contract_monitoring_status()（2026-07-23新設）。スタッフごとに
// 雇用契約書系・就業条件明示書系それぞれの署名済み契約の有無・最新署名済み終了日・
// 進行中案件の有無・直近の動きを集計して返す。work_placeはstaff.work_place（現状全件NULL・
// 未運用）のバックフィルを待たず、直近契約のwork_placeから動的に推定する（伊藤さん確認済み・
// 2026-07-23）。
//
// 重大度モデル（4段階。設計メモ準拠）：
//   ①台帳なし（契約実績が一度もない）＝最重要・赤。デフォルト非表示（絞り込みトグルで表示）。
//   ②重大（赤）＝対象書類が一度も締結されていない、または過去に署名済みだが期限切れで
//     後続の申請もない。
//   ③警告（黄）＝申請はあるが30日以上ステータスが動いていない。
//   ④注意（黄・下位）＝社内・有期契約スタッフの雇用契約書が期限間近（45日以内）。
//     現場スタッフの期限間近は既存の更新期限管理リスト（同じタブ内）が既にカバーしているため
//     ここでは重複させない（社内・有期契約は既存のget_latest_genba_contracts_for_renewal()が
//     work_place='現場'限定のためスコープ外だった＝ここが唯一の空白地帯）。
//
// フェーズ2（2026-07-23追加）：対応状況（未着手／依頼済み／対応中／解消）の管理と、
// 「対応依頼」ボタンからの担当営業への即時メール送信。対応状況は新規テーブル
// contract_monitoring_actions（employee_number単位・管理部ロールのみ読み書き可）で
// 別途永続化する。メール送信は/api/contract-monitoring/notifyを経由する
// （宛先解決・RENEWAL_NOTIFY_OVERRIDE_EMAILの考え方はapp/api/cron/renewal-notify/route.tsを流用）。
'use client'

import { useState, useCallback } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'

const STALE_DAYS = 30
const NEAR_EXPIRY_DAYS = 45

export type MonitoringIssue = {
  docLabel: '雇用契約書' | '就業条件明示書' | 'アルバイト誓約書'
  kind: 'never_signed' | 'expired_no_followup' | 'stalled' | 'near_expiry'
  severity: 1 | 2 | 3 | 4
  detail: string
}

export type ActionStatus = '未着手' | '依頼済み' | '対応中' | '解消'

export type MonitoringRow = {
  employeeNumber: string
  staffName: string | null
  deptNo: number | null
  deptName: string | null
  contractType: string | null
  inferredWorkPlace: string | null
  anyContractEver: boolean
  issues: MonitoringIssue[]
  topSeverity: 1 | 2 | 3 | 4
  // 2026-07-23追加（フェーズ2）：contract_monitoring_actionsから結合する対応状況。
  // 行が無い（一度も操作していない）場合は'未着手'扱い。
  actionStatus: ActionStatus
  requestedAt: string | null
  requestedByName: string | null
}

type RawRow = {
  employee_number: string
  staff_name: string | null
  dept_no: number | null
  contract_type: string | null
  hired_at: string | null
  inferred_work_place: string | null
  any_contract_ever: boolean
  employment_signed: boolean
  employment_latest_signed_end: string | null
  employment_in_progress: boolean
  employment_latest_activity_at: string | null
  conditions_signed: boolean
  conditions_latest_signed_end: string | null
  conditions_in_progress: boolean
  conditions_latest_activity_at: string | null
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const today = new Date()
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function remainingDaysTo(dateStr: string | null): number | null {
  if (!dateStr) return null
  const end = new Date(dateStr); end.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// 1つの書類種別（雇用契約書 or 就業条件明示書）についての判定。
// 「期限間近（④）」はこの関数では出さない（呼び出し側で社内・有期契約のみ別途判定する）。
function evaluateDoc(
  docLabel: MonitoringIssue['docLabel'],
  signed: boolean,
  latestSignedEnd: string | null,
  inProgress: boolean,
  latestActivityAt: string | null
): MonitoringIssue | null {
  if (signed && latestSignedEnd) {
    const remaining = remainingDaysTo(latestSignedEnd)
    if (remaining !== null && remaining < 0) {
      // 期限切れ
      if (inProgress) return null // 後続の申請が進行中＝既存の署名待ち等で追える
      return { docLabel, kind: 'expired_no_followup', severity: 2, detail: `${docLabel}が期限切れ（後続の申請なし）` }
    }
    return null // 有効期限内＝問題なし（期限間近は既存の更新期限管理リストが担当）
  }
  // 一度も署名済みの実績がない
  if (inProgress) {
    const stale = daysSince(latestActivityAt)
    if (stale !== null && stale >= STALE_DAYS) {
      return { docLabel, kind: 'stalled', severity: 3, detail: `${docLabel}の申請が${stale}日間動いていません` }
    }
    return null // 進行中・直近に動きあり＝正常進行中
  }
  return { docLabel, kind: 'never_signed', severity: 2, detail: `${docLabel}が一度も締結されていません` }
}

export function useContractMonitoring() {
  const [rows, setRows] = useState<MonitoringRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMonitoring = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_contract_monitoring_status')
      if (error) { console.error('契約状況モニタリング取得エラー:', error); return }
      const raw = (data || []) as RawRow[]

      const deptNos = Array.from(new Set(raw.map(r => r.dept_no).filter((n): n is number => n != null)))
      let deptNameByNo = new Map<number, string>()
      if (deptNos.length > 0) {
        const { data: deptRows } = await supabase
          .from('department_master')
          .select('dept_no, dept_name')
          .in('dept_no', deptNos)
        deptNameByNo = new Map((deptRows || []).map((d: any) => [d.dept_no, d.dept_name]))
      }

      // 2026-07-23追加（フェーズ2）：対応状況を結合する。行が無いスタッフは'未着手'扱い。
      const empNos = raw.map(r => r.employee_number)
      let actionByEmpNo = new Map<string, { status: ActionStatus; requested_at: string | null; requested_by_name: string | null }>()
      if (empNos.length > 0) {
        const { data: actionRows } = await supabase
          .from('contract_monitoring_actions')
          .select('employee_number, status, requested_at, requested_by_name')
          .in('employee_number', empNos)
        actionByEmpNo = new Map((actionRows || []).map((a: any) => [a.employee_number, a]))
      }

      const result: MonitoringRow[] = []
      for (const r of raw) {
        const action = actionByEmpNo.get(r.employee_number)
        const base = {
          employeeNumber: r.employee_number,
          staffName: r.staff_name,
          deptNo: r.dept_no,
          deptName: r.dept_no != null ? (deptNameByNo.get(r.dept_no) || null) : null,
          contractType: r.contract_type,
          inferredWorkPlace: r.inferred_work_place,
          anyContractEver: r.any_contract_ever,
          actionStatus: (action?.status || '未着手') as ActionStatus,
          requestedAt: action?.requested_at || null,
          requestedByName: action?.requested_by_name || null,
        }

        if (!r.any_contract_ever) {
          // ①台帳なし（契約実績が一度もない）。work_placeも判別不能。
          result.push({
            ...base,
            issues: [{ docLabel: '雇用契約書', kind: 'never_signed', severity: 1, detail: '契約実績が一度もありません（台帳なし）' }],
            topSeverity: 1,
          })
          continue
        }

        const issues: MonitoringIssue[] = []

        // 雇用契約書は全スタッフ共通で判定
        const employmentIssue = evaluateDoc('雇用契約書', r.employment_signed, r.employment_latest_signed_end, r.employment_in_progress, r.employment_latest_activity_at)
        if (employmentIssue) issues.push(employmentIssue)

        // 就業条件明示書は現場スタッフのみ判定（社内は制度上発行しない）
        if (r.inferred_work_place === '現場') {
          const conditionsIssue = evaluateDoc('就業条件明示書', r.conditions_signed, r.conditions_latest_signed_end, r.conditions_in_progress, r.conditions_latest_activity_at)
          if (conditionsIssue) issues.push(conditionsIssue)
        }

        // ④社内・有期契約スタッフの雇用契約書 期限間近（45日以内）。
        // 既存の更新期限管理リストはwork_place='現場'限定のため、ここが唯一の空白地帯。
        if (r.inferred_work_place === '社内' && r.contract_type === '有期契約' && r.employment_signed && r.employment_latest_signed_end) {
          const remaining = remainingDaysTo(r.employment_latest_signed_end)
          if (remaining !== null && remaining >= 0 && remaining <= NEAR_EXPIRY_DAYS && !r.employment_in_progress) {
            issues.push({
              docLabel: '雇用契約書',
              kind: 'near_expiry',
              severity: 4,
              detail: remaining === 0 ? '雇用契約書が本日期限です' : `雇用契約書の期限まで残り${remaining}日です`,
            })
          }
        }

        if (issues.length === 0) continue
        const topSeverity = issues.reduce<1 | 2 | 3 | 4>((min, i) => (i.severity < min ? i.severity : min), 4)
        result.push({ ...base, issues, topSeverity })
      }

      // 2026-07-23追加：アルバイト誓約書（pledges）の長期未対応検知。
      // 伊藤さんとの確認の結果、アルバイトは既存の対象母集団（active_staff／有期契約・無期契約・
      // 正社員のみ）には含めない（誓約書が必要かどうかは案件次第のため「台帳なし」判定は行わない）。
      // その代わり、既に作成済みの誓約書がステータス未確定（署名済み・差し戻し中・取り下げ以外）
      // のまま長期間動いていないものだけを、独立した警告として検知する。
      const { data: staleRaw, error: pledgeError } = await supabase
        .from('pledges')
        .select('id, status, updated_at, staff(employee_number, name, dept_no, contract_type)')
        .not('status', 'in', '(署名済み,差し戻し中,取り下げ)')
      if (pledgeError) {
        console.error('アルバイト誓約書モニタリング取得エラー:', pledgeError)
      } else {
        const pledgeDeptNos = Array.from(new Set((staleRaw || [])
          .map((p: any) => p.staff?.dept_no).filter((n: any): n is number => n != null)))
        let pledgeDeptNameByNo = deptNameByNo
        const missingDeptNos = pledgeDeptNos.filter(n => !pledgeDeptNameByNo.has(n))
        if (missingDeptNos.length > 0) {
          const { data: extraDeptRows } = await supabase
            .from('department_master')
            .select('dept_no, dept_name')
            .in('dept_no', missingDeptNos)
          pledgeDeptNameByNo = new Map([...pledgeDeptNameByNo, ...((extraDeptRows || []).map((d: any) => [d.dept_no, d.dept_name] as const))])
        }

        for (const p of (staleRaw || []) as any[]) {
          const staff = p.staff
          if (!staff?.employee_number) continue
          const stale = daysSince(p.updated_at)
          if (stale === null || stale < STALE_DAYS) continue // 30日未満は正常進行中

          const action = actionByEmpNo.get(staff.employee_number)
          const existingRowIdx = result.findIndex(r => r.employeeNumber === staff.employee_number)
          const issue: MonitoringIssue = {
            docLabel: 'アルバイト誓約書',
            kind: 'stalled',
            severity: 3,
            detail: `アルバイト誓約書の申請が${stale}日間動いていません`,
          }
          if (existingRowIdx >= 0) {
            // 既存行（雇用契約書等）と同一スタッフの場合は課題を追加するだけ
            const existing = result[existingRowIdx]
            const issues = [...existing.issues, issue]
            const topSeverity = issues.reduce<1 | 2 | 3 | 4>((min, i) => (i.severity < min ? i.severity : min), 4)
            result[existingRowIdx] = { ...existing, issues, topSeverity }
          } else {
            result.push({
              employeeNumber: staff.employee_number,
              staffName: staff.name,
              deptNo: staff.dept_no,
              deptName: staff.dept_no != null ? (pledgeDeptNameByNo.get(staff.dept_no) || null) : null,
              contractType: staff.contract_type,
              inferredWorkPlace: null,
              anyContractEver: true,
              issues: [issue],
              topSeverity: 3,
              actionStatus: (action?.status || '未着手') as ActionStatus,
              requestedAt: action?.requested_at || null,
              requestedByName: action?.requested_by_name || null,
            })
          }
        }
      }

      // 重大度順（数字が小さいほど深刻）→ 同順位は氏名順
      result.sort((a, b) => a.topSeverity - b.topSeverity || (a.staffName || '').localeCompare(b.staffName || ''))
      setRows(result)
    } finally {
      setLoading(false)
    }
  }, [])

  // フェーズ2：対応状況を手動で切り替える（未着手／依頼済み／対応中／解消）。
  // RLSでcontract_monitoring_actionsへの書き込みは管理部ロールのみ許可されている。
  const updateActionStatus = useCallback(async (employeeNumber: string, status: ActionStatus) => {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('contract_monitoring_actions')
      .upsert({ employee_number: employeeNumber, status, updated_at: now }, { onConflict: 'employee_number' })
    if (error) {
      console.error('契約状況モニタリング 対応状況の更新エラー:', error)
      return false
    }
    setRows(prev => prev.map(r => r.employeeNumber === employeeNumber ? { ...r, actionStatus: status } : r))
    return true
  }, [])

  // フェーズ2：「対応依頼」ボタン本体。サーバー側API（/api/contract-monitoring/notify）を呼び、
  // 担当営業への即時メール送信＋対応状況の「依頼済み」への更新をまとめて行う。
  const requestFollowUp = useCallback(async (
    row: Pick<MonitoringRow, 'employeeNumber' | 'staffName' | 'deptNo' | 'issues'>,
    requestedByName: string | null
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/contract-monitoring/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          employeeNumber: row.employeeNumber,
          staffName: row.staffName,
          deptNo: row.deptNo,
          issues: row.issues.map(i => ({ docLabel: i.docLabel, detail: i.detail })),
          requestedByName,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: json?.error || '確認依頼の送信に失敗しました。' }
      }
      const now = new Date().toISOString()
      setRows(prev => prev.map(r => r.employeeNumber === row.employeeNumber
        ? { ...r, actionStatus: '依頼済み', requestedAt: now, requestedByName }
        : r))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || '確認依頼の送信に失敗しました。' }
    }
  }, [])

  return { rows, loading, fetchMonitoring, updateActionStatus, requestFollowUp }
}
