// ===== メール送信処理 =====
// Gmail（agency@appart.co.jp）のSMTP＋アプリパスワードを使って送信する（2026-07-08決定）。
// 7-4章のルール通り、本文には個人情報・契約内容・氏名を一切含めない（件名＋システムURLのみ）。
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ap-contract-system.vercel.app'

// 署名依頼／確認依頼メールを送信する。
// isConfirmationOnly=true の場合はパターンB（就業条件明示書のみ）用の文言になる。
export async function sendSignRequestMail(
  toEmail: string,
  contractId: string,
  isConfirmationOnly: boolean
): Promise<void> {
  const url = `${APP_URL}/sign/${contractId}`
  const subject = isConfirmationOnly ? '【APパートナーズ】書類確認のお願い' : '【APパートナーズ】契約書署名のお願い'
  const actionLabel = isConfirmationOnly ? '内容のご確認' : 'ご署名'

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: [
      `以下のURLより、書類の${actionLabel}をお願いいたします。`,
      '',
      url,
      '',
      'このメールに心当たりがない場合は、お手数ですが破棄してください。',
    ].join('\n'),
  })
}
