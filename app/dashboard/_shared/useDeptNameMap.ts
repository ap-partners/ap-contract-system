// ===== 部門名マップ取得フック（2026-07-28新設） =====
// 「申請者」表示を「部門名 氏名」の順に統一するための共通ヘルパー。
// contracts.created_by_dept_noにはdepartment_masterへの外部キー制約が無く、
// PostgRESTの自動埋め込みJOIN（.select('...,department_master(dept_name)')）が使えないため、
// department_masterを1回まるごと取得してMap<number,string>を作り、各行のdept_noで引く方式に
// 統一する（pledges側はFKがあるが、契約・誓約書で実装方式を分けると保守が面倒なため揃える）。
// docs/SYSTEM_DESIGN.md 10章 2026-07-28参照。
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useDeptNameMap() {
  const [deptNameByNo, setDeptNameByNo] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('department_master').select('dept_no, dept_name')
      if (data) {
        setDeptNameByNo(new Map(data.map((d: any) => [d.dept_no, d.dept_name])))
      }
    })()
  }, [])

  return deptNameByNo
}

// 申請者表示ラベルを組み立てる共通ヘルパー：「部門名 氏名」の順（項目ラベル「申請者」自体は
// 変更しない・2026-07-28決定）。氏名が無ければ「(氏名未設定)」、部門名が引けなければ氏名のみ返す。
export function getApplicantLabel(
  name: string | null | undefined,
  deptNo: number | null | undefined,
  deptNameByNo: Map<number, string>
): string {
  const displayName = name || '(氏名未設定)'
  if (deptNo == null) return displayName
  const deptName = deptNameByNo.get(deptNo)
  return deptName ? `${deptName} ${displayName}` : displayName
}
