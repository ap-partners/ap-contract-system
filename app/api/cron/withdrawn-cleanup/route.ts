// ===== 取り下げ済み申請の自動削除（2026-07-27新設） =====
// Vercel Cron（vercel.json）から1日1回呼び出される想定。
//
// 仕様（2026-07-27 伊藤さん決定）：
// ・対象＝contracts・pledgesのうち status='取り下げ' かつ withdrawn_at が30日以上前のもの
// ・手動削除ボタン（ダッシュボードの「取り下げ」タブ）と同じ「取り下げ済みのみ削除可」の
//   RLSポリシーの範囲内で動く想定だが、本cronはservice roleで実行するためRLSの対象外。
//   誤って他ステータスの行を消さないよう、DELETE文自体にstatus='取り下げ'条件を必ず含める。
// ・renewal-notifyと同じCRON_SECRET認証を流用（Vercel Cronからのみ実行可）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_DAYS = 30

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: deletedContracts, error: contractsError } = await supabaseAdmin
    .from('contracts')
    .delete()
    .eq('status', '取り下げ')
    .lt('withdrawn_at', cutoffIso)
    .select('id')

  if (contractsError) {
    return NextResponse.json({ error: '契約書の削除に失敗しました: ' + contractsError.message }, { status: 500 })
  }

  const { data: deletedPledges, error: pledgesError } = await supabaseAdmin
    .from('pledges')
    .delete()
    .eq('status', '取り下げ')
    .lt('withdrawn_at', cutoffIso)
    .select('id')

  if (pledgesError) {
    return NextResponse.json({ error: 'アルバイト誓約書の削除に失敗しました: ' + pledgesError.message }, { status: 500 })
  }

  return NextResponse.json({
    deletedContracts: (deletedContracts || []).length,
    deletedPledges: (deletedPledges || []).length,
  })
}
