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
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_YEARS = 2

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS)

  const { data, error } = await supabaseAdmin.rpc('cleanup_old_csvmeta', {
    cutoff_at: cutoff.toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: 'csvMetaの削除に失敗しました: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ deletedCount: (data || []).length })
}
