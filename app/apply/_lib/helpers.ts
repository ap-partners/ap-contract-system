// ===== app/apply/page.tsx から切り出した「Reactに依存しない純粋な関数・定数」だけを集めたファイル =====
// スケーラビリティ改善タスク③（apply/page.tsx分割・Phase1）2026-07-14
// ここにあるのはJSXを一切含まない計算・変換ロジックのみ。画面表示用の小さな部品コンポーネントは
// ./_components/FormParts.tsx 側にある（DiffTextなどJSXを返すものはこちら側ではなくそちら）。

export const getDocumentTypes = (workPlace: string) => {
  if (workPlace === '社内') return [{ value: '雇用契約書', pattern: 'A', step: '6STEP' }]
  return [
    { value: '雇用契約書', pattern: 'A', step: '6STEP' },
    { value: '就業条件明示書', pattern: 'B', step: '6STEP・給与記載なし' },
    { value: '雇用契約書 兼\n就業条件明示書', pattern: 'C', step: '8STEP' },
  ]
}

export const getFullDocumentName = (docType: string, contractType: string) => {
  if (!docType || !contractType) return ''
  const cleanDocType = docType.replace('\n', ' ')
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : contractType === 'アルバイト' ? 'アルバイト' : ''
  return period ? `${cleanDocType}（${period}）` : cleanDocType
}

export const getPattern = (docType: string) => {
  const clean = docType.replace('\n', ' ')
  if (clean === '雇用契約書') return 'A'
  if (clean === '就業条件明示書') return 'B'
  if (clean === '雇用契約書 兼 就業条件明示書') return 'C'
  return ''
}

export const STEPS_A = ['基本情報', '就業先情報', '期間・労働条件', '契約条件', '給与・保険', '最終確認']
export const STEPS_B = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '最終確認']
export const STEPS_C = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '契約条件', '給与・保険', '最終確認']

export const STEP_SUB: Record<string, string> = {
  '基本情報': '契約するスタッフと書類の種類を選びます',
  '就業先情報': '就業場所・業務内容・労働時間を入力します',
  '派遣先担当者': '派遣先の担当者情報を入力します',
  '派遣元担当者': '自社の担当者情報を確認・修正します',
  '期間・労働条件': '雇用期間・派遣期間・残業の有無を入力します',
  '契約条件': '契約書の締結方法と備考欄の内容を選びます',
  '給与・保険': '給与の金額と加入する保険を入力します',
  '最終確認': '入力内容を確認して申請します',
}

export const STEP_DESC: Record<string, string> = {
  '基本情報': '契約書を発行するスタッフを検索して選択します。次に雇用の種類（有期・無期・正社員）と、発行する書類の種類を選んでください。',
  '就業先情報': 'スタッフが働く場所の情報と、業務内容・労働時間を入力します。派遣管理システム（e-staffing・HRstation・winworks・Staffia）に該当するスタッフがいる場合は「CSVデータから自動入力」を選ぶと、就業先などの個別契約情報が自動で反映されます。該当しない場合は「手動で入力する」を選んでください。',
  '派遣先担当者': '派遣先企業の担当者（指揮命令者・派遣先責任者・苦情処理申出先）の部署・役職・氏名・電話番号を入力します。派遣先に確認してから入力してください。',
  '派遣元担当者': '自社（APパートナーズ）の担当者情報がマスタから自動で入力されています。内容を確認し、異なる場合は修正してください。',
  '期間・労働条件': '派遣期間（開始日・終了日）と雇用契約の期間・試用期間を入力します。また、残業の有無と変形労働時間制の有無を選択してください。',
  '契約条件': 'スタッフへの契約書の説明方法（対面・印刷・自動送信）を選択します。また、賞与・退職手当・昇給に関する備考欄の文言を選んでください。',
  '給与・保険': '基本給や各種手当の金額、交通費の支給方法を入力します。また、雇用保険・健康保険・厚生年金への加入有無を選択してください。',
  '最終確認': 'これまでに入力した内容をすべて確認できます。内容に問題がなければ「申請する」ボタンを押してください。申請後はSSCが内容を確認します。',
}

export const DEFAULT_SAFETY = '派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。'
export const DEFAULT_CONFLICT = '派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。'

export const CLOSING_PATTERNS = [
  {
    id: 'auto',
    label: '指定しない',
    desc: '承認が完了すると、システムが従業員へ確認用URLを自動送信します。',
    icon: '/icons/pattern-auto.png',
  },
  {
    id: 'face',
    label: '対面でその場説明',
    desc: '担当営業が端末画面を見せながら説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。',
    icon: '/icons/pattern-face.png',
  },
  {
    id: 'print',
    label: '印刷して説明後にリンク送付',
    desc: '担当営業が印刷した資料を用いて説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。',
    icon: '/icons/pattern-print.png',
  },
]

export const FIXED_REMARKS_SUFFIX = '上記以外の事項については、当社就業規則及び賃金規定による。手当はクライアント規定により支払うものとする。'

// 備考文言の自動決定ロジック（法務確認済み）
export const getRemarksText = (pattern: string, contractType: string, bonusType: string): string => {
  const suffix = FIXED_REMARKS_SUFFIX
  if (pattern === 'B') return ''
  const isSeishain = contractType === '正社員'
  const isKeiyaku = contractType === '有期契約' || contractType === '無期契約' || contractType === 'アルバイト'

  if (pattern === 'C') {
    if (isKeiyaku) return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'あり') return `賞与【有】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'なし') return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
  }
  if (pattern === 'A') {
    if (isKeiyaku) return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'あり') return `賞与【有】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'なし') return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
  }
  return suffix
}

export const needsBonusSelection = (pattern: string, contractType: string): boolean => {
  return contractType === '正社員' && (pattern === 'A' || pattern === 'C')
}

// STEP7：交通費区分
export const TRANSPORT_TYPES = [
  {
    id: 'default',
    label: '実費または定期代（デフォルト）',
    icon: '/icons/transport-pass.png',
    preview: '実費または定期代(デフォルト)\n原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
  {
    id: 'included',
    label: '交通費込',
    icon: '/icons/transport-included.png',
    preview: '交通費込\n基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。',
  },
  {
    id: 'gas',
    label: 'ガソリン代',
    icon: '/icons/transport-gas.png',
    preview: 'ガソリン代\n私有車通勤：ガソリン代支給　【 12円 / km】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
  {
    id: 'pass-gas',
    label: '定期代＋ガソリン代',
    icon: '/icons/transport-pass-gas.png',
    preview: '定期代＋ガソリン代\n定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③エビデンスの提出確認が取れない交通費は支払い対象外とする。⑤私有車通勤については別途私有車通勤を許可する書面を提出し、規定を遵守すること。',
  },
]

export const SALARY_RULES: Record<string, { min: number; max: number }> = {
  '時給': { min: 1000,   max: 9999    },
  '日給': { min: 1000,   max: 79999   },
  '月給': { min: 100000, max: 2999999 },
}

export const TOOLTIPS: Record<string, string> = {
  '変形労働時間制': '毎日同じ時間働くのではなく、忙しい日は長く・暇な日は短くなど、期間全体で帳尻を合わせる働き方です。シフト制の職場などで使われます。',
  '所定労働時間外労働': '定められた就業時間を超えて働く「残業」があるかどうかです。「有」の場合は残業代が発生します。',
  '抵触日（事業所単位）': 'その事業所（会社・支店など）全体が、派遣社員を受け入れられる期限です（原則3年）。※無期雇用派遣社員は対象外です。',
  '抵触日（組織単位）': 'このスタッフが、同じ部署（課・グループなど）で勤務できる期限です（原則3年）。継続する場合は別の部署への異動などが必要です。※無期雇用派遣社員は対象外です。',
  '業務に伴う責任の程度': 'このスタッフが他のスタッフへの指示・管理などリーダー的な役割を担うかどうかです。派遣先との個別契約の内容を確認の上、選択してください。',
}

export const inp = "bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-full placeholder:text-gray-400"

// 幅を固定したい日付欄専用（inpのw-fullと衝突しないよう別クラスとして定義。2026-07-02追加）
export const inpDate = "bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-40 placeholder:text-gray-400"

export const deptInputStyle = {
  borderColor: '#D0DAF0',
  color: '#1A2340',
  wordBreak: 'break-all' as const,
  overflowWrap: 'break-word' as const,
  whiteSpace: 'normal' as const,
  lineHeight: '1.6',
}

export const normalizeTel = (v: string) => v
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/ー|－|―/g, '-')
  .replace(/[^0-9-]/g, '')

export const validateTel = (v: string) => {
  const digits = v.replace(/-/g, '')
  if (digits.length === 0) return null
  if (!/^\d+$/.test(digits)) return '数字と-のみ入力できます'
  if (digits.length < 10 || digits.length > 11) return '10〜11桁で入力してください'
  if (!/^\d{2,4}-\d{2,4}-\d{4}$/.test(v)) return '例）03-1234-5678 の形式で入力してください'
  return null
}

export const calcTrialMonths = (start: string, end: string) => {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (e <= s) return null
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const dayDiff = e.getDate() - s.getDate()
  if (dayDiff < 0) months--
  const days = dayDiff < 0 ? new Date(e.getFullYear(), e.getMonth(), 0).getDate() + dayDiff : dayDiff
  return { months, days, over6: months > 6 || (months === 6 && days > 0) }
}

export const toJpDate = (dateStr: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// 2つの日付文字列（YYYY-MM-DD）を比較する。dateA < dateB なら true
// どちらか未入力の場合は比較不能のため false（エラーにしない）
export const isDateBefore = (dateA: string, dateB: string) => {
  if (!dateA || !dateB) return false
  return dateA < dateB // YYYY-MM-DD形式は文字列比較でも日付の前後関係が正しく出る
}

// 2つの日付文字列（YYYY-MM-DD）の差を日数で返す（絶対値）。どちらか未入力ならnull（2026-07-07追加）
export const diffDaysAbs = (dateA: string, dateB: string): number | null => {
  if (!dateA || !dateB) return null
  const a = new Date(dateA + 'T00:00:00').getTime()
  const b = new Date(dateB + 'T00:00:00').getTime()
  return Math.abs(Math.round((a - b) / (1000 * 60 * 60 * 24)))
}

// 数値を2桁ゼロ埋めにする（時間・分の入力統一用）。空欄はそのまま空欄にする
export const padTwoDigits = (str: string) => {
  if (!str) return str
  const n = parseAmount(str)
  return String(n).padStart(2, '0')
}

// 全角数字を半角に変換（全角混在の入力ミスを防ぐ）
export const toHalfWidthDigits = (str: string) =>
  (str || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))

export const parseAmount = (str: string) =>
  parseInt(toHalfWidthDigits(str || '0').replace(/,/g, ''), 10) || 0

// ===== CSV連携：raw_dataから各項目を抽出するヘルパー =====

// 時刻文字列をHH:MM形式に統一する（システムごとに形式が異なるため）
// - "09:00" "8:45" のようなコロン区切り → そのままHH:MMにゼロ埋め
// - "945" "1800" のような4桁数値（コロンなし） → 前2桁:後2桁に変換
export const normalizeTimeStr = (raw: string): string | null => {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str) return null
  if (str.includes(':')) {
    const [h, m] = str.split(':')
    if (h === undefined || m === undefined) return null
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  }
  // コロンなしの数値（HRstation形式）
  const digits = str.replace(/[^\d]/g, '')
  if (digits.length === 3) {
    // 3桁（例:945 → 9:45）
    return `0${digits[0]}:${digits.slice(1)}`
  }
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`
  }
  return null
}

// 複数の始業・終業時刻パターンから、最早の始業・最遅の終業を計算する
// 戻り値: { start, end, isMultiple }
export const calcEarliestLatest = (pairs: Array<{ start: string | null; end: string | null }>) => {
  const valid = pairs.filter(p => p.start && p.end)
  if (valid.length === 0) return { start: null, end: null, isMultiple: false }
  const starts = valid.map(p => p.start as string).sort()
  const ends = valid.map(p => p.end as string).sort()
  return {
    start: starts[0],
    end: ends[ends.length - 1],
    isMultiple: valid.length > 1,
  }
}

// "HH:MM" 形式の時刻を、指定した時間（hours）だけ前後にずらす（日付をまたぐ場合は24時間で折り返す）
export const shiftTimeByHours = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number)
  let totalMin = h * 60 + m + hours * 60
  totalMin = ((totalMin % 1440) + 1440) % 1440
  const newH = Math.floor(totalMin / 60)
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

// 文字単位のLCS（最長共通部分列）ベースで差分を計算する
// 戻り値は { type: 'same' | 'removed' | 'added', text: string } の配列
// 'same'＝変化なし、'removed'＝旧テキストにあったが新テキストにない（削除）、'added'＝新テキストに追加された部分
export type DiffPart = { type: 'same' | 'removed' | 'added'; text: string }
export const computeCharDiff = (oldText: string, newText: string): DiffPart[] => {
  const oldArr = Array.from(oldText)
  const newArr = Array.from(newText)
  const m = oldArr.length
  const n = newArr.length

  // LCSの長さテーブルを計算（dp[i][j] = oldArr[0..i) と newArr[0..j) のLCSの長さ）
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldArr[i - 1] === newArr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // テーブルを後ろからたどり、same/removed/addedの並び（逆順）を作る
  const rawParts: { type: 'same' | 'removed' | 'added'; char: string }[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      rawParts.push({ type: 'same', char: oldArr[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] > dp[i - 1][j])) {
      rawParts.push({ type: 'added', char: newArr[j - 1] })
      j--
    } else {
      rawParts.push({ type: 'removed', char: oldArr[i - 1] })
      i--
    }
  }
  rawParts.reverse()

  // 同じtypeが連続する文字をまとめて、読みやすいブロックにする
  const parts: DiffPart[] = []
  for (const p of rawParts) {
    const last = parts[parts.length - 1]
    if (last && last.type === p.type) {
      last.text += p.char
    } else {
      parts.push({ type: p.type, text: p.char })
    }
  }
  return parts
}

// winworksの「諸措置」列から「業務に伴う責任の程度」を抽出する
// 文末の「責任の程度：◯◯」パターンを正規表現で抽出。「役職無し」は「無」に変換する
export const extractResponsibilityFromWinworks = (shochi: string | null): string | null => {
  if (!shochi) return null
  const m = shochi.match(/責任の程度[：:](.+?)$/)
  if (!m) return null
  const value = m[1].trim()
  return value === '役職無し' ? '無' : value
}

// e-staffingの便宜供与（0/1のフラグ＋その他自由記述）を、福利厚生の説明文に組み立てる
export const buildWelfareTextFromEstaffing = (raw: any): string | null => {
  const parts: string[] = []
  if (String(raw['便宜供与：診療施設']) === '1') parts.push('診療施設')
  if (String(raw['便宜供与：給食施設']) === '1') parts.push('給食施設')
  if (String(raw['便宜供与：休憩室']) === '1') parts.push('休憩室')
  if (String(raw['便宜供与：更衣室']) === '1') parts.push('更衣室')
  const others = [raw['便宜供与：その他1'], raw['便宜供与：その他2'], raw['便宜供与：その他3']].filter(Boolean)
  const all = [...parts, ...others]
  return all.length > 0 ? all.join(' ') : null
}

// HRstationの福利厚生（給食施設/休憩室/更衣室の0/1フラグ＋その他自由記述）を組み立てる
export const buildWelfareTextFromHRstation = (raw: any): string | null => {
  const parts: string[] = []
  if (String(raw['給食施設']) === '1') parts.push('給食施設')
  if (String(raw['休憩室']) === '1') parts.push('休憩室')
  if (String(raw['更衣室']) === '1') parts.push('更衣室')
  const others = [raw['その他福利厚生施設等']].filter(Boolean)
  const all = [...parts, ...others]
  return all.length > 0 ? all.join(' ') : null
}

// 数値（0/1や1/0）の文字列を「無」「有」に変換する（1=有、0または未入力=無扱いはしない＝nullを返す）
export const numToYesNo = (value: any): string | null => {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (str === '1') return '有'
  if (str === '0') return '無'
  return null
}

// CSVの検索結果（raw_data）から、システムごとに必要な項目を抽出して統一フォーマットで返す
export const extractCsvFieldsRaw = (system: string, raw: any) => {
  if (!raw) return {}

  if (system === 'e-staffing') {
    const { start, end, isMultiple } = calcEarliestLatest([
      { start: normalizeTimeStr(raw['勤務開始時間']), end: normalizeTimeStr(raw['勤務終了時間']) },
    ])
    return {
      business: newlineToSpace(raw['業務内容']),
      startTime: start,
      endTime: end,
      isShift: isMultiple,
      breakTime: raw['休憩時間1'] || null,
      org: raw['組織単位'] || null,
      conflictDate: raw['事業所抵触日'] ? normalizeDateSlash(raw['事業所抵触日']) : null,
      conflictDateOrg: raw['個人抵触日'] ? normalizeDateSlash(raw['個人抵触日']) : null,
      responsibility: null, // e-staffingは列なし
      workDays: raw['勤務日'] || null,
      cmdName: raw['指揮命令者氏名'] || null,
      cmdDept: raw['指揮命令者部署'] || null,
      cmdRole: raw['指揮命令者役職'] || null,
      cmdTel: formatTelHyphen(raw['指揮命令者TEL']),
      respName: raw['派遣先責任者氏名'] || null,
      respDept: raw['派遣先責任者部署'] || null,
      respRole: raw['派遣先責任者役職'] || null,
      respTel: formatTelHyphen(raw['派遣先責任者TEL']),
      compName: raw['苦情申出先氏名'] || null,
      compDept: raw['苦情申出先部署'] || null,
      compRole: raw['苦情申出先役職'] || null,
      compTel: formatTelHyphen(raw['苦情申出先TEL']),
      // 派遣元責任者（確定仕様：部署は「正式部署」を使用）
      mgrName: raw['派遣元責任者氏名'] || null,
      mgrDept: raw['派遣元責任者正式部署'] || null,
      mgrRole: raw['派遣元責任者役職'] || null,
      mgrTel: formatTelHyphen(raw['派遣元責任者TEL']),
      // 苦情処理申出先（派遣元）（確定仕様：部署は「正式部署」を使用）
      cmpName: raw['派遣元苦情申出先氏名'] || null,
      cmpDept: raw['派遣元苦情申出先正式部署'] || null,
      cmpRole: raw['派遣元苦情申出先役職'] || null,
      cmpTel: formatTelHyphen(raw['派遣元苦情申出先TEL']),
      welfare: buildWelfareTextFromEstaffing(raw),
      // 変形労働時間制：「備考1」または「契約書備考」に「変形労働」の記載があれば「有」、なければ「無」（確定仕様）
      flexTime: (String(raw['備考1'] || '').includes('変形労働') || String(raw['契約書備考'] || '').includes('変形労働')) ? '有' : '無',
      // 所定労働時間外労働：「時間外労働」列が1なら「有」、それ以外（0・空欄等）は「無」（確定仕様）
      overtime: String(raw['時間外労働'] ?? '') === '1' ? '有' : '無',
      dispatchStart: raw['契約開始日'] ? normalizeDateSlash(raw['契約開始日']) : null,
      dispatchEnd: raw['契約終了日'] ? normalizeDateSlash(raw['契約終了日']) : null,
    }
  }

  if (system === 'HRstation') {
    const pairs = [1, 2, 3, 4].map(i => ({
      start: normalizeTimeStr(raw[`勤務時間${i}_勤務開始時間`]),
      end: normalizeTimeStr(raw[`勤務時間${i}_勤務終了時間`]),
    }))
    const { start, end, isMultiple } = calcEarliestLatest(pairs)
    return {
      business: newlineToSpace(raw['業務内容']),
      startTime: start,
      endTime: end,
      isShift: isMultiple,
      breakTime: raw['勤務時間1_休憩時間1'] || null,
      org: raw['組織単位'] || null,
      conflictDate: raw['事業所単位抵触日'] ? normalizeDateSlash(raw['事業所単位抵触日']) : null,
      conflictDateOrg: raw['個人単位抵触日'] ? normalizeDateSlash(raw['個人単位抵触日']) : null,
      responsibility: null, // HRstationは列なし
      workDays: null,
      cmdName: raw['指揮命令者_氏名'] || null,
      cmdDept: raw['指揮命令者_部署'] || null,
      cmdRole: raw['指揮命令者_役職'] || null,
      cmdTel: formatTelHyphen(raw['指揮命令者_TEL']),
      respName: raw['派遣先責任者_氏名'] || null,
      respDept: raw['派遣先責任者_部署'] || null,
      respRole: raw['派遣先責任者_役職'] || null,
      respTel: formatTelHyphen(raw['派遣先責任者_TEL']),
      compName: raw['派遣先苦情処理受付者_氏名'] || null,
      compDept: raw['派遣先苦情処理受付者_部署'] || null,
      compRole: raw['派遣先苦情処理受付者_役職'] || null,
      compTel: formatTelHyphen(raw['派遣先苦情処理受付者_TEL']),
      // 派遣元責任者
      mgrName: raw['派遣元責任者_氏名'] || null,
      mgrDept: raw['派遣元責任者_部署'] || null,
      mgrRole: raw['派遣元責任者_役職'] || null,
      mgrTel: formatTelHyphen(raw['派遣元責任者_TEL']),
      // 苦情処理申出先（派遣元）
      cmpName: raw['派遣元苦情処理受付者_氏名'] || null,
      cmpDept: raw['派遣元苦情処理受付者_部署'] || null,
      cmpRole: raw['派遣元苦情処理受付者_役職'] || null,
      cmpTel: formatTelHyphen(raw['派遣元苦情処理受付者_TEL']),
      welfare: buildWelfareTextFromHRstation(raw),
      flexTime: null, // HRstationは列なし
      // 所定労働時間外労働：「個別契約書_契約書備考」に特定の文言があれば「有」、記載がなければ未反映（確定仕様）
      overtime: String(raw['個別契約書_契約書備考'] || '').includes('時間外（8時間/日超過分）') ? '有' : null,
      dispatchStart: raw['契約開始日'] ? normalizeDateSlash(raw['契約開始日']) : null,
      dispatchEnd: raw['契約終了日'] ? normalizeDateSlash(raw['契約終了日']) : null,
    }
  }

  if (system === 'winworks') {
    // 就業時間：CSVの「就業時間」列は契約によらず同じ固定文言が入る（確定仕様）。
    // 「9時00分　～　23時00分」「6時間を超える場合は1時間」という文言を含む場合、
    // 始業9:00・終業23:00・シフト制・休憩60分として反映する。
    const shugyoText = String(raw['就業時間'] || '')
    const hasFixedShiftText = shugyoText.includes('9時00分') && shugyoText.includes('23時00分')
    const hasFixedBreakText = shugyoText.includes('6時間を超える場合')
    return {
      business: newlineToSpace(raw['業務内容']),
      startTime: hasFixedShiftText ? '09:00' : null,
      endTime: hasFixedShiftText ? '23:00' : null,
      isShift: hasFixedShiftText,
      breakTime: hasFixedBreakText ? 60 : null,
      org: raw['派遣先情報（就業場所） 部署名（組織単位）'] || null,
      conflictDate: raw['派遣先情報（就業場所） 事業所単位の期間抵触日'] ? normalizeDateSlash(raw['派遣先情報（就業場所） 事業所単位の期間抵触日']) : null,
      conflictDateOrg: raw['個人単位の期間抵触日'] ? normalizeDateSlash(raw['個人単位の期間抵触日']) : null,
      responsibility: extractResponsibilityFromWinworks(raw['諸措置']),
      workDays: raw['就業日'] || null,
      // 指揮命令者：氏名・役職は専用列、部署・電話番号は就業場所の情報を代用（確定仕様）
      cmdName: raw['派遣先情報（就業場所） 指揮命令者'] || null,
      cmdDept: raw['派遣先情報（就業場所） 部署名（組織単位）'] || null,
      cmdRole: raw['派遣先情報（就業場所） 役職'] || null,
      cmdTel: formatTelHyphen(raw['派遣先情報（就業場所） 電話番号']),
      respName: raw['派遣責任者　派遣先 氏名'] || null,
      respDept: raw['派遣責任者　派遣先 部署名'] || null,
      respRole: raw['派遣責任者　派遣先 役職'] || null,
      respTel: formatTelHyphen(raw['派遣責任者　派遣先 電話番号']),
      compName: raw['苦情申出先　派遣先 氏名'] || null,
      compDept: raw['苦情申出先　派遣先 部署名'] || null,
      compRole: raw['苦情申出先　派遣先 役職'] || null,
      compTel: formatTelHyphen(raw['苦情申出先　派遣先 電話番号']),
      // 派遣元責任者
      mgrName: raw['派遣責任者　派遣元 氏名'] || null,
      mgrDept: raw['派遣責任者　派遣元 部署名'] || null,
      mgrRole: raw['派遣責任者　派遣元 役職'] || null,
      mgrTel: formatTelHyphen(raw['派遣責任者　派遣元 電話番号']),
      // 苦情処理申出先（派遣元）
      cmpName: raw['苦情申出先　派遣元 氏名'] || null,
      cmpDept: raw['苦情申出先　派遣元 部署名'] || null,
      cmpRole: raw['苦情申出先　派遣元 役職'] || null,
      cmpTel: formatTelHyphen(raw['苦情申出先　派遣元 電話番号']),
      welfare: raw['福利厚生等の便宜供与 条件'] || null,
      // 変形労働時間制：「就業時間」列に「変形労働時間制」という記載があるため「有」と判定する（確定仕様）
      flexTime: shugyoText.includes('変形労働時間制') ? '有' : null,
      // 所定労働時間外労働：「時間外及び休日労働」列に「時間外扱いとする」旨の記載があるため「有」と判定する（確定仕様）
      overtime: raw['時間外及び休日労働'] ? '有' : null,
      dispatchStart: raw['派遣期間 開始日'] ? normalizeDateSlash(raw['派遣期間 開始日']) : null,
      dispatchEnd: raw['派遣期間 終了日'] ? normalizeDateSlash(raw['派遣期間 終了日']) : null,
    }
  }

  if (system === 'Staffia') {
    const pairs = [1, 2, 3, 4, 5, 6, 7].map(i => ({
      start: normalizeTimeStr(raw[`就業開始時間${i}`]),
      end: normalizeTimeStr(raw[`就業終了時間${i}`]),
    }))
    const calcResult = calcEarliestLatest(pairs)
    // Staffia専用：勤務時間パターンが1つだけの場合、始業を1時間早め・終業を1時間遅らせて、
    // シフト制チェックを入れる（確定仕様）。パターンが2つ以上の場合（既に最早・最遅を計算済み）は対象外。
    let start = calcResult.start
    let end = calcResult.end
    let isShiftFlag = calcResult.isMultiple
    if (!calcResult.isMultiple && start && end) {
      start = shiftTimeByHours(start, -1)
      end = shiftTimeByHours(end, 1)
      isShiftFlag = true
    }
    // 業務内容1〜21を半角スペースで連結
    const businessParts = Array.from({ length: 21 }, (_, i) => raw[`業務内容${i + 1}`]).filter(Boolean)
    return {
      business: businessParts.length > 0 ? newlineToSpace(businessParts.join(' ')) : null,
      startTime: start,
      endTime: end,
      isShift: isShiftFlag,
      // 休憩時間：「休憩時間数」列（時間単位の小数）を分に変換して反映（確定仕様）
      breakTime: (raw['休憩時間数'] !== null && raw['休憩時間数'] !== undefined && raw['休憩時間数'] !== '') ? Math.round(Number(raw['休憩時間数']) * 60) : null,
      org: raw['就業先組織単位名'] || null,
      conflictDate: raw['事業所の抵触日'] ? normalizeDateSlash(raw['事業所の抵触日']) : null,
      conflictDateOrg: raw['抵触日'] ? normalizeDateSlash(raw['抵触日']) : null,
      // 業務に伴う責任の程度：CSVの「責任の程度」列は文章のため「無」「有」に判定できない。自動反映しない（確定仕様）
      responsibility: null,
      // 所定労働時間：「所定労働時間数」列（時間単位の小数）を時間・分に変換して反映（確定仕様）
      workingHoursH: (raw['所定労働時間数'] !== null && raw['所定労働時間数'] !== undefined && raw['所定労働時間数'] !== '') ? String(Math.floor(Number(raw['所定労働時間数']))) : null,
      workingHoursM: (raw['所定労働時間数'] !== null && raw['所定労働時間数'] !== undefined && raw['所定労働時間数'] !== '') ? String(Math.round((Number(raw['所定労働時間数']) % 1) * 60)).padStart(2, '0') : null,
      workDays: null,
      // 指揮命令者・派遣先責任者は1セット目（末尾が1の列）のみ使用（確定仕様）
      // 部署は「事業部名＋担当名」の結合（確定仕様）
      cmdName: raw['指揮命令者氏名1'] || null,
      cmdDept: joinDeptAndPerson(raw['指揮命令者事業部名1'], raw['指揮命令者担当名1']),
      cmdRole: raw['指揮命令者役職名1'] || null,
      cmdTel: formatTelHyphen(raw['指揮命令者電話番号1']),
      respName: raw['派遣先責任者氏名1'] || null,
      respDept: joinDeptAndPerson(raw['派遣先責任者事業部名1'], raw['派遣先責任者担当名1']),
      respRole: raw['派遣先責任者役職名1'] || null,
      respTel: formatTelHyphen(raw['派遣先責任者電話番号1']),
      compName: raw['派遣先苦情処理申出先氏名'] || null,
      compDept: joinDeptAndPerson(raw['派遣先苦情処理申出先事業部名'], raw['派遣先苦情処理申出先担当名']),
      compRole: raw['派遣先苦情処理申出先役職名'] || null,
      compTel: formatTelHyphen(raw['派遣先苦情処理申出先電話番号']),
      // 派遣元責任者（確定仕様：1セット目のみ使用。部署は「担当名1」を使用）
      mgrName: raw['派遣元責任者氏名1'] || null,
      mgrDept: raw['派遣元責任者担当名1'] || null,
      mgrRole: raw['派遣元責任者役職名1'] || null,
      mgrTel: formatTelHyphen(raw['派遣元責任者電話番号1']),
      // 苦情処理申出先（派遣元）（確定仕様：部署は「担当名」を使用）
      cmpName: raw['派遣元苦情処理申出先氏名'] || null,
      cmpDept: raw['派遣元苦情処理申出先担当名'] || null,
      cmpRole: raw['派遣元苦情処理申出先役職名'] || null,
      cmpTel: formatTelHyphen(raw['派遣元苦情処理申出先電話番号']),
      welfare: raw['その他福利厚生等'] || null,
      flexTime: raw['変形労働時間制適用有無'] || null, // Staffiaのみ「無」「有」がそのまま入っている
      overtime: raw['時間外労働有無'] || null,
      dispatchStart: raw['派遣開始日'] ? normalizeDateSlash(raw['派遣開始日']) : null,
      dispatchEnd: raw['派遣終了日'] ? normalizeDateSlash(raw['派遣終了日']) : null,
    }
  }

  return {}
}

// extractCsvFieldsRawの結果に対し、共通の後処理を行うラッパー
// 「役職」が空欄で、対応する氏名に値がある場合は「担当」を補完する（確定仕様：CSV反映に限る）
export const extractCsvFields = (system: string, raw: any) => {
  const fields = extractCsvFieldsRaw(system, raw) as Record<string, any>
  // [役職キー, 対応する氏名キー] のペア。氏名があるのに役職が空欄だと必須チェックで進めなくなるため、
  // その場合は「担当」をセットする（派遣先・派遣元の指揮命令者・責任者・苦情処理申出先すべてが対象）
  const roleNamePairs: Array<[string, string]> = [
    ['cmdRole', 'cmdName'], ['respRole', 'respName'], ['compRole', 'compName'],
    ['mgrRole', 'mgrName'], ['cmpRole', 'cmpName'],
  ]
  roleNamePairs.forEach(([roleKey, nameKey]) => {
    if (fields[nameKey] && !fields[roleKey]) {
      fields[roleKey] = '担当'
    }
  })
  return fields
}

// "2026/03/01" 等のスラッシュ区切り日付をYYYY-MM-DD形式に変換
export const normalizeDateSlash = (value: string): string | null => {
  if (!value) return null
  const str = String(value).trim()
  const m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// 改行コード（連続する改行・空行も含む）を1つの半角スペースに変換する
// （帳票レイアウトに反映する際、改行が残るとレイアウト崩れが起きるため。確定仕様）
export const newlineToSpace = (value: string | null | undefined): string | null => {
  if (!value) return null
  const result = String(value).replace(/[\r\n]+/g, ' ').trim()
  return result || null
}

// CSVから反映された電話番号にハイフンを自動で挿入する（簡易ルール。確定仕様：完全な市外局番判定は行わない）
// 11桁（070/080/090等の携帯電話）→ 3-4-4、10桁で03/06（東京・大阪）→ 2-4-4、10桁のその他→ 3-3-4
export const formatTelHyphen = (value: string | null | undefined): string | null => {
  if (!value) return null
  const digits = String(value).replace(/[^\d]/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) {
    if (digits.startsWith('03') || digits.startsWith('06')) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return String(value) // 想定外の桁数はそのまま返す（手入力で修正できる）
}

// Staffiaの「部署」表記：事業部名＋半角スペース＋担当名の結合（確定仕様）
export const joinDeptAndPerson = (dept: string | null | undefined, person: string | null | undefined): string | null => {
  const parts = [dept, person].map(v => (v || '').toString().trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}
