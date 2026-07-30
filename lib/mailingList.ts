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
