// ===== 日付表記の共通ヘルパー（2026-08-05新設） =====
// docs/SYSTEM_DESIGN.md 10章 2026-08-03「日付表記の不統一に関する調査結果」・2026-08-05の対応記録参照。
//
// 従来、アプリ内の日付表示が「ハイフン生値（2026-05-01）」「スラッシュ（2026/08/05）」
// 「漢字（2026年08月05日）」の3方式に混在し、かつ同じロジックの重複関数が
// contractDisplay.tsx・各ダッシュボードのローカル定義・lib/mail.ts・lib/pdf/documentText.ts・
// app/staff/mypage/page.tsx など10箇所以上にコピーされていた（2026-08-03発見、2026-08-05調査で
// 全容確認）。伊藤さんとの確認の結果「すべて漢字表記（年月日）に統一・重複関数も一括で共通化」
// と決定し、このファイルを唯一の正（source of truth）とする。
//
// 表記ルール：年月日は必ずゼロ埋め2桁（08月05日。8月5日にはしない）。これは元々
// useRenewalCandidates.tsのformatDateJp/formatPeriodJp（2026-08-03新設）で採用していた形式に
// 揃えたもの（更新期限管理タブで最初に「年月日表記でないと分かりづらい」という伊藤さんの
// 指摘に対応した際の表記がすでにこの形式だったため、これを全体の基準とした）。
//
// タイムゾーンについて：このファイルはクライアント（ブラウザ・日本国内利用者のローカル時刻＝
// 実質JST）とサーバー（VercelのNode.jsランタイム＝既定でUTC）の両方からimportされる。
// 日時（時刻を含む）を扱うformatDateTimeJpは、サーバー側で単純に「ローカル時刻」を使うと
// UTCで計算されてしまい表示が9時間ずれるため、Intl.DateTimeFormatでタイムゾーンを
// 'Asia/Tokyo'に明示的に固定している（lib/mail.tsのsendNewRequestMail等が従来
// { timeZone: 'Asia/Tokyo' } を個別に指定していたのと同じ対策を、共通ヘルパー側に一本化した）。

const JST_DATETIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

// 日付のみを「YYYY年MM月DD日」形式に変換。
// 入力は 'YYYY-MM-DD' 形式（DBの date 型カラムの一般的な文字列表現）を主に想定するが、
// ISO日時文字列（'YYYY-MM-DDTHH:mm:ss...'）が来ても先頭の日付部分だけを抽出して変換する
// （日付部分の文字列をそのまま切り出すだけなのでタイムゾーン変換は発生しない＝安全）。
export function formatDateJp(dateStr: string | null | undefined, emptyLabel: string = '―'): string {
  if (!dateStr) return emptyLabel
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (m) return `${m[1]}年${m[2]}月${m[3]}日`
  // 上記の正規表現に一致しない形式（まれにDate.parseできる別形式の文字列が来た場合）のフォールバック。
  // JST基準で年月日を確定させるため、直接Dateのローカルgetterは使わずformatDateTimeJpと同じ
  // Intl.DateTimeFormat（Asia/Tokyo固定）を経由する。
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return emptyLabel
  const parts = JST_DATETIME_FORMAT.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}年${get('month')}月${get('day')}日`
}

// 日時（タイムスタンプ）を「YYYY年MM月DD日 HH:mm」形式に変換（常にJST基準）。
// 申請日時・承認日時・確認済み日時など、これまで formatDateTime()（スラッシュ表記）が
// 使われていた箇所の置き換え先。
export function formatDateTimeJp(iso: string | null | undefined, emptyLabel: string = '―'): string {
  if (!iso) return emptyLabel
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return emptyLabel
  const parts = JST_DATETIME_FORMAT.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}年${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`
}

// 開始日〜終了日の期間レンジ表示。どちらも無ければemptyLabelを返す。
export function formatPeriodJp(start: string | null | undefined, end: string | null | undefined, emptyLabel: string = '―'): string {
  if (!start && !end) return emptyLabel
  return `${formatDateJp(start, emptyLabel)} 〜 ${formatDateJp(end, emptyLabel)}`
}
