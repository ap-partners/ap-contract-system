// ===== 従業員向けFAQ：質問送信API =====
// 改善提案30件・グループA④対応（2026-08-19）：外部総合品質監査レポート12章29番
// 「困ったときは」への導線を全画面のフッターに常設。従業員（Supabase Authのセッションを
// 持たない独自セッション方式）から寄せられた質問を、社内向けチャットボットと同じ
// faq_inquiriesテーブルへ保存する。管理部の「FAQ管理」タブ（FaqManagementTab.tsx）に
// そのまま並んで表示され、回答すると従業員が入力した連絡先へ回答メールが送られる
// （lib/mail.ts sendFaqAnswerMail・app/api/faq/notify-answer/route.tsは無変更で流用できる）。
//
// submitted_byはSupabase Authユーザーのuuidを想定した列だが、従業員はauth.uid()を
// 持たないため、事前のマイグレーション（2026-08-19）でNOT NULL制約を解除済み。
// 従業員からの質問はsubmitted_by=null・submitted_by_role='従業員'で保存する。
//
// ログイン前の画面（/staff/login・/sign/[id]の本人確認前）からも呼ばれる、認証を要求
// できないエンドポイントのため、スパム送信対策としてIP単位のレート制限を掛ける
// （lib/rateLimit.ts。B-05のログイン系APIと同じ設計）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/getClientIp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const QUESTION_MAX_LENGTH = 1000
const CONTACT_MAX_LENGTH = 200

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const withinLimit = await checkRateLimit(supabaseAdmin, `staff-faq-submit:${ip}`, 10, 300)
  if (!withinLimit) {
    return NextResponse.json({ error: 'しばらく時間をおいてから、もう一度お試しください。' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }

  const questionText = String(body.questionText || '').trim()
  const contact = String(body.contact || '').trim()

  if (!questionText) {
    return NextResponse.json({ error: '質問内容を入力してください。' }, { status: 400 })
  }
  if (questionText.length > QUESTION_MAX_LENGTH) {
    return NextResponse.json({ error: `質問内容は${QUESTION_MAX_LENGTH}文字以内で入力してください。` }, { status: 400 })
  }
  if (contact.length > CONTACT_MAX_LENGTH) {
    return NextResponse.json({ error: '連絡先は200文字以内で入力してください。' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('faq_inquiries').insert([{
    question_text: questionText,
    submitted_by: null,
    submitted_by_email: contact || null,
    submitted_by_role: '従業員',
  }])

  if (error) {
    return NextResponse.json({ error: '質問の送信に失敗しました。お手数ですが、もう一度お試しください。' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
