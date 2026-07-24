'use client'

// ===== ログイン中ユーザーの表示用情報（氏名・部門名） =====
// 2026-07-24新設。ダッシュボードヘッダーに「今ログインしている本人」を表示するための共通フック。
// staff_roles（社内アカウント用テーブル。RLSで「本人は自分の行のみ参照可」に限定済み）から
// 氏名・ロールを取得し、担当営業の場合のみdept_noからdepartment_masterを引いて部門名に変換する。
// SSC・管理部はdept_noを持たない設計のため、ロール名（'SSC'|'管理部'）をそのまま部門欄に表示する
// （2026-07-17のアカウント管理機能実装時からの既存仕様を踏襲）。
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type LoggedInUserInfo = {
  name: string | null
  departmentLabel: string | null
  loading: boolean
}

export function useLoggedInUser(userId: string | undefined | null): LoggedInUserInfo {
  const [name, setName] = useState<string | null>(null)
  const [departmentLabel, setDepartmentLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: roleRow } = await supabase
        .from('staff_roles')
        .select('name, role, dept_no')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      if (!roleRow) { setLoading(false); return }

      setName(roleRow.name || null)

      if (roleRow.role === '担当営業' && roleRow.dept_no != null) {
        const { data: deptRow } = await supabase
          .from('department_master')
          .select('dept_name')
          .eq('dept_no', roleRow.dept_no)
          .maybeSingle()
        if (!cancelled) setDepartmentLabel(deptRow?.dept_name || null)
      } else {
        setDepartmentLabel(roleRow.role || null)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId])

  return { name, departmentLabel, loading }
}
