// ===== レート制限（総当たり・一括列挙対策） =====
// 2026-08-10新設（B-05対応）。監査指摘の報告書は外部Redisサービス（Upstash等）の導入を
// 提案していたが、このシステムは意図的にSupabase単独構成を保っており、新しい外部サービスの
// 契約・環境変数追加という伊藤さんの追加作業を避けるため、既存のincrement_attempt_counterと
// 同じ考え方（DB関数によるアトミックな加算）でIP単位のレート制限を実装する。
// DB関数check_rate_limitは1つのUPSERT文でPostgresが行ロックするため、並列リクエストでも
// カウントが正しく増加する（competing requestsによる過小カウントが起きない）。
import { SupabaseClient } from '@supabase/supabase-js'

// 制限判定に失敗した場合（DB接続エラー等）は、ログイン機能全体を止めないよう
// 「許可」側に倒す（可用性を優先。総当たり対策自体は他の防御層＝アカウント単位の
// 時間窓ロック等でも一部カバーされているため）。
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('checkRateLimit failed:', error.message)
    return true
  }
  return data === true
}
