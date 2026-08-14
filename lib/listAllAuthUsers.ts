// ===== M-11対応（2026-08-14）=====
// Supabase Auth の supabaseAdmin.auth.admin.listUsers() は、1回の呼び出しでは指定した
// ページ分（例：perPage:200）しか返さない。通知メールの宛先解決等でこれを「全社員のメール
// アドレス一覧」のつもりで1回だけ呼んでいる箇所が複数あり、実際のアカウント数がページ上限を
// 超えると、超えた分のユーザーが宛先解決から静かに漏れる（外部総合品質監査レポートM-11）。
// このヘルパーは、空（または上限未満）のページに到達するまでページを進めながら全件を
// 収集する共通実装。呼び出し側は「id・emailのペアの配列が全件返ってくる」とだけ意識すればよい。
import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000 // Supabase Auth Admin APIの1ページあたり最大件数

export type AuthUserSummary = { id: string; email: string | null }

export async function listAllAuthUsers(supabaseAdmin: SupabaseClient): Promise<AuthUserSummary[]> {
  const allUsers: AuthUserSummary[] = []
  let page = 1
  // 安全弁：本来あり得ない無限ループを避けるための上限（100ページ＝最大10万ユーザー相当）。
  // 現実的なアカウント数を大きく超えているため、通常運用でここに到達することはない。
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) {
      console.error('listAllAuthUsers: ユーザー一覧の取得に失敗しました:', error.message)
      break
    }
    const users = data?.users || []
    for (const u of users) allUsers.push({ id: u.id, email: u.email || null })
    if (users.length < PAGE_SIZE) break // このページが最後（次ページは空のはず）
    page++
  }
  return allUsers
}
