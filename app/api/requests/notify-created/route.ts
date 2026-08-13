// ===== 依頼（スタッフマスタ登録・CSVインポート）新規送信時の管理部通知API（2026-07-31新設） =====
// /apply STEP1（handleSubmitRequest）・STEP2（handleSubmitCsvRequest）で`requests`テーブルへの
// 保存が成功した直後に、クライアントから呼ばれる。管理部（メーリングリスト優先・未登録なら
// 個人宛にフォールバック。宛先解決の考え方はcontract-monitoring/notifyと同じ）へ、
// 新しい依頼が届いた旨のメールを送る。
// このメールはあくまで「気づきやすくする」ための通知であり、依頼自体は`requests`への保存が
// 完了した時点で業務上有効なため、送信に失敗しても依頼の保存はロールバックしない
// （エラーは呼び出し元に返すが、依頼自体は既に保存済みのまま）。
// 認可：ログイン済みの社内ユーザー（担当営業・SSC・管理部のいずれか）であればよい
// （/applyは3ロールとも申請可能なため、role制限はしない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendNewRequestMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { resolveMailingListEmail } from '@/lib/mailingList'

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
  const { requestId } = body as { requestId: string }
  if (!requestId) {
    return NextResponse.json({ error: '依頼IDが指定されていません。' }, { status: 400 })
  }

  // 2026-07-31：メール本文の項目網羅（伊藤さん指摘）のため、フォームの入力項目一式
  // （staff_dept・staff_hire_date・system_type・dispatch_start_date・csv_import_status）を追加。
  const { data: request, error } = await supabaseAdmin
    .from('requests')
    .select('id, request_type, staff_name, staff_code, staff_dept, staff_hire_date, client_name, system_type, dispatch_start_date, csv_import_status, requested_by_name, requested_by_dept, requested_at')
    .eq('id', requestId)
    .maybeSingle()

  if (error || !request) {
    return NextResponse.json({ error: '依頼が見つかりませんでした。' }, { status: 404 })
  }

  // 2026-07-30新設のメーリングリストマスタに登録があればそちらへ、未登録なら
  // staff_rolesから個人宛メールへフォールバック（他の通知と同じ考え方）。
  const [adminMailingEmail, roleRows, usersList] = await Promise.all([
    resolveMailingListEmail('admin'),
    supabaseAdmin.from('staff_roles').select('id, role'),
    supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
  ])

  const emailById = new Map<string, string>((usersList.data?.users || []).map(u => [u.id, u.email || '']))
  const individualMgmtEmails = Array.from(new Set(
    (roleRows.data || [])
      .filter((r: any) => r.role === '管理部')
      .map((r: any) => emailById.get(r.id))
      .filter((e): e is string => !!e)
  ))

  const overrideEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || null
  const mgmtEmails = overrideEmail ? [overrideEmail] : (adminMailingEmail ? [adminMailingEmail] : individualMgmtEmails)

  if (mgmtEmails.length === 0) {
    return NextResponse.json({ error: '送信先の管理部メールアドレスが見つかりませんでした（メーリングリスト未登録・管理部個人アカウントも0件）。' }, { status: 422 })
  }

  try {
    await sendNewRequestMail(mgmtEmails, {
      requestType: request.request_type,
      staffName: request.staff_name,
      staffCode: request.staff_code,
      staffDept: request.staff_dept,
      staffHireDate: request.staff_hire_date,
      clientName: request.client_name,
      systemType: request.system_type,
      dispatchStartDate: request.dispatch_start_date,
      // staff_register依頼で「CSVインポートも同時に依頼する」がオンだった場合のみtrue
      // （csv_import_statusが明示的に'pending'の場合。csv_import単独依頼時はこのフラグ自体を
      // 使わない＝buildRequestDetailLines側でrequestType判定が優先される）
      csvAlsoRequested: request.request_type === 'staff_register' && request.csv_import_status === 'pending',
      requestedByName: request.requested_by_name,
      requestedByDept: request.requested_by_dept,
      requestedAt: request.requested_at,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました: ' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
