// ===== メーリングリストマスタ：通知メール宛先の解決 =====
// 2026-07-30新設。部門（担当営業）・SSC・管理部ごとに登録されたメーリングリストの
// メールアドレスを返す。未登録の場合はnullを返すので、呼び出し側は既存の個人宛メール
// 送信にそのままフォールバックする（安全策。設定を忘れていても宛先ゼロで届かなくなる
// 事故は起きない）。
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type MailingListScope = 'dept' | 'ssc' | 'admin'

// 指定したスコープ（部門／SSC／管理部）に登録済みのメーリングリストのメールアドレスを返す。
// 未登録の場合はnull。scopeType='dept'の場合はdeptNoが必須（無ければ問答無用でnull）。
export async function resolveMailingListEmail(
  scopeType: MailingListScope,
  deptNo?: number | null
): Promise<string | null> {
  if (scopeType === 'dept') {
    if (deptNo === null || deptNo === undefined) return null
    const { data } = await supabaseAdmin
      .from('mailing_list_master')
      .select('email')
      .eq('scope_type', 'dept')
      .eq('dept_no', deptNo)
      .maybeSingle()
    return data?.email || null
  }
  const { data } = await supabaseAdmin
    .from('mailing_list_master')
    .select('email')
    .eq('scope_type', scopeType)
    .is('dept_no', null)
    .maybeSingle()
  return data?.email || null
}

// アカウント管理の新規追加・編集時、指定したスコープにメーリングリストが登録済みかどうかを判定する。
export async function hasMailingList(scopeType: MailingListScope, deptNo?: number | null): Promise<boolean> {
  const email = await resolveMailingListEmail(scopeType, deptNo)
  return !!email
}

// requests（スタッフマスタ登録依頼・CSVインポート依頼）の依頼元（担当営業）への通知先を解決する。
// 2026-07-31新設。依頼元の「現在の」所属部署（staff_rolesが正）のメーリングリストが
// 登録されていればそちらへ、未登録なら依頼者本人のログインアカウントのメールアドレスに
// フォールバックする（他の通知と同じ「メーリングリスト優先・個人宛フォールバック」の考え方）。
export async function resolveRequesterNotifyEmail(requestedBy: string): Promise<string | null> {
  const { data: roleRow } = await supabaseAdmin
    .from('staff_roles')
    .select('dept_no')
    .eq('id', requestedBy)
    .maybeSingle()
  const deptNo = roleRow?.dept_no ?? null

  const mailingEmail = await resolveMailingListEmail('dept', deptNo)
  if (mailingEmail) return mailingEmail

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requestedBy)
  return userData?.user?.email || null
}
