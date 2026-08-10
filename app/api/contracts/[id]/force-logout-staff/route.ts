// ===== 従業員マイページセッションの強制ログアウト =====
// 2026-08-10新設（B-07対応の追加機能）。従業員から「スマホを紛失した／盗まれた」等の
// 連絡があった際、7日間のセッション有効期限が切れるのを待たずに、その場でログイン状態を
// 無効化できるようにする（staff.session_token_versionを繰り上げるだけ。その端末に
// 残っているセッションCookieは、次にAPIを呼んだ瞬間にlib/staffAuth.tsのgetStaffIdFromRequest
// で世代番号の不一致を検知され401になる＝再ログインが必要になる）。
//
// 権限判定はnotify-sign-request（B-01対応）と全く同じ部門スコープ判定を流用する
// （対象契約を操作できる担当営業・SSC・管理部と、対象スタッフのアカウントを扱ってよい
// 範囲は同じであるべきという考え方）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

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
    .select('staff_id, work_place, created_by_dept_no')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  const canOperate =
    staffAuth.role === '管理部' ||
    (staffAuth.role === 'SSC' && contract.work_place !== '社内') ||
    (staffAuth.role === '担当営業' && contract.created_by_dept_no != null && contract.created_by_dept_no === staffAuth.deptNo)
  if (!canOperate) {
    return NextResponse.json({ error: 'この操作を行う権限がありません。' }, { status: 403 })
  }

  const { data: newVersion, error: revokeError } = await supabaseAdmin.rpc('revoke_staff_sessions', { p_staff_id: contract.staff_id })
  if (revokeError || typeof newVersion !== 'number') {
    return NextResponse.json({ error: '強制ログアウトに失敗しました：' + (revokeError?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
