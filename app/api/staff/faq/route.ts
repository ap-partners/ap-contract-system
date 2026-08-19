// ===== 従業員向けFAQ：一覧取得API =====
// 改善提案30件・グループA④対応（2026-08-19）：外部総合品質監査レポート12章29番
// 「困ったときは」への導線を全画面のフッターに常設。特に従業員のマイページ（署名前）に
// 必要と指摘されている。
//
// 社内向けのChatbotWidget（app/dashboard/_shared/ChatbotWidget.tsx）はSupabase Auth
// （auth.uid()）のログインセッションを前提に、ブラウザから直接faq_entriesをSELECTしている。
// 従業員（/staff/login・/sign/[id]・マイページ）はSupabase Authとは別の独自セッション方式
// （社員番号＋パスワード等）で、ログイン前の画面（/staff/login・/sign/[id]の本人確認前）でも
// 「ログインできない」「認証コードが届かない」といったFAQを見られる必要があるため、
// セッションの有無を問わず内容を返す。faq_entriesには個人情報を含む列が無いため、
// 誰でも読めても安全（RLSの変更は行わず、service role経由のAPIルートとして実装する）。
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('faq_entries')
    .select('id, major_category, major_label, minor_category, question, keywords, answer, related_labels, escalation_note, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'FAQの読み込みに失敗しました。' }, { status: 500 })
  }
  return NextResponse.json({ entries: data || [] })
}
