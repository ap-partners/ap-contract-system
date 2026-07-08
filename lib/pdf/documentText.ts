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

// ===== 休日又は勤務休暇（テンプレートJ19〜J21）=====
// 2026-07-07修正：1行目「週休2日　シフト制　[１か月単位の変形労働時間制の場合]」が
// 所定労働日数（週5日／週4日／週3日／その他フリー入力）の実際の選択値に関わらず固定表示に
// なっており、労基法15条・労基則5条1項1号の2（休日の明示義務）に照らして不正確だった。
// また「[１か月単位の変形労働時間制の場合]」は変形労働時間制ボックス（始業・終業時刻欄の下、
// 休憩時間の右）で別途明示するようになったため、この行に重ねて残す必要がなくなった
// （残していると「無」を選んだ契約でもこの注記だけ残るという矛盾が生じるバグがあった）。
// 伊藤さん確認済みの変換ルール（2026-07-07決定）：
//   週5日 → 週休2日 / 週4日 → 週休3日 / 週3日 → 週休4日
//   その他（フリー入力）に「週N日」という記載がある場合（週1日・週2日等）→ 週休(7-N)日に自動変換
//   それ以外のフリー入力（例：「18日」「カレンダー暦通り」）→ 週n日形式に機械変換できないため「所定労働日数による」
//   シフト制（isShift）が有効な場合は末尾に「（勤務シフトによる）」を付記
export const getHolidayClauseLine1 = (
  workDays: string,
  workDaysOther: string,
  isShift: boolean
): string => {
  let base: string
  if (workDays === '週5日') {
    base = '週休2日'
  } else if (workDays === '週4日') {
    base = '週休3日'
  } else if (workDays === '週3日') {
    base = '週休4日'
  } else {
    // その他（フリー入力）：「週N日」という記載（全角・半角数字どちらも対応）があれば
    // 7-Nで週休日数に変換する。週1日〜週6日まで対応（週7日は休日ゼロになり得ないため対象外）。
    const text = (workDaysOther || '').trim()
    const normalized = text.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    const m = normalized.match(/週\s*([1-6])\s*日/)
    if (m) {
      const workDaysNum = Number(m[1])
      base = `週休${7 - workDaysNum}日`
    } else {
      base = '所定労働日数による'
    }
  }
  return isShift ? `${base}（勤務シフトによる）` : base
}

// 2026-07-07修正：折り返し任せだと「3時間/日」の「3」の直前で改行され読みづらかったため、
// 伊藤さん指定の3行（「時間外労働扱いとし、」「1ヶ月に4日の範囲で」の直後）で明示的に改行する。
export const HOLIDAY_CLAUSE_LINES_FIXED: string[] = [
  '時間外は、36協定の範囲内で可能とする。(実働8時間を超える労働に関しては、時間外労働扱いとし、\n3時間/日、45時間/月、360時間/年の範囲内とする。）、休日労働は、1ヶ月に4日の範囲で\n命ずることができるものとする。',
  '年次有給休暇は6ヶ月継続勤務した場合年間付与',
]

// ===== 賃金支払方法（テンプレートJ26。固定文言）=====
// 2026-07-07修正：折り返し任せだと読みづらい位置で改行されていたため、
// 「手数料無料とし、」の直後で明示的に改行する。
export const WAGE_PAYMENT_TEXT =
  '銀行振込　［振込口座がみずほ銀行麹町支店またはりそな銀行グループ（支店不問）の場合は手数料無料とし、\nその他銀行の場合は振込手数料500円を必要とする。］\n賃金締切日　［　当月末日　］　/　賃金支払日　［　翌月25日　］'

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
  // 2026-07-07修正：「12円 / km 】」のように閉じ括弧の直前に空白があると、そこが改行可能な
  // 箇所とみなされ「】」だけが次の行の先頭に取り残されて見えることがあったため、空白を削除。
  gas: '私有車通勤：ガソリン代支給　【 12円 / km】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  // 2026-07-07修正：①「【】」見出し部分のあとが全角スペースのみで、自然な折り返し任せに
  // なっていたため、gasパターンと同様に明示的な改行を入れた。②番号が①②③⑤と④が抜けていた
  // 誤字を④に修正。③「②支払上限は3万円/月とする。」の直後と「④私有車通勤については」の直前で
  // 折り返し任せだと読みづらい位置（「③」だけが行頭に取り残される等）で改行されていたため、
  // 伊藤さん指定の位置（②の直後、④の直前）で明示的に改行する。
  'pass-gas': '定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km】\n①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。\n③エビデンスの提出確認が取れない交通費は支払い対象外とする。④私有車通勤については\n別途私有車通勤を許可する書面を提出し、規定を遵守すること。',
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

// ===== 変形労働時間制ボックスの表示文言（2026-07-07追加。伊藤さん確認済み）=====
// 労基法32条の2（1ヶ月単位の変形労働時間制）が要求する「対象期間の起算日」「平均して
// 1週40時間を超えないこと」の明示に対応するため、「有」の場合はこの定型注記を右側に付す。
// 2026-07-07追加：注記部分（(毎月1日を起算日とし...)）は本文より1ポイント小さいフォントで
// 表示したいとの指示のため、「有」本体と注記を分けて取得できるようにする
// （EmploymentContractPdf.tsx側でネストしたTextに分けてフォントサイズを変える）。
export const getFlexTimeText = (flexTime: string): string => {
  if (flexTime !== '有') return flexTime || '―'
  return '有'
}
const FLEX_TIME_NOTE = '(毎月1日を起算日とし、1ヶ月を平均して1週あたり40時間を超えないものとする。)'
export const getFlexTimeNote = (flexTime: string): string => {
  return flexTime === '有' ? FLEX_TIME_NOTE : ''
}

// ===== 自社住所（会社側署名欄。テンプレートE47/E48セルを書き起こし）=====
// 2026-07-07発見・追加：会社名の上に自社住所を表示する行があり、以前の実装では抜けていた。
// 【暫定】本社住所を固定で表示している。伊藤さん確認済み：営業所ごとに住所が異なるため、
// 本来は部門→拠点住所のマスタが必要（2026-07-07時点でまだ存在しない・新規に決める必要がある。
// docs/SYSTEM_DESIGN.md 9章PENDING参照）。マスタ整備までの暫定表示として本社住所を使う。
// 2026-07-08修正：就業条件明示書のExcelテンプレート実物との突き合わせで住所の誤りが判明し、
// 伊藤さんに正しい住所を確認済み（「2-16-20」→「2-6-4」、「10F」→「10階」表記に訂正）。
export const COMPANY_HQ_ADDRESS_LINES = ['東京都新宿区新宿2-6-4', '新宿通東洋ビル10階']

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

// ===== 以下、就業条件明示書（パターンB）・兼用版（パターンC）用の固定文言 =====
// 2026-07-08追加。契約書関連フォルダの「就業条件明示書_有期.xlsx」のセル内容から書き起こし。

// ===== 抵触日に関する注記（テンプレートJ18・固定文言）=====
export const CONFLICT_DATE_NOTICE_TEXT =
  '派遣先の事業所における派遣可能期間の延長について、当該手続を適正に行っていない場合や派遣労働者\n個人単位の期間制限を超えて労働者派遣の役務の提供を受けた場合は、派遣先は労働契約申し込み\nみなし制度の対象となる。'

// ===== 苦情処理内容（テンプレートJ35・固定文言）=====
export const COMPLAINT_HANDLING_TEXT =
  '苦情については、派遣先・派遣元が連携し誠意をもって適切かつ迅速に処理するものとし、\nその結果について必ず労働者に通知する事とする。'

// ===== 派遣契約解除の場合の措置（テンプレートJ40・固定文言）=====
export const DISPATCH_CANCEL_MEASURES_TEXT =
  '①派遣先事情により派遣契約を中途解除する場合、派遣先はその１ヶ月前迄に派遣元へ文書で通知・協議し\n決定する。又、派遣先は派遣期間の残余期間、派遣料金を勘案し、派遣契約中途解除に伴う損害を賠償する。\n②派遣先は、派遣契約を中途解除しようとする場合であって、派遣元から請求があった時は、派遣契約中途\n解除の理由を派遣元に明らかにすることとする。③派遣契約中途解除に際し、派遣先及び派遣元は中途\n解除にかかる派遣労働者の新たな就業機会の確保に努め、これができない場合には、少なくとも当該派遣\n労働者に生じた損害である休業手当、解雇予告手当等の額以上の損害の賠償を行うこととする。'

// ===== 協定対象派遣労働者であるか否か（テンプレートJ43＋V43の数式を書き起こし）=====
// 労使協定の有効期間の終了日：派遣終了日の月が3月以前ならその年の3月31日、4月以降なら翌年の3月31日
export const getAgreementLaborText = (dispatchEnd: string | null | undefined): string => {
  const base = '協定対象派遣労働者で 【　ある　】'
  if (!dispatchEnd) return base
  const d = new Date(dispatchEnd)
  if (Number.isNaN(d.getTime())) return base
  const endYear = d.getMonth() + 1 <= 3 ? d.getFullYear() : d.getFullYear() + 1
  return `${base}\n労使協定の有効期間の終了日　　【　${endYear}年3月31日　】`
}

// ===== 契約更新の有無・基準・無期転換（兼用版パターンCのみ・テンプレートJ58〜J62固定文言）=====
// 2026-07-08追加。有期・無期どちらのExcelテンプレートにも同一文言で存在するため、
// contractTypeによる出し分けは行わず常に固定表示とする（元のExcelの誤字「いずかれ」は「いずれか」に訂正）。
// 「契約更新上限の有無」欄は現状STEP screensに対応する入力項目が無いため、Excel既定値の
// 「無」を固定表示する（将来、更新回数上限・通算契約期間の入力項目を追加する場合はここを拡張する。
// docs/SYSTEM_DESIGN.md 9章PENDING参照）。
export const CONTRACT_RENEWAL_TEXT =
  '契約の更新は次のいずれかにより判断します。\n①契約期間満了時の業務量　②従事している業務の進捗状況　③能力、勤務成績、勤務態度　④会社の経営状況\n契約期間満了で終了の場合は、少なくとも契約終了の３０日前に通知します。\n契約更新上限の有無（　無　・　有(更新回数上限または通算契約期間：　　　　　　　　　　　　)）\n労働契約法18条に基づく無期転換申込権については、権利発生する契約更新時にその条件と併せて明示する。'

// ===== 当該事業所における労働者派遣料金額の平均額（就業条件明示書・兼用版共通）=====
// 2026-07-08追加・同日仕様確定（伊藤さん確認済み）。
// 表示形式は「【営業所名】　◯,◯◯◯円/日」。営業所名・金額は自社の部門マスタ（department_master）と
// 新設した年度別マスタ（dispatch_fee_master）から導出する。値の取得・整形はサーバー側
// （app/api/contracts/[id]/pdf/route.ts）で行い、ここでは整形ロジックのみを持つ。

// 自社の部署名（department_master.dept_name）から表示用の「営業所名」を判定する。
// ルール（2026-07-08伊藤さん確認済み）：
//   ①dept_nameに「営業所」または「支社」を含む場合→そのまま使用（末尾の「（内勤）」は除いて判定）
//   ②それ以外（全社／本社／SP営業部／HRソリューション営業部／SP1課／SP2課／CS課／広域本部／
//     北日本営業部／西日本営業部／事業開発部／デジタルマーケティング部／営業支援事務局／
//     IT部（＝伊藤さんの言う「システム開発課」に相当）／管理部／管理課／法務部 法務課／営業開発課）
//     →「本社」
export const getOfficeName = (deptName: string | null | undefined): string => {
  if (!deptName) return '本社'
  const base = deptName.replace(/（内勤）$/, '').trim()
  if (base.includes('営業所') || base.includes('支社')) return base
  return '本社'
}

// 2026-07-08再修正：伊藤さんよりExcel実物（就業条件明示書_有期.xlsx）の該当箇所の
// スクリーンショットを提示いただき、独立した項目行ではなく「備考／その他」セルの2行目に
// 同じセル内で続けて表示される文言だったと判明（見た目上も項目名を新設していたのは誤り）。
// 表記も「【営業所名】」ではなく、Excel実物の通り括弧無し・全角スペース区切りに訂正。
// 呼び出し側（EmploymentConditionsPdf.tsx／EmploymentContractAndConditionsPdf.tsx）で
// 備考・その他の本文に改行して連結する形に変更したため、この関数は「備考欄に追記する1行分の文言」を返す。
export const getDispatchFeeAvgText = (
  officeName: string | null | undefined,
  amountPerDay: number | null | undefined,
  fiscalYearLabel: string | null | undefined
): string => {
  const yearLabel = fiscalYearLabel || 'R6'
  const prefix = `当該事業所における労働者派遣料金額の平均額(${yearLabel}年度実績)：　　`
  if (!officeName || amountPerDay === null || amountPerDay === undefined) {
    return `${prefix}―`
  }
  return `${prefix}${officeName}　　${amountPerDay.toLocaleString()}円/日`
}

// ===== 抵触日欄の表示文言（パターンB・C共通・テンプレートP16/P17固定文言）=====
// 2026-07-08発見・追加：就業条件明示書_無期.xlsx／雇用契約書(兼)就業条件明示書_無期.xlsxの
// 抵触日欄（事業所単位・組織単位とも）には、無期契約時「無期雇用派遣のため該当しない」という
// 固定文言が入ることが判明（有期版は空欄=日付欄）。STEP8のisConflictDateExempt
// （app/apply/page.tsx）と同じ判定基準（無期契約・正社員は対象外）に合わせる。
export const getConflictDateText = (contractType: string, dateStr: string | null | undefined): string => {
  if (contractType === '無期契約' || contractType === '正社員') {
    return '無期雇用派遣のため該当しない'
  }
  return toJpDate(dateStr) || '―'
}
