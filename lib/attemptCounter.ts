// ===== 本人確認系の試行回数カウンタ：アトミックな加算 =====
// リリース前総合レビュー指摘[15]対応（2026-07-27）。
// 「SELECTで現在値取得→JS側で+1→UPDATEで書き戻す」実装は、並列リクエストが同じ古い値を
// 読み込んでから書き戻すことでカウントが正しく増加しない競合状態（race condition）を生む。
// DB関数increment_attempt_counter（1つのUPDATE文でPostgresが行ロックする）を呼ぶだけの
// 薄いラッパーとして共通化し、各APIルートでの重複実装を避ける。
import { SupabaseClient } from '@supabase/supabase-js'

export type AttemptCounterTarget =
  | { table: 'contracts'; column: 'sign_auth_attempts' }
  | { table: 'staff'; column: 'login_auth_attempts' }
  | { table: 'staff'; column: 'login_password_attempts' }
  | { table: 'staff_roles'; column: 'setup_code_attempts' }

// 加算後の新しい試行回数を返す。DB関数呼び出し自体が失敗した場合は例外を投げる
// （呼び出し元で握りつぶさず、試行回数が更新できない異常系として扱う）。
export async function incrementAttemptCounter(
  supabaseAdmin: SupabaseClient,
  target: AttemptCounterTarget,
  id: string
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('increment_attempt_counter', {
    p_table: target.table,
    p_column: target.column,
    p_id: id,
  })
  if (error || data === null || data === undefined) {
    throw new Error('試行回数の更新に失敗しました: ' + (error?.message || 'unknown error'))
  }
  return data as number
}
