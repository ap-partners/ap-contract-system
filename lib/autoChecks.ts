// ===== 自動チェック機能（SYSTEM_DESIGN.md 7-5章）の判定ロジック本体 =====
// 申請保存時（/apply の handleSubmitContract）に呼び出し、結果を
// contracts.auto_check_results（詳細）・contracts.warning_level（none/yellow/red）に保存する。
// 2026-07-06 実装。

export type WarningLevel = 'none' | 'yellow' | 'red'

export interface AutoCheckResult {
  type: string
  level: 'yellow' | 'red'
  message: string
}

export interface MinimumWageRow {
  dept_no: number
  hourly_wage: number
  effective_from: string // YYYY-MM-DD
}

// 最低賃金マスタ（minimum_wage_master。department_masterとは別のテーブル）に、対象部門の登録が1件も無いかどうか。
// 7-5章の例外規定：「最低賃金マスタに登録が無い場合のみ、申請不可（強制ブロック）」。
// 対象は勤務地が「現場」の場合のみ（「社内」は最低賃金チェック自体の対象外のため呼び出し不要）。
export function isMinimumWageMasterMissing(
  allRows: MinimumWageRow[],
  deptNo: number | null | undefined
): boolean {
  if (deptNo === null || deptNo === undefined) return false // 部門が特定できないケースは別途ハンドリング（ここではブロックしない）
  return !allRows.some(r => r.dept_no === deptNo)
}

const diffDays = (dateA: string, dateB: string) => {
  const a = new Date(dateA + 'T00:00:00').getTime()
  const b = new Date(dateB + 'T00:00:00').getTime()
  return Math.round((a - b) / (1000 * 60 * 60 * 24))
}

export interface AutoCheckInput {
  workPlace: string // '現場' | '社内'
  contractType: string // '有期契約' | '無期契約' | '正社員' | 'アルバイト'
  salaryType: string // '時給' | '日給' | '月給'
  basicSalary: number
  overtimePay: number
  hasEmployInsurance: boolean
  hasSocialInsurance: boolean
  workingHoursH: number
  workingHoursM: number
  monthlyStandardHours: number | null
  deptNo: number | null
  staffHiredAt: string | null // staff.hired_at（YYYY-MM-DD）
  employStart: string
  employEnd: string
  contractStartDate: string // 無期契約・正社員は雇用期間ではなくこちら（契約条件適用開始日）を使う
  dispatchStart: string
  dispatchEnd: string
  trialPeriod: string // '有' | '無' | ''
  minimumWageRowsForDept: MinimumWageRow[] // 対象部門の行のみに絞り込んだもの
}

// ① 金額チェック（異常値検出）※7-5章の表より。定額残業代の異常値チェックは対象外（2026-07-06 伊藤さん確認：不要と判断）
function checkAmountAnomaly(input: AutoCheckInput): AutoCheckResult | null {
  const { salaryType, basicSalary } = input
  if (salaryType === '時給') {
    if (basicSalary < 1500 || basicSalary > 5000) {
      return { type: 'amount_anomaly_hourly', level: 'red', message: `時給として入力された金額（${basicSalary.toLocaleString()}円）が、通常の範囲（1,500円〜5,000円）から外れています。入力ミスがないかご確認ください。` }
    }
  } else if (salaryType === '日給') {
    if (basicSalary < 8000 || basicSalary > 50000) {
      return { type: 'amount_anomaly_daily', level: 'red', message: `日給として入力された金額（${basicSalary.toLocaleString()}円）が、通常の範囲（8,000円〜50,000円）から外れています。入力ミスがないかご確認ください。` }
    }
  } else if (salaryType === '月給') {
    if (basicSalary < 150000 || basicSalary > 800000) {
      return { type: 'amount_anomaly_monthly', level: 'red', message: `月給として入力された金額（${basicSalary.toLocaleString()}円）が、通常の範囲（150,000円〜800,000円）から外れています。入力ミスがないかご確認ください。` }
    }
  }
  return null
}

// ② 最低賃金チェック（現場のみ・部門×適用開始日単位）
// 2026-07-07決定：雇用期間中に最低賃金の改定をまたぐ場合、改定後（＝雇用期間中で最も適用開始日が新しいもの）の
// 金額1本でチェックするシンプルな設計に変更。最低賃金は下がることを想定しないため、最新の基準を満たしていれば
// それより前の期間も自動的に満たしている、という考え方（過去の「区間ごとに別々にチェック」という設計から変更）。
function checkMinimumWage(input: AutoCheckInput): AutoCheckResult[] {
  const results: AutoCheckResult[] = []
  if (input.workPlace !== '現場') return results // 社内は対象外（2026-07-03最終決定）
  if (input.minimumWageRowsForDept.length === 0) return results // STEP1で強制ブロック済みのはずだが念のため

  // 時給換算した金額を算出
  let hourlyEquivalent: number | null = null
  if (input.salaryType === '時給') {
    hourlyEquivalent = input.basicSalary
  } else if (input.salaryType === '日給') {
    const dailyHours = input.workingHoursH + input.workingHoursM / 60
    if (dailyHours > 0) hourlyEquivalent = input.basicSalary / dailyHours
  } else if (input.salaryType === '月給') {
    if (input.monthlyStandardHours && input.monthlyStandardHours > 0) {
      hourlyEquivalent = input.basicSalary / input.monthlyStandardHours
    }
  }
  if (hourlyEquivalent === null) return results // 換算できない場合は判定不能のためスキップ

  // 無期契約・正社員は雇用期間（employStart/employEnd）を使わず、契約条件適用開始日（contractStartDate）を使う仕様のため、
  // こちらが空の場合のフォールバックとして必ず含める（2026-07-07修正：この考慮漏れで正社員の最低賃金チェックが常にスキップされていた）
  const periodEnd = input.employEnd || input.employStart || input.contractStartDate || null
  if (!periodEnd) return results

  // 雇用期間の終了日までに適用開始済みの行の中から、最も新しい（＝適用開始日が最も遅い）行を採用する。
  // 該当する行が無い場合（雇用期間の終了日より後にしか改定が無い＝マスタ登録より前の契約等）は、
  // 登録されている中で最も古い行を代わりに使う（判定不能で見逃すより、既知の中で最も近い基準で判定する方針）。
  const applicableRows = input.minimumWageRowsForDept.filter(r => r.effective_from <= periodEnd)
  const targetRow = applicableRows.length > 0
    ? applicableRows.reduce((latest, r) => r.effective_from > latest.effective_from ? r : latest)
    : input.minimumWageRowsForDept.reduce((earliest, r) => r.effective_from < earliest.effective_from ? r : earliest)

  if (hourlyEquivalent < targetRow.hourly_wage) {
    results.push({
      type: 'minimum_wage_violation',
      level: 'red',
      message: `${targetRow.effective_from}時点の最低賃金（時給${targetRow.hourly_wage.toLocaleString()}円）に対して、入力内容の時給換算額（約${Math.floor(hourlyEquivalent).toLocaleString()}円）が下回っています。`,
    })
  }

  return results
}

// ③ 就業規則との整合チェック（7-5章の表より。定額残業代の異常値チェック分の重複は除く）
function checkWorkRules(input: AutoCheckInput): AutoCheckResult[] {
  const results: AutoCheckResult[] = []
  const { contractType, employStart, employEnd, dispatchEnd, trialPeriod, salaryType, overtimePay, hasEmployInsurance, hasSocialInsurance, staffHiredAt } = input

  // 1. 試用期間：新規入社（staff.hired_at = 雇用開始日）なのに試用期間「なし」
  //    アルバイトは「試用期間不要（有期契約と同じ扱い）」と決定済みのため対象外（2026-07-02決定）
  if (contractType !== 'アルバイト' && staffHiredAt && employStart && staffHiredAt === employStart && trialPeriod === '無') {
    results.push({
      type: 'no_trial_new_hire',
      level: 'yellow',
      message: '新規入社（入社日＝雇用開始日）なのに、試用期間が「なし」に設定されています。契約社員第8条・正社員第13条により、原則として試用期間を設けることになっています。',
    })
  }

  // 2. 雇用期間：有期契約なのに終了日が空欄（現状のSTEP5バリデーションで既に必須化されているため通常は発生しない防御的チェック）
  if ((contractType === '有期契約' || contractType === 'アルバイト') && employStart && !employEnd) {
    results.push({
      type: 'fixed_term_no_end_date',
      level: 'yellow',
      message: '有期契約なのに雇用期間の終了日が入力されていません。契約社員第7条に基づき、終了日を確認してください。',
    })
  }

  // 3. 雇用期間の上限：有期契約の期間が1年超
  if ((contractType === '有期契約' || contractType === 'アルバイト') && employStart && employEnd && diffDays(employEnd, employStart) > 366) {
    results.push({
      type: 'fixed_term_over_1year',
      level: 'yellow',
      message: '有期契約の雇用期間が1年を超えています。就業規則第3条により、雇用期間は原則1年以内と定められています。',
    })
  }

  // 4. 社会保険：月給者なのに全未加入
  if (salaryType === '月給' && !hasEmployInsurance && !hasSocialInsurance) {
    results.push({
      type: 'insurance_all_none',
      level: 'yellow',
      message: '月給者ですが、雇用保険・社会保険のいずれも未加入に設定されています。契約社員第10条により、月給者は社会保険への加入が原則です。',
    })
  }

  // 5. 定額残業代：月給以外で定額残業代が設定されている
  if (salaryType !== '月給' && overtimePay > 0) {
    results.push({
      type: 'overtime_allowance_not_monthly',
      level: 'yellow',
      message: '時給・日給の契約で定額残業代が設定されています。定額残業代は月給者向けの制度のため、設定内容をご確認ください。',
    })
  }

  // 6. 雇用期間と派遣期間：雇用期間が派遣期間より短い（現状のSTEP5バリデーションで一致必須のため通常は発生しない防御的チェック）
  if (employEnd && dispatchEnd && employEnd < dispatchEnd) {
    results.push({
      type: 'employ_period_shorter_than_dispatch',
      level: 'yellow',
      message: '雇用期間の終了日が、派遣期間の終了日より前になっています。内容に矛盾がないかご確認ください。',
    })
  }

  return results
}

export function runAutoChecks(input: AutoCheckInput): { results: AutoCheckResult[]; overallLevel: WarningLevel } {
  const results: AutoCheckResult[] = []

  const amount = checkAmountAnomaly(input)
  if (amount) results.push(amount)

  results.push(...checkMinimumWage(input))
  results.push(...checkWorkRules(input))

  const overallLevel: WarningLevel = results.some(r => r.level === 'red')
    ? 'red'
    : results.some(r => r.level === 'yellow')
      ? 'yellow'
      : 'none'

  return { results, overallLevel }
}
