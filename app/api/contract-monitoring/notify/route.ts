// ===== 契約状況モニタリング フェーズ2：担当営業への確認依頼API（2026-07-23新設） =====
// 管理部ダッシュボード「更新期限管理」タブ内「契約状況モニタリング」セクションの
// 「対応依頼」ボタンから呼ばれる。①対象スタッフの所属部門の担当営業へ即時メール送信
// （担当営業アカウントが特定できない場合は管理部へフォールバック。宛先解決の考え方は
// app/api/cron/renewal-notify/route.ts と同じ）、②contract_monitoring_actionsの
// 対応状況を「依頼済み」に更新、の2つを行う。
// 認可：管理部ロールのログイン済みユーザーのみ呼び出せる（notify-sign-requestと同じ
// getAuthenticatedStaff方式。総合レビュー指摘4の教訓を踏まえ、この新規APIも最初から
// Authorizationヘッダー必須で実装する）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendContractMonitoringFollowupMail, type ContractMonitoringFollowupItem } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { resolveMailingListEmail } from '@/lib/mailingList'
import { listAllAuthUsers } from '@/lib/listAllAuthUsers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || staffAuth.role !== '管理部') {
    return NextResponse.json({ error: '管理部ロールでのログインが必要です。' }, { status: 401 })
  }

  // 外部総合品質監査レポートM-24対応（2026-08-14）：Content-Type不正・空ボディ等でreq.json()が
  // 例外を投げると未捕捉のまま500になっていたため、他のAPIルートと同じ`.catch(() => null)`＋
  // 400エラーのパターンに統一する。
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const { employeeNumber, staffName, deptNo, issues, requestedByName } = body as {
    employeeNumber: string
    staffName: string | null
    deptNo: number | null
    issues: ContractMonitoringFollowupItem[]
    requestedByName: string | null
  }
  if (!employeeNumber || !issues || issues.length === 0) {
    return NextResponse.json({ error: '必要な情報が不足しています。' }, { status: 400 })
  }

  const { data: deptRow } = await supabaseAdmin
    .from('department_master')
    .select('dept_name')
    .eq('dept_no', deptNo)
    .maybeSingle()
  const deptName = deptRow?.dept_name || '所属部署不明'

  const { data: roleRows } = await supabaseAdmin.from('staff_roles').select('id, role, dept_no')
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
  const individualSscEmails = Array.from(new Set(
    (roleRows || [])
      .filter((r: any) => r.role === 'SSC')
      .map((r: any) => emailById.get(r.id))
      .filter((e): e is string => !!e)
  ))
  const individualAssignedToEmails = deptNo !== null
    ? Array.from(new Set(
        (roleRows || [])
          .filter((r: any) => r.role === '担当営業' && r.dept_no === deptNo)
          .map((r: any) => emailById.get(r.id))
          .filter((e): e is string => !!e)
      ))
    : []

  // 2026-07-30追加：メーリングリストマスタに登録があれば、個人宛メールの代わりにそちらを使う。
  // 未登録のスコープは従来通り個人宛（安全策）。
  const [deptMailingEmail, sscMailingEmail, adminMailingEmail] = await Promise.all([
    resolveMailingListEmail('dept', deptNo),
    resolveMailingListEmail('ssc'),
    resolveMailingListEmail('admin'),
  ])

  const mgmtEmails = adminMailingEmail ? [adminMailingEmail] : individualMgmtEmails
  const sscEmails = sscMailingEmail ? [sscMailingEmail] : individualSscEmails
  const assignedToEmails = deptMailingEmail ? [deptMailingEmail] : individualAssignedToEmails

  const isUnassignedFallback = assignedToEmails.length === 0
  const toEmails = isUnassignedFallback ? mgmtEmails : assignedToEmails
  const ccEmails = isUnassignedFallback ? sscEmails : Array.from(new Set([...sscEmails, ...mgmtEmails]))

  const overrideEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || null
  let finalTo = toEmails
  let finalCc = ccEmails
  let overrideNotice: string | undefined
  if (overrideEmail) {
    finalTo = [overrideEmail]
    finalCc = []
    overrideNotice = `※現在テスト運用中のため、本来の宛先ではなくこのアドレスに届いています。\n　本来のTO：${toEmails.join(', ') || '(該当する担当営業・管理部アカウントなし)'}\n　本来のCC：${ccEmails.join(', ') || '(なし)'}`
  }

  if (finalTo.length === 0) {
    return NextResponse.json({ error: '送信先メールアドレスが見つかりませんでした（担当営業アカウント未登録・管理部フォールバックも0件）。' }, { status: 422 })
  }

  try {
    await sendContractMonitoringFollowupMail(finalTo, finalCc, staffName, employeeNumber, deptName, issues, requestedByName, overrideNotice, isUnassignedFallback)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました: ' + (e?.message || '') }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: upsertError } = await supabaseAdmin
    .from('contract_monitoring_actions')
    .upsert({
      employee_number: employeeNumber,
      status: '依頼済み',
      requested_at: now,
      requested_by: staffAuth.userId,
      requested_by_name: requestedByName || null,
      updated_at: now,
    }, { onConflict: 'employee_number' })

  if (upsertError) {
    return NextResponse.json({ sent: true, statusSaveError: upsertError.message })
  }

  return NextResponse.json({ sent: true, isUnassignedFallback })
}
