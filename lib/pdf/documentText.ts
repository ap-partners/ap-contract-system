// ===== 帳票（雇用契約書等）に印字する固定文言・整形ロジック =====
// docs/SYSTEM_DESIGN.md 7-1章の確定仕様、およびテンプレートExcel（契約書関連フォルダ）の
// セル内容・数式（J19〜J42等）から書き起こしたもの。2026-07-07実装。
//
// 注意：app/apply/page.tsx にも見た目確認用の類似ロジック（getRemarksText・trialPreview等）があるが、
// page.tsxは'use client'のクライアント専用コンポーネントのため、帳票生成（サーバー側API route）からは
// 独立してこちらに実装している。page.tsx側のロジックを変更した場合、内容が一致するかここも確認すること。

export const toJpDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ===== 退職・解雇（2026-07-07確定。SYSTEM_DESIGN.md 7-1章参照）=====
// アルバイトはこの項目自体を表示しない（呼び出し側でnullチェックすること）
export const getRetirementClause = (contractType: string): string | null => {
  if (contractType === '正社員') {
    return '①定年制：有（従業員の定年は選択定年制とし、定年日は満60歳から満65歳に達するまでの各月末日の内から従業員が選択できるものとする。）\n②自己都合退職の手続［退職する3ヶ月以上前に届け出、退職後速やかに貸与物を返却］\n③解雇事由及び手続（就業規則第8章その他関連する規程に従う）'
  }
  if (contractType === '有期契約' || contractType === '無期契約') {
    return '①定年制：有（従業員の定年は選択定年制とし、定年日は満60歳から満65歳に達するまでの各月末日の内から従業員が選択できるものとする。）\n②自己都合退職の手続［退職する30日以上前に届け出、退職後速やかに貸与物を返却］\n③解雇事由及び手続（契約社員就業規則第8章その他関連する規程に従う）'
  }
  return null // アルバイト等
}

// ===== 休日又は勤務休暇（テンプレートJ19〜J21。全パターン共通の固定文言）=====
export const HOLIDAY_CLAUSE_LINES: string[] = [
  '週休2日　シフト制　[１か月単位の変形労働時間制の場合]',
  '時間外は、36協定の範囲内で可能とする。(実働8時間を超える労働に関しては、時間外労働扱いとし、3時間/日、45時間/月、360時間/年の範囲内とする。）、休日労働は、1ヶ月に4日の範囲で命ずることができるものとする。',
  '年次有給休暇は6ヶ月継続勤務した場合年間付与',
]

// ===== 賃金支払方法（テンプレートJ26。固定文言）=====
export const WAGE_PAYMENT_TEXT =
  '銀行振込　［振込口座がみずほ銀行麹町支店またはりそな銀行グループ（支店不問）の場合は手数料無料とし、その他銀行の場合は振込手数料500円を必要とする。］\n賃金締切日　［　当月末日　］　/　賃金支払日　［　翌月25日　］'

// ===== 割増賃金率（テンプレートAJ25。固定文言）=====
export const OVERTIME_RATE_TEXT = '法定の割合に基づく。'

// ===== 賃金支払時の控除（テンプレートJ29ラベル＋R29）=====
// 2026-07-07修正：雇用保険・社会保険のどちらにも未加入の場合でも、源泉所得税は必ず発生するため
// 「なし」にはならない。以前は誤って空欄（呼び出し側で「なし」表示）になっていた実装バグを修正。
// app/apply/page.tsxのdeductionText（STEP8帳票プレビュー）と内容を一致させている。
export const getDeductionText = (hasEmployInsurance: boolean, hasSocialInsurance: boolean): string => {
  const items: string[] = []
  if (hasEmployInsurance) items.push('雇用保険')
  if (hasSocialInsurance) items.push('健康保険', '厚生年金')
  if (items.length === 0) return '[源泉所得税]'
  return `[社会保険料（${items.join('、')}）・源泉所得税]`
}

// ===== 各種保険（テンプレートJ34）=====
// 労災保険は全従業員共通で加入するため常に含める。雇用保険・社会保険の有無に応じて追加。
export const getInsuranceLine = (hasEmployInsurance: boolean, hasSocialInsurance: boolean): string => {
  const items = ['労災保険']
  if (hasSocialInsurance) items.push('健康保険', '厚生年金')
  if (hasEmployInsurance) items.push('雇用保険')
  return items.join(' / ')
}

// ===== 試用期間（テンプレートJ35〜J39の数式を書き起こし。page.tsxのtrialPreviewと同内容）=====
export const getTrialText = (trialPeriod: string, trialStart: string, trialEnd: string): string => {
  if (trialPeriod !== '有' || !trialStart || !trialEnd) {
    return '試用期間：　無'
  }
  return `試用期間：　有\n試用期間：${toJpDate(trialStart)}〜${toJpDate(trialEnd)}まで　（試用期間延長の場合は、その2週間前までに通知します）\n試用期間満了後の本採用は次のいずれかにより判断します。\n①試用期間満了時の業務量　②従事している業務の進捗状況　③能力、勤務成績、勤務態度　④健康状態、⑤職務への適正性その他就業規則上の規定基準\n試用期間開始日より14日経過後の本採用拒否の場合は、少なくとも本採用拒否退職の30日前に通知します。`
}

// ===== 備考・その他（テンプレートJ40〜J42。app/apply/page.tsxのgetRemarksTextと同内容）=====
const FIXED_REMARKS_SUFFIX = '上記以外の事項については、当社就業規則及び賃金規定による。手当はクライアント規定により支払うものとする。'

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

// ===== 交通費（テンプレートJ30。app/apply/page.tsxのTRANSPORT_TYPES.previewから、
// 先頭のラベル行を除いた本文部分のみを使う） =====
const TRANSPORT_BODY_TEXT: Record<string, string> = {
  default: '原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  included: '基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。',
  // 2026-07-07修正：「12円 / km 】」のように閉じ括弧の直前に空白があると、そこが改行可能な
  // 箇所とみなされ「】」だけが次の行の先頭に取り残されて見えることがあったため、空白を削除。
  gas: '私有車通勤：ガソリン代支給　【 12円 / km】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  'pass-gas': '定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③エビデンスの提出確認が取れない交通費は支払い対象外とする。⑤私有車通勤については別途私有車通勤を許可する書面を提出し、規定を遵守すること。',
}

export const getTransportText = (transportType: string): string => {
  return TRANSPORT_BODY_TEXT[transportType] || TRANSPORT_BODY_TEXT.default
}

// ===== 交通費の補足注記（テンプレートJ31。VLOOKUP(C88,B99:AT100,13,0)を書き起こし）=====
// 2026-07-07発見・追加：「実費または定期代」「定期代＋ガソリン代支給」の場合のみ、
// 交通費本文の下にもう1行、勤務日数に応じた注記が付く。以前の実装ではこの行が漏れていた。
const TRANSPORT_SECONDARY_NOTE = '15日以上の勤務日数の場合は定期代支給とする。これに満たない勤務日数の場合、実費支給とする。'
export const getTransportSecondaryNote = (transportType: string): string => {
  return (transportType === 'default' || transportType === 'pass-gas') ? TRANSPORT_SECONDARY_NOTE : ''
}

// ===== 所定労働日数の帳票表示文言（2026-07-07追加。過去のトーク履歴で確定していた変換ルール）=====
// STEP2の選択肢「週5日」「週4日」「週3日」「その他（自由入力）」のうち、
// 「週5日」を選んだ場合だけ、帳票上は選択値そのままではなく決まった文言に変換する。
// 週4日・週3日・その他はそのまま表示（変換なし）。
export const getWorkDaysText = (workDays: string, workDaysOther: string): string => {
  if (workDays === '週5日') return '概ね、週5日とし、勤務日は就業規則第3章および勤務シフトによる'
  if (workDays === 'other') return workDaysOther || '―'
  return workDays || '―'
}

// ===== 自社住所（会社側署名欄。テンプレートE47/E48セルを書き起こし）=====
// 2026-07-07発見・追加：会社名の上に自社住所を表示する行があり、以前の実装では抜けていた。
// 【暫定】本社住所を固定で表示している。伊藤さん確認済み：営業所ごとに住所が異なるため、
// 本来は部門→拠点住所のマスタが必要（2026-07-07時点でまだ存在しない・新規に決める必要がある。
// docs/SYSTEM_DESIGN.md 9章PENDING参照）。マスタ整備までの暫定表示として本社住所を使う。
export const COMPANY_HQ_ADDRESS_LINES = ['東京都新宿区新宿2-16-20', '新宿通東洋ビル10F']

// ===== 始業・終業・休憩・所定労働時間の表示整形 =====
export const formatHoursMinutes = (h: string | number | null | undefined, m: string | number | null | undefined): string => {
  const hh = Number(h) || 0
  const mm = Number(m) || 0
  if (hh === 0 && mm === 0) return '―'
  return mm > 0 ? `${hh}時間${mm}分` : `${hh}時間`
}

export const formatMinutes = (minutes: string | number | null | undefined): string => {
  const n = Number(minutes)
  if (!n) return '―'
  return `${n}分`
}

export const formatSalaryType = (salaryType: string): string => (salaryType ? `${salaryType}制` : '―')

export const formatYen = (amount: string | number | null | undefined): string => {
  const n = Number(amount)
  if (!n) return '―'
  return `${n.toLocaleString()}円`
}
