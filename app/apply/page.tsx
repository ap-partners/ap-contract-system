'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { runAutoChecks, isMinimumWageMasterMissing, type MinimumWageRow } from '@/lib/autoChecks'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  getDocumentTypes, getFullDocumentName, getPattern,
  STEPS_A, STEPS_B, STEPS_C, STEP_SUB, STEP_DESC,
  DEFAULT_SAFETY, DEFAULT_CONFLICT, CLOSING_PATTERNS, FIXED_REMARKS_SUFFIX,
  getRemarksText, needsBonusSelection,
  TRANSPORT_TYPES, SALARY_RULES, TOOLTIPS,
  inp, inpDate, deptInputStyle,
  normalizeTel, validateTel, calcTrialMonths, toJpDate, isDateBefore, diffDaysAbs,
  padTwoDigits, toHalfWidthDigits, parseAmount,
  normalizeTimeStr, calcEarliestLatest, shiftTimeByHours,
  type DiffPart, computeCharDiff,
  extractResponsibilityFromWinworks, buildWelfareTextFromEstaffing, buildWelfareTextFromHRstation,
  numToYesNo, extractCsvFieldsRaw, extractCsvFields, normalizeDateSlash, newlineToSpace,
  formatTelHyphen, joinDeptAndPerson,
} from './_lib/helpers'
import {
  DiffText, Req, AutoBadge, Tooltip, FormRow, EmptyHintBubble, FormRowAuto,
  SectionHeader, FinalSection, FinalGroupHeader, FinalRow, ModeToggle,
  NoBreakTextarea, TelInput, RadioGroup, CriticalWarning, SearchInput,
} from './_components/FormParts'
import { buildMergedFields } from '@/app/dashboard/_shared/renewalFieldMap'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'
import StepSourceContact from './_components/StepSourceContact'
import StepDispatchContact from './_components/StepDispatchContact'
import StepContractCondition from './_components/StepContractCondition'
import StepPeriod from './_components/StepPeriod'
import StepSalary from './_components/StepSalary'
import StepBasic from './_components/StepBasic'
import StepWorkInfo from './_components/StepWorkInfo'
import StepFinalCheck from './_components/StepFinalCheck'


function ApplyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editContractId = searchParams.get('edit') // 再申請モード：/apply?edit=契約ID で開いた場合の契約ID
  const [editLoading, setEditLoading] = useState(!!editContractId)
  const [editNotFound, setEditNotFound] = useState(false)
  // 2026-07-17追加（更新期限管理タブ・チャットD・⑤個別申請）：/apply?renewal=renewal_candidatesのID
  // で開いた場合の、原契約プリフィル＋最終確認（STEP8）直行モード。差し戻し再申請（editContractId）
  // とは別物で、真新しい申請として最後にinsertされる（updateではない）。
  const renewalCandidateId = searchParams.get('renewal')
  const [renewalLoading, setRenewalLoading] = useState(!!renewalCandidateId)
  const [renewalNotFound, setRenewalNotFound] = useState(false)
  const [user, setUser] = useState<any>(null)
  // STEP1スタッフ検索の自部門制限用：担当営業自身の部門番号。
  // undefined=まだ取得していない／null=担当営業だが部門が特定できない（staffテーブルに一致行なし）
  // （2026-07-14〜 [DECISION]：制限対象は担当営業ロールのみ。SSC・管理部は横断的な代理申請・確認業務を
  //   担うため、従来通り全部門のスタッフを検索できる。docs/SYSTEM_DESIGN.md 10章参照）
  const [myDeptNo, setMyDeptNo] = useState<any>(undefined)
  const [currentStep, setCurrentStep] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  // 総合レビュー指摘25対応（2026-07-17）：自部門情報が読み込み中／未登録で検索を止めた場合に、
  // 「該当なし」（実際に検索した結果0件）と誤認させないための区別用フラグ。
  const [searchBlockedReason, setSearchBlockedReason] = useState<null | 'loading' | 'no_dept'>(null)
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [contractType, setContractType] = useState('')
  // スタッフマスタの雇用区分が自動反映されている場合、変更不可にする（確定仕様）
  const isContractTypeLocked = !!(selectedStaff && ['アルバイト', '有期契約', '無期契約', '正社員'].includes(selectedStaff.contract_type))
  const [showContractTypeLockedMsg, setShowContractTypeLockedMsg] = useState(false)
  const [workPlace, setWorkPlace] = useState('現場')
  const [documentType, setDocumentType] = useState('')

  const pattern = getPattern(documentType)
  // アルバイトは雇用期間・試用期間まわりのバリデーションを有期契約と同じ扱いにする（表示用の帳票名ラベルは別途getFullDocumentName側で「アルバイト」と表示する）
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : contractType === 'アルバイト' ? '有期' : ''
  // 抵触日が不要な雇用区分（無期雇用派遣・正社員は「該当しない」扱い。アルバイトは有期契約と同じく対象）
  const isConflictDateExempt = contractType === '無期契約' || contractType === '正社員'
  const fullDocumentName = getFullDocumentName(documentType, contractType)
  const steps = pattern === 'A' ? STEPS_A : pattern === 'B' ? STEPS_B : pattern === 'C' ? STEPS_C : STEPS_A

  // STEP2
  const [showStepDesc, setShowStepDesc] = useState(false)
  const [csvMode, setCsvMode] = useState<'csv' | 'manual'>('manual')
  const [csvSystem, setCsvSystem] = useState('e-staffing')
  const [csvDispatchStart, setCsvDispatchStart] = useState('')
  const [csvSearched, setCsvSearched] = useState(false)
  const [csvResults, setCsvResults] = useState<any[]>([])
  const [csvNoResults, setCsvNoResults] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvSelectedId, setCsvSelectedId] = useState<number | null>(null)
  const [csvRequestSent, setCsvRequestSent] = useState(false)
  const [csvRequestSubmitting, setCsvRequestSubmitting] = useState(false)
  const [csvRequestError, setCsvRequestError] = useState('')
  // CSVインポート依頼（STEP2・単独）で管理部に伝える就業場所名（2026-07-14追加。
  // 従来この依頼には就業場所名を入力する欄自体が無く、一覧側で就業先が常に空欄になっていた）
  const [csvRequestWorkLocation, setCsvRequestWorkLocation] = useState('')
  const [workLocationName, setWorkLocationName] = useState('')
  const [workLocationAddress, setWorkLocationAddress] = useState('')
  const [workLocationTel, setWorkLocationTel] = useState('')
  const [businessContent, setBusinessContent] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isShift, setIsShift] = useState(false)
  const [breakTime, setBreakTime] = useState('')
  const [workingHoursH, setWorkingHoursH] = useState('')
  const [workingHoursM, setWorkingHoursM] = useState('')
  const [workDays, setWorkDays] = useState('')
  const [workDaysOther, setWorkDaysOther] = useState('')
  const [organizationUnit, setOrganizationUnit] = useState('')
  const [conflictDate, setConflictDate] = useState('')
  const [responsibility, setResponsibility] = useState('')
  // CSV反映バッジ管理
  const [csvBadges, setCsvBadges] = useState<Record<string, 'none' | 'reflected' | 'modified'>>({})
  // CSV反映バッジ（修正済み）判定用：CSVから反映された時点の値のスナップショット
  // 現在値とこのスナップショットを比較し、一致していれば「CSV反映」、異なれば「CSV反映（修正済み）」と判定する
  // （元に戻せば自動的に「CSV反映」表示に戻る。派遣元側のmasterSnapshotと同じ仕組み）
  const [csvSnapshot, setCsvSnapshot] = useState<Record<string, string>>({})

  // STEP3
  const [cmd_dept, setCmdDept] = useState('')
  const [cmd_role, setCmdRole] = useState('')
  const [cmd_name, setCmdName] = useState('')
  const [cmd_tel, setCmdTel] = useState('')
  const [resp_dept, setRespDept] = useState('')
  const [resp_role, setRespRole] = useState('')
  const [resp_name, setRespName] = useState('')
  const [resp_tel, setRespTel] = useState('')
  const [comp_dept, setCompDept] = useState('')
  const [comp_role, setCompRole] = useState('')
  const [comp_name, setCompName] = useState('')
  const [comp_tel, setCompTel] = useState('')
  const [welfare, setWelfare] = useState('')
  const [safetyMode, setSafetyMode] = useState<'default' | 'new'>('default')
  const [safetyText, setSafetyText] = useState(DEFAULT_SAFETY)
  const [conflictMode, setConflictMode] = useState<'default' | 'new'>('default')
  const [conflictText, setConflictText] = useState(DEFAULT_CONFLICT)

  // STEP4
  const [mgr_dept, setMgrDept] = useState('')
  const [mgr_role, setMgrRole] = useState('')
  const [mgr_name, setMgrName] = useState('')
  const [mgr_tel, setMgrTel] = useState('')
  const [cmp_dept, setCmpDept] = useState('')
  const [cmp_role, setCmpRole] = useState('')
  const [cmp_name, setCmpName] = useState('')
  const [cmp_tel, setCmpTel] = useState('')
  // マスタ取得時の初期値スナップショット（修正済みバッジ判定用）
  const [masterSnapshot, setMasterSnapshot] = useState<Record<string, string>>({})
  // 派遣元責任者・苦情処理申出先（派遣元）の反映元。'master'＝company_masterから反映、'csv'＝CSV検索結果から反映
  // CSV検索を行った場合は'csv'、CSV検索を行わず手入力で進める場合は'master'のままになる
  const [mgrCmpSource, setMgrCmpSource] = useState<'master' | 'csv'>('master')

  // STEP5
  const [dispatchStart, setDispatchStart] = useState('')
  const [dispatchEnd, setDispatchEnd] = useState('')
  const [conflictDateOrg, setConflictDateOrg] = useState('')
  const [employStart, setEmployStart] = useState('')
  const [employEnd, setEmployEnd] = useState('')
  const [contractStartDate, setContractStartDate] = useState('')
  const [trialPeriod, setTrialPeriod] = useState('')
  const [trialStart, setTrialStart] = useState('')
  const [trialEnd, setTrialEnd] = useState('')
  const [trialWarningChecked, setTrialWarningChecked] = useState(false)
  const [noTrialWarningChecked, setNoTrialWarningChecked] = useState(false)
  const [flexTime, setFlexTime] = useState('')
  const [overtime, setOvertime] = useState('')

  // STEP6
  const [closingPattern, setClosingPattern] = useState('auto')
  const [bonusType, setBonusType] = useState<'あり' | 'なし' | ''>('')

  // STEP8：最終確認
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  // CSV反映項目の修正について、管理部への修正依頼が必要なことを確認したかどうか（2026-07-02追加）
  const [csvModWarningChecked, setCsvModWarningChecked] = useState(false)
  const [isRejected, setIsRejected] = useState(false)
  const [originalFieldsSnapshot, setOriginalFieldsSnapshot] = useState<string | null>(null) // 差し戻し時点の内容（変更有無チェック用）
  const [rejectionReason, setRejectionReason] = useState('業務内容の記載が個別契約書の内容と一致していません。STEP2の業務内容をご確認の上、修正してください。')
  const [rejectedAt, setRejectedAt] = useState('2026年06月18日 14:32')
  const [rejectedBy, setRejectedBy] = useState('SSC 高橋')

  // STEP1：スタッフ登録依頼フォーム
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [reqEmployeeNumber, setReqEmployeeNumber] = useState('')
  const [reqName, setReqName] = useState('')
  const [reqDept, setReqDept] = useState('')
  const [reqHireDate, setReqHireDate] = useState('')
  const [reqWorkLocation, setReqWorkLocation] = useState('')
  const [reqWithCsv, setReqWithCsv] = useState(false)
  const [reqCsvSystem, setReqCsvSystem] = useState('')
  const [reqDispatchStart, setReqDispatchStart] = useState('')
  const [reqSubmitted, setReqSubmitted] = useState(false)
  const [reqSubmitting, setReqSubmitting] = useState(false)
  const [reqError, setReqError] = useState('')

  // STEP7
  const [salaryType, setSalaryType] = useState('時給')
  const [basicSalary, setBasicSalary] = useState('')
  const [skillPay, setSkillPay] = useState('0')
  const [rolePay, setRolePay] = useState('0')
  const [salesPay, setSalesPay] = useState('0')
  const [housingPay, setHousingPay] = useState('0')
  const [overtimePay, setOvertimePay] = useState('0')
  const [overtimeHours, setOvertimeHours] = useState('0')
  const [transportType, setTransportType] = useState('default')
  const [hasEmployInsurance, setHasEmployInsurance] = useState(true)
  const [hasSocialInsurance, setHasSocialInsurance] = useState(true)
  const [salaryWarningChecked, setSalaryWarningChecked] = useState(false)
  const [workingHoursMaster, setWorkingHoursMaster] = useState<any[]>([])
  const [minimumWageMaster, setMinimumWageMaster] = useState<MinimumWageRow[]>([])

  // 所定労働時間マスタを取得（月給者の最低賃金チェックで使用。件数が少ないため一括取得）
  useEffect(() => {
    supabase.from('standard_working_hours_master').select('*').then(({ data }) => {
      setWorkingHoursMaster(data || [])
    })
  }, [])

  // 最低賃金マスタを取得（自動チェック機能。件数が少ないため一括取得。2026-07-06追加）
  useEffect(() => {
    supabase.from('minimum_wage_master').select('dept_no, hourly_wage, effective_from').then(({ data }) => {
      setMinimumWageMaster(data || [])
    })
  }, [])

  // STEP1：勤務地が「現場」の場合のみ対象。対象スタッフの所属部門に最低賃金マスタの登録が
  // 1件も無い場合は、最低賃金チェック自体が実行できないため申請をブロックする（7-5章の例外規定）
  const deptWageMasterMissing = !!(
    selectedStaff && workPlace === '現場' && isMinimumWageMasterMissing(minimumWageMaster, selectedStaff.dept_no)
  )

  const trialCalc = calcTrialMonths(trialStart, trialEnd)

  // 正社員・試用期間なしの警告：スタッフマスタの入社日と、雇用開始日（正社員はcontractStartDateを使用）が
  // 同日または近い日付（30日以内）＝新規入社と推定できる場合のみ警告を出す（2026-07-07決定）。
  // 人材派遣業では正社員でも案件変更のたびに雇用契約書を再締結することが多く、その都度警告が出ると
  // SSCの一括承認ができずオペレーションの負担が大きいため、明らかな契約更新（入社日と離れている）は対象外にする。
  const noTrialCheckRelevantDate = contractType === '正社員' ? contractStartDate : employStart
  const isProbableNewHire = !!(
    selectedStaff?.hired_at && noTrialCheckRelevantDate &&
    diffDaysAbs(noTrialCheckRelevantDate, selectedStaff.hired_at) !== null &&
    (diffDaysAbs(noTrialCheckRelevantDate, selectedStaff.hired_at) as number) <= 30
  )
  // CSVデータから自動入力している時だけ、未入力必須項目を赤く強調する（手入力の時はそもそも全項目が空欄から始まるため対象外）
  const showEmptyHint = csvMode === 'csv'

  // CSV反映項目（STEP2・STEP3・STEP5）が、反映時点から1つでも修正されているか（2026-07-02追加）
  // ※CsvBadgeコンポーネント内のcurrentValueMapと同じ比較ロジック。将来もし項目を追加する場合は両方合わせて直すこと
  const hasModifiedCsvFields = Object.keys(csvSnapshot).some(key => {
    const currentValueMap: Record<string, string> = {
      locationName: workLocationName, locationAddress: workLocationAddress, locationTel: workLocationTel,
      business: businessContent, startTime: startTime, endTime: endTime, breakTime: breakTime,
      workingHours: `${workingHoursH}-${workingHoursM}`, org: organizationUnit, conflict: conflictDate, conflictOrg: conflictDateOrg,
      resp: responsibility, cmdDept: cmd_dept, cmdRole: cmd_role, cmdName: cmd_name, cmdTel: cmd_tel,
      respDept: resp_dept, respRole: resp_role, respName: resp_name, respTel: resp_tel,
      compDept: comp_dept, compRole: comp_role, compName: comp_name, compTel: comp_tel,
      welfare: welfare, flexTime: flexTime, overtime: overtime,
    }
    return currentValueMap[key] !== csvSnapshot[key]
  })

  // 派遣元情報（STEP4：mgr_*・cmp_*）が、CSV反映時点から1つでも修正されているか（2026-07-02追加）
  const hasModifiedMgrFields = mgrCmpSource === 'csv' && (
    (masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept) ||
    (masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role) ||
    (masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name) ||
    (masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel) ||
    (masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept) ||
    (masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role) ||
    (masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name) ||
    (masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel)
  )

  // 上記のいずれかが1つでも該当すれば、STEP8で確認チェックが必要
  const hasCsvModifiedFields = hasModifiedCsvFields || hasModifiedMgrFields

  // STEP5バリデーション派生値
  const employStartError = (() => {
    if (!employStart) return null
    if (pattern === 'C' && dispatchStart && employStart < dispatchStart)
      return '雇用期間の開始日は派遣期間の開始日以降にしてください'
    return null
  })()

  // PENDING②反映：パターンC・有期は終了日が派遣終了日と同じ日付のみOK
  const employEndError = (() => {
    if (!employEnd) return null
    if (pattern === 'C' && period === '有期' && dispatchEnd && employEnd !== dispatchEnd)
      return '雇用期間の終了日は派遣期間の終了日と同じ日付にしてください'
    if (employStart && employEnd < employStart)
      return '終了日は開始日以降の日付にしてください'
    return null
  })()

  const trialStartError = (() => {
    if (!trialStart || period !== '有期') return null
    if (employStart && trialStart !== employStart)
      return '試用期間の開始日は雇用期間の開始日と同じ日付にしてください'
    return null
  })()

  const trialEndError = (() => {
    if (!trialEnd || period !== '有期') return null
    if (employEnd && trialEnd > employEnd)
      return '試用期間の終了日は雇用期間の終了日以前にしてください'
    if (trialStart && trialEnd <= trialStart)
      return '終了日は開始日より後の日付にしてください'
    return null
  })()

  // STEP7：基本給バリデーション（赤・止める）
  const basicSalaryError = (() => {
    if (!basicSalary) return null
    const val = parseAmount(basicSalary)
    const rule = SALARY_RULES[salaryType]
    if (!rule) return null
    if (val < rule.min || val > rule.max) return '桁数をご確認ください'
    return null
  })()

  // 所定労働時間マスタから、現在の勤務地×雇用区分に該当するパターンを絞り込む
  // （最低賃金の月給者チェックで使用。社内は個人差が大きく判別できないため対象外とし、現場のみ実施する2026-07-03決定）
  const applicableHoursPatterns = workPlace === '現場'
    ? workingHoursMaster.filter(p => p.work_place === workPlace && p.contract_type === contractType)
    : []
  // 確定した月所定労働時間（現場は組み合わせごとに必ず1パターンのため自動適用。社内はチェック対象外のためnull）
  const resolvedMonthlyHours = applicableHoursPatterns.length === 1 ? applicableHoursPatterns[0].monthly_hours : null

  // STEP7：定額残業手当の時間数バリデーション（赤・止める）
  const overtimeHoursError = (() => {
    const pay = parseAmount(overtimePay)
    const hours = parseAmount(overtimeHours)
    if (pay < 1) return null
    if (hours === 0) return '時間数を入力してください'
    if (hours < 5 || hours > 60) return '時間数は5以上60以下で入力してください'
    return null
  })()

  // STEP7：合計金額
  // 各種手当の合計（0円除外）
  const allowancesTotal =
    parseAmount(skillPay) +
    parseAmount(rolePay) +
    parseAmount(salesPay) +
    parseAmount(housingPay) +
    parseAmount(overtimePay)

  // 合計支給額（時給の場合は月額換算：時給×160時間＋各種手当）
  const salaryTotal = (() => {
    const basic = parseAmount(basicSalary)
    if (salaryType === '時給') return basic * 160 + allowancesTotal
    return basic + allowancesTotal
  })()

  // 時給の場合の月額換算内訳
  const hourlyMonthlyBreakdown = (() => {
    if (salaryType !== '時給') return null
    const basic = parseAmount(basicSalary)
    if (!basic) return null
    const lines = [`基本給：${basic.toLocaleString()}円 × 160時間 = ${(basic * 160).toLocaleString()}円`]
    if (parseAmount(rolePay) > 0) lines.push(`役職手当：${parseAmount(rolePay).toLocaleString()}円`)
    if (parseAmount(skillPay) > 0) lines.push(`職能給：${parseAmount(skillPay).toLocaleString()}円`)
    if (parseAmount(salesPay) > 0) lines.push(`営業手当：${parseAmount(salesPay).toLocaleString()}円`)
    if (parseAmount(overtimePay) > 0) lines.push(`定額残業手当：${parseAmount(overtimePay).toLocaleString()}円（${parseAmount(overtimeHours)}時間分）`)
    if (parseAmount(housingPay) > 0) lines.push(`住宅手当：${parseAmount(housingPay).toLocaleString()}円`)
    return lines
  })()


  // STEP7：保険帳票プレビュー
  const insurancePreview = (() => {
    const parts = ['労災保険']
    if (hasSocialInsurance) { parts.push('健康保険'); parts.push('厚生年金') }
    if (hasEmployInsurance) parts.push('雇用保険')
    return parts.join(' / ')
  })()

  // STEP7：賃金支払時の控除
  const deductionText = (() => {
    if (hasEmployInsurance && hasSocialInsurance) return '社会保険料（雇用保険、健康保険、厚生年金）・源泉所得税'
    if (!hasEmployInsurance && hasSocialInsurance) return '社会保険料（健康保険、厚生年金）・源泉所得税'
    if (hasEmployInsurance && !hasSocialInsurance) return '社会保険料（雇用保険）・源泉所得税'
    return '源泉所得税'
  })()

  const selectedTransport = TRANSPORT_TYPES.find(t => t.id === transportType) || TRANSPORT_TYPES[0]

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      // 認証チェック（2026-07-13追記：フェーズ2「/applyのロールゲート緩和」。社内案件は担当営業・SSC・
      // 管理部のいずれからも申請可能とする方針が確定した（docs/SYSTEM_DESIGN.md 10章参照）。
      // 就業場所区分（現場／社内）の選択肢は担当営業と全く同じものを見せる（伊藤さん選択：案2＝
      // 将来SSC・管理部が現場案件を代理申請するケースに備え、選択肢を絞らない）。
      const role = data.user.user_metadata?.role
      if (role !== '担当営業' && role !== 'SSC' && role !== '管理部') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  // STEP1スタッフ検索の自部門制限用：担当営業自身の部門番号をstaffテーブル（email一致）から取得する。
  // SSC・管理部は制限対象外のため取得不要（nullのままにし、handleSearch側で分岐する）
  useEffect(() => {
    if (!user) return
    const role = user.user_metadata?.role
    if (role !== '担当営業') { setMyDeptNo(null); return }
    const loadMyDeptNo = async () => {
      const { data } = await supabase
        .from('staff')
        .select('dept_no')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()
      setMyDeptNo(data?.dept_no ?? null)
    }
    loadMyDeptNo()
  }, [user])

  // company_masterから派遣元責任者・苦情処理申出先（派遣元）を読み込む処理。
  // 初回ページ読み込み時と、入力方法を「手動」に切り替えてリセットする時の両方で使う
  const loadCompanyMaster = async () => {
    const { data } = await supabase.from('company_master').select('key, value')
    if (!data) return
    const m: Record<string, string> = {}
    data.forEach((row: any) => { m[row.key] = row.value })
    const mgrDeptVal = m['dispatch_manager_dept'] || ''
    const mgrRoleVal = m['dispatch_manager_role'] || ''
    const mgrNameVal = m['dispatch_manager_name'] || ''
    const mgrTelVal = m['dispatch_manager_tel'] || ''
    const cmpDeptVal = m['complaint_dept'] || ''
    const cmpRoleVal = m['complaint_role'] || ''
    const cmpNameVal = m['complaint_name'] || ''
    const cmpTelVal = m['complaint_tel'] || ''
    setMgrDept(mgrDeptVal)
    setMgrRole(mgrRoleVal)
    setMgrName(mgrNameVal)
    setMgrTel(mgrTelVal)
    setCmpDept(cmpDeptVal)
    setCmpRole(cmpRoleVal)
    setCmpName(cmpNameVal)
    setCmpTel(cmpTelVal)
    setMgrCmpSource('master')
    // マスタ情報反映（修正済み）バッジ判定用の初期値スナップショット
    setMasterSnapshot({
      mgr_dept: mgrDeptVal, mgr_role: mgrRoleVal, mgr_name: mgrNameVal, mgr_tel: mgrTelVal,
      cmp_dept: cmpDeptVal, cmp_role: cmpRoleVal, cmp_name: cmpNameVal, cmp_tel: cmpTelVal,
    })
  }

  useEffect(() => {
    loadCompanyMaster()
  }, [])

  // 再申請モード（/apply?edit=契約ID）：差し戻された既存申請のデータを全STEPのstateに復元する
  useEffect(() => {
    if (!editContractId) { setEditLoading(false); return }
    if (!user) return
    const loadForEdit = async () => {
      // ログインユーザーの所属部門NOを取得（自部門以外の申請は編集不可）
      const { data: staffRow } = await supabase
        .from('staff')
        .select('dept_no')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()

      const { data: row, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', editContractId)
        .single()

      // 差し戻し中以外・自部門以外の申請は編集不可（見つからない扱い）
      if (error || !row || row.status !== '差し戻し中' || !staffRow || row.created_by_dept_no !== staffRow.dept_no) {
        setEditNotFound(true)
        setEditLoading(false)
        return
      }

      const staffSnap = row.input_data?.staff || {}
      const f = row.input_data?.fields || {}
      const csvMeta = row.input_data?.csvMeta || {}

      // STEP1：対象スタッフ・雇用区分・就業場所区分・書類種別
      // 2026-07-09追加：住所も他フィールドと同様にスナップショットから復元する（下記staffSnapshotの修正と対）
      setSelectedStaff({
        id: row.staff_id,
        employee_number: staffSnap.employee_number,
        name: staffSnap.name,
        department: staffSnap.department,
        crew_code: staffSnap.crew_code,
        address: staffSnap.address,
      })
      setSearched(true)
      setContractType(f.contractType || '')
      setWorkPlace(f.workPlace || '現場')
      setDocumentType(f.documentType || '')

      // STEP2：就業先情報
      setCsvMode(csvMeta.csvMode || 'manual')
      setCsvSystem(csvMeta.csvSystem || 'e-staffing')
      setCsvDispatchStart(csvMeta.csvDispatchStart || '')
      setCsvSnapshot(csvMeta.csvSnapshot || {})
      setWorkLocationName(f.workLocationName || '')
      setWorkLocationAddress(f.workLocationAddress || '')
      setWorkLocationTel(f.workLocationTel || '')
      setBusinessContent(f.businessContent || '')
      setStartTime(f.startTime || '')
      setEndTime(f.endTime || '')
      setIsShift(!!f.isShift)
      setBreakTime(f.breakTime || '')
      setWorkingHoursH(f.workingHoursH || '')
      setWorkingHoursM(f.workingHoursM || '')
      setWorkDays(f.workDays || '')
      setWorkDaysOther(f.workDaysOther || '')
      setOrganizationUnit(f.organizationUnit || '')
      setConflictDate(f.conflictDate || '')
      setResponsibility(f.responsibility || '')

      // STEP3：派遣先担当者
      setCmdDept(f.cmd_dept || ''); setCmdRole(f.cmd_role || ''); setCmdName(f.cmd_name || ''); setCmdTel(f.cmd_tel || '')
      setRespDept(f.resp_dept || ''); setRespRole(f.resp_role || ''); setRespName(f.resp_name || ''); setRespTel(f.resp_tel || '')
      setCompDept(f.comp_dept || ''); setCompRole(f.comp_role || ''); setCompName(f.comp_name || ''); setCompTel(f.comp_tel || '')
      setWelfare(f.welfare || '')
      setSafetyMode(f.safetyMode || 'default')
      setSafetyText(f.safetyText || DEFAULT_SAFETY)
      setConflictMode(f.conflictMode || 'default')
      setConflictText(f.conflictText || DEFAULT_CONFLICT)

      // STEP4：派遣元担当者
      setMgrDept(f.mgr_dept || ''); setMgrRole(f.mgr_role || ''); setMgrName(f.mgr_name || ''); setMgrTel(f.mgr_tel || '')
      setCmpDept(f.cmp_dept || ''); setCmpRole(f.cmp_role || ''); setCmpName(f.cmp_name || ''); setCmpTel(f.cmp_tel || '')
      setMgrCmpSource(csvMeta.mgrCmpSource || 'master')
      setMasterSnapshot(csvMeta.masterSnapshot || {})

      // STEP5：期間・労働条件
      setDispatchStart(f.dispatchStart || '')
      setDispatchEnd(f.dispatchEnd || '')
      setConflictDateOrg(f.conflictDateOrg || '')
      setEmployStart(f.employStart || '')
      setEmployEnd(f.employEnd || '')
      setContractStartDate(f.contractStartDate || '')
      setTrialPeriod(f.trialPeriod || '')
      setTrialStart(f.trialStart || '')
      setTrialEnd(f.trialEnd || '')
      setFlexTime(f.flexTime || '')
      setOvertime(f.overtime || '')
      // 上長承認が必要な警告のチェックは、再申請のたびに改めて確認してもらうためあえて復元しない（未チェックに戻す）

      // STEP6：契約条件
      setClosingPattern(f.closingPattern || 'auto')
      setBonusType(f.bonusType || '')

      // STEP7：給与・保険
      setSalaryType(f.salaryType || '時給')
      setBasicSalary(f.basicSalary || '')
      setSkillPay(f.skillPay || '0')
      setRolePay(f.rolePay || '0')
      setSalesPay(f.salesPay || '0')
      setHousingPay(f.housingPay || '0')
      setOvertimePay(f.overtimePay || '0')
      setOvertimeHours(f.overtimeHours || '0')
      setTransportType(f.transportType || 'default')
      setHasEmployInsurance(f.hasEmployInsurance !== false)
      setHasSocialInsurance(f.hasSocialInsurance !== false)

      // 差し戻し情報を復元し、STEP8（最終確認）に直行する
      setIsRejected(true)
      setRejectionReason(row.rejection_reason || '')
      // 差し戻された既存データを、画面のstateと同じ整形ルール（未入力→空文字 等）に揃える。
      // これをしないと「保存されている生データ」と「画面に読み込んだ後の値」で表記ゆれが起き、変更有無の判定が正しく行えない。
      const normalizeFields = (raw: Record<string, any>) => ({
        contractType: raw.contractType || '', workPlace: raw.workPlace || '現場', documentType: raw.documentType || '',
        workLocationName: raw.workLocationName || '', workLocationAddress: raw.workLocationAddress || '', workLocationTel: raw.workLocationTel || '',
        businessContent: raw.businessContent || '', startTime: raw.startTime || '', endTime: raw.endTime || '', isShift: !!raw.isShift, breakTime: raw.breakTime || '',
        workingHoursH: raw.workingHoursH || '', workingHoursM: raw.workingHoursM || '', workDays: raw.workDays || '', workDaysOther: raw.workDaysOther || '',
        organizationUnit: raw.organizationUnit || '', conflictDate: raw.conflictDate || '', conflictDateOrg: raw.conflictDateOrg || '', responsibility: raw.responsibility || '',
        cmd_dept: raw.cmd_dept || '', cmd_role: raw.cmd_role || '', cmd_name: raw.cmd_name || '', cmd_tel: raw.cmd_tel || '',
        resp_dept: raw.resp_dept || '', resp_role: raw.resp_role || '', resp_name: raw.resp_name || '', resp_tel: raw.resp_tel || '',
        comp_dept: raw.comp_dept || '', comp_role: raw.comp_role || '', comp_name: raw.comp_name || '', comp_tel: raw.comp_tel || '',
        welfare: raw.welfare || '', safetyMode: raw.safetyMode || 'default', safetyText: raw.safetyText || DEFAULT_SAFETY, conflictMode: raw.conflictMode || 'default', conflictText: raw.conflictText || DEFAULT_CONFLICT,
        mgr_dept: raw.mgr_dept || '', mgr_role: raw.mgr_role || '', mgr_name: raw.mgr_name || '', mgr_tel: raw.mgr_tel || '',
        cmp_dept: raw.cmp_dept || '', cmp_role: raw.cmp_role || '', cmp_name: raw.cmp_name || '', cmp_tel: raw.cmp_tel || '',
        dispatchStart: raw.dispatchStart || '', dispatchEnd: raw.dispatchEnd || '',
        employStart: raw.employStart || '', employEnd: raw.employEnd || '', contractStartDate: raw.contractStartDate || '',
        trialPeriod: raw.trialPeriod || '', trialStart: raw.trialStart || '', trialEnd: raw.trialEnd || '',
        flexTime: raw.flexTime || '', overtime: raw.overtime || '',
        closingPattern: raw.closingPattern || 'auto', bonusType: raw.bonusType || '',
        salaryType: raw.salaryType || '時給', basicSalary: raw.basicSalary || '', skillPay: raw.skillPay || '0', rolePay: raw.rolePay || '0', salesPay: raw.salesPay || '0', housingPay: raw.housingPay || '0',
        overtimePay: raw.overtimePay || '0', overtimeHours: raw.overtimeHours || '0', transportType: raw.transportType || 'default',
        hasEmployInsurance: raw.hasEmployInsurance !== false, hasSocialInsurance: raw.hasSocialInsurance !== false,
        monthlyStandardHours: raw.monthlyStandardHours ?? null, // buildCurrentFields()と同じキー構成に揃える（指摘14対応。これが無いと変更有無の判定が常にfalseになる）
      })
      setOriginalFieldsSnapshot(JSON.stringify(normalizeFields(f))) // 差し戻し時点の内容（画面と同じ整形ルール適用後）を保存し、送信直前に「変更されたか」を比較する
      if (row.rejected_at) {
        const d = new Date(row.rejected_at)
        setRejectedAt(`${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
      } else {
        setRejectedAt('―')
      }
      setRejectedBy('SSC') // フェーズ2.5の認証統合完了後、担当者名を表示予定

      const patternFromDoc = getPattern(f.documentType || '')
      const targetSteps = patternFromDoc === 'A' ? STEPS_A.length : patternFromDoc === 'B' ? STEPS_B.length : patternFromDoc === 'C' ? STEPS_C.length : STEPS_A.length
      setCurrentStep(targetSteps)

      setEditLoading(false)
    }
    loadForEdit()
  }, [user, editContractId])

  // 2026-07-17追加（更新期限管理タブ・チャットD・⑤個別申請）：/apply?renewal=候補ID で開いた場合、
  // 前回契約の内容を土台に、CSVから反映される最新内容・確定済みの新しい雇用期間/派遣期間/就業場所で
  // 上書きしたデータを全STEPのstateに復元し、最終確認（STEP8相当）へ直行する。
  // executeBulkApply()（一括申請の裏側処理）と同じマージロジック（buildMergedFields）を使うことで、
  // 一括申請・個別申請のどちらでも同じ「前回＋最新反映」の内容になることを保証する。
  // 差し戻し再申請（editContractId）と違い、これは真新しい申請なので isRejected 等は一切設定しない
  // （送信時も通常のinsertパスをそのまま通る）。
  useEffect(() => {
    if (!renewalCandidateId) { setRenewalLoading(false); return }
    if (!user) return
    const loadForRenewal = async () => {
      const { data: candidate, error: candidateError } = await supabase
        .from('renewal_candidates')
        .select('*')
        .eq('id', renewalCandidateId)
        .maybeSingle()
      if (candidateError || !candidate) { setRenewalNotFound(true); setRenewalLoading(false); return }

      const { data: prevContract, error: prevError } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', candidate.source_contract_id)
        .maybeSingle()
      if (prevError || !prevContract) { setRenewalNotFound(true); setRenewalLoading(false); return }

      const prevFields = (prevContract.input_data as any)?.fields || {}

      let csvFields: Record<string, any> | null = null
      if (candidate.new_csv_raw_data_id) {
        const { data: csvRow } = await supabase
          .from('csv_raw_data')
          .select('raw_data')
          .eq('id', candidate.new_csv_raw_data_id)
          .maybeSingle()
        if (csvRow?.raw_data) {
          csvFields = extractCsvFields(candidate.csv_system || '', csvRow.raw_data) as Record<string, any>
        }
      }

      const f: Record<string, any> = {
        ...buildMergedFields(prevFields, csvFields),
        employStart: candidate.new_employ_start || prevFields.employStart || '',
        employEnd: candidate.new_employ_end || prevFields.employEnd || '',
        dispatchStart: candidate.new_dispatch_start || prevFields.dispatchStart || '',
        dispatchEnd: candidate.new_dispatch_end || prevFields.dispatchEnd || '',
        workLocationName: candidate.new_work_location_name || prevFields.workLocationName || '',
        workLocationAddress: candidate.new_work_address || prevFields.workLocationAddress || '',
        // 更新のたびに試用期間を引き継がない（2026-07-17伊藤さんとの確認・一括申請と同じ扱い）。
        // 個別申請は最終確認画面で営業が内容を見ながら送信するため、必要であれば画面上で
        // 「有」に戻して入力し直すことも可能。
        trialPeriod: '無',
        trialStart: '',
        trialEnd: '',
      }
      const csvMeta = (prevContract.input_data as any)?.csvMeta || {}

      // スタッフ情報：staffテーブルに"department"列は存在せずdepartment_masterとの結合が必要
      // （executeBulkApply()の実機テストで発覚した不具合と同じ注意点）。
      const { data: staffRow } = await supabase
        .from('staff')
        .select('id, employee_number, name, crew_code, address, department_master(dept_name)')
        .eq('employee_number', candidate.employee_number)
        .maybeSingle()

      // STEP1：対象スタッフ・雇用区分・就業場所区分・書類種別
      setSelectedStaff(staffRow ? {
        id: staffRow.id,
        employee_number: staffRow.employee_number,
        name: staffRow.name,
        department: (staffRow as any).department_master?.dept_name || null,
        crew_code: staffRow.crew_code,
        address: staffRow.address,
      } : {
        id: prevContract.staff_id,
        employee_number: candidate.employee_number,
        name: candidate.staff_name,
        department: null,
        crew_code: null,
        address: null,
      })
      setSearched(true)
      setContractType(f.contractType || '')
      setWorkPlace(f.workPlace || '現場')
      setDocumentType(f.documentType || '')

      // STEP2：就業先情報
      setCsvMode(csvMeta.csvMode || 'manual')
      setCsvSystem(csvMeta.csvSystem || 'e-staffing')
      setCsvDispatchStart(csvMeta.csvDispatchStart || '')
      setCsvSnapshot(csvMeta.csvSnapshot || {})
      setWorkLocationName(f.workLocationName || '')
      setWorkLocationAddress(f.workLocationAddress || '')
      setWorkLocationTel(f.workLocationTel || '')
      setBusinessContent(f.businessContent || '')
      setStartTime(f.startTime || '')
      setEndTime(f.endTime || '')
      setIsShift(!!f.isShift)
      setBreakTime(f.breakTime || '')
      setWorkingHoursH(f.workingHoursH || '')
      setWorkingHoursM(f.workingHoursM || '')
      setWorkDays(f.workDays || '')
      setWorkDaysOther(f.workDaysOther || '')
      setOrganizationUnit(f.organizationUnit || '')
      setConflictDate(f.conflictDate || '')
      setResponsibility(f.responsibility || '')

      // STEP3：派遣先担当者
      setCmdDept(f.cmd_dept || ''); setCmdRole(f.cmd_role || ''); setCmdName(f.cmd_name || ''); setCmdTel(f.cmd_tel || '')
      setRespDept(f.resp_dept || ''); setRespRole(f.resp_role || ''); setRespName(f.resp_name || ''); setRespTel(f.resp_tel || '')
      setCompDept(f.comp_dept || ''); setCompRole(f.comp_role || ''); setCompName(f.comp_name || ''); setCompTel(f.comp_tel || '')
      setWelfare(f.welfare || '')
      setSafetyMode(f.safetyMode || 'default')
      setSafetyText(f.safetyText || DEFAULT_SAFETY)
      setConflictMode(f.conflictMode || 'default')
      setConflictText(f.conflictText || DEFAULT_CONFLICT)

      // STEP4：派遣元担当者
      setMgrDept(f.mgr_dept || ''); setMgrRole(f.mgr_role || ''); setMgrName(f.mgr_name || ''); setMgrTel(f.mgr_tel || '')
      setCmpDept(f.cmp_dept || ''); setCmpRole(f.cmp_role || ''); setCmpName(f.cmp_name || ''); setCmpTel(f.cmp_tel || '')
      setMgrCmpSource(csvMeta.mgrCmpSource || 'master')
      setMasterSnapshot(csvMeta.masterSnapshot || {})

      // STEP5：期間・労働条件
      setDispatchStart(f.dispatchStart || '')
      setDispatchEnd(f.dispatchEnd || '')
      setConflictDateOrg(f.conflictDateOrg || '')
      setEmployStart(f.employStart || '')
      setEmployEnd(f.employEnd || '')
      setContractStartDate(f.contractStartDate || '')
      setTrialPeriod(f.trialPeriod || '')
      setTrialStart(f.trialStart || '')
      setTrialEnd(f.trialEnd || '')
      setFlexTime(f.flexTime || '')
      setOvertime(f.overtime || '')

      // STEP6：契約条件
      setClosingPattern(f.closingPattern || 'auto')
      setBonusType(f.bonusType || '')

      // STEP7：給与・保険
      setSalaryType(f.salaryType || '時給')
      setBasicSalary(f.basicSalary || '')
      setSkillPay(f.skillPay || '0')
      setRolePay(f.rolePay || '0')
      setSalesPay(f.salesPay || '0')
      setHousingPay(f.housingPay || '0')
      setOvertimePay(f.overtimePay || '0')
      setOvertimeHours(f.overtimeHours || '0')
      setTransportType(f.transportType || 'default')
      setHasEmployInsurance(f.hasEmployInsurance !== false)
      setHasSocialInsurance(f.hasSocialInsurance !== false)

      // 最終確認（STEP8相当）に直行する
      const patternFromDoc = getPattern(f.documentType || '')
      const targetSteps = patternFromDoc === 'A' ? STEPS_A.length : patternFromDoc === 'B' ? STEPS_B.length : patternFromDoc === 'C' ? STEPS_C.length : STEPS_A.length
      setCurrentStep(targetSteps)

      setRenewalLoading(false)
    }
    loadForRenewal()
  }, [user, renewalCandidateId])

  // STEP2の「入力方法」（CSV検索／手動入力）を切り替えた時、新規作成時と同じ状態に完全にリセットする処理
  // ※CSV→手動、手動→CSVどちらの切り替えでもリセットする（確定仕様）
  const resetStep2Step3ForModeChange = () => {
    // STEP2：就業場所・業務内容・時間関連
    setWorkLocationName(''); setWorkLocationAddress(''); setWorkLocationTel('')
    setBusinessContent('')
    setStartTime(''); setEndTime(''); setIsShift(false)
    setBreakTime('')
    setWorkingHoursH(''); setWorkingHoursM('')
    setWorkDays(''); setWorkDaysOther('')
    setOrganizationUnit('')
    setConflictDate(''); setConflictDateOrg('')
    setResponsibility('')
    setCsvBadges({})
    setCsvSnapshot({})
    // STEP3：指揮命令者・派遣先責任者・苦情処理申出先（派遣先）・福利厚生等
    setCmdDept(''); setCmdRole(''); setCmdName(''); setCmdTel('')
    setRespDept(''); setRespRole(''); setRespName(''); setRespTel('')
    setCompDept(''); setCompRole(''); setCompName(''); setCompTel('')
    setWelfare('')
    setSafetyMode('default'); setSafetyText(DEFAULT_SAFETY)
    setConflictMode('default'); setConflictText(DEFAULT_CONFLICT)
    setFlexTime(''); setOvertime('')
    // 派遣期間
    setDispatchStart(''); setDispatchEnd('')
    // 派遣元責任者・苦情処理申出先（派遣元）：company_masterの値に戻す（新規作成時と同じ状態）
    loadCompanyMaster()
  }


  // STEP2：所定労働時間の整合性チェック（シフト制以外・黄色警告）
  const workingHoursWarn = (() => {
    if (isShift) return null
    if (!startTime || !endTime || !breakTime || !workingHoursH) return null
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const totalMin = (eh * 60 + em) - (sh * 60 + sm)
    if (totalMin <= 0) return null
    const breakMin = parseAmount(breakTime)
    const actualMin = totalMin - breakMin
    const inputMin = parseAmount(workingHoursH) * 60 + parseAmount(workingHoursM)
    if (actualMin !== inputMin) {
      const h = Math.floor(actualMin / 60)
      const m = actualMin % 60
      return `始業・終業・休憩時間から計算した実働時間は${h}時間${m > 0 ? m + '分' : ''}です。所定労働時間をご確認ください。`
    }
    return null
  })()

  // STEP2：CSVバッジのヘルパー
  // 「就業場所名」などCSV由来の項目は、現在値とCSV反映時のスナップショットを比較して
  // reflected/modifiedを動的に判定する（手入力でも元の値に戻せば自動的に「CSV反映」に戻る）。
  // ※「所定労働時間」「安全及び衛生」「紛争防止措置」はCSVから自動反映されない項目のため、
  //   従来通りcsvBadgesの固定状態をそのまま使う。
  const setCsvBadge = (key: string, state: 'reflected' | 'modified') => {
    setCsvBadges(prev => ({ ...prev, [key]: state }))
  }
  const CsvBadge = ({ name }: { name: string }) => {
    // CSVスナップショットの対象キーと、現在値の対応表
    const currentValueMap: Record<string, string> = {
      locationName: workLocationName,
      locationAddress: workLocationAddress,
      locationTel: workLocationTel,
      business: businessContent,
      startTime: startTime,
      endTime: endTime,
      breakTime: breakTime,
      workingHours: `${workingHoursH}-${workingHoursM}`,
      org: organizationUnit,
      conflict: conflictDate,
      conflictOrg: conflictDateOrg,
      resp: responsibility,
      cmdDept: cmd_dept,
      cmdRole: cmd_role,
      cmdName: cmd_name,
      cmdTel: cmd_tel,
      respDept: resp_dept,
      respRole: resp_role,
      respName: resp_name,
      respTel: resp_tel,
      compDept: comp_dept,
      compRole: comp_role,
      compName: comp_name,
      compTel: comp_tel,
      welfare: welfare,
      flexTime: flexTime,
      overtime: overtime,
    }

    const hasSnapshot = name in csvSnapshot
    let state: 'none' | 'reflected' | 'modified'
    if (hasSnapshot) {
      // スナップショットがある項目（CSVから自動反映される項目）は、現在値と比較して動的に判定
      state = currentValueMap[name] === csvSnapshot[name] ? 'reflected' : 'modified'
    } else {
      // スナップショット対象外の項目（所定労働時間・安全及び衛生・紛争防止措置等）は従来通り固定状態を使う
      state = csvBadges[name] || 'none'
    }

    if (!state || state === 'none') return null
    if (state === 'reflected') return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#ECFDF5', color: '#0D9488', border: '1px solid #A7F3D0' }}>CSV反映</span>
    )
    return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>CSV反映（修正済み）</span>
    )
  }


  useEffect(() => {
    if (workPlace === '社内' && documentType !== '雇用契約書' && documentType !== '') {
      setDocumentType('雇用契約書')
    }
  }, [workPlace])

  // 書類種別を変更したら、STEP2以降の入力内容をリセットする（前のパターンのデータが残らないように）
  const prevDocumentTypeRef = useRef(documentType)
  useEffect(() => {
    if (prevDocumentTypeRef.current && prevDocumentTypeRef.current !== documentType) {
      // STEP2：就業先情報
      setCsvMode('manual'); setCsvSystem('e-staffing'); setCsvDispatchStart('')
      setCsvSearched(false); setCsvResults([]); setCsvNoResults(false); setCsvSelectedId(null)
      setWorkLocationName(''); setWorkLocationAddress(''); setWorkLocationTel('')
      setBusinessContent(''); setStartTime(''); setEndTime(''); setIsShift(false)
      setBreakTime(''); setWorkingHoursH(''); setWorkingHoursM('')
      setWorkDays(''); setWorkDaysOther('')
      setOrganizationUnit(''); setConflictDate(''); setResponsibility('')
      setCsvBadges({})
      // STEP3：派遣先担当者
      setCmdDept(''); setCmdRole(''); setCmdName(''); setCmdTel('')
      setRespDept(''); setRespRole(''); setRespName(''); setRespTel('')
      setCompDept(''); setCompRole(''); setCompName(''); setCompTel('')
      setWelfare(''); setSafetyMode('default'); setSafetyText(DEFAULT_SAFETY)
      setConflictMode('default'); setConflictText(DEFAULT_CONFLICT)
      // STEP5：期間・労働条件
      setDispatchStart(''); setDispatchEnd(''); setConflictDateOrg('')
      setEmployStart(''); setEmployEnd(''); setContractStartDate('')
      setTrialPeriod(''); setTrialStart(''); setTrialEnd('')
      setTrialWarningChecked(false); setNoTrialWarningChecked(false)
      setFlexTime(''); setOvertime('')
      // STEP6：契約条件
      setClosingPattern('auto'); setBonusType('')
      // STEP7：給与・保険
      setSalaryType('時給'); setBasicSalary('')
      setSkillPay('0'); setRolePay('0'); setSalesPay('0'); setHousingPay('0')
      setOvertimePay('0'); setOvertimeHours('0')
      setTransportType('default')
      setHasEmployInsurance(true); setHasSocialInsurance(true)
      setSalaryWarningChecked(false)
      // STEP8：最終確認
      setCollapsedSections({})
    }
    prevDocumentTypeRef.current = documentType
  }, [documentType])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setSearched(false); return }
    const normalized = query.replace(/[\s　]+/g, '')

    // STEP1スタッフ検索の自部門制限（2026-07-14〜）：担当営業ロールのみ、自分の所属部門（dept_no）の
    // スタッフしか検索・選択できないようにする（他部門スタッフの住所・給与関連情報等の閲覧を防止）。
    // SSC・管理部は横断的な代理申請・確認業務のため対象外（従来通り全部門を検索可能）。
    const role = user?.user_metadata?.role
    const restrictToOwnDept = role === '担当営業'
    if (restrictToOwnDept && (myDeptNo === undefined)) {
      // 自部門情報がまだ取得できていない（読み込み中）。安全側に倒し、今回の検索は行わない
      setSearchBlockedReason('loading'); setSearchResults([]); setSearched(true)
      return
    }
    if (restrictToOwnDept && myDeptNo === null) {
      // 担当営業だがstaffテーブルに自分の行が見つからず、部門を特定できない → 検索させない
      setSearchBlockedReason('no_dept'); setSearchResults([]); setSearched(true)
      return
    }
    setSearchBlockedReason(null)

    // 社員番号での検索と氏名での検索を別クエリに分け、結果をマージする。
    // （.or()にqueryを直接埋め込むと、入力に「,」や「(」「)」が含まれた場合にフィルタ構文が壊れたり、
    //   意図しない条件が注入される可能性があるため、.ilike()の値として安全に渡せる形に分離している）
    // 退職済み・退職予定のスタッフは、DBクエリ側の条件（.or()を2回連結＝AND結合）で除外する
    // （2026-07-21・タスク④：従来はここで全件取得後にJS側で日付比較していたが、
    //   lib/staffFilters.tsの共通条件をDB側のWHEREとして適用する形に変更した）。
    const [retiredAtOk, retirementScheduledOk] = excludeRetiredStaffOr()
    let byNumberQuery = supabase.from('staff').select('*, department_master(dept_name)').ilike('employee_number', `%${query}%`).or(retiredAtOk).or(retirementScheduledOk).limit(20)
    let byNameQuery = supabase.from('staff').select('*, department_master(dept_name)').ilike('name', `%${normalized}%`).or(retiredAtOk).or(retirementScheduledOk).limit(20)
    if (restrictToOwnDept) {
      byNumberQuery = byNumberQuery.eq('dept_no', myDeptNo)
      byNameQuery = byNameQuery.eq('dept_no', myDeptNo)
    }
    const [byNumber, byName] = await Promise.all([byNumberQuery, byNameQuery])
    const merged = [...(byNumber.data || []), ...(byName.data || [])]
    const data = Array.from(new Map(merged.map((s: any) => [s.employee_number, s])).values()) // employee_number/nameの両方に一致した場合の重複を除去
    // department_master(dept_name) は { department_master: { dept_name: '...' } } の形で返るため、
    // page.tsx側の表示コード（selectedStaff.department）と互換性を持たせるためフラットな形に変換する
    const flattened = (data || [])
      .slice(0, 10)
      .map((s: any) => ({
        ...s,
        department: s.department_master?.dept_name || null,
      }))
    setSearchResults(flattened)
    setSearched(true)
    // 新たに検索したら依頼フォームをリセット
    setShowRequestForm(false)
    setReqSubmitted(false)
    setReqEmployeeNumber('')
    setReqName('')
    setReqDept('')
    setReqHireDate('')
    setReqWorkLocation('')
    setReqWithCsv(false)
    setReqCsvSystem('')
    setReqDispatchStart('')
  }, [user, myDeptNo])

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleCancel = () => {
    if (!confirm('入力中の申請を中断します。入力した内容は保存されません。よろしいですか？')) return
    const role = user?.user_metadata?.role
    router.push(role === 'SSC' ? '/dashboard/ssc' : role === '管理部' ? '/dashboard/admin' : '/dashboard/sales')
  }

  // ===== 申請データの保存処理 =====
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // STEP1〜8で入力したすべての値をまとめる（保存・再申請時の変更有無チェックの両方で使う）
  const buildCurrentFields = () => ({
    contractType, workPlace, documentType,
    workLocationName, workLocationAddress, workLocationTel,
    businessContent, startTime, endTime, isShift, breakTime,
    workingHoursH, workingHoursM, workDays, workDaysOther,
    organizationUnit, conflictDate, conflictDateOrg, responsibility,
    cmd_dept, cmd_role, cmd_name, cmd_tel,
    resp_dept, resp_role, resp_name, resp_tel,
    comp_dept, comp_role, comp_name, comp_tel,
    welfare, safetyMode, safetyText, conflictMode, conflictText,
    mgr_dept, mgr_role, mgr_name, mgr_tel,
    cmp_dept, cmp_role, cmp_name, cmp_tel,
    dispatchStart, dispatchEnd,
    employStart, employEnd, contractStartDate,
    trialPeriod, trialStart, trialEnd,
    flexTime, overtime,
    closingPattern, bonusType,
    salaryType, basicSalary, skillPay, rolePay, salesPay, housingPay,
    overtimePay, overtimeHours, transportType,
    hasEmployInsurance, hasSocialInsurance,
    monthlyStandardHours: resolvedMonthlyHours,
  })

  const handleSubmitContract = async () => {
    if (isSubmitting) return // 二重送信防止
    setIsSubmitting(true)
    setSubmitError('')
    try {
      // STEP1〜8で入力したすべての値（再申請時の復元・SSC確認・将来の帳票生成にそのまま使う）
      const fields = buildCurrentFields()

      // 申請者（担当営業）自身の部門番号を取得し、担当営業ダッシュボードの閲覧範囲フィルタに使う
      // （2026-07-02追加：この取得処理がなく、新規申請のcreated_by_dept_noが常にnullになっていたバグを修正）
      const { data: submitterStaffRow } = await supabase
        .from('staff')
        .select('dept_no, name')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()

      // CSV関連の記録（SSC確認画面での差分表示・将来の振り返り用）
      const csvMeta = {
        csvMode, csvSystem, csvDispatchStart,
        csvSnapshot, masterSnapshot, mgrCmpSource,
      }

      // 申請対象スタッフのスナップショット（後でstaffマスタの情報が変わっても、申請時点の記録が残る）
      // 2026-07-09追加：帳票PDFの従業員住所欄（employeeAddress）に使うaddressが漏れていたため追加
      // （staff.addressの取込自体は既に完了していたが、この申請保存側の反映が漏れていたバグの修正）。
      const staffSnapshot = selectedStaff ? {
        employee_number: selectedStaff.employee_number,
        name: selectedStaff.name,
        department: selectedStaff.department,
        crew_code: selectedStaff.crew_code,
        address: selectedStaff.address || null,
      } : null

      // 上長承認が必要だった警告のうち、実際にチェックされたものだけを記録
      const warningConfirmations: { type: string; confirmed_at: string }[] = []
      if (trialPeriod === '有' && trialCalc?.over6 && trialWarningChecked) {
        warningConfirmations.push({ type: 'trial_over6months', confirmed_at: new Date().toISOString() })
      }
      if (trialPeriod === '無' && contractType === '正社員' && isProbableNewHire && noTrialWarningChecked) {
        warningConfirmations.push({ type: 'no_trial_period', confirmed_at: new Date().toISOString() })
      }
      if (salaryTotal > 1000000 && salaryWarningChecked) {
        warningConfirmations.push({ type: 'salary_over_1000000', confirmed_at: new Date().toISOString() })
      }
      if (hasCsvModifiedFields && csvModWarningChecked) {
        warningConfirmations.push({ type: 'csv_fields_modified', confirmed_at: new Date().toISOString() })
      }

      // 自動チェック機能（7-5章・9-1章タスク18）：金額異常値・最低賃金・就業規則整合の3種を判定
      // 2026-07-06実装。判定ロジック本体は lib/autoChecks.ts に切り出し済み
      const { results: autoCheckResults, overallLevel: warningLevel } = runAutoChecks({
        pattern,
        workPlace,
        contractType,
        salaryType,
        basicSalary: parseAmount(basicSalary),
        rolePay: parseAmount(rolePay),
        skillPay: parseAmount(skillPay),
        salesPay: parseAmount(salesPay),
        housingPay: parseAmount(housingPay),
        overtimePay: parseAmount(overtimePay),
        hasEmployInsurance,
        hasSocialInsurance,
        workingHoursH: parseAmount(workingHoursH),
        workingHoursM: parseAmount(workingHoursM),
        monthlyStandardHours: resolvedMonthlyHours,
        deptNo: selectedStaff?.dept_no ?? null,
        staffHiredAt: selectedStaff?.hired_at ?? null,
        employStart, employEnd, contractStartDate,
        dispatchStart, dispatchEnd,
        trialPeriod,
        minimumWageRowsForDept: minimumWageMaster.filter(r => r.dept_no === selectedStaff?.dept_no),
      })

      // 再申請モード：既存の契約IDをそのままupdateし、ステータスを申請中に戻す（差し戻し情報はクリア）
      // 新規申請：新しい行としてinsertする
      const payload = {
        staff_id: selectedStaff?.id,
        pattern,
        contract_type: contractType,
        document_type: documentType,
        work_place: workPlace,
        status: '申請中',
        closing_pattern: (pattern === 'A' || pattern === 'C') ? closingPattern : null,
        created_by_dept_no: submitterStaffRow?.dept_no ?? null,
        // 総合レビュー指摘E対応（2026-07-16）：SSC・管理部が「誰の申請か」をID断片ではなく
        // 氏名で判断できるよう、申請時点の担当者名をスナップショットとして保存する。
        created_by_name: submitterStaffRow?.name ?? null,
        // csvSelectedIdは配列のインデックス（何番目を選んだか）であり、CSV行の実IDではない。
        // 実IDはcsvResults[csvSelectedId].idに入っているため、ここで変換してから保存する
        csv_raw_data_id: (csvMode === 'csv' && csvSelectedId !== null && csvResults[csvSelectedId]) ? csvResults[csvSelectedId].id : null,
        input_data: { staff: staffSnapshot, fields, csvMeta },
        // ダッシュボード一覧の「全期間で検索」用（2026-07-14追加）。氏名・社員番号・就業先名を
        // 連結した検索用テキスト。input_dataはJSONBのためSQL側で都度パースせず済むよう、
        // 保存時点でこの1カラムに平坦化しておく（docs/SYSTEM_DESIGN.md 10章 2026-07-14参照）。
        search_text: [staffSnapshot?.name, staffSnapshot?.employee_number, workLocationName]
          .filter(Boolean).join(' '),
        warning_confirmations: warningConfirmations,
        auto_check_results: autoCheckResults,
        warning_level: warningLevel,
      }

      // 再申請（update）は、画面を開いたままの間に他の人が処理を進めている可能性があるため、
      // 保存直前に status='差し戻し中' であることも条件に含める（指摘15対応）。
      // これが無いと、承認済み等に進んだ契約を古い画面からの送信で上書きしてしまう恐れがある。
      const { error, data: savedRows } = editContractId
        ? await supabase.from('contracts').update({
            ...payload,
            rejection_reason: null,
            rejected_by: null,
            rejected_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', editContractId).eq('status', '差し戻し中').select('id')
        : await supabase.from('contracts').insert({
            ...payload,
            created_by: user.id,
          }).select('id')

      if (error) {
        // 総合レビュー指摘27対応（2026-07-17）：Postgresの生エラーをそのまま画面に出さず、
        // 詳細はコンソールにのみ残す。
        console.error('契約保存エラー:', error)
        setSubmitError('申請の保存に失敗しました。お手数ですが、もう一度お試しください。改善しない場合はシステム担当者にご連絡ください。')
        setIsSubmitting(false)
        return
      }
      if (editContractId && (!savedRows || savedRows.length === 0)) {
        setSubmitError('この申請は既に処理が進んでいるため、この画面からは保存できませんでした。お手数ですが、画面を再読み込みして最新の状態をご確認ください。')
        setIsSubmitting(false)
        return
      }
      // 2026-07-17追加（チャットD・⑤個別申請）：更新期限管理の「個別に申請する」経由で開いた場合、
      // 送信成功後にrenewal_candidates側を「申請済み」にする（一括申請と同じ扱い。失敗しても
      // 契約自体は正常に保存済みなので、ここのエラーは申請完了自体をブロックしない）。
      if (renewalCandidateId) {
        try {
          await supabase.from('renewal_candidates')
            .update({ status: 'applied', triage_mode: 'undecided' })
            .eq('id', renewalCandidateId)
        } catch { /* 契約自体は保存済みのため、ここの失敗で申請完了をブロックしない */ }
      }
      setIsSubmitted(true)
    } catch (e: any) {
      setSubmitError('申請の保存中に問題が発生しました。お手数ですが、もう一度お試しください。')
      setIsSubmitting(false)
    }
  }

  const handleNext = () => { setCurrentStep(s => s + 1); window.scrollTo(0, 0) }
  const handleBack = () => { setCurrentStep(s => s - 1); window.scrollTo(0, 0) }
  const getStepLabel = (step: number) => steps[step - 1] || ''

  const getStepType = (step: number) => {
    if (step === 1) return 'basic'
    if (step === 2) return 'workInfo'
    if (step === 3 && (pattern === 'B' || pattern === 'C')) return 'dispatchContact'
    if (step === 3 && pattern === 'A') return 'period'
    if (step === 4 && (pattern === 'B' || pattern === 'C')) return 'sourceContact'
    if (step === 5 && (pattern === 'B' || pattern === 'C')) return 'period'
    if (step === 4 && pattern === 'A') return 'contractCondition'
    if (step === 5 && pattern === 'A') return 'salary'
    if (step === 6 && pattern === 'C') return 'contractCondition'
    if (step === 7 && pattern === 'C') return 'salary'
    if (step === steps.length) return 'finalCheck'
    return 'tbd'
  }

  const stepType = getStepType(currentStep)
  if (!user || editLoading || renewalLoading) return <div className="p-8" style={{ color: '#5A6A8A' }}>読み込み中...</div>
  if (editNotFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F5F7FC' }}>
      <p className="text-lg font-bold" style={{ color: '#1A2340' }}>再申請する差し戻し案件が見つかりませんでした</p>
      <button onClick={() => {
        const role = user?.user_metadata?.role
        router.push(role === 'SSC' ? '/dashboard/ssc' : role === '管理部' ? '/dashboard/admin' : '/dashboard/sales')
      }}
        className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
        ダッシュボードに戻る
      </button>
    </div>
  )
  if (renewalNotFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F5F7FC' }}>
      <p className="text-lg font-bold" style={{ color: '#1A2340' }}>個別申請の対象となる更新期限案件が見つかりませんでした</p>
      <button onClick={() => {
        const role = user?.user_metadata?.role
        router.push(role === 'SSC' ? '/dashboard/ssc' : role === '管理部' ? '/dashboard/admin' : '/dashboard/sales')
      }}
        className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
        ダッシュボードに戻る
      </button>
    </div>
  )

  const fixedText = (text: string) => (
    <p className="text-sm rounded-lg px-3 py-2 inline-block border"
      style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>{text}</p>
  )

  const validateStep2 = () => {
    if (csvRequestSent) return 'CSVインポート依頼を送信済みです。インポート完了後に再度申請してください'
    if (!workLocationName) return '就業場所名を入力してください'
    if (!workLocationAddress) return '就業場所住所を入力してください'
    if (!businessContent) return '業務内容を入力してください'
    if (!startTime) return '始業時刻を入力してください'
    if (!endTime) return '終業時刻を入力してください'
    if (!breakTime) return '休憩時間を入力してください'
    if (!workingHoursH || parseAmount(workingHoursH) <= 0) return '所定労働時間を入力してください（時間が0の入力はできません）'
    if (!workDays) return '所定労働日数を選択してください'
    if (workDays === 'other' && !workDaysOther) return '所定労働日数（その他）を入力してください'
    if (pattern === 'B' || pattern === 'C') {
      if (!responsibility) return '業務に伴う責任の程度を選択してください'
    }
    return null
  }

  const validatePeriod = () => {
    if (pattern === 'B' || pattern === 'C') {
      if (!dispatchStart || !dispatchEnd) return '派遣期間を入力してください'
      if (!isConflictDateExempt && !conflictDate) return '抵触日（事業所単位）を入力してください'
      if (!isConflictDateExempt && isDateBefore(conflictDate, dispatchEnd)) return '抵触日（事業所単位）は派遣期間の終了日以降の日付にしてください'
      if (!isConflictDateExempt && !conflictDateOrg) return '抵触日（組織単位）を入力してください'
      if (!isConflictDateExempt && isDateBefore(conflictDateOrg, dispatchEnd)) return '抵触日（組織単位）は派遣期間の終了日以降の日付にしてください'
      if (!organizationUnit) return '組織単位を入力してください'
    }
    if (pattern === 'A' || pattern === 'C') {
      if (period === '有期') {
        if (!employStart || !employEnd) return '雇用期間を入力してください'
        if (employStartError) return employStartError
        if (employEndError) return employEndError
      }
      if ((period === '無期' || contractType === '正社員') && !contractStartDate) return '契約条件適用開始日を入力してください'
      if ((period === '無期' || contractType === '正社員') && isDateBefore(contractStartDate, dispatchStart)) return '契約条件適用開始日は派遣期間の開始日以降の日付にしてください'
      if (!trialPeriod) return '試用期間を選択してください'
      if (trialPeriod === '有') {
        if (!trialStart || !trialEnd) return '試用期間の開始日・終了日を入力してください'
        if (trialStartError) return trialStartError
        if (trialEndError) return trialEndError
        if (trialCalc?.over6 && !trialWarningChecked) return '試用期間6ヶ月超の警告について、上長の了承確認が必要です'
      }
      if (contractType === '正社員' && trialPeriod === '無' && isProbableNewHire && !noTrialWarningChecked) {
        return '正社員・試用期間なしの警告について、上長の了承確認が必要です'
      }
    }
    if (!flexTime) return '変形労働時間制を選択してください'
    if (!overtime) return '所定労働時間外労働を選択してください'
    return null
  }

  // STEP1：依頼フォームバリデーション
  const validateRequestForm = () => {
    if (!reqEmployeeNumber) return '社員番号を入力してください'
    if (!/^\d{6}$/.test(reqEmployeeNumber)) return '社員番号は半角数字6桁で入力してください'
    if (!reqName) return 'スタッフ氏名を入力してください'
    if (!reqDept) return '部門名を入力してください'
    if (!reqHireDate) return '入社日を入力してください'
    // 就業場所名はスタッフマスタ登録のみの依頼では不要。CSVインポートも同時に
    // 依頼する場合のみ必須にする（2026-07-14：伊藤さん確認の上、必須条件を変更）
    if (reqWithCsv) {
      if (!reqCsvSystem) return '使用システムを選択してください'
      if (!reqDispatchStart) return '派遣開始日を入力してください'
      if (!reqWorkLocation) return '就業場所名を入力してください'
    }
    return null
  }

  const handleSubmitRequest = async () => {
    const err = validateRequestForm()
    if (err) { alert(err); return }
    if (reqSubmitting) return // 二重送信防止
    setReqSubmitting(true)
    setReqError('')
    try {
      // 申請者（担当営業）自身の氏名・部門名を取得
      const { data: submitterStaffRow } = await supabase
        .from('staff')
        .select('name, department_master(dept_name)')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()

      const { error } = await supabase.from('requests').insert([{
        request_type: 'staff_register',
        staff_name: reqName,
        staff_code: reqEmployeeNumber,
        staff_dept: reqDept,
        staff_hire_date: reqHireDate,
        // 就業場所名はCSVインポートも同時に依頼した場合のみ入力される。単独のスタッフマスタ
        // 登録依頼では空文字のまま保存せずnullにする（一覧側で「-」表示になるようにするため）
        client_name: reqWorkLocation || null,
        // 「CSVインポートも同時に依頼する」がオフの場合は、csv_import_status を明示的に
        // 'not_required' にする（デフォルトが'pending'のままだと、CSVインポートも
        // 未対応の依頼として管理部側に表示されてしまうため）
        csv_import_status: reqWithCsv ? 'pending' : 'not_required',
        system_type: reqWithCsv ? reqCsvSystem : null,
        dispatch_start_date: reqWithCsv ? reqDispatchStart : null,
        requested_by: user.id,
        // staffマスタに一致する行が無い場合でも申請者が空欄にならないよう、
        // メールアドレスへフォールバックする（2026-07-14追加・教訓：スタッフ登録前の
        // テスト送信でここがnullのまま保存され、管理部画面に申請者情報が出ない事故があった）
        requested_by_name: (submitterStaffRow as any)?.name || user.email || null,
        requested_by_dept: (submitterStaffRow as any)?.department_master?.dept_name || null,
      }])

      if (error) {
        console.error('依頼送信エラー:', error)
        setReqError('依頼の送信に失敗しました。お手数ですが、もう一度お試しください。改善しない場合はシステム担当者にご連絡ください。')
        setReqSubmitting(false)
        return
      }
      setReqSubmitted(true)
      setReqSubmitting(false)
    } catch (e: any) {
      setReqError('依頼の送信中に問題が発生しました。お手数ですが、もう一度お試しください。')
      setReqSubmitting(false)
    }
  }

  // STEP2：CSVインポート依頼（社員番号・使用システム・派遣開始日は画面上ですでに分かっているため、
  // 追加入力なしでその場で送信する）
  const handleSubmitCsvRequest = async () => {
    if (csvRequestSubmitting) return // 二重送信防止
    // 就業場所名は必須（2026-07-14：この依頼には元々就業場所名の入力欄が無く、
    // 一覧側で就業先が常に空欄になっていたことが判明したため追加）
    if (!csvRequestWorkLocation.trim()) {
      setCsvRequestError('就業場所名を入力してください')
      return
    }
    setCsvRequestSubmitting(true)
    setCsvRequestError('')
    try {
      const { data: submitterStaffRow } = await supabase
        .from('staff')
        .select('name, department_master(dept_name)')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()

      const { error } = await supabase.from('requests').insert([{
        request_type: 'csv_import',
        staff_name: selectedStaff?.name || null,
        staff_code: selectedStaff?.employee_number || null,
        staff_id: selectedStaff?.id || null,
        client_name: csvRequestWorkLocation.trim(),
        system_type: csvSystem,
        dispatch_start_date: csvDispatchStart,
        // スタッフはすでに登録済み（この依頼はCSVデータの話のみ）なので、
        // デフォルトの'pending'のままにせず明示的にnullにする
        staff_register_status: null,
        requested_by: user.id,
        requested_by_name: (submitterStaffRow as any)?.name || user.email || null,
        requested_by_dept: (submitterStaffRow as any)?.department_master?.dept_name || null,
      }])

      if (error) {
        console.error('CSVインポート依頼送信エラー:', error)
        setCsvRequestError('依頼の送信に失敗しました。お手数ですが、もう一度お試しください。改善しない場合はシステム担当者にご連絡ください。')
        setCsvRequestSubmitting(false)
        return
      }
      setCsvRequestSent(true)
      setCsvRequestSubmitting(false)
    } catch (e: any) {
      setCsvRequestError('依頼の送信中に問題が発生しました。お手数ですが、もう一度お試しください。')
      setCsvRequestSubmitting(false)
    }
  }

  // STEP2：CSV検索（システムごとの検索キー対応・確定仕様）
  // - e-staffing：staff_code そのまま
  // - HRstation：staff_code（先頭の「F3810」を除いた数字部分）。CSV側の値にF3810が付くため、
  //   ここでは社員番号の前に「F3810」を付けて比較する
  // - winworks：CSVのstaff_codeではなく、staff.crew_code の値で検索
  // - Staffia：staff_code（雇用元管理コード）そのまま
  const handleCsvSearch = async () => {
    if (!csvDispatchStart) return
    setCsvLoading(true)
    setCsvSearched(false)
    setCsvNoResults(false)
    setCsvResults([])
    setCsvSelectedId(null) // 再検索時に前回選択が残らないようにリセット（指摘13対応）

    let staffCodeForSearch = selectedStaff?.employee_number || ''
    if (csvSystem === 'HRstation') {
      staffCodeForSearch = `F3810${selectedStaff?.employee_number || ''}`
    } else if (csvSystem === 'winworks') {
      staffCodeForSearch = selectedStaff?.crew_code || ''
    }

    if (!staffCodeForSearch) {
      setCsvNoResults(true)
      setCsvSearched(true)
      setCsvLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('csv_raw_data')
      .select('*')
      .eq('system_type', csvSystem)
      .eq('staff_code', staffCodeForSearch)
      .lte('dispatch_start', csvDispatchStart) // 派遣期間の開始日 ≦ 検索日
      .gte('dispatch_end', csvDispatchStart)   // 派遣期間の終了日 ≧ 検索日（つまり検索日が期間内に含まれる）

    if (error || !data || data.length === 0) {
      setCsvNoResults(true)
      setCsvSearched(true)
      setCsvLoading(false)
      return
    }

    let finalRows = data

    // Staffiaは KEF00104（スタッフ個人・派遣期間）と KEF00103（契約全体の詳細・業務内容等）の
    // 2つのファイルに分かれているため、KEF00104側のヒット結果から「個別契約書番号」を取り出し、
    // それをキーにKEF00103側のデータも取得して、raw_dataを合成する
    if (csvSystem === 'Staffia') {
      const merged = await Promise.all(data.map(async (r: any) => {
        const contractNo = r.raw_data?.['個別契約書番号']
        if (!contractNo) return r
        const { data: detailData } = await supabase
          .from('csv_raw_data')
          .select('*')
          .eq('system_type', 'Staffia')
          .eq('unique_key', contractNo) // KEF00103側はunique_key = 個別契約書番号のみ
          .maybeSingle()
        if (!detailData) return r
        return {
          ...r,
          // KEF00103側の詳細情報（就業場所名・住所・業務内容等）を合成する
          work_location: detailData.work_location || r.work_location,
          work_address: detailData.work_address || r.work_address,
          work_tel: detailData.work_tel || r.work_tel,
          raw_data: { ...detailData.raw_data, ...r.raw_data }, // 個人情報(104)を優先しつつ詳細情報(103)も統合
        }
      }))
      finalRows = merged
    }

    setCsvResults(finalRows.map((r: any) => ({
      id: r.id,
      name: r.work_location,
      address: r.work_address,
      tel: formatTelHyphen(r.work_tel),
      start: r.dispatch_start,
      end: r.dispatch_end,
      raw: r.raw_data, // STEP2〜5の詳細項目反映時にここから取り出す
    })))
    setCsvSearched(true)
    setCsvLoading(false)
  }

  // STEP2：CSV検索結果から1件選択した時、STEP2〜5の詳細項目に自動反映する
  const handleCsvResultSelect = (r: any, idx: number) => {
    setCsvSelectedId(idx)
    setWorkLocationName(r.name)
    setWorkLocationAddress(r.address)
    setWorkLocationTel(r.tel)

    // raw_data（CSVの生データ）からシステムごとに項目を抽出
    const fields = extractCsvFields(csvSystem, r.raw)
    if (fields.business) setBusinessContent(fields.business)
    if (fields.startTime) setStartTime(fields.startTime)
    if (fields.endTime) setEndTime(fields.endTime)
    if (fields.isShift) setIsShift(true)
    if (fields.breakTime) setBreakTime(String(fields.breakTime))
    if (fields.workingHoursH) setWorkingHoursH(fields.workingHoursH)
    if (fields.workingHoursM) setWorkingHoursM(fields.workingHoursM)
    if (fields.org) setOrganizationUnit(fields.org)
    if (fields.conflictDate) setConflictDate(fields.conflictDate)
    if (fields.conflictDateOrg) setConflictDateOrg(fields.conflictDateOrg)
    if (fields.responsibility) setResponsibility(fields.responsibility)
    // 指揮命令者（派遣先）
    if (fields.cmdDept) setCmdDept(fields.cmdDept)
    if (fields.cmdRole) setCmdRole(fields.cmdRole)
    if (fields.cmdName) setCmdName(fields.cmdName)
    if (fields.cmdTel) setCmdTel(fields.cmdTel)
    // 派遣先責任者
    if (fields.respDept) setRespDept(fields.respDept)
    if (fields.respRole) setRespRole(fields.respRole)
    if (fields.respName) setRespName(fields.respName)
    if (fields.respTel) setRespTel(fields.respTel)
    // 苦情処理申出先（派遣先）
    if (fields.compDept) setCompDept(fields.compDept)
    if (fields.compRole) setCompRole(fields.compRole)
    if (fields.compName) setCompName(fields.compName)
    if (fields.compTel) setCompTel(fields.compTel)
    // 派遣元責任者・苦情処理申出先（派遣元）：CSVに値があれば反映し、反映元をCSVに切り替える
    // （CSVに値がなければmgr_*/cmp_*は変更せず、これまでの値＝company_master由来の値のまま残す）
    if (fields.mgrDept || fields.mgrRole || fields.mgrName || fields.mgrTel ||
        fields.cmpDept || fields.cmpRole || fields.cmpName || fields.cmpTel) {
      if (fields.mgrDept) setMgrDept(fields.mgrDept)
      if (fields.mgrRole) setMgrRole(fields.mgrRole)
      if (fields.mgrName) setMgrName(fields.mgrName)
      if (fields.mgrTel) setMgrTel(fields.mgrTel)
      if (fields.cmpDept) setCmpDept(fields.cmpDept)
      if (fields.cmpRole) setCmpRole(fields.cmpRole)
      if (fields.cmpName) setCmpName(fields.cmpName)
      if (fields.cmpTel) setCmpTel(fields.cmpTel)
      setMgrCmpSource('csv')
      // 「修正済み」判定用のスナップショットも、CSVから反映された値に更新する
      // （既存のmasterSnapshot方式と同じ比較ロジックをそのまま使う）
      setMasterSnapshot(prev => ({
        ...prev,
        ...(fields.mgrDept ? { mgr_dept: fields.mgrDept } : {}),
        ...(fields.mgrRole ? { mgr_role: fields.mgrRole } : {}),
        ...(fields.mgrName ? { mgr_name: fields.mgrName } : {}),
        ...(fields.mgrTel ? { mgr_tel: fields.mgrTel } : {}),
        ...(fields.cmpDept ? { cmp_dept: fields.cmpDept } : {}),
        ...(fields.cmpRole ? { cmp_role: fields.cmpRole } : {}),
        ...(fields.cmpName ? { cmp_name: fields.cmpName } : {}),
        ...(fields.cmpTel ? { cmp_tel: fields.cmpTel } : {}),
      }))
    }
    // 福利厚生・変形労働時間制・所定労働時間外労働
    if (fields.welfare) setWelfare(fields.welfare)
    if (fields.flexTime) setFlexTime(fields.flexTime)
    if (fields.overtime) setOvertime(fields.overtime)
    // 派遣期間
    if (fields.dispatchStart) setDispatchStart(fields.dispatchStart)
    if (fields.dispatchEnd) setDispatchEnd(fields.dispatchEnd)

    // 値が実際に入った項目にのみバッジをセット
    const newBadges: Record<string, 'none' | 'reflected' | 'modified'> = {}
    if (r.name) newBadges['locationName'] = 'reflected'
    if (r.address) newBadges['locationAddress'] = 'reflected'
    if (r.tel) newBadges['locationTel'] = 'reflected'
    if (fields.business) newBadges['business'] = 'reflected'
    if (fields.startTime) newBadges['startTime'] = 'reflected'
    if (fields.endTime) newBadges['endTime'] = 'reflected'
    if (fields.breakTime) newBadges['breakTime'] = 'reflected'
    if (fields.org) newBadges['org'] = 'reflected'
    if (fields.conflictDate) newBadges['conflict'] = 'reflected'
    if (fields.conflictDateOrg) newBadges['conflictOrg'] = 'reflected'
    if (fields.responsibility) newBadges['resp'] = 'reflected'
    if (fields.cmdDept) newBadges['cmdDept'] = 'reflected'
    if (fields.cmdRole) newBadges['cmdRole'] = 'reflected'
    if (fields.cmdName) newBadges['cmdName'] = 'reflected'
    if (fields.cmdTel) newBadges['cmdTel'] = 'reflected'
    if (fields.respDept) newBadges['respDept'] = 'reflected'
    if (fields.respRole) newBadges['respRole'] = 'reflected'
    if (fields.respName) newBadges['respName'] = 'reflected'
    if (fields.respTel) newBadges['respTel'] = 'reflected'
    if (fields.compDept) newBadges['compDept'] = 'reflected'
    if (fields.compRole) newBadges['compRole'] = 'reflected'
    if (fields.compName) newBadges['compName'] = 'reflected'
    if (fields.compTel) newBadges['compTel'] = 'reflected'
    if (fields.welfare) newBadges['welfare'] = 'reflected'
    if (fields.flexTime) newBadges['flexTime'] = 'reflected'
    if (fields.overtime) newBadges['overtime'] = 'reflected'
    setCsvBadges(newBadges)

    // CSV反映バッジ（修正済み）判定用：反映した時点の値をスナップショットとして保存
    // 以後、現在値とこのスナップショットを比較して「修正済み」かどうかを動的に判定する
    // ※値が実際に存在した項目のみ登録する（CSVに列がなく空のままの項目は登録しない。
    //   登録してしまうと、元々ヒットしない項目に「修正済み」が誤表示されるため）
    const newSnapshot: Record<string, string> = {}
    if (r.name) newSnapshot.locationName = r.name
    if (r.address) newSnapshot.locationAddress = r.address
    if (r.tel) newSnapshot.locationTel = r.tel
    if (fields.business) newSnapshot.business = fields.business
    if (fields.startTime) newSnapshot.startTime = fields.startTime
    if (fields.endTime) newSnapshot.endTime = fields.endTime
    if (fields.breakTime) newSnapshot.breakTime = String(fields.breakTime)
    if (fields.workingHoursH) newSnapshot.workingHours = `${fields.workingHoursH}-${fields.workingHoursM || ''}`
    if (fields.org) newSnapshot.org = fields.org
    if (fields.conflictDate) newSnapshot.conflict = fields.conflictDate
    if (fields.conflictDateOrg) newSnapshot.conflictOrg = fields.conflictDateOrg
    if (fields.responsibility) newSnapshot.resp = fields.responsibility
    if (fields.cmdDept) newSnapshot.cmdDept = fields.cmdDept
    if (fields.cmdRole) newSnapshot.cmdRole = fields.cmdRole
    if (fields.cmdName) newSnapshot.cmdName = fields.cmdName
    if (fields.cmdTel) newSnapshot.cmdTel = fields.cmdTel
    if (fields.respDept) newSnapshot.respDept = fields.respDept
    if (fields.respRole) newSnapshot.respRole = fields.respRole
    if (fields.respName) newSnapshot.respName = fields.respName
    if (fields.respTel) newSnapshot.respTel = fields.respTel
    if (fields.compDept) newSnapshot.compDept = fields.compDept
    if (fields.compRole) newSnapshot.compRole = fields.compRole
    if (fields.compName) newSnapshot.compName = fields.compName
    if (fields.compTel) newSnapshot.compTel = fields.compTel
    if (fields.welfare) newSnapshot.welfare = fields.welfare
    if (fields.flexTime) newSnapshot.flexTime = fields.flexTime
    if (fields.overtime) newSnapshot.overtime = fields.overtime
    setCsvSnapshot(newSnapshot)
  }

  const validateSalary = () => {
    if (!salaryType) return '給与の種類を選択してください'
    if (!basicSalary) return '基本給を入力してください'
    if (basicSalaryError) return basicSalaryError
    if (overtimeHoursError) return overtimeHoursError
    if (salaryTotal > 1000000 && !salaryWarningChecked) return '合計支給額が100万円超の警告について、上長の了承確認が必要です'
    return null
  }

  const trialPreview = trialStart && trialEnd && trialCalc
    ? `試用期間： 有\n試用期間：${toJpDate(trialStart)}〜${toJpDate(trialEnd)}まで　（試用期間延長の場合は、その2週間前までに通知します）\n試用期間満了後の本採用は次のいずれかにより判断します。\n①試用期間満了時の業務量　②従事している業務の進捗状況　③能力、勤務成績、勤務態度　④健康状態、⑤職務への適正性その他就業規則上の規定基準\n試用期間開始日より14日経過後の本採用拒否の場合は、少なくとも本採用拒否退職の30日前に通知します。`
    : ''

  const remarksText = getRemarksText(pattern, contractType, bonusType)

  const NavButtons = ({ onNext }: { onNext: () => void }) => (
    <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
      <button onClick={e => { e.preventDefault(); handleBack() }}
        className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all"
        style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
      <button onClick={e => { e.preventDefault(); onNext() }}
        className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
        style={{ background: '#1B3A8C' }}>次へ進む →</button>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>新規発行申請</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* 申請完了後は「やめる」対象が無くなるため非表示にする（2026-07-07修正） */}
            {!isSubmitted && (
              <button onClick={handleCancel}
                className="text-sm px-4 py-2 rounded-lg border font-medium transition-all"
                style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                この申請をやめる
              </button>
            )}
            <button onClick={handleLogout} className="text-sm" style={{ color: '#5A6A8A' }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        <div className="flex items-center overflow-x-auto pb-2 mb-6">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: currentStep === i + 1 ? '#1B3A8C' : currentStep > i + 1 ? '#0D9488' : '#D0DAF0',
                    color: currentStep >= i + 1 ? 'white' : '#5A6A8A'
                  }}>
                  {currentStep > i + 1 ? '✓' : i + 1}
                </div>
                <span className="text-xs whitespace-nowrap hidden sm:block"
                  style={{ color: currentStep === i + 1 ? '#1A2340' : '#5A6A8A', fontWeight: currentStep === i + 1 ? 600 : 400 }}>
                  {step}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-5 h-px mx-1.5 shrink-0"
                  style={{ background: currentStep > i + 1 ? '#0D9488' : '#D0DAF0' }} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#1B3A8C' }}>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white text-sm font-medium">STEP{currentStep}：{getStepLabel(currentStep)}</span>
              <span className="text-xs" style={{ color: '#A8C0E8' }}>{STEP_SUB[getStepLabel(currentStep)] || ''}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs" style={{ color: '#A8C0E8' }}>{currentStep} / {steps.length}</span>
              <button
                onClick={e => { e.preventDefault(); setShowStepDesc(v => !v) }}
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                style={{ background: '#F97316', color: 'white', border: 'none' }}
                title="このSTEPの説明を見る">?</button>
            </div>
          </div>
          {showStepDesc && (
            <div className="px-5 py-4 border-b" style={{ background: 'white', borderColor: '#D0DAF0' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
                {stepType === 'sourceContact'
                  ? `自社（APパートナーズ）の担当者情報が${mgrCmpSource === 'csv' ? 'CSVデータ' : '自社マスタ'}から自動で入力されています。内容を確認し、異なる場合は修正してください。`
                  : (STEP_DESC[getStepLabel(currentStep)] || '')}
              </p>
            </div>
          )}

          {/* ===== STEP1 ===== */}
          {stepType === 'basic' && (
            <StepBasic
              selectedStaff={selectedStaff} setSelectedStaff={setSelectedStaff}
              searched={searched} setSearched={setSearched}
              searchResults={searchResults} setSearchResults={setSearchResults}
              searchBlockedReason={searchBlockedReason} handleSearch={handleSearch}
              reqSubmitted={reqSubmitted} setReqSubmitted={setReqSubmitted}
              showRequestForm={showRequestForm} setShowRequestForm={setShowRequestForm}
              reqEmployeeNumber={reqEmployeeNumber} setReqEmployeeNumber={setReqEmployeeNumber}
              reqName={reqName} setReqName={setReqName}
              reqDept={reqDept} setReqDept={setReqDept}
              reqHireDate={reqHireDate} setReqHireDate={setReqHireDate}
              reqWorkLocation={reqWorkLocation} setReqWorkLocation={setReqWorkLocation}
              reqWithCsv={reqWithCsv} setReqWithCsv={setReqWithCsv}
              reqCsvSystem={reqCsvSystem} setReqCsvSystem={setReqCsvSystem}
              reqDispatchStart={reqDispatchStart} setReqDispatchStart={setReqDispatchStart}
              reqSubmitting={reqSubmitting} reqError={reqError} setReqError={setReqError}
              handleSubmitRequest={handleSubmitRequest}
              contractType={contractType} setContractType={setContractType}
              isContractTypeLocked={isContractTypeLocked}
              showContractTypeLockedMsg={showContractTypeLockedMsg}
              setShowContractTypeLockedMsg={setShowContractTypeLockedMsg}
              workPlace={workPlace} setWorkPlace={setWorkPlace}
              documentType={documentType} setDocumentType={setDocumentType}
              fullDocumentName={fullDocumentName} pattern={pattern}
              deptWageMasterMissing={deptWageMasterMissing}
              handleNext={handleNext}
            />
          )}

          {/* ===== STEP2 ===== */}
          {stepType === 'workInfo' && (
            <StepWorkInfo
              csvRequestSent={csvRequestSent} setCsvRequestSent={setCsvRequestSent}
              csvMode={csvMode} setCsvMode={setCsvMode}
              csvSearched={csvSearched} setCsvSearched={setCsvSearched}
              csvResults={csvResults} setCsvResults={setCsvResults}
              csvNoResults={csvNoResults} setCsvNoResults={setCsvNoResults}
              resetStep2Step3ForModeChange={resetStep2Step3ForModeChange}
              csvSystem={csvSystem} setCsvSystem={setCsvSystem}
              csvDispatchStart={csvDispatchStart} setCsvDispatchStart={setCsvDispatchStart}
              csvLoading={csvLoading} handleCsvSearch={handleCsvSearch}
              csvSelectedId={csvSelectedId} handleCsvResultSelect={handleCsvResultSelect}
              csvRequestWorkLocation={csvRequestWorkLocation} setCsvRequestWorkLocation={setCsvRequestWorkLocation}
              handleSubmitCsvRequest={handleSubmitCsvRequest}
              csvRequestSubmitting={csvRequestSubmitting} csvRequestError={csvRequestError}
              CsvBadge={CsvBadge}
              workLocationName={workLocationName} setWorkLocationName={setWorkLocationName}
              workLocationAddress={workLocationAddress} setWorkLocationAddress={setWorkLocationAddress}
              workLocationTel={workLocationTel} setWorkLocationTel={setWorkLocationTel}
              businessContent={businessContent} setBusinessContent={setBusinessContent}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime}
              isShift={isShift} setIsShift={setIsShift}
              breakTime={breakTime} setBreakTime={setBreakTime}
              workingHoursH={workingHoursH} setWorkingHoursH={setWorkingHoursH}
              workingHoursM={workingHoursM} setWorkingHoursM={setWorkingHoursM}
              workingHoursWarn={workingHoursWarn}
              workDays={workDays} setWorkDays={setWorkDays}
              workDaysOther={workDaysOther} setWorkDaysOther={setWorkDaysOther}
              pattern={pattern}
              responsibility={responsibility} setResponsibility={setResponsibility}
              showEmptyHint={showEmptyHint}
              validateStep2={validateStep2}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {/* ===== STEP3：派遣先担当者 ===== */}
          {stepType === 'dispatchContact' && (
            <StepDispatchContact
              showEmptyHint={showEmptyHint} CsvBadge={CsvBadge}
              cmd_dept={cmd_dept} cmd_role={cmd_role} cmd_name={cmd_name} cmd_tel={cmd_tel}
              setCmdDept={setCmdDept} setCmdRole={setCmdRole} setCmdName={setCmdName} setCmdTel={setCmdTel}
              resp_dept={resp_dept} resp_role={resp_role} resp_name={resp_name} resp_tel={resp_tel}
              setRespDept={setRespDept} setRespRole={setRespRole} setRespName={setRespName} setRespTel={setRespTel}
              comp_dept={comp_dept} comp_role={comp_role} comp_name={comp_name} comp_tel={comp_tel}
              setCompDept={setCompDept} setCompRole={setCompRole} setCompName={setCompName} setCompTel={setCompTel}
              welfare={welfare} setWelfare={setWelfare}
              safetyMode={safetyMode} setSafetyMode={setSafetyMode} safetyText={safetyText} setSafetyText={setSafetyText}
              conflictMode={conflictMode} setConflictMode={setConflictMode} conflictText={conflictText} setConflictText={setConflictText}
              csvBadges={csvBadges} setCsvBadge={setCsvBadge}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {/* ===== STEP4：派遣元担当者 ===== */}
          {stepType === 'sourceContact' && (
            <StepSourceContact
              mgrCmpSource={mgrCmpSource}
              masterSnapshot={masterSnapshot}
              mgr_dept={mgr_dept} mgr_role={mgr_role} mgr_name={mgr_name} mgr_tel={mgr_tel}
              setMgrDept={setMgrDept} setMgrRole={setMgrRole} setMgrName={setMgrName} setMgrTel={setMgrTel}
              cmp_dept={cmp_dept} cmp_role={cmp_role} cmp_name={cmp_name} cmp_tel={cmp_tel}
              setCmpDept={setCmpDept} setCmpRole={setCmpRole} setCmpName={setCmpName} setCmpTel={setCmpTel}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {/* ===== STEP5（A=STEP3 / B・C=STEP5）：期間・労働条件 ===== */}
          {stepType === 'period' && (
            <StepPeriod
              pattern={pattern} contractType={contractType} period={period}
              showEmptyHint={showEmptyHint} CsvBadge={CsvBadge} fixedText={fixedText}
              dispatchStart={dispatchStart} setDispatchStart={setDispatchStart}
              dispatchEnd={dispatchEnd} setDispatchEnd={setDispatchEnd}
              isConflictDateExempt={isConflictDateExempt}
              conflictDate={conflictDate} setConflictDate={setConflictDate}
              conflictDateOrg={conflictDateOrg} setConflictDateOrg={setConflictDateOrg}
              organizationUnit={organizationUnit} setOrganizationUnit={setOrganizationUnit}
              contractStartDate={contractStartDate} setContractStartDate={setContractStartDate}
              employStart={employStart} setEmployStart={setEmployStart}
              employEnd={employEnd} setEmployEnd={setEmployEnd}
              employStartError={employStartError} employEndError={employEndError}
              trialPeriod={trialPeriod} setTrialPeriod={setTrialPeriod}
              trialStart={trialStart} setTrialStart={setTrialStart}
              trialEnd={trialEnd} setTrialEnd={setTrialEnd}
              trialStartError={trialStartError} trialEndError={trialEndError}
              trialPreview={trialPreview} trialCalc={trialCalc}
              trialWarningChecked={trialWarningChecked} setTrialWarningChecked={setTrialWarningChecked}
              noTrialWarningChecked={noTrialWarningChecked} setNoTrialWarningChecked={setNoTrialWarningChecked}
              isProbableNewHire={isProbableNewHire}
              flexTime={flexTime} setFlexTime={setFlexTime}
              overtime={overtime} setOvertime={setOvertime}
              validatePeriod={validatePeriod}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {/* ===== STEP6（A=STEP4 / C=STEP6）：契約条件 ===== */}
          {stepType === 'contractCondition' && (
            <StepContractCondition
              pattern={pattern} contractType={contractType}
              closingPattern={closingPattern} setClosingPattern={setClosingPattern}
              bonusType={bonusType} setBonusType={setBonusType}
              remarksText={remarksText}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {/* ===== STEP7（A=STEP5 / C=STEP7）：給与・保険 ===== */}
          {stepType === 'salary' && (
            <StepSalary
              salaryType={salaryType} setSalaryType={setSalaryType}
              basicSalary={basicSalary} setBasicSalary={setBasicSalary} basicSalaryError={basicSalaryError}
              rolePay={rolePay} setRolePay={setRolePay}
              skillPay={skillPay} setSkillPay={setSkillPay}
              salesPay={salesPay} setSalesPay={setSalesPay}
              overtimePay={overtimePay} setOvertimePay={setOvertimePay}
              overtimeHours={overtimeHours} setOvertimeHours={setOvertimeHours} overtimeHoursError={overtimeHoursError}
              housingPay={housingPay} setHousingPay={setHousingPay}
              hourlyMonthlyBreakdown={hourlyMonthlyBreakdown} salaryTotal={salaryTotal}
              salaryWarningChecked={salaryWarningChecked} setSalaryWarningChecked={setSalaryWarningChecked}
              transportType={transportType} setTransportType={setTransportType}
              selectedTransport={selectedTransport}
              hasEmployInsurance={hasEmployInsurance} setHasEmployInsurance={setHasEmployInsurance}
              hasSocialInsurance={hasSocialInsurance} setHasSocialInsurance={setHasSocialInsurance}
              insurancePreview={insurancePreview} deductionText={deductionText}
              validateSalary={validateSalary}
              handleNext={handleNext}
              NavButtons={NavButtons}
            />
          )}

          {stepType === 'finalCheck' && (
            <StepFinalCheck
              isRejected={isRejected} rejectionReason={rejectionReason} rejectedAt={rejectedAt} rejectedBy={rejectedBy}
              collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} setCurrentStep={setCurrentStep}
              selectedStaff={selectedStaff} contractType={contractType} workPlace={workPlace} documentType={documentType}
              csvMode={csvMode} csvSystem={csvSystem} csvSnapshot={csvSnapshot} CsvBadge={CsvBadge}
              workLocationName={workLocationName} workLocationAddress={workLocationAddress} workLocationTel={workLocationTel}
              businessContent={businessContent}
              startTime={startTime} endTime={endTime} isShift={isShift} breakTime={breakTime}
              workingHoursH={workingHoursH} workingHoursM={workingHoursM}
              workDays={workDays} workDaysOther={workDaysOther} responsibility={responsibility}
              pattern={pattern}
              cmd_dept={cmd_dept} cmd_role={cmd_role} cmd_name={cmd_name} cmd_tel={cmd_tel}
              resp_dept={resp_dept} resp_role={resp_role} resp_name={resp_name} resp_tel={resp_tel}
              comp_dept={comp_dept} comp_role={comp_role} comp_name={comp_name} comp_tel={comp_tel}
              welfare={welfare} safetyText={safetyText} conflictText={conflictText}
              mgr_dept={mgr_dept} mgr_role={mgr_role} mgr_name={mgr_name} mgr_tel={mgr_tel}
              cmp_dept={cmp_dept} cmp_role={cmp_role} cmp_name={cmp_name} cmp_tel={cmp_tel}
              masterSnapshot={masterSnapshot} mgrCmpSource={mgrCmpSource}
              dispatchStart={dispatchStart} dispatchEnd={dispatchEnd}
              isConflictDateExempt={isConflictDateExempt} conflictDate={conflictDate} conflictDateOrg={conflictDateOrg}
              organizationUnit={organizationUnit}
              period={period} contractStartDate={contractStartDate} employStart={employStart} employEnd={employEnd}
              trialPeriod={trialPeriod} trialStart={trialStart} trialEnd={trialEnd} trialCalc={trialCalc}
              trialWarningChecked={trialWarningChecked} setTrialWarningChecked={setTrialWarningChecked}
              isProbableNewHire={isProbableNewHire}
              noTrialWarningChecked={noTrialWarningChecked} setNoTrialWarningChecked={setNoTrialWarningChecked}
              flexTime={flexTime} overtime={overtime}
              closingPattern={closingPattern} remarksText={remarksText}
              salaryType={salaryType} basicSalary={basicSalary} rolePay={rolePay} skillPay={skillPay} salesPay={salesPay}
              overtimePay={overtimePay} overtimeHours={overtimeHours} housingPay={housingPay}
              salaryTotal={salaryTotal} salaryWarningChecked={salaryWarningChecked} setSalaryWarningChecked={setSalaryWarningChecked}
              hourlyMonthlyBreakdown={hourlyMonthlyBreakdown}
              selectedTransport={selectedTransport}
              hasEmployInsurance={hasEmployInsurance} hasSocialInsurance={hasSocialInsurance}
              insurancePreview={insurancePreview} deductionText={deductionText}
              isSubmitted={isSubmitted} user={user}
              hasCsvModifiedFields={hasCsvModifiedFields}
              csvModWarningChecked={csvModWarningChecked} setCsvModWarningChecked={setCsvModWarningChecked}
              submitError={submitError} isSubmitting={isSubmitting}
              setShowConfirmModal={setShowConfirmModal} handleSubmitContract={handleSubmitContract}
              showConfirmModal={showConfirmModal} originalFieldsSnapshot={originalFieldsSnapshot} buildCurrentFields={buildCurrentFields}
              handleBack={handleBack}
            />
          )}
        </div>
      </main>
    </div>
  )
}

// useSearchParams()を使うため、Next.jsの要件でSuspenseで包んで外部公開する
export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="p-8" style={{ color: '#5A6A8A' }}>読み込み中...</div>}>
      <ApplyPageInner />
    </Suspense>
  )
}
