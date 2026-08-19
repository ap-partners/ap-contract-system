// ===== #14対応（2026-08-19）：Vercel Cronの実行結果をcron_runsへ記録する共通ヘルパー =====
// 外部総合品質監査レポート12章-14「cronが失敗しても誰も気づかない」への対応。
// 3本のcron（renewal-notify・withdrawn-cleanup・csvmeta-cleanup）が実行のたびに
// logCronRun()を1回呼び、cron_runsへ1行記録する。
//
// 通知の設計（伊藤さん承認済み・2026-08-19）：
// ・status='error'が2回連続した「その瞬間」（＝2回目のerror記録時点）だけ、
//   管理部へ1通だけ通知メールを送る。3回目以降も失敗し続けている間は再通知しない
//   （毎日何通も届く「オオカミ少年化」を避けるため）。
// ・status='skipped'（例：土日祝でそもそも処理対象外だった等）はエラーではないため、
//   連続失敗のカウントに含めない・通知もしない。
// ・RENEWAL_NOTIFY_OVERRIDE_EMAILが設定されている間（本稼働前のテスト運用中）は、
//   cron/renewal-notifyの既存の宛先差し替え方式と同じ考え方で、そちらへ送る。
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCronFailureNoticeMail } from '@/lib/mail'
import { listAllAuthUsers } from '@/lib/listAllAuthUsers'

export type CronRunStatus = 'success' | 'error' | 'skipped'

export async function logCronRun(
  supabaseAdmin: SupabaseClient,
  params: {
    cronName: string
    status: CronRunStatus
    summary?: Record<string, unknown> | null
    errorMessage?: string | null
    startedAt: Date
  }
): Promise<void> {
  try {
    await supabaseAdmin.from('cron_runs').insert({
      cron_name: params.cronName,
      status: params.status,
      summary: params.summary ?? null,
      error_message: params.errorMessage ?? null,
      started_at: params.startedAt.toISOString(),
    })
  } catch (e: any) {
    // cron_runsへの記録自体が失敗しても、cron本来の処理結果には一切影響させない。
    console.error(`cron_runs記録エラー（${params.cronName}）:`, e?.message || e)
    return
  }

  if (params.status !== 'error') return

  try {
    const { data: recentRuns } = await supabaseAdmin
      .from('cron_runs')
      .select('status')
      .eq('cron_name', params.cronName)
      .order('finished_at', { ascending: false })
      .limit(2)
    const runs = recentRuns || []
    const isSecondConsecutiveFailure = runs.length === 2 && runs.every((r: any) => r.status === 'error')
    if (!isSecondConsecutiveFailure) return

    const overrideEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || null
    let toEmails: string[] = []
    if (overrideEmail) {
      toEmails = [overrideEmail]
    } else {
      const { data: roleRows } = await supabaseAdmin.from('staff_roles').select('id, role').eq('role', '管理部')
      const allAuthUsers = await listAllAuthUsers(supabaseAdmin)
      const emailById = new Map<string, string>(allAuthUsers.map(u => [u.id, u.email || '']))
      toEmails = Array.from(new Set(
        (roleRows || []).map((r: any) => emailById.get(r.id)).filter((e): e is string => !!e)
      ))
    }
    if (toEmails.length === 0) return
    await sendCronFailureNoticeMail(toEmails, params.cronName, params.errorMessage ?? null)
  } catch (e: any) {
    console.error(`cron失敗通知メール送信エラー（${params.cronName}）:`, e?.message || e)
  }
}
