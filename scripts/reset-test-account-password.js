/**
 * テスト用アカウントのパスワードを強制的に再設定するスクリプト
 *
 * 【用途】
 * Supabase Authはパスワードをハッシュ化して保存しているため、
 * 「今設定されているパスワードが何か」をクエリで取り出すことはできない
 * （これはセキュリティ上の仕様であり、不具合ではない）。
 * パスワードを忘れた／分からないテスト用アカウントにログインしたい場合は、
 * このスクリプトで新しいパスワードを上書き設定する。
 *
 * 【実行方法】（VSCodeのターミナルから）
 * node scripts/reset-test-account-password.js <メールアドレス> <新しいパスワード>
 *
 * 例：
 * node scripts/reset-test-account-password.js ito+groupscope1@appart.co.jp Test1234!
 *
 * 【注意】
 * ・実在の従業員アカウント（/staff/mypage用）ではなく、担当営業・SSC・管理部の
 *   ログインアカウント（Supabase Authユーザー）が対象。
 * ・本番の実アカウントに対して安易に使わないこと（テスト用アカウントの復旧目的で使う）。
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const email = process.argv[2]
  const newPassword = process.argv[3]

  if (!email || !newPassword) {
    console.error('使い方: node scripts/reset-test-account-password.js <メールアドレス> <新しいパスワード>')
    process.exit(1)
  }

  // メールアドレスからSupabase AuthのユーザーIDを検索
  // （supabase-jsの管理APIにはメール直接指定の更新がないため、一覧から探す）
  let user = null
  let page = 1
  const perPage = 1000
  while (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('ユーザー一覧の取得に失敗しました:', error.message)
      process.exit(1)
    }
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user || data.users.length < perPage) break
    page += 1
  }

  if (!user) {
    console.error('該当するアカウントが見つかりませんでした:', email)
    process.exit(1)
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })

  if (updateError) {
    console.error('パスワードの更新に失敗しました:', updateError.message)
    process.exit(1)
  }

  console.log('パスワードを更新しました。')
  console.log('メールアドレス:', email)
  console.log('新しいパスワード:', newPassword)
}

main()
