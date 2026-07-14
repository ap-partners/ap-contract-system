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
