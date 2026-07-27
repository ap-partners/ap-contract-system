// ===== アカウント初回設定／パスワード再設定：認証コード照合 =====
// 2026-07-24新設。/account-setup画面の「認証コードを確認する」ステップで呼ばれる。
// この時点ではまだパスワードが決まっておらずログインセッションが無いため、ログイン必須APIには
// できない（/api/sign/[id]/verifyと同じ考え方で、メールアドレス＋認証コードそのものが認可の代わり）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACCOUNT_SETUP_MAX_ATTEMPTS } from '@/lib/accountSetupCode'
import { incrementAttemptCounter } from '@/lib/attemptCounter'
import { timingSafeEqualStrings } from '@/lib/timingSafeEqual'

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

  // 2026-07-24：以前はlistUsers()で全件取得して絞り込んでいたが、実機確認中に500エラーが
  // 発生（連続呼び出しによる負荷・レート制限が疑われる）。ピンポイントにidだけを引く
  // SQL関数（RPC）に置き換えて解消。
  const { data: userId, error: rpcErr } = await supabaseAdmin.rpc('get_auth_user_id_by_email', { p_email: email })
  if (rpcErr) return NextResponse.json({ error: '確認に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
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

  if (!timingSafeEqualStrings(roleRow.setup_code, code)) {
    // 総合レビュー指摘15対応：DB側のアトミックなインクリメントに一本化し競合状態を回避
    const nextAttempts = await incrementAttemptCounter(supabaseAdmin, { table: 'staff_roles', column: 'setup_code_attempts' }, userId)
    const remaining = ACCOUNT_SETUP_MAX_ATTEMPTS - nextAttempts
    return NextResponse.json({ error: `認証コードが正しくありません。あと${Math.max(remaining, 0)}回間違えると失効します。` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, name: roleRow.name, role: roleRow.role })
}
