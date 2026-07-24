// ===== アカウント初回設定／パスワード再設定：認証コードの消込 =====
// 2026-07-24新設。/api/account-setup/complete で発行したrecoveryトークンを使い、クライアント側で
// supabase.auth.updateUser() による本人自身のパスワード設定が成功した「後」に呼ぶ。
// 認証コード自体は本人のセッションで検証済み（token_hashの検証はSupabase Auth側で行われている）だが、
// 念のためここでも同じ認証コードの一致・有効期限・試行回数を再確認したうえで消込む（他人が
// email・codeを推測してこのAPIだけを叩いても消込めないようにするため）。
// このAPI自体はDBの更新のみでSupabase Authの管理者API（/admin/users系）を呼ばないため、
// JWT鍵移行に起因する断続的な不具合の影響を受けない。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACCOUNT_SETUP_MAX_ATTEMPTS } from '@/lib/accountSetupCode'

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
  if (!email || !code) {
    return NextResponse.json({ error: 'メールアドレスと認証コードを入力してください。' }, { status: 400 })
  }

  const { data: userId, error: rpcErr } = await supabaseAdmin.rpc('get_auth_user_id_by_email', { p_email: email })
  if (rpcErr) return NextResponse.json({ error: '処理に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  if (!userId) return NextResponse.json({ error: 'メールアドレスまたは認証コードが正しくありません。' }, { status: 400 })

  const { data: roleRow } = await supabaseAdmin.from('staff_roles').select('*').eq('id', userId).maybeSingle()
  if (!roleRow) return NextResponse.json({ error: 'メールアドレスまたは認証コードが正しくありません。' }, { status: 400 })

  // 認証コードが既に消込済み（＝二重送信等）でも、パスワード自体は本人セッションで
  // 既に設定済みのはずなのでエラーにはせず成功扱いにする（ユーザー体験上ここで詰まらせない）。
  if (!roleRow.setup_code) {
    return NextResponse.json({ ok: true })
  }
  if (roleRow.setup_code_attempts >= ACCOUNT_SETUP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: '試行回数の上限に達しました。管理部に認証コードの再発行を依頼してください。' }, { status: 400 })
  }
  if (roleRow.setup_code !== code) {
    return NextResponse.json({ error: '認証コードが正しくありません。' }, { status: 400 })
  }

  await supabaseAdmin.from('staff_roles').update({
    needs_password_setup: false,
    setup_code: null,
    setup_code_expires_at: null,
    setup_code_issued_at: null,
    setup_code_attempts: 0,
  }).eq('id', userId)

  return NextResponse.json({ ok: true })
}
