// ===== FAQチャットボット：質問への回答メール送信API（2026-07-29新設） =====
// 管理部ダッシュボード「FAQ管理」タブから、質問に回答した直後に呼ばれる。
// 質問した本人（faq_inquiries.submitted_by_email）へ、質問文・回答文をそのまま記載したメールを送る。
// 認可：notify-sign-request・contract-monitoring/notifyと同じ考え方で、管理部ロールの
// ログイン済みユーザーのみ呼び出せる（getAuthenticatedStaff方式。最初からAuthorizationヘッダー
// 必須で実装する）。
//
// 【2026-08-12修正・B-04対応】従来はtoEmail/questionText/answerTextをクライアントから
// そのまま受け取っており、管理部ロールでログインしてさえいれば任意の宛先へ任意の本文で
// メールを送信できてしまう「任意送信の踏み台」になっていた（外部総合品質監査レポート指摘）。
// inquiryId（faq_inquiries.id）のみを受け取り、宛先・本文はすべてDB上の実データ
// （FaqManagementTabが直前に更新した回答内容）から読み出す方式に変更した。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFaqAnswerMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || staffAuth.role !== '管理部') {
    return NextResponse.json({ error: '管理部ロールでのログインが必要です。' }, { status: 401 })
  }

  // 外部総合品質監査レポートM-24対応（2026-08-14）：req.json()を`.catch(() => null)`で
  // 保護し、他のAPIルートと同じ400エラーに統一する。
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const { inquiryId } = body as { inquiryId: string }

  if (!inquiryId) {
    return NextResponse.json({ error: '必要な情報が不足しています。' }, { status: 400 })
  }

  const { data: inquiry, error: fetchError } = await supabaseAdmin
    .from('faq_inquiries')
    .select('id, question_text, answer_text, status, submitted_by_email')
    .eq('id', inquiryId)
    .maybeSingle()

  if (fetchError || !inquiry) {
    return NextResponse.json({ error: '対象の質問が見つかりませんでした。' }, { status: 404 })
  }
  if (inquiry.status !== 'answered' || !inquiry.answer_text) {
    return NextResponse.json({ error: 'この質問はまだ回答済みの状態になっていません。' }, { status: 409 })
  }

  const toEmail = inquiry.submitted_by_email
  if (!toEmail) {
    // 質問者のメールアドレスが取得できないケース（想定上は稀）。エラーにはせず、
    // 呼び出し元（FaqManagementTab）で「メール送信は省略されました」と分かるようにする。
    return NextResponse.json({ sent: false, reason: 'no_email' })
  }

  try {
    await sendFaqAnswerMail(toEmail, inquiry.question_text, inquiry.answer_text)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました: ' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
