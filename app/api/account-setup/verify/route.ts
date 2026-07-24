// ===== アカウント初回設定／パスワード再設定：認証コード照合 =====
// 2026-07-24新設。/account-setup画面の「認証コードを確認する」ステップで呼ばれる。
// この時点ではまだパスワードが決まっておらずログインセッションが無いため、ログイン必須APIには
// できない（/api/sign/[id]/verifyと同じ考え方で、メールアドレス＋認証コードそのものが認可の代わり）。
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
  if (!email || !code) return NextResponse.json({ error: 'メールアドレスと認証コードを入力してください。' }, { status: 400 })

  const { data: listResult, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: '確認に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  const authUser = listResult.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!authUser) return NextResponse.json({ error: 'メールアドレスまたは認証コードが正しくありません。' }, { status: 400 })

  const { data: roleRow } = await supabaseAdmin.from('staff_roles').select('*').eq('id', authUser.id).maybeSingle()
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
    await supabaseAdmin.from('staff_roles').update({ setup_code_attempts: roleRow.setup_code_attempts + 1 }).eq('id', authUser.id)
    return NextResponse.json({ error: `認証コードが正しくありません。あと${Math.max(remaining, 0)}回間違えると失効します。` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, name: roleRow.name, role: roleRow.role })
}
