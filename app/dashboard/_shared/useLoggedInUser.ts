'use client'

// ===== ログイン中ユーザーの表示用情報（氏名・部門名） =====
// 2026-07-24新設。ダッシュボードヘッダーに「今ログインしている本人」を表示するための共通フック。
// staff_roles（社内アカウント用テーブル。RLSで「本人は自分の行のみ参照可」に限定済み）から
// 氏名・ロールを取得し、担当営業の場合のみdept_noからdepartment_masterを引いて部門名に変換する。
// SSC・管理部はdept_noを持たない設計のため、ロール名（'SSC'|'管理部'）をそのまま部門欄に表示する
// （2026-07-17のアカウント管理機能実装時からの既存仕様を踏襲）。
//
// 2026-08-12（B-11対応）：is_internal_approver・is_account_adminも合わせて返すよう拡張。
// 従来これらはSupabase Authのuser_metadata（ログイン時に発行されたJWTに埋め込まれた値の
// スナップショット）から読んでいたため、アカウント管理で権限を後から付与・剥奪しても、
// 対象者が再ログイン（＝新しいJWTの発行）するまで画面の表示が実際の権限とズレたままになる
// 問題があった。staff_rolesを毎回サーバー側で直接参照するこのフック経由に統一することで、
// ページの再読み込みだけで最新の権限が反映されるようにする（RLS側は元々current_role_name()・
// current_is_internal_approver()等でstaff_rolesを直接見ており、常に正しい状態だった＝
// 今回の対応はUIの表示精度の是正であり、データそのものが見えてしまう・書き換えられてしまう
// という意味でのセキュリティ上の穴ではない）。
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type LoggedInUserInfo = {
  name: string | null
  departmentLabel: string | null
  isInternalApprover: boolean
  isAccountAdmin: boolean
  loading: boolean
}

export function useLoggedInUser(userId: string | undefined | null): LoggedInUserInfo {
  const [name, setName] = useState<string | null>(null)
  const [departmentLabel, setDepartmentLabel] = useState<string | null>(null)
  const [isInternalApprover, setIsInternalApprover] = useState(false)
  const [isAccountAdmin, setIsAccountAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: roleRow } = await supabase
        .from('staff_roles')
        .select('name, role, dept_no, is_internal_approver, is_account_admin')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      if (!roleRow) { setLoading(false); return }

      setName(roleRow.name || null)
      setIsInternalApprover(roleRow.is_internal_approver === true)
      setIsAccountAdmin(roleRow.is_account_admin === true)

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

  return { name, departmentLabel, isInternalApprover, isAccountAdmin, loading }
}
