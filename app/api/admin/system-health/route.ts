// ===== #11対応（2026-08-19）：管理部向け「システム状況」ダッシュボードの集計API =====
// 外部総合品質監査レポート12章-11「管理部向けのシステム健全性ダッシュボード」への対応。
// ①署名待ちで7日超過の件数 ②pendingのまま14日超過の依頼 ③直近のCSV取込エラー
// ④メール送信失敗の件数（直近7日）＋⑤3本のcronの直近実行状況、をまとめて1回で返す。
// 管理部ロール限定（mail_logs・cron_runsのRLSと同じスコープに揃える）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CRON_NAMES = ['renewal-notify', 'withdrawn-cleanup', 'csvmeta-cleanup'] as const

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth || auth.role !== '管理部') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const now = Date.now()
  const sevenDaysAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgoIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [
    overdueSignRes,
    overdueRequestRes,
    csvErrorsRes,
    mailFailureCountRes,
    recentMailFailuresRes,
  ] = await Promise.all([
    supabaseAdmin.from('contracts').select('id', { count: 'exact', head: true })
      .eq('status', '署名待ち').lt('sign_requested_at', sevenDaysAgoIso),
    supabaseAdmin.from('requests').select('id', { count: 'exact', head: true })
      .or('staff_register_status.eq.pending,csv_import_status.eq.pending')
      .lt('requested_at', fourteenDaysAgoIso),
    supabaseAdmin.from('csv_imports').select('id, system_type, file_name, error_rows, uploaded_at')
      .gt('error_rows', 0).order('uploaded_at', { ascending: false }).limit(10),
    supabaseAdmin.from('mail_logs').select('id', { count: 'exact', head: true })
      .eq('success', false).gte('sent_at', sevenDaysAgoIso),
    supabaseAdmin.from('mail_logs').select('id, mail_type, to_emails, error_message, sent_at')
      .eq('success', false).order('sent_at', { ascending: false }).limit(10),
  ])

  const firstError = overdueSignRes.error || overdueRequestRes.error || csvErrorsRes.error || mailFailureCountRes.error || recentMailFailuresRes.error
  if (firstError) {
    return NextResponse.json({ error: 'データ取得に失敗しました: ' + firstError.message }, { status: 500 })
  }

  const cronStatuses = await Promise.all(CRON_NAMES.map(async (cronName) => {
    const { data } = await supabaseAdmin
      .from('cron_runs')
      .select('status, finished_at, error_message, summary')
      .eq('cron_name', cronName)
      .order('finished_at', { ascending: false })
      .limit(1)
    return { cronName, lastRun: (data && data[0]) || null }
  }))

  return NextResponse.json({
    overdueSignCount: overdueSignRes.count ?? 0,
    overdueRequestCount: overdueRequestRes.count ?? 0,
    recentCsvErrors: csvErrorsRes.data ?? [],
    mailFailureCount: mailFailureCountRes.count ?? 0,
    recentMailFailures: recentMailFailuresRes.data ?? [],
    cronStatuses,
  })
}
