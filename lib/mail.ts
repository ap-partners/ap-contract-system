// ===== メール送信処理 =====
// Gmail（agency@appart.co.jp）のSMTP＋アプリパスワードを使って送信する（2026-07-08決定）。
// 7-4章のルール通り、本文には契約内容・給与・就業先等の個人情報を含めない（件名＋システムURLのみ）。
// ただし宛名の氏名（「〇〇様」）のみ、2026-07-16に伊藤さんの判断で例外的に許可（詳細は
// sendSignRequestMail関数内のコメント・docs/SYSTEM_DESIGN.md 10章2026-07-16参照）。
import nodemailer from 'nodemailer'

// 2026-07-23：デフォルトのquoted-printableエンコーディングだと、本文中の "=" が
// 行折り返し位置と衝突した場合にHTML内のリンクURLが破損する不具合が判明
// （マイページ認証コードメールのリンクに "?emp=105611" を追加した際に発覚。
// プレーンテキスト版は無事だったがHTML版のボタンリンクの "=" が消失していた）。
// textEncodingをbase64に固定し、この種の破損を全メール送信で根本的に防ぐ。
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
}, {
  textEncoding: 'base64',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ap-contract-system.vercel.app'

// 2026-07-31追加：日付（'YYYY-MM-DD'）を「YYYY年MM月DD日」表記に変換する共通ヘルパー。
// 従来sendCsvModifiedNotifyMail内にのみ同じロジックがローカルで存在していたが、
// 依頼系メール（新規・完了・取消）でも同じ表記を使うため共通化した。
function formatJaDate(dateStr: string | null): string {
  if (!dateStr) return '（未入力）'
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return dateStr
  return `${m[1]}年${m[2]}月${m[3]}日`
}

// 2026-07-31追加：依頼（スタッフマスタ登録・CSVインポート）メール3種
// （新規依頼・完了・取消）で共通して使う項目一式。伊藤さんの指摘（項目の網羅・
// 申請者の所属部署名/氏名を全メール必須化）を受け、フォームの入力項目と1対1で
// 対応させる形に統一した。
export type RequestMailInfo = {
  requestType: 'staff_register' | 'csv_import'
  staffName: string | null
  staffCode: string | null
  staffDept: string | null
  staffHireDate: string | null // 'YYYY-MM-DD'（staff_register時のみ意味を持つ）
  clientName: string | null // 就業場所名（CSVインポート関連時のみ）
  systemType: string | null // 使用システム（CSVインポート関連時のみ）
  dispatchStartDate: string | null // 派遣開始日（CSVインポート関連時のみ）
  csvAlsoRequested: boolean // staff_register時、CSVインポートも同時に依頼されたか
  requestedByName: string | null
  requestedByDept: string | null
}

// 依頼内容ブロック（対象スタッフ・依頼種別ごとの項目）をtext/html共通のデータとして組み立てる。
// text版は「ラベル：値」を1行に、html版は同じ内容を<br>区切りの箱に入れる。
function buildRequestDetailLines(info: RequestMailInfo): string[] {
  if (info.requestType === 'staff_register') {
    const lines = [
      `依頼種別：スタッフマスタ登録依頼`,
      `社員番号：${info.staffCode || '（未入力）'}`,
      `スタッフ氏名：${info.staffName || '（未入力）'}`,
      `部門名：${info.staffDept || '（未入力）'}`,
      `入社日：${formatJaDate(info.staffHireDate)}`,
    ]
    if (info.csvAlsoRequested) {
      lines.push(
        '',
        '【CSVインポートも同時に依頼されています】',
        `使用システム：${info.systemType || '（未入力）'}`,
        `派遣開始日：${formatJaDate(info.dispatchStartDate)}`,
        `就業場所名：${info.clientName || '（未入力）'}`,
      )
    }
    return lines
  }
  return [
    `依頼種別：CSVインポート依頼`,
    `社員番号：${info.staffCode || '（未入力）'}`,
    `スタッフ氏名：${info.staffName || '（未入力）'}`,
    `所属部門：${info.staffDept || '（未入力）'}`,
    `使用システム：${info.systemType || '（未入力）'}`,
    `派遣開始日：${formatJaDate(info.dispatchStartDate)}`,
    `就業場所名：${info.clientName || '（未入力）'}`,
  ]
}

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
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
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
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
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

// ===== マイページ：初回ログイン／パスワード再設定用の認証コード送信 =====
// 2026-07-17追加。従来のsendSignRequestMail（契約1件ごとの署名依頼メール）とは別に、
// マイページ導入に伴い「従業員単位」で送る認証コードメール。
//  ・purpose='initial'：初めてマイページに入る従業員（is_initial_login=true）向け。
//    SSC承認等で書類が署名待ちになったタイミングで送る「書類到着＋初回ログイン案内」を兼ねる。
//  ・purpose='reset'：パスワードを忘れた場合の再設定用。従業員がマイページのログイン画面から
//    自分で申請した時に送る。
// 実装当初、既存のsendSignRequestMailを流用しパターンBを増やす案も検討したが、対象読者
// （契約1件の署名依頼／マイページ全体のログイン案内）が異なり無理に共通化すると条件分岐が
// 複雑になるため、別関数として新設した（2026-07-17決定）。
export async function sendStaffLoginCodeMail(
  toEmail: string,
  employeeNumber: string,
  authCode: string,
  staffName: string | null,
  purpose: 'initial' | 'reset',
  pendingDocumentLabel?: string | null
): Promise<void> {
  // 2026-07-23：メールのリンクから「認証コードを送信する」ボタンを経由せず直接コード入力画面へ
  // 遷移できるよう、社員番号をクエリパラメータで渡す（案1・伊藤さん承認）。承認直後にすぐ
  // アクセスした従業員が、既にコード発行済みなのに「送信する」ボタンでの新規発行を要求してしまい、
  // 再発行クールダウン（3分）に引っかかって詰まっていた問題への対応。認証コード自体は別途必須
  // なため、社員番号だけがURLに含まれてもログインは完了しない。
  const url = `${APP_URL}/staff/login?emp=${encodeURIComponent(employeeNumber)}`
  const greetingHtml = staffName ? `<tr><td style="padding:32px 32px 0 32px;font-family:sans-serif;font-size:14px;color:#1A2340;font-weight:bold;">${staffName}　様</td></tr>` : ''

  const subject = purpose === 'initial'
    ? '【APパートナーズ】マイページのご利用開始について'
    : '【APパートナーズ】パスワード再設定のご案内'

  const introLine = purpose === 'initial'
    ? (pendingDocumentLabel ? `確認・署名が必要な書類（${pendingDocumentLabel}）が届いています。マイページからご確認ください。` : '確認・署名が必要な書類が届いています。マイページからご確認ください。')
    : 'パスワード再設定のお手続きです。'

  const text = [
    staffName ? `${staffName}　様` : '',
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    introLine,
    '',
    '①下記URLからマイページを開いてください',
    url,
    '',
    `②「社員番号」に ${employeeNumber} を、「認証コード」に下記の6桁を入力してください`,
    `　認証コード（6桁）：${authCode}`,
    '',
    purpose === 'initial' ? '③続けて、次回から使うパスワードを設定してください' : '③続けて、新しいパスワードを設定してください',
    '',
    '※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。',
    '※認証コードの有効期限は2日間です。期限が切れた場合は、ログイン画面から再度お手続きください。',
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
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        ${introLine}
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 20px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              マイページを開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        社員番号「${employeeNumber}」と、下記の認証コードを入力してください。
      </td></tr>
      <tr><td align="center" style="padding:0 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center" bgcolor="#FFFFFF" style="border-radius:6px;padding:14px 0;font-family:sans-serif;font-size:26px;font-weight:bold;letter-spacing:4px;color:#1B3A8C;">
            ${authCode}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#5A6A8A;line-height:1.7;">
        ※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。<br>
        ※認証コードの有効期限は2日間です。期限が切れた場合は、ログイン画面から再度お手続きください。<br>
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

// ===== アカウント管理：担当営業／SSC／管理部アカウントの初回設定・パスワード再設定案内 =====
// 2026-07-24新設。管理部ダッシュボード「アカウント管理」機能から新規アカウントを作成した際、
// および既存アカウントのパスワード再発行が必要になった際に送る。sendStaffLoginCodeMailと
// 対象読者（マイページの従業員 vs 社内ログインアカウント）が異なるため別関数として新設。
export async function sendAccountSetupMail(
  toEmail: string,
  name: string | null,
  role: string,
  authCode: string,
  purpose: 'initial' | 'reset'
): Promise<void> {
  const url = `${APP_URL}/account-setup?email=${encodeURIComponent(toEmail)}`
  const greetingHtml = name ? `<tr><td style="padding:32px 32px 0 32px;font-family:sans-serif;font-size:14px;color:#1A2340;font-weight:bold;">${name}　様</td></tr>` : ''

  const subject = purpose === 'initial'
    ? '【APパートナーズ】契約書管理システムのアカウントが発行されました'
    : '【APパートナーズ】パスワード再設定のご案内'

  const introLine = purpose === 'initial'
    ? `契約書管理システムのアカウント（${role}）が発行されました。下記の手順でパスワードを設定してください。`
    : 'パスワード再設定のお手続きです。'

  const text = [
    name ? `${name}　様` : '',
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    introLine,
    '',
    '①下記URLを開いてください',
    url,
    '',
    `②「認証コード」に下記の6桁を入力してください`,
    `　認証コード（6桁）：${authCode}`,
    '',
    '③続けて、次回から使うパスワードを設定してください',
    '',
    '※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。',
    '※認証コードの有効期限は2日間です。期限が切れた場合は、管理部にご連絡のうえ再発行を依頼してください。',
    '',
    'このメールに心当たりがない場合は、お手数ですが破棄してください。',
  ].filter(Boolean).join('\n')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      ${greetingHtml}
      <tr><td style="padding:${name ? '8px' : '32px'} 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        ${introLine}
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 20px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              パスワードを設定する
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        下記の認証コードを入力してください。
      </td></tr>
      <tr><td align="center" style="padding:0 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center" bgcolor="#FFFFFF" style="border-radius:6px;padding:14px 0;font-family:sans-serif;font-size:26px;font-weight:bold;letter-spacing:4px;color:#1B3A8C;">
            ${authCode}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#5A6A8A;line-height:1.7;">
        ※認証コードは本人確認のためのものです。他の方に伝えないようご注意ください。<br>
        ※認証コードの有効期限は2日間です。期限が切れた場合は、管理部にご連絡のうえ再発行を依頼してください。
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

// ===== マイページ：書類到着（パスワード設定済みの従業員向け） =====
// is_initial_login=falseの従業員には認証コードを送らず、ログイン案内のみを送る。
export async function sendStaffDocumentReadyMail(
  toEmail: string,
  staffName: string | null,
  documentLabel: string
): Promise<void> {
  const url = `${APP_URL}/staff/login`
  const greetingHtml = staffName ? `<tr><td style="padding:32px 32px 0 32px;font-family:sans-serif;font-size:14px;color:#1A2340;font-weight:bold;">${staffName}　様</td></tr>` : ''
  const subject = `【APパートナーズ】確認・署名が必要な書類があります（${documentLabel}）`

  const text = [
    staffName ? `${staffName}　様` : '',
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    `確認・署名が必要な書類（${documentLabel}）が届いています。`,
    'マイページにログインしてご確認ください。',
    '',
    url,
    '',
    'このメールに心当たりがない場合は、お手数ですが破棄してください。',
  ].filter(Boolean).join('\n')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      ${greetingHtml}
      <tr><td style="padding:${staffName ? '8px' : '32px'} 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        確認・署名が必要な書類（${documentLabel}）が届いています。<br>マイページにログインしてご確認ください。
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              マイページを開く
            </a>
          </td></tr>
        </table>
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

// ===== 締結パターン「対面」「印刷」：承認後の説明対応が必要な旨を担当営業へ通知 =====
// 2026-07-29追加。伊藤さんの指摘：SSC・管理部が締結パターン「対面でその場説明」「印刷して
// 説明後にリンク送付」の契約を承認しても、これまで担当営業には何も通知されず、ダッシュボードの
// 「要説明」カードを自分で見に行かない限り気づけなかった（プル型のみ・プッシュ型の通知が無い状態）。
// このメールで、承認された瞬間に担当営業へプッシュ型の通知を追加する。
// 7-4章のルール通り、本文には対象従業員の氏名・給与・就業先等の個人情報は一切含めない
// （宛先である担当営業自身の氏名のみ、既存の他メールと同じ例外として記載する）。
// 2026-07-29修正（伊藤さんレビュー対応）：①「承認されました。」の後に段落の空行を入れて
// 読みやすくする、②対面・印刷パターンで実際に何をすればよいか（PDFの表示方法・印刷方法・
// 説明完了ボタンの場所）が分からないという指摘を受け、番号付きの手順に書き換えた。
// あわせて、契約詳細画面（app/dashboard/sales/contracts/[id]/page.tsx）に「説明完了」
// ボタンを新設したため（従来はダッシュボード一覧の「要説明」タブにしか無く、このメールの
// リンク先＝契約詳細画面では操作が完結しない導線の断絶があった）、手順③はこの画面内で
// 完結する内容に修正している（docs/SYSTEM_DESIGN.md 10章2026-07-29参照）。
export async function sendExplainNeededMail(
  toEmail: string,
  submitterName: string | null,
  contractId: string
): Promise<void> {
  const url = `${APP_URL}/dashboard/sales/contracts/${contractId}`
  const greetingHtml = submitterName ? `<tr><td style="padding:32px 32px 0 32px;font-family:sans-serif;font-size:14px;color:#1A2340;font-weight:bold;">${submitterName}　様</td></tr>` : ''
  const subject = '【APパートナーズ】承認された契約書の説明対応をお願いします'

  const text = [
    submitterName ? `${submitterName}　様` : '',
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    'あなたが申請した契約書がSSC（または管理部）により承認されました。',
    '',
    'この契約書は締結パターンで「対面でその場説明」または「印刷して説明後にリンク送付」が',
    '選ばれているため、承認だけでは従業員への確認用URLは自動送信されません。',
    '下記の手順で、従業員への説明を行ってください。',
    '',
    '①下記URLから契約詳細画面を開き、「帳票PDFプレビュー」を押してください',
    '　（帳票が新しいタブで表示されます）',
    '②画面を見せてご説明いただくか、書面で渡す場合は開いたタブでブラウザの印刷機能（Ctrl+Pなど）で印刷してご説明ください',
    '③説明が完了したら、同じ契約詳細画面の「説明完了」ボタンを押してください',
    '　（押した時点で従業員へ確認用のメールが送信されます）',
    '',
    url,
    '',
    'このメールに心当たりがない場合は、お手数ですが破棄してください。',
  ].filter(Boolean).join('\n')

  const stepsHtml = [
    { n: '①', body: '下記URLから契約詳細画面を開き、「帳票PDFプレビュー」を押してください<br><span style="color:#5A6A8A;">（帳票が新しいタブで表示されます）</span>' },
    { n: '②', body: '画面を見せてご説明いただくか、書面で渡す場合は開いたタブでブラウザの印刷機能（Ctrl+Pなど）で印刷してご説明ください' },
    { n: '③', body: '説明が完了したら、同じ契約詳細画面の「説明完了」ボタンを押してください<br><span style="color:#5A6A8A;">（押した時点で従業員へ確認用のメールが送信されます）</span>' },
  ].map((s, idx, arr) => `
    <tr><td style="padding:12px 16px;${idx === arr.length - 1 ? '' : 'border-bottom:1px solid #E3E7F0;'}">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="padding-right:10px;font-family:sans-serif;font-size:14px;font-weight:bold;color:#1B3A8C;">${s.n}</td>
        <td style="font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">${s.body}</td>
      </tr></table>
    </td></tr>`).join('')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      ${greetingHtml}
      <tr><td style="padding:${submitterName ? '8px' : '32px'} 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        あなたが申請した契約書がSSC（または管理部）により承認されました。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        この契約書は締結パターンで「対面でその場説明」または「印刷して説明後にリンク送付」が選ばれているため、承認だけでは従業員への確認用URLは自動送信されません。下記の手順で、従業員への説明を行ってください。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:8px;">
          ${stepsHtml}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              契約詳細を開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
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
  info: {
    staffName: string | null
    staffCode: string | null
    staffDept: string | null
    workLocationName: string | null
    systemType: string | null
    dispatchStartDate: string | null
    requestedByName: string | null
    requestedByDept: string | null
  },
  // 2026-07-31追加：管理部の「完了にする」ボタンによる手動完了時にもこのメールを再利用する
  // ようになったため、自動マッチ時の「自動的に完了しました」という文言のままだと事実と異なる。
  // trueの場合は「管理部により完了と確認されました」に文言を差し替える。
  isManual = false
): Promise<void> {
  const { staffName, staffCode, staffDept, workLocationName, systemType, dispatchStartDate, requestedByName, requestedByDept } = info
  const subject = `【APパートナーズ】CSVインポート依頼が完了しました（${staffName || '対象スタッフ'}様）`
  // 2026-07-31：伊藤さんの指摘（項目の網羅・改行位置の読みやすさ）を受け、対象スタッフ・
  // 依頼内容・申請者をブロックごとに分け、1文1行・句点や助詞の切れ目でのみ改行する形に見直した。
  const completedLine = isManual
    ? ['以前ご依頼いただいたCSVインポートについて、', '管理部により完了と確認されました。']
    : ['以前ご依頼いただいたCSVインポートについて、', '該当データが取り込まれ、自動的に完了しました。']
  const text = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    ...completedLine,
    '',
    '【対象スタッフ】',
    `社員番号：${staffCode || '（未入力）'}`,
    `スタッフ氏名：${staffName || '（未入力）'}`,
    `所属部門：${staffDept || '（未入力）'}`,
    '',
    '【依頼内容】',
    `使用システム：${systemType || '（未入力）'}`,
    `派遣開始日：${formatJaDate(dispatchStartDate)}`,
    `就業場所名：${workLocationName || '（未入力）'}`,
    '',
    '【申請者】',
    `${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}`,
    '',
    '申請画面（STEP2）からCSV検索を行うと、',
    '内容が反映できる状態になっています。',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。',
    'ご不明点は管理部までご連絡ください。',
  ].join('\n')

  // 2026-07-22追加：他の社内向けメール（署名依頼・更新期限ダイジェスト等）と見た目を揃えるため、
  // text専用だった本メールにもHTML版（multipart/alternative）を追加した
  // （伊藤さんとの全メール文面レビューで指摘・合意。docs/SYSTEM_DESIGN.md 10章2026-07-22参照）。
  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        ${completedLine.join('<br>')}
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">対象スタッフ</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            社員番号：${staffCode || '（未入力）'}<br>
            スタッフ氏名：${staffName || '（未入力）'}<br>
            所属部門：${staffDept || '（未入力）'}
          </td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">依頼内容</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            使用システム：${systemType || '（未入力）'}<br>
            派遣開始日：${formatJaDate(dispatchStartDate)}<br>
            就業場所名：${workLocationName || '（未入力）'}
          </td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">申請者</td></tr>
          <tr><td style="padding:0 16px 14px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;">
            ${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        申請画面（STEP2）からCSV検索を行うと、<br>内容が反映できる状態になっています。
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${APP_URL}/dashboard/sales" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              担当営業ダッシュボードを開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;line-height:1.6;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。<br>ご不明点は管理部までご連絡ください。
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

// ===== FAQチャットボット：質問への回答メール（2026-07-29追加） =====
// 管理部が「FAQ管理」タブから質問に回答した際、質問した本人（submitted_by_email）へ
// 回答内容をそのまま記載して送る。従来、回答してもfaq_entriesへ登録されるだけで質問者本人には
// 何も通知されず、自分で再度チャットボットを開いて検索し直さない限り気づけなかった問題への対応
// （伊藤さん指摘・2026-07-29）。社内向けの業務連絡メールのため、氏名を含めない代わりに
// 質問文・回答文をそのまま本文に記載する（社外秘の契約内容等は含まれないため7-4章のルールには
// 抵触しない）。
export async function sendFaqAnswerMail(
  toEmail: string,
  questionText: string,
  answerText: string
): Promise<void> {
  const subject = '【APパートナーズ】チャットボットへのご質問に回答がありました'

  const text = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    'チャットボットからお送りいただいたご質問に、管理部より回答がありました。',
    '',
    '【ご質問】',
    questionText,
    '',
    '【回答】',
    answerText,
    '',
    'この内容は今後、チャットボットの「よくある質問」からも検索できるようになります。',
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。追加のご質問がある場合は、チャットボットから改めて質問を送ってください。',
  ].join('\n')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        チャットボットからお送りいただいたご質問に、管理部より回答がありました。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">ご質問</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;white-space:pre-line;">${questionText}</td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">回答</td></tr>
          <tr><td style="padding:0 16px 14px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;white-space:pre-line;line-height:1.7;">${answerText}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        この内容は今後、チャットボットの「よくある質問」からも検索できるようになります。
      </td></tr>
      <tr><td style="padding:20px 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。追加のご質問がある場合は、チャットボットから改めて質問を送ってください。
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

export async function sendStaffRegisterMatchedMail(
  toEmail: string,
  info: {
    staffName: string | null
    staffCode: string | null
    staffDept: string | null
    staffHireDate: string | null
    requestedByName: string | null
    requestedByDept: string | null
  },
  // 2026-07-31追加：sendCsvImportMatchedMailと同じ理由（手動完了での再利用）
  isManual = false
): Promise<void> {
  const { staffName, staffCode, staffDept, staffHireDate, requestedByName, requestedByDept } = info
  const subject = `【APパートナーズ】スタッフマスタ登録依頼が完了しました（${staffName || '対象スタッフ'}様）`
  // 2026-07-31：項目網羅・改行位置の見直し（sendCsvImportMatchedMailと同様の方針）。
  const completedLine = isManual
    ? ['以前ご依頼いただいたスタッフマスタ登録について、', '管理部により完了と確認されました。']
    : ['以前ご依頼いただいたスタッフマスタ登録について、', '該当データが取り込まれ、自動的に完了しました。']
  const text = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    ...completedLine,
    '',
    '【対象スタッフ】',
    `社員番号：${staffCode || '（未入力）'}`,
    `スタッフ氏名：${staffName || '（未入力）'}`,
    `部門名：${staffDept || '（未入力）'}`,
    `入社日：${formatJaDate(staffHireDate)}`,
    '',
    '【申請者】',
    `${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}`,
    '',
    '申請画面（STEP1）からスタッフ検索を行うと、',
    '内容が反映できる状態になっています。',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。',
    'ご不明点は管理部までご連絡ください。',
  ].join('\n')

  // 2026-07-22追加：sendCsvImportMatchedMailと同様の理由でHTML版を追加
  // （伊藤さんとの全メール文面レビューで指摘・合意。docs/SYSTEM_DESIGN.md 10章2026-07-22参照）。
  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        ${completedLine.join('<br>')}
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">対象スタッフ</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            社員番号：${staffCode || '（未入力）'}<br>
            スタッフ氏名：${staffName || '（未入力）'}<br>
            部門名：${staffDept || '（未入力）'}<br>
            入社日：${formatJaDate(staffHireDate)}
          </td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">申請者</td></tr>
          <tr><td style="padding:0 16px 14px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;">
            ${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        申請画面（STEP1）からスタッフ検索を行うと、<br>内容が反映できる状態になっています。
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${APP_URL}/dashboard/sales" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              担当営業ダッシュボードを開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;line-height:1.6;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。<br>ご不明点は管理部までご連絡ください。
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


// ===== 契約状況モニタリング フェーズ2：担当営業への確認依頼メール（2026-07-23追加） =====
// 管理部ダッシュボード「更新期限管理」タブ内の「契約状況モニタリング」セクションから、
// 個別の対応依頼ボタンで即時送信する（sendRenewalDigestMailのような日次バッチではなく、
// 管理部が能動的にクリックした瞬間に飛ぶ点が異なる）。宛先解決（担当営業→フォールバックで
// 管理部）・RENEWAL_NOTIFY_OVERRIDE_EMAILでのテスト用差し替えは
// app/api/cron/renewal-notify/route.ts と同じ考え方を流用する。社内向け業務メールのため
// 氏名を本文に含めてよい（sendRenewalDigestMailと同じ整理）。
export type ContractMonitoringFollowupItem = {
  docLabel: string
  detail: string
}

export async function sendContractMonitoringFollowupMail(
  toEmails: string[],
  ccEmails: string[],
  staffName: string | null,
  employeeNumber: string,
  deptName: string,
  issues: ContractMonitoringFollowupItem[],
  requestedByName: string | null,
  overrideNotice?: string,
  isUnassignedFallback?: boolean
): Promise<void> {
  if (toEmails.length === 0) return

  const fallbackPrefix = isUnassignedFallback ? '【担当者未設定】' : ''
  const subject = `${fallbackPrefix}【契約状況モニタリング・要確認】${staffName || '対象スタッフ'}様の契約状況をご確認ください`

  const lines: string[] = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    `管理部（契約状況モニタリング）より、下記スタッフの契約状況について確認・対応のご依頼です。`,
    '',
    `対象スタッフ：${staffName || '(氏名不明)'}（社員番号 ${employeeNumber}／${deptName}）`,
    '',
  ]
  for (const issue of issues) {
    lines.push(`・${issue.detail}`)
  }
  lines.push(
    '',
    '契約実績のご確認、または新規申請・更新申請の対応をお願いいたします。',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    '',
    requestedByName ? `依頼者：管理部 ${requestedByName}` : '依頼者：管理部',
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

  const issuesHtml = issues.map(issue =>
    `<tr><td style="padding:6px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">・${issue.detail}</td></tr>`
  ).join('')

  const fallbackNoticeHtml = isUnassignedFallback
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">※この部門は担当営業アカウントが特定できなかったため、本来の宛先の代わりに管理部宛に送信しています。対象スタッフの部門設定・担当営業アカウントの登録をご確認ください。</td></tr>`
    : ''
  const overrideNoticeHtml = overrideNotice
    ? `<tr><td style="padding:16px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;white-space:pre-line;">${overrideNotice}</td></tr>`
    : ''

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:520px;width:100%;">
      <tr><td style="padding:32px 32px 4px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:16px 32px 8px 32px;font-family:sans-serif;font-size:14px;font-weight:bold;color:#1A2340;">
        管理部（契約状況モニタリング）より、下記スタッフの契約状況について確認・対応のご依頼です。
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
      <tr><td style="padding:16px 32px 4px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#1B3A8C;">
        ${staffName || '(氏名不明)'}（社員番号 ${employeeNumber}／${deptName}）
      </td></tr>
      ${issuesHtml}
      <tr><td style="padding:16px 32px 0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0 0 16px;"></td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">
        契約実績のご確認、または新規申請・更新申請の対応をお願いいたします。
      </td></tr>
      <tr><td style="padding:0 32px 4px 32px;"><a href="${APP_URL}/dashboard/sales" style="display:inline-block;background:#1B3A8C;color:#fff;text-decoration:none;font-family:sans-serif;font-size:13px;font-weight:bold;padding:10px 20px;border-radius:6px;">担当営業ダッシュボードを開く</a></td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ${requestedByName ? `依頼者：管理部 ${requestedByName}` : '依頼者：管理部'}
      </td></tr>
      <tr><td style="padding:12px 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
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

// ===== CSV由来データ修正時の管理部通知メール（2026-07-30追加・上司デモ指摘⑥対応） =====
// 担当営業がCSV自動反映項目をSTEP修正した状態のまま申請し、SSCが承認した時点で管理部
// （app_labor@appart.co.jp固定・伊藤さん指定）へ、どのシステムのどの項目がどう変わったかを
// メール本文に一覧で記載して通知する。
// 【7-4章の例外】7-4章は「全メール本文に個人情報・契約内容・氏名を含めない」ルールだが、
// この通知メールに限り、伊藤さんの明示的な指示（2026-07-30・PII全文記載の了承確認済み）により
// 対象スタッフの社員番号・氏名およびCSV値／変更後値を本文に含める、7-4章に対する明示的な例外
// として扱う（宛先が社内の管理部固定アドレスであり、外部への漏洩経路が無いことを踏まえた判断）。
export type CsvModifiedFieldMailItem = { label: string; csvValue: string; newValue: string }
export async function sendCsvModifiedNotifyMail(
  toEmail: string,
  systemType: string,
  applicantDeptName: string,
  applicantName: string,
  employeeNumber: string,
  staffName: string,
  documentLabel: string,
  modifiedFields: CsvModifiedFieldMailItem[],
  contractId: string,
  // 2026-07-30追加（伊藤さんフィードバック対応）：
  // ①就業場所名、②CSVデータ上の派遣期間（開始日〜終了日）を本文に追加表示。
  // ③冒頭の承認者表記を「SSC」固定ではなく実際の承認者ロールに応じて動的に変える
  //   （管理部が承認した場合は「管理部が承認」と表示。approved_byをstaff_rolesで引いた結果を渡す）。
  workLocationName: string,
  dispatchStart: string | null,
  dispatchEnd: string | null,
  approverRoleLabel: string,
  // 2026-07-30追加：対象システムの下に契約番号（csv_raw_data.unique_key相当。システムごとに
  // 契約No／契約番号／個別契約番号／個別契約書番号と呼び名が異なる項目をDB側で正規化した値）を表示。
  contractNo: string
): Promise<void> {
  // 2026-07-30追加（伊藤さんフィードバック対応）：
  // ①スタッフ氏名の全角スペース（e-staffing等のCSV由来データで発生）を半角スペースに統一。
  // ②宛名の「様」表記は本メールでは不要なため削除（件名・本文とも）。
  // ③CSVデータ上の派遣期間の日付表記を「YYYY-MM-DD」から「YYYY年MM月DD日」に変更。
  const normalizedStaffName = staffName.replace(/　/g, ' ')
  // 2026-07-31：日付フォーマットは共通ヘルパー(formatJaDate)に統合。ただしこの関数では
  // 未入力時にnullを返す挙動に依存している箇所（dispatchPeriodLabelの「―」表示）があるため、
  // 共通ヘルパー（未入力時は'（未入力）'を返す）をそのまま使わず、この関数専用の薄いラッパーとする。
  const formatJapaneseDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return dateStr
    return `${m[1]}年${m[2]}月${m[3]}日`
  }
  const subject = `【要確認】CSV反映項目の修正あり（${normalizedStaffName}・${documentLabel}）`
  const detailUrl = `${APP_URL}/dashboard/ssc/contracts/${contractId}`
  const dispatchStartLabel = formatJapaneseDate(dispatchStart)
  const dispatchEndLabel = formatJapaneseDate(dispatchEnd)
  const dispatchPeriodLabel = (dispatchStartLabel && dispatchEndLabel) ? `${dispatchStartLabel} ～ ${dispatchEndLabel}` : '―'

  const lines: string[] = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    `担当営業がCSV自動反映項目を修正した状態で申請し、`,
    `${approverRoleLabel}が承認しましたのでお知らせします。`,
    '',
    `対象システム：${systemType}`,
    `契約番号：${contractNo || '―'}`,
    `就業場所名：${workLocationName || '―'}`,
    `派遣期間（CSVデータ上）：${dispatchPeriodLabel}`,
    `申請者：${applicantDeptName}　${applicantName}`,
    `対象スタッフ：${normalizedStaffName}（社員番号 ${employeeNumber}）`,
    `書類種別：${documentLabel}`,
    '',
    '【修正項目一覧】',
  ]
  for (const f of modifiedFields) {
    lines.push(`・${f.label}`, `　CSVの情報：${f.csvValue}`, `　変更後の情報：${f.newValue}`)
  }
  lines.push(
    '',
    '詳細内容は下記「詳細画面を開く」からご確認頂けます。',
    `詳細画面：${detailUrl}`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。',
  )

  const itemsHtml = modifiedFields.map(f => `
    <tr><td style="padding:10px 32px 0 32px;font-family:sans-serif;font-size:13px;font-weight:bold;color:#1A2340;">・${f.label}</td></tr>
    <tr><td style="padding:2px 32px 0 44px;font-family:sans-serif;font-size:12px;color:#D97706;">CSVの情報：${f.csvValue}</td></tr>
    <tr><td style="padding:2px 32px 0 44px;font-family:sans-serif;font-size:12px;color:#1B3A8C;">変更後の情報：${f.newValue}</td></tr>
  `).join('')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:520px;width:100%;">
      <tr><td style="padding:32px 32px 4px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:16px 32px 8px 32px;font-family:sans-serif;font-size:14px;font-weight:bold;color:#1A2340;">
        担当営業がCSV自動反映項目を修正した状態で申請し、<br>${approverRoleLabel}が承認しましたのでお知らせします。
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
      <tr><td style="padding:14px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">対象システム：${systemType}</td></tr>
      <tr><td style="padding:4px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">契約番号：${contractNo || '―'}</td></tr>
      <tr><td style="padding:4px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">就業場所名：${workLocationName || '―'}</td></tr>
      <tr><td style="padding:4px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">派遣期間（CSVデータ上）：${dispatchPeriodLabel}</td></tr>
      <tr><td style="padding:4px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">申請者：${applicantDeptName}　${applicantName}</td></tr>
      <tr><td style="padding:4px 32px 0 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#1B3A8C;">対象スタッフ：${normalizedStaffName}（社員番号 ${employeeNumber}）</td></tr>
      <tr><td style="padding:4px 32px 12px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">書類種別：${documentLabel}</td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
      <tr><td style="padding:12px 32px 0 32px;font-family:sans-serif;font-size:13px;font-weight:bold;color:#1A2340;">【修正項目一覧】</td></tr>
      ${itemsHtml}
      <tr><td style="padding:16px 32px 0 32px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0 0 16px;"></td></tr>
      <tr><td style="padding:0 32px 20px 32px;font-family:sans-serif;font-size:13px;color:#1A2340;">
        詳細内容は下記「詳細画面を開く」からご確認頂けます。
      </td></tr>
      <tr><td style="padding:0 32px 4px 32px;"><a href="${detailUrl}" style="display:inline-block;background:#1B3A8C;color:#fff;text-decoration:none;font-family:sans-serif;font-size:13px;font-weight:bold;padding:10px 20px;border-radius:6px;">詳細画面を開く</a></td></tr>
      <tr><td style="padding:20px 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。
      </td></tr>
    </table>
  </td></tr>
</table>`.trim()

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: lines.join('\n'),
    html,
  })
}

// ===== 依頼（スタッフマスタ登録・CSVインポート）新規送信時の管理部通知メール（2026-07-31新設） =====
// 従来、STEP1/STEP2から依頼を送信しても`requests`テーブルへの保存のみでメール送信が無く、
// 管理部が自主的に「依頼管理」タブを開かない限り新しい依頼に気づけなかった問題への対応。
// 宛先は管理部（メーリングリスト優先・未登録なら個人宛にフォールバック。呼び出し元のAPIルートで解決）。
export async function sendNewRequestMail(
  toEmails: string[],
  info: RequestMailInfo & { requestedAt: string }
): Promise<void> {
  if (toEmails.length === 0) return

  const { requestType, staffName, requestedByName, requestedByDept, requestedAt } = info
  const typeLabel = requestType === 'staff_register' ? 'スタッフマスタ登録依頼' : 'CSVインポート依頼'
  const requestedAtLabel = new Date(requestedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const subject = `【APパートナーズ】新しい依頼が届きました（${typeLabel}・${staffName || '対象スタッフ'}様）`
  const detailLines = buildRequestDetailLines(info)

  // 2026-07-31：伊藤さんの指摘（フォームの入力項目を漏れなく記載・改行位置の読みやすさ）を
  // 受け全面的に見直した。1文1行を基本とし、句点・助詞の切れ目以外では改行しない。
  const lines = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    `${typeLabel}が新しく届きましたので、`,
    'お知らせします。',
    '',
    '【依頼内容】',
    ...detailLines,
    '',
    '【申請者】',
    `${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}`,
    `依頼日時：${requestedAtLabel}`,
    '',
    '内容をご確認のうえ、',
    '対応をお願いします。',
    `管理部ダッシュボードはこちら：${APP_URL}/dashboard/admin`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。',
  ].join('\n')

  const detailHtml = detailLines
    .map(l => (l === '' ? '<br>' : l.startsWith('【') ? `<strong>${l}</strong>` : l))
    .join('<br>')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        ${typeLabel}が新しく届きましたので、<br>お知らせします。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">依頼内容</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            ${detailHtml}
          </td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">申請者</td></tr>
          <tr><td style="padding:0 16px 14px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            ${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}<br>
            依頼日時：${requestedAtLabel}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        内容をご確認のうえ、<br>対応をお願いします。
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${APP_URL}/dashboard/admin" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              管理部ダッシュボードを開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。
      </td></tr>
    </table>
  </td></tr>
</table>`.trim()

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmails.join(','),
    subject,
    text: lines,
    html,
  })
}

// ===== 依頼（スタッフマスタ登録・CSVインポート）取消時の依頼元向け通知メール（2026-07-31新設） =====
// 管理部が「依頼管理」タブから依頼を取消した際、依頼元（担当営業）へ取消理由とともに通知する。
// 従来は取消してもメールが飛ばず、依頼元は気づけなかった。
// 宛先は依頼元の所属部署のメーリングリスト優先・未登録なら本人個人宛にフォールバック
// （呼び出し元のAPIルートで解決）。
export async function sendRequestCancelledMail(
  toEmail: string,
  info: RequestMailInfo & { reason: string }
): Promise<void> {
  const { requestType, staffName, requestedByName, requestedByDept, reason } = info
  const typeLabel = requestType === 'staff_register' ? 'スタッフマスタ登録依頼' : 'CSVインポート依頼'
  const subject = `【APパートナーズ】${typeLabel}が取消されました（${staffName || '対象スタッフ'}様）`
  const detailLines = buildRequestDetailLines(info)

  // 2026-07-31：項目網羅・改行位置の見直し（sendNewRequestMailと同じ方針）。
  const lines = [
    'お疲れ様です。',
    'APパートナーズ 契約書管理システムです。',
    '',
    `以前ご依頼いただいた${typeLabel}について、`,
    '管理部により取消されましたので、',
    'お知らせします。',
    '',
    '【依頼内容】',
    ...detailLines,
    '',
    '【申請者】',
    `${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}`,
    '',
    `取消理由：${reason}`,
    '',
    'ご不明点・再度の依頼が必要な場合は、',
    '管理部までご連絡ください。',
    `担当営業の方はこちら：${APP_URL}/dashboard/sales`,
    '',
    '※本メールは自動送信です。このアドレスへの返信には対応しておりません。',
  ].join('\n')

  const detailHtml = detailLines
    .map(l => (l === '' ? '<br>' : l.startsWith('【') ? `<strong>${l}</strong>` : l))
    .join('<br>')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;max-width:480px;width:100%;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:sans-serif;font-size:14px;color:#1A2340;">
        お疲れ様です。<br>APパートナーズ 契約書管理システムです。
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;font-family:sans-serif;font-size:15px;color:#1A2340;font-weight:bold;line-height:1.6;">
        以前ご依頼いただいた${typeLabel}について、<br>管理部により取消されましたので、<br>お知らせします。
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FC;border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">依頼内容</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            ${detailHtml}
          </td></tr>
          <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #E3E7F0;margin:0;"></td></tr>
          <tr><td style="padding:12px 16px 4px 16px;font-family:sans-serif;font-size:12px;color:#5A6A8A;font-weight:bold;">申請者</td></tr>
          <tr><td style="padding:0 16px 12px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;">
            ${requestedByDept || '（部門不明）'}　${requestedByName || '（氏名不明）'}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FDECEC;border-radius:6px;">
          <tr><td style="padding:14px 16px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.8;">
            取消理由：${reason}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;font-family:sans-serif;font-size:13px;color:#1A2340;line-height:1.7;">
        ご不明点・再度の依頼が必要な場合は、<br>管理部までご連絡ください。
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td align="center" bgcolor="#1B3A8C" style="border-radius:6px;">
            <a href="${APP_URL}/dashboard/sales" target="_blank" style="display:inline-block;padding:14px 32px;font-family:sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
              担当営業ダッシュボードを開く
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:sans-serif;font-size:12px;color:#8A94AA;">
        ※本メールは自動送信です。このアドレスへの返信には対応しておりません。
      </td></tr>
    </table>
  </td></tr>
</table>`.trim()

  await transporter.sendMail({
    from: `"APパートナーズ 契約書管理システム" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: lines,
    html,
  })
}
