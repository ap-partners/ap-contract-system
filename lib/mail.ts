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
// 2026-07-13追加：本人確認方式を「社員番号＋生年月日」から「社員番号＋6桁認証コード」へ
// 変更したことに伴い、確認用リンクと同じメールにコード（authCode）も記載する
// （docs/SYSTEM_DESIGN.md 10章 2026-07-13決定。1通のメールで完結させる方式）。
// コードは数字6桁のみで氏名・契約内容等の個人情報は含まないため、上記の
// 「本文に個人情報を含めない」ルールには抵触しない。
// 2026-07-13追加：プロのUXライター/CRM観点でのレビューを踏まえて件名・本文を改善
// （docs/SYSTEM_DESIGN.md 10章 2026-07-13参照）。件名には「認証コード在中」を明記し
// 本文を読み飛ばされるリスクを下げる一方、期限（2日間）はコードの有効期限であって
// 対応そのものの締切ではない（再発行可能）ため、件名では触れず本文で正確に説明する。
export async function sendSignRequestMail(
  toEmail: string,
  contractId: string,
  isConfirmationOnly: boolean,
  authCode: string
): Promise<void> {
  const url = `${APP_URL}/sign/${contractId}`
  const subject = isConfirmationOnly
    ? '【APパートナーズ】書類のご確認をお願いします（認証コード在中）'
    : '【APパートナーズ】契約書のご署名をお願いします（認証コード在中）'
  const actionLabel = isConfirmationOnly ? 'ご確認' : 'ご署名'

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: [
      'お疲れ様です。APパートナーズです。',
      '',
      `書類の${actionLabel}をお願いいたします。`,
      '',
      '①下記URLを開いてください',
      url,
      '',
      '②画面で「社員番号」と「認証コード」を入力してください',
      `　認証コード（6桁）：${authCode}`,
      '',
      '※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。',
      '※コードの有効期限は2日間です。切れた場合は、画面の「認証コードを再発行する」からいつでも再送できます。',
      '※操作方法についてご不明な点があれば、担当営業までご連絡ください。',
      '',
      'このメールに心当たりがない場合は、お手数ですが破棄してください。',
    ].join('\n'),
  })
}

// ===== 更新期限管理：残日数しきい値通知（フェーズ2） =====
// 2026-07-15追加。部門ごとに1日1通のダイジェスト形式（伊藤さん決定）。
// 宛先はTO=担当営業（自部門）、CC=SSC・管理部（伊藤さん決定）。
// 社内向けメールのため、署名依頼メール（lib/mail.ts上部）と異なり氏名・就業先名を本文に含めてよい。
export type RenewalDigestItem = {
  staffName: string | null
  workLocationName: string | null
  remainingDays: number | null
  employEndDate: string | null
  dispatchEndDate: string | null
}

// 残日数は雇用期間終了日を優先し、無ければ派遣期間終了日を基準に計算している
// （useRenewalCandidates.tsのremainingDays()と同じ考え方）。メール本文でも実際に基準にした
// 日付が分かるよう、ダッシュボード（RenewalManagementTab.tsx）と同じ「同一／雇／派」の考え方に揃える。
// ただしダッシュボードは省スペースUIのため「雇◯◯ / 派◯◯」と省略表記だが、メールは
// スペース制約が無いため「雇用期間終了日」「派遣期間終了日」と正式名称で書く
// （2026-07-15：業務改善責任者/PdM/UI-UXレビューを踏まえた修正。省略形は初見で誤読しやすいため）。
function formatEndDateLabel(employEndDate: string | null, dispatchEndDate: string | null): string {
  if (employEndDate && dispatchEndDate && employEndDate === dispatchEndDate) return `雇用・派遣期間終了日：${employEndDate}`
  if (employEndDate && dispatchEndDate) return `雇用期間終了日：${employEndDate} / 派遣期間終了日：${dispatchEndDate}`
  if (employEndDate) return `雇用期間終了日：${employEndDate}`
  if (dispatchEndDate) return `派遣期間終了日：${dispatchEndDate}`
  return '終了日：不明'
}

export async function sendRenewalDigestMail(
  toEmails: string[],
  ccEmails: string[],
  deptName: string,
  items: RenewalDigestItem[],
  overrideNotice?: string
): Promise<void> {
  if (toEmails.length === 0) return

  const todayLabel = new Date().toLocaleDateString('ja-JP')
  const sorted = [...items].sort((a, b) => (a.remainingDays ?? 9999) - (b.remainingDays ?? 9999))
  const overdueCount = items.filter(i => (i.remainingDays ?? 0) < 0).length
  const upcomingCount = items.length - overdueCount

  // 件名：中身が全て「期限超過」なのに「更新期限が近い」という件名では緊急度が伝わらない、
  // という指摘を踏まえ、超過案件が1件でもあれば件名自体で分かるようにする（2026-07-15修正）。
  const subject = overdueCount > 0
    ? `【更新期限管理・要対応】${deptName} 期限超過${overdueCount}件を含む契約があります（${todayLabel}）`
    : `【更新期限管理】${deptName} 更新期限が近い契約のお知らせ（${todayLabel}）`

  const lines: string[] = [
    'お疲れ様です。APパートナーズです。',
    '',
    `${deptName}で、更新期限管理の確認・対応が必要な契約が${items.length}件あります（${todayLabel}時点／期限超過${overdueCount}件・期限内${upcomingCount}件）。`,
    '',
  ]
  for (const item of sorted) {
    const days = item.remainingDays
    const daysLabel = days === null ? '(残日数不明)' : days < 0 ? `期限超過${Math.abs(days)}日` : `残り${days}日`
    const endDateLabel = formatEndDateLabel(item.employEndDate, item.dispatchEndDate)
    // 氏名・就業先名が長いケース（外国籍スタッフ等）でも読みやすいよう、1件を2行に分ける
    // （2026-07-15修正：1行に詰め込むと長い名前で読みにくいという指摘への対応）。
    lines.push(`・${item.staffName || '(氏名未登録)'}様（${item.workLocationName || '就業先不明'}）`)
    lines.push(`　${daysLabel}／${endDateLabel}`)
  }
  lines.push(
    '',
    '期限超過の契約は特に優先してご確認ください。',
    '更新期限管理タブから、スタッフ・クライアントへの意向確認と「送付準備完了」の操作をお願いします。',
    '',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    `SSCの方はこちら：${APP_URL}/dashboard/ssc`,
    `管理部の方はこちら：${APP_URL}/dashboard/admin`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。ご不明点は管理部までご連絡ください。',
  )
  if (overrideNotice) {
    lines.push('', overrideNotice)
  }

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmails.join(','),
    cc: ccEmails.length > 0 ? ccEmails.join(',') : undefined,
    subject,
    text: lines.join('\n'),
  })
}

// ===== CSVインポート自動化：依頼の自動マッチ完了通知（2026-07-15追加） =====
// 担当営業が「CSVインポート依頼」を出した後、管理部が新しいCSVを取り込んだ結果
// 自動マッチが成立し依頼が自動完了した際、依頼元の担当営業へ通知する。社内向けメールのため
// 氏名・就業先名を本文に含めてよい（署名依頼メールと異なるルール。renewal digestと同様）。
export async function sendCsvImportMatchedMail(
  toEmail: string,
  staffName: string | null,
  workLocationName: string | null
): Promise<void> {
  const subject = `【APパートナーズ】CSVインポート依頼が完了しました（${staffName || '対象スタッフ'}様）`
  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: [
      'お疲れ様です。APパートナーズです。',
      '',
      `以前ご依頼いただいたCSVインポート依頼について、該当データが取り込まれ、自動的に完了しました。`,
      '',
      `対象スタッフ：${staffName || '(氏名不明)'}`,
      `就業先：${workLocationName || '(就業先不明)'}`,
      '',
      '申請画面（STEP2）からCSV検索を行うと、内容が反映できる状態になっています。',
      `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
      '',
      '※本メールは自動送信です。このアドレスへの返信には対応しておりません。ご不明点は管理部までご連絡ください。',
    ].join('\n'),
  })
}
