// ===== FAQチャットボット：質問への回答メール送信API（2026-07-29新設） =====
// 管理部ダッシュボード「FAQ管理」タブから、質問に回答した直後に呼ばれる。
// 質問した本人（faq_inquiries.submitted_by_email）へ、質問文・回答文をそのまま記載したメールを送る。
// 認可：notify-sign-request・contract-monitoring/notifyと同じ考え方で、管理部ロールの
// ログイン済みユーザーのみ呼び出せる（getAuthenticatedStaff方式。最初からAuthorizationヘッダー
// 必須で実装する）。
import { NextRequest, NextResponse } from 'next/server'
import { sendFaqAnswerMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || staffAuth.role !== '管理部') {
    return NextResponse.json({ error: '管理部ロールでのログインが必要です。' }, { status: 401 })
  }

  const body = await req.json()
  const { toEmail, questionText, answerText } = body as {
    toEmail: string | null
    questionText: string
    answerText: string
  }

  if (!toEmail) {
    // 質問者のメールアドレスが取得できないケース（想定上は稀）。エラーにはせず、
    // 呼び出し元（FaqManagementTab）で「メール送信は省略されました」と分かるようにする。
    return NextResponse.json({ sent: false, reason: 'no_email' })
  }
  if (!questionText || !answerText) {
    return NextResponse.json({ error: '必要な情報が不足しています。' }, { status: 400 })
  }

  try {
    await sendFaqAnswerMail(toEmail, questionText, answerText)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました: ' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
