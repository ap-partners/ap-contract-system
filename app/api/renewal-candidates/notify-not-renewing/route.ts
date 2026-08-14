// ===== 更新期限管理：「更新しない」確定時の管理部通知API（2026-07-31新設） =====
// 更新期限管理タブ（5タブ再設計）で「更新しないで確定する」を押した際に呼ばれる。
// 担当営業・SSC・管理部の誰でも操作できる既存仕様（confirmNotRenewing）に合わせ、
// ロール制限はせず認証済みスタッフであれば呼べるようにする。
// 宛先は管理部メーリングリスト優先・未登録なら個人（管理部ロール全員）宛にフォールバック。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRenewalNotRenewingNotifyMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { resolveMailingListEmail } from '@/lib/mailingList'
import { listAllAuthUsers } from '@/lib/listAllAuthUsers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  // 外部総合品質監査レポートM-24対応（2026-08-14）：req.json()を`.catch(() => null)`で
  // 保護し、他のAPIルートと同じ400エラーに統一する。
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const { staffName, employeeNumber, deptNo, workLocationName, reason } = body as {
    staffName: string | null
    employeeNumber: string
    deptNo: number | null
    workLocationName: string | null
    reason: string
  }
  if (!employeeNumber || !reason) {
    return NextResponse.json({ error: '必要な情報が不足しています。' }, { status: 400 })
  }

  const [deptRow, confirmedByRow] = await Promise.all([
    deptNo != null
      ? supabaseAdmin.from('department_master').select('dept_name').eq('dept_no', deptNo).maybeSingle()
      : Promise.resolve({ data: null }),
    // B-09対応（2026-08-06）：確定者の氏名も、以前は別途staff.emailで検索していたが
    // C-03によりほぼ機能していなかった（フォールバックでログインメールが表示されていた）。
    // このAPIは元々確定者の部門・ロール判定にstaff_rolesを使っていたため、nameも
    // 同じ1回のクエリで取得する形に統合する。
    supabaseAdmin.from('staff_roles').select('role, dept_no, name').eq('id', staffAuth.userId).maybeSingle(),
  ])
  const deptName = deptRow?.data?.dept_name || null

  let confirmedByDept: string | null = null
  const confirmedByDeptNo = confirmedByRow?.data?.dept_no ?? null
  if (confirmedByDeptNo != null) {
    const { data: cbDeptRow } = await supabaseAdmin
      .from('department_master').select('dept_name').eq('dept_no', confirmedByDeptNo).maybeSingle()
    confirmedByDept = cbDeptRow?.dept_name || null
  } else if (confirmedByRow?.data?.role) {
    confirmedByDept = confirmedByRow.data.role
  }

  let confirmedByName = confirmedByRow?.data?.name || null
  if (!confirmedByName) {
    // staff_rolesにも氏名が無い場合の最終フォールバックとしてログインメールを表示する
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(staffAuth.userId)
    confirmedByName = userData?.user?.email || null
  }

  const { data: roleRows } = await supabaseAdmin.from('staff_roles').select('id, role')
  // M-11対応（2026-08-14）：以前は1ページ目（perPage:200）しか取得しておらず、アカウント数が
  // 200を超えると201人目以降が通知先から静かに欠落する不具合があった。全件取得するヘルパーへ変更。
  const allAuthUsers = await listAllAuthUsers(supabaseAdmin)
  const emailById = new Map<string, string>(allAuthUsers.map(u => [u.id, u.email || '']))
  const individualMgmtEmails = Array.from(new Set(
    (roleRows || [])
      .filter((r: any) => r.role === '管理部')
      .map((r: any) => emailById.get(r.id))
      .filter((e): e is string => !!e)
  ))

  const adminMailingEmail = await resolveMailingListEmail('admin')
  const toEmails = adminMailingEmail ? [adminMailingEmail] : individualMgmtEmails

  const overrideEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || null
  const finalTo = overrideEmail ? [overrideEmail] : toEmails

  if (finalTo.length === 0) {
    return NextResponse.json({ error: '送信先メールアドレスが見つかりませんでした（管理部メーリングリスト未登録・個人アカウントも0件）。' }, { status: 422 })
  }

  try {
    await sendRenewalNotRenewingNotifyMail(finalTo, {
      staffName,
      employeeNumber,
      deptName,
      workLocationName,
      reason,
      confirmedByName,
      confirmedByDept,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました: ' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
