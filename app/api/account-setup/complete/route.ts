// ===== アカウント初回設定／パスワード再設定：パスワード確定 =====
// 2026-07-24新設。認証コードを再度照合したうえで、Supabase Auth本体のパスワードを更新する。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACCOUNT_SETUP_MAX_ATTEMPTS } from '@/lib/accountSetupCode'
import { isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from '@/lib/staffPassword'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const email = String(body?.email || '').trim()
  const code = String(body?.code || '').trim()
  const newPassword = String(body?.newPassword || '')
  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: 'メールアドレス・認証コード・新しいパスワードを入力してください。' }, { status: 400 })
  }
  if (!isPasswordValid(newPassword)) {
    return NextResponse.json({ error: PASSWORD_REQUIREMENT_MESSAGE }, { status: 400 })
  }

  // 2026-07-24：以前はlistUsers()で全件取得して絞り込んでいたが、実機確認中に500エラーが
  // 発生（連続呼び出しによる負荷・レート制限が疑われる）。ピンポイントにidだけを引く
  // SQL関数（RPC）に置き換えて解消。
  const { data: userId, error: rpcErr } = await supabaseAdmin.rpc('get_auth_user_id_by_email', { p_email: email })
  if (rpcErr) return NextResponse.json({ error: '処理に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  if (!userId) return NextResponse.json({ error: 'メールアドレスまたは認証コードが正しくありません。' }, { status: 400 })

  const { data: roleRow } = await supabaseAdmin.from('staff_roles').select('*').eq('id', userId).maybeSingle()
  if (!roleRow) return NextResponse.json({ error: 'メールアドレスまたは認証コードが正しくありません。' }, { status: 400 })

  if (roleRow.is_active === false) {
    return NextResponse.json({ error: 'このアカウントは現在ご利用いただけません。管理部にご連絡ください。' }, { status: 400 })
  }
  if (!roleRow.setup_code || !roleRow.setup_code_expires_at) {
    return NextResponse.json({ error: '認証コードが発行されていません。管理部に再発行を依頼してください。' }, { status: 400 })
  }
  if (roleRow.setup_code_attempts >= ACCOUNT_SETUP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: '試行回数の上限に達しました。管理部に認証コードの再発行を依頼してください。' }, { status: 400 })
  }
  if (new Date(roleRow.setup_code_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '認証コードの有効期限が切れています。管理部に再発行を依頼してください。' }, { status: 400 })
  }
  if (roleRow.setup_code !== code) {
    const remaining = ACCOUNT_SETUP_MAX_ATTEMPTS - (roleRow.setup_code_attempts + 1)
    await supabaseAdmin.from('staff_roles').update({ setup_code_attempts: roleRow.setup_code_attempts + 1 }).eq('id', userId)
    return NextResponse.json({ error: `認証コードが正しくありません。あと${Math.max(remaining, 0)}回間違えると失効します。` }, { status: 400 })
  }

  const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword })
  if (pwErr) return NextResponse.json({ error: 'パスワードの更新に失敗しました：' + pwErr.message }, { status: 500 })

  await supabaseAdmin.from('staff_roles').update({
    needs_password_setup: false,
    setup_code: null,
    setup_code_expires_at: null,
    setup_code_issued_at: null,
    setup_code_attempts: 0,
  }).eq('id', userId)

  return NextResponse.json({ ok: true })
}
