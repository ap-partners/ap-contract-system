// ===== メール送信処理 =====
// Gmail（agency@appart.co.jp）のSMTP＋アプリパスワードを使って送信する（2026-07-08決定）。
// 7-4章のルール通り、本文には契約内容・給与・就業先等の個人情報を含めない（件名＋システムURLのみ）。
// ただし宛名の氏名（「〇〇様」）のみ、2026-07-16に伊藤さんの判断で例外的に許可（詳細は
// sendSignRequestMail関数内のコメント・docs/SYSTEM_DESIGN.md 10章2026-07-16参照）。
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
// 2026-07-16修正（UIUX総合レビュー対応・伊藤さん承認済み）：
//  ①件名の「（認証コード在中）」はフィッシングメールを連想させる表現のため削除
//    （コード自体は引き続き本文に記載）。
//  ②書類種別（雇用契約書／就業条件明示書等）を件名・本文に追加。氏名・給与・就業先等の
//    個人情報は引き続き一切含めないため、7-4章のルールには抵触しない。
//  ③HTML版を追加（ボタン・認証コードを大きく目立たせる、他社の実例を伊藤さんと確認の上で
//    採用したデザイン）。ただし環境・メールアプリによりHTMLが正しく表示されない場合に備え、
//    従来通りの文字だけの版（text）も同じメールに必ず同封し、HTML非対応の環境では自動的に
//    そちらが表示されるようにする（multipart/alternative。nodemailerのtext+html指定で対応）。
//    見た目の崩れを防ぐため、表（テーブル）レイアウト＋インラインスタイルのみを使い、
//    画像・外部フォント・flexbox等の新しいCSSは使用しない。
export async function sendSignRequestMail(
  toEmail: string,
  contractId: string,
  isConfirmationOnly: boolean,
  authCode: string,
  documentType?: string | null,
  staffName?: string | null
): Promise<void> {
  const url = `${APP_URL}/sign/${contractId}`
  // 2026-07-16修正（伊藤さん決定）：本人確認前のメールに氏名を入れないという7-4章の
  // ルールを、伊藤さんの判断で今回だけ変更。「〇〇様」の宛名を入れることで、機械的な
  // 一斉送信メールに見えてしまいフィッシングと誤解されるリスクを下げ、開封率・信頼感を
  // 優先する（誤送信時の情報漏洩リスクは、氏名以外に既に会社名・書類種別・認証コードが
  // 含まれているため、氏名を加える増分は小さいと判断）。
  const greetingHtml = staffName ? `<tr><td style="padding:32px 32px 0 32px;font-family:sans-serif;font-size:14px;color:#1A2340;font-weight:bold;">${staffName}　様</td></tr>` : ''
  // document_type には改行込みの「雇用契約書 兼\n就業条件明示書」（パターンC）が
  // 入ることがあるため、メール表示用に改行をスペースへ変換する。
  const docTypeLabel = (documentType || '').replace(/\n/g, ' ').trim()
  const docTypePrefix = docTypeLabel ? `【${docTypeLabel}】` : ''
  const subject = isConfirmationOnly
    ? `【APパートナーズ】${docTypePrefix}書類のご確認をお願いします`
    : `【APパートナーズ】${docTypePrefix}契約書のご署名をお願いします`
  const actionLabel = isConfirmationOnly ? 'ご確認' : 'ご署名'
  const docTypeLine = docTypeLabel ? `対象書類：${docTypeLabel}\n` : ''
  // 2026-07-16修正（伊藤さんレビュー対応）：ボタン文言を「書類をご署名する」から
  // 「書類に署名する」へ変更（丁寧語の重ね過ぎを避けたシンプルな表現に統一）。
  // 確認のみ（パターンB）の場合も同じ考え方で「書類を確認する」に統一。
  const buttonLabel = isConfirmationOnly ? '書類を確認する' : '書類に署名する'

  const text = [
    staffName ? `${staffName}　様` : '',
    'お疲れ様です。APパートナーズです。',
    '',
    `書類の${actionLabel}をお願いいたします。`,
    docTypeLine,
    '①下記URLを開いてください',
    url,
    '',
    '②画面で「社員番号（6桁の数字）」と、下記の「認証コード」を入力してください',
    `　認証コード（6桁）：${authCode}`,
    '',
    '※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。',
    '※認証コードの有効期限は2日間です。期限が切れた場合は、画面の「認証コードを再発行する」からいつでも新しいコードを再送できます。',
    '※操作方法についてご不明な点があれば、担当営業までご連絡ください。',
    '',
    'このメールに心当たりがない場合は、お手数ですが破棄してください。',
  ].filter(Boolean).join('\n')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      ${greetingHtml}
      <tr><td style="padding:${staffName ? '8px' : '32px'} 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。APパートナーズです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;">
        書類の${actionLabel}をお願いいたします。
      </td></tr>
      ${docTypeLabel ? `<tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#5A6A8A;">対象書類：${docTypeLabel}</td></tr>` : ''}
      <tr><td align="center" style="padding:24px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              ${buttonLabel}
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;font-family:sans-serif;font-size:12px;color:#5A6A8A;" align="center">
        ボタンが表示されない場合は <a href="${url}" style="color:#1B3A8C;">こちらのリンク</a> を開いてください
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">
        画面を開いたら「社員番号（6桁の数字）」と、下記の「認証コード」を入力してください。
      </td></tr>
      <tr><td align="center" style="padding:12px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center" bgcolor="#FFFFFF" style="border-radius:6px;padding:14px 0;font-family:sans-serif;font-size:26px;font-weight:bold;letter-spacing:4px;color:#1B3A8C;">
            ${authCode}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#5A6A8A;line-height:1.7;">
        ※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。<br>
        ※認証コードの有効期限は2日間です。期限が切れた場合は、画面の「認証コードを再発行する」からいつでも新しいコードを再送できます。<br>
        ※操作方法についてご不明な点があれば、担当営業までご連絡ください。
      </td></tr>
      <tr><td style="padding:20px 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        このメールに心当たりがない場合は、お手数ですが破棄してください。
      </td></tr>
    </table>
  </td></tr>
</table>`.trim()

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text,
    html,
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
  overrideNotice?: string,
  isUnassignedFallback?: boolean
): Promise<void> {
  if (toEmails.length === 0) return

  const todayLabel = new Date().toLocaleDateString('ja-JP')
  const sorted = [...items].sort((a, b) => (a.remainingDays ?? 9999) - (b.remainingDays ?? 9999))
  const overdueCount = items.filter(i => (i.remainingDays ?? 0) < 0).length
  const upcomingCount = items.length - overdueCount

  // 件名：中身が全て「期限超過」なのに「更新期限が近い」という件名では緊急度が伝わらない、
  // という指摘を踏まえ、超過案件が1件でもあれば件名自体で分かるようにする（2026-07-15修正）。
  // 総合レビュー指摘N対応（2026-07-16）：部門未設定・担当営業アカウント未登録等で本来の
  // 宛先（担当営業）が特定できない案件は、管理部宛にフォールバック送信する。件名で
  // フォールバックだと分かるようにし、埋もれて放置されるのを防ぐ。
  const fallbackPrefix = isUnassignedFallback ? '【担当者未設定】' : ''
  const subject = overdueCount > 0
    ? `${fallbackPrefix}【更新期限管理・要対応】${deptName} 期限超過${overdueCount}件を含む契約があります（${todayLabel}）`
    : `${fallbackPrefix}【更新期限管理】${deptName} 更新期限が近い契約のお知らせ（${todayLabel}）`

  // 2026-07-16修正（伊藤さんレビュー対応）：対象は社内向け業務メールで、スタッフ本人ではなく
  // 担当営業・SSC・管理部が読むため、一覧内の氏名には「様」を付けない（社外向けの署名依頼メール
  // とは性質が異なるため区別。docs/SYSTEM_DESIGN.md 10章2026-07-16参照）。
  const lines: string[] = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
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
    lines.push(`・${item.staffName || '(氏名未登録)'}（${item.workLocationName || '就業先不明'}）`)
    lines.push(`　${daysLabel}／${endDateLabel}`)
  }
  lines.push(
    '',
    '期限超過の契約は特に優先してご確認ください。',
    '更新期限管理タブから対応をお願いします。',
    '',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    `SSCの方はこちら：${APP_URL}/dashboard/ssc`,
    `管理部の方はこちら：${APP_URL}/dashboard/admin`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。ご不明点は管理部までご連絡ください。',
  )
  if (isUnassignedFallback) {
    lines.push(
      '',
      '※この部門は担当営業アカウントが特定できなかったため、本来の宛先の代わりに管理部宛に送信しています。'
      + '対象スタッフの部門設定・担当営業アカウントの登録をご確認ください。'
    )
  }
  if (overrideNotice) {
    lines.push('', overrideNotice)
  }

  // 2026-07-16追加（伊藤さんレビュー対応）：対象が複数件あると文字だけの一覧は見づらいという
  // 指摘を受け、署名依頼メール（sendSignRequestMail）と同じtext+html multipart方式でHTML版を
  // 追加した。氏名を紺太字、期限超過を赤太字、期限内（残り）を緑太字にして視認性を上げ、
  // 1件ごとに罫線で区切る。HTML非対応の環境では上のtext版が自動的に表示される。
  const itemsHtml = sorted.map((item, idx) => {
    const days = item.remainingDays
    const daysLabel = days === null ? '(残日数不明)' : days < 0 ? `期限超過${Math.abs(days)}日` : `残り${days}日`
    const daysColor = days !== null && days < 0 ? '#C0392B' : '#1F7A45'
    const endDateLabel = formatEndDateLabel(item.employEndDate, item.dispatchEndDate)
    const borderStyle = idx === sorted.length - 1 ? '' : 'border-bottom:1px solid #F0F2F7;'
    return `<tr><td style="padding:14px 32px;${borderStyle}">
        <p style="margin:0 0 4px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#1B3A8C;">${item.staffName || '(氏名未登録)'}（${item.workLocationName || '就業先不明'}）</p>
        <p style="margin:0;font-family:sans-serif;font-size:13px;"><span style="color:${daysColor};font-weight:bold;">${daysLabel}</span><span style="color:#8A94AA;"> ／ ${endDateLabel}</span></p>
      </td></tr>`
  }).join('')

  const fallbackNoticeHtml = isUnassignedFallback
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">※この部門は担当営業アカウントが特定できなかったため、本来の宛先の代わりに管理部宛に送信しています。対象スタッフの部門設定・担当営業アカウントの登録をご確認ください。</td></tr>`
    : ''
  const overrideNoticeHtml = overrideNotice
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;white-space:pre-line;">${overrideNotice}</td></tr>`
    : ''

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:560px;width:100%;">
      <tr><td style="padding:32px 32px 4px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:20px 32px 4px 32px;font-family:sans-serif;font-size:14px;font-weight:bold;color:#1A2340;">
        ${deptName}で、更新期限管理の確認・対応が必要な契約が${items.length}件あります。
      </td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#5A6A8A;">
        （${todayLabel}時点／期限超過${overdueCount}件・期限内${upcomingCount}件）
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
      ${itemsHtml}
      <tr><td style="padding:20px 32px 0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0 0 20px;"></td></tr>
      <tr><td style="padding:0 32px 4px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">
        期限超過の契約は特に優先してご確認ください。
      </td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">
        更新期限管理タブから対応をお願いします。
      </td></tr>
      <tr><td style="padding:0 32px 2px 32px;font-family:sans-serif;font-size:13px;"><a href="${APP_URL}/dashboard/sales" style="color:#1B3A8C;">担当営業の方はこちら</a></td></tr>
      <tr><td style="padding:0 32px 2px 32px;font-family:sans-serif;font-size:13px;"><a href="${APP_URL}/dashboard/ssc" style="color:#1B3A8C;">SSCの方はこちら</a></td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;"><a href="${APP_URL}/dashboard/admin" style="color:#1B3A8C;">管理部の方はこちら</a></td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。ご不明点は管理部までご連絡ください。
      </td></tr>
      ${fallbackNoticeHtml}
      ${overrideNoticeHtml}
    </table>
  </td></tr>
</table>`.trim()

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmails.join(','),
    cc: ccEmails.length > 0 ? ccEmails.join(',') : undefined,
    subject,
    text: lines.join('\n'),
    html,
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
