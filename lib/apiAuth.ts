// ===== 社内向けAPIルートの認可ヘルパー =====
// 総合レビュー指摘4対応（2026-07-15）。notify-sign-request・PDF取得など「社内の
// ログイン済みユーザー（担当営業・SSC・管理部）のみが呼ぶはずのAPI」で、呼び出し元の
// 認証確認が一切無かった問題への対応。フロント側は`Authorization: Bearer <access_token>`
// ヘッダーを付けてfetchする（各呼び出し箇所を修正済み）。
//
// 注意：/api/sign/[id]/* （verify・complete・reissue）は対象外。これらは従業員向けで
// Supabaseアカウントを持たないため、社員番号＋認証コードでの本人確認が認可の代わりとなる
// 設計（意図的・レビューでも「設計上やむを得ない」と評価済み）。
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type StaffAuthContext = {
  userId: string
  role: string | null
  deptNo: number | null
  isInternalApprover: boolean
  isAccountAdmin: boolean
}

// リクエストのAuthorizationヘッダーからSupabaseセッションを検証し、staff_rolesの
// ロール・部門情報とあわせて返す。認証できない場合はnull。
// 2026-07-24追加：is_active=falseの行（凍結済みアカウント）はnullを返し、既に発行済みの
// ログイントークンが残っていても即座に全APIで拒否されるようにする（RLS側のcurrent_role_name等
// と同じ考え方の二重ガード）。
export async function getAuthenticatedStaff(req: NextRequest): Promise<StaffAuthContext | null> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  if (!token) return null

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) return null

  const { data: roleRow } = await supabaseAdmin
    .from('staff_roles')
    .select('role, dept_no, is_internal_approver, is_account_admin, is_active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (roleRow && roleRow.is_active === false) return null

  return {
    userId: userData.user.id,
    role: roleRow?.role || null,
    deptNo: roleRow?.dept_no ?? null,
    isInternalApprover: !!roleRow?.is_internal_approver,
    isAccountAdmin: !!roleRow?.is_account_admin,
  }
}
