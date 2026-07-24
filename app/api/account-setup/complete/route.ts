// ===== アカウント初回設定／パスワード再設定：本人セッション発行 =====
// 2026-07-24新設／同日改修。認証コードを照合したうえで、Supabase Authの
// パスワードリセット用リンク（recovery）を管理者権限で発行し、本人確認用のtoken_hashを
// クライアントへ返す。以前は管理者権限で直接パスワードを書き換えていたが（admin.updateUserById）、
// Supabaseプロジェクト側のJWT署名鍵移行（HS256→ES256）に起因すると見られる断続的な不具合
// （invalid JWT: unrecognized JWT kid <nil> for algorithm ES256）により失敗することがあると判明。
// 実際のログ調査で、管理者権限のAPI呼び出し（/admin/users系）でのみ発生し、本人自身のセッションでの
// API呼び出し（/user系）では発生していないことを確認したため、「本人確認コード→本人自身の権限で
// パスワード設定」という元々の設計（マイページ署名フローと同じ考え方）に変更し、この不具合の経路を
// 回避する。パスワードの実際の書き込みはクライアント側でsupabase.auth.updateUser()により本人の
// セッションで行う（app/account-setup/page.tsx参照）。認証コードの消込は本人側のパスワード設定が
// 成功した後、/api/account-setup/finalizeで行う（このエンドポイントでは消込しない＝途中で失敗しても
// 同じコードで再試行できるようにするため）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACCOUNT_SETUP_MAX_ATTEMPTS } from '@/lib/accountSetupCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Supabase側の断続的な不具合（同一トークンでも成功/失敗が入れ替わる)に対する保険として、
// 管理者権限のAPI呼び出しのみ短い間隔で数回リトライする。
async function withRetry<T>(fn: () => Promise<{ data: T; error: any }>, attempts = 3, delayMs = 700) {
  let lastError: any = null
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await fn()
    if (!error) return { data, error: null as any }
    lastError = error
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  return { data: null as any, error: lastError }
}

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

  // 本人自身がこの後 supabase.auth.updateUser() でパスワードを設定できるよう、
  // recovery（パスワード再設定）用のリンクを管理者権限で発行し、token_hashだけを返す。
  // メールは送らず（すでに独自の認証コードメールを送信済みのため）、tokenを直接クライアントに渡す。
  const { data: linkData, error: linkErr } = await withRetry(() =>
    supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
  )
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: '本人確認用のリンク発行に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tokenHash: linkData.properties.hashed_token })
}
