 import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 社内向けAPIルート（notify-sign-request等）呼び出し時に付与する認証ヘッダーを作る。
// 総合レビュー指摘4対応（2026-07-15）：これらのAPIはログイン済みユーザーのみ呼べるよう
// サーバー側でAuthorizationヘッダーを検証するようになったため、fetch()する側でも
// このヘッダーを付ける必要がある。
export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Supabaseプロジェクト側のJWT署名鍵移行（HS256→ES256）に起因すると見られる断続的な
// 認証エラー（2026-07-24確認）に対する保険。同じ呼び出しを短い間隔で数回リトライする。
// アカウント初回設定（/account-setup）のように、失敗すると本人がやり直せず詰まりやすい
// 画面で使う想定。
export async function retrySupabaseCall<T>(
  fn: () => Promise<{ data: T; error: any }>,
  attempts = 3,
  delayMs = 700
): Promise<{ data: T | null; error: any }> {
  let lastError: any = null
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await fn()
    if (!error) return { data, error: null }
    lastError = error
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  return { data: null, error: lastError }
}
