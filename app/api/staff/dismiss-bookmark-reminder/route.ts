// ===== マイページ：ブックマーク案内画面の「次回から表示しない」永続化 =====
// 2026-07-30新設。/staff/mypageのブックマーク案内画面で「次回から表示しない」に
// チェックを入れて「マイページを開く」を押したときだけ呼ばれる。チェックを入れずに
// 閉じた場合はこのAPIを呼ばず、次回ログイン時にも案内画面が表示され続ける仕様。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStaffIdFromRequest } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const staffId = await getStaffIdFromRequest(req)
  if (!staffId) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('staff')
    .update({ mypage_bookmark_reminder_dismissed: true })
    .eq('id', staffId)

  if (error) {
    return NextResponse.json({ error: '保存に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
