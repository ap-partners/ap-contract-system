// ===== input_data.csvMetaの自動削除（2026-07-27新設） =====
// Vercel Cron（vercel.json）から1日1回呼び出される想定。
//
// 経緯・設計（docs/SYSTEM_DESIGN.md 10章 2026-07-21・2026-07-27決定）：
// ・contracts.input_data肥大化対策として、対象をinput_data.csvMetaのみに限定（staff・fieldsは
//   対象外）。更新機能（executeBulkApply等）はinput_data.fieldsしか参照せずcsvMetaは無関係、
//   帳票PDFプレビューもcontracts.drive_file_id経由でGoogle Drive上の実PDFを返す実装のため
//   input_dataが無くても影響しないことをどちらも確認済み。
// ・伊藤さんの提案により「csvMetaを削除する前に必ずGoogle Driveへバックアップしておく」方式を
//   採用済み（署名・確認完了時にlib/googleDrive.tsのuploadJsonBackup()で自動保存し、
//   contracts.csvmeta_backup_file_idに記録）。このcronはバックアップが存在するもの
//   （csvmeta_backup_file_id IS NOT NULL）だけを削除対象にする（DB関数cleanup_old_csvmeta内で
//   条件を保証）。バックアップが無い古い署名済みデータは対象外のまま残る。
// ・保持期間は2年（signed_atから起算）で確定。
// ・削除本体はDB関数cleanup_old_csvmeta（migration: add_cleanup_old_csvmeta_function）が
//   1回のUPDATE文で行う。アプリのコード変更・Vercelデプロイなしで運用できるという当初設計の
//   意図を踏まえ、このAPIルート自体はDB関数の呼び出しと結果集計のみを行う薄い層とする。
// ・renewal-notify・withdrawn-cleanupと同じCRON_SECRET認証を流用（Vercel Cronからのみ実行可）。
//
// 2026-08-19（改善提案#10・#14対応）：mail_logs・cron_runsという2つの新しいログテーブルが
// 増えたことに伴い、日次で動く本cronに「1年以上前のログ行を削除する」処理を相乗りさせた。
// 新しい専用cronを追加すると本番運用中のcron本数・Vercel設定が増えるため、既に日次で
// 動いている本cron（元々csvMetaという別種のデータの定期削除を担っている）へ追加する形にした
// （伊藤さんとの合意・2026-08-19）。ファイル名・コメントの「csvmeta-cleanup」という名前は
// 変更しない（vercel.json・過去ログとの一貫性を優先）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqualStrings } from '@/lib/timingSafeEqual'
import { logCronRun } from '@/lib/cronRunLogger'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_YEARS = 2
const LOG_RETENTION_YEARS = 1
const CRON_NAME = 'csvmeta-cleanup'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (!cronSecret || !timingSafeEqualStrings(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // #14対応（2026-08-19）：この時点から「実行された1回」としてcron_runsに記録する。
  const cronStartedAt = new Date()

  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS)

  const { data, error } = await supabaseAdmin.rpc('cleanup_old_csvmeta', {
    cutoff_at: cutoff.toISOString(),
  })

  if (error) {
    await logCronRun(supabaseAdmin, { cronName: CRON_NAME, status: 'error', errorMessage: error.message, startedAt: cronStartedAt })
    return NextResponse.json({ error: 'csvMetaの削除に失敗しました: ' + error.message }, { status: 500 })
  }

  // mail_logs・cron_runsの1年保持（#10・#14対応）。どちらも削除に失敗しても、
  // csvMeta本体の削除は既に成功しているため、cron全体としては引き続きerror扱いにはしない
  // （ログの掃除漏れがcsvMeta削除という主目的の成否を左右しないようにするため）。
  const logCutoffIso = new Date(Date.now() - LOG_RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000).toISOString()
  let mailLogsDeleted = 0
  let cronRunsDeleted = 0
  let logCleanupError: string | null = null
  try {
    const { data: deletedMailLogs, error: mailLogsError } = await supabaseAdmin
      .from('mail_logs').delete().lt('sent_at', logCutoffIso).select('id')
    if (mailLogsError) throw mailLogsError
    mailLogsDeleted = (deletedMailLogs || []).length

    const { data: deletedCronRuns, error: cronRunsError } = await supabaseAdmin
      .from('cron_runs').delete().lt('finished_at', logCutoffIso).select('id')
    if (cronRunsError) throw cronRunsError
    cronRunsDeleted = (deletedCronRuns || []).length
  } catch (e: any) {
    logCleanupError = e?.message || String(e)
    console.error('mail_logs/cron_runsの保持期間削除エラー:', logCleanupError)
  }

  await logCronRun(supabaseAdmin, {
    cronName: CRON_NAME,
    status: 'success',
    summary: { deletedCsvMetaCount: (data || []).length, mailLogsDeleted, cronRunsDeleted, logCleanupError },
    startedAt: cronStartedAt,
  })

  return NextResponse.json({ deletedCount: (data || []).length, mailLogsDeleted, cronRunsDeleted })
}
