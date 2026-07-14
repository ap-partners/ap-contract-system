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


function ApplyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editContractId = searchParams.get('edit') // 再申請モード：/apply?edit=契約ID で開いた場合の契約ID
  const [editLoading, setEditLoading] = useState(!!editContractId)
  const [editNotFound, setEditNotFound] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
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
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD（検索した瞬間の日付）
    // 社員番号での検索と氏名での検索を別クエリに分け、結果をマージする。
    // （.or()にqueryを直接埋め込むと、入力に「,」や「(」「)」が含まれた場合にフィルタ構文が壊れたり、
    //   意図しない条件が注入される可能性があるため、.ilike()の値として安全に渡せる形に分離している）
    const [byNumber, byName] = await Promise.all([
      supabase.from('staff').select('*, department_master(dept_name)').ilike('employee_number', `%${query}%`).limit(20),
      supabase.from('staff').select('*, department_master(dept_name)').ilike('name', `%${normalized}%`).limit(20),
    ])
    const merged = [...(byNumber.data || []), ...(byName.data || [])]
    const data = Array.from(new Map(merged.map((s: any) => [s.employee_number, s])).values()) // employee_number/nameの両方に一致した場合の重複を除去
    // department_master(dept_name) は { department_master: { dept_name: '...' } } の形で返るため、
    // page.tsx側の表示コード（selectedStaff.department）と互換性を持たせるためフラットな形に変換する
    // 同時に、退職年月日・退職予定日が今日より前のスタッフは検索結果から除外する（リアルタイム判定）
    const flattened = (data || [])
      .filter((s: any) => {
        if (s.retired_at && s.retired_at < today) return false
        if (s.retirement_scheduled_at && s.retirement_scheduled_at < today) return false
        return true
      })
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
  }, [])

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleCancel = () => {
    if (!confirm('入力中の申請を中断します。入力した内容は保存されません。よろしいですか？')) return
    router.push('/dashboard/sales')
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
        .select('dept_no')
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

      const { error } = editContractId
        ? await supabase.from('contracts').update({
            ...payload,
            rejection_reason: null,
            rejected_by: null,
            rejected_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', editContractId)
        : await supabase.from('contracts').insert({
            ...payload,
            created_by: user.id,
          })

      if (error) {
        setSubmitError('申請の保存に失敗しました。お手数ですが、もう一度お試しください。（' + error.message + '）')
        setIsSubmitting(false)
        return
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
  if (!user || editLoading) return <div className="p-8" style={{ color: '#5A6A8A' }}>読み込み中...</div>
  if (editNotFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F5F7FC' }}>
      <p className="text-lg font-bold" style={{ color: '#1A2340' }}>再申請する差し戻し案件が見つかりませんでした</p>
      <button onClick={() => router.push('/dashboard/sales')}
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
        setReqError('依頼の送信に失敗しました。お手数ですが、もう一度お試しください。（' + error.message + '）')
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
        setCsvRequestError('依頼の送信に失敗しました。お手数ですが、もう一度お試しください。（' + error.message + '）')
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
            <>
              <FormRow label="対象スタッフ" required>
                {selectedStaff ? (
                  <div className="flex items-center gap-3 rounded-lg px-4 py-3 max-w-xl border"
                    style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                      style={{ background: '#1B3A8C', color: 'white' }}>
                      {selectedStaff.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words" style={{ color: '#1A2340' }}>{selectedStaff.name}</p>
                      <p className="text-xs break-words" style={{ color: '#5A6A8A' }}>
                        {selectedStaff.department && `${selectedStaff.department}　`}社員番号：{selectedStaff.employee_number}
                      </p>
                    </div>
                    <button onClick={e => { e.preventDefault(); setSelectedStaff(null); setSearched(false); setSearchResults([]); setContractType(''); setShowContractTypeLockedMsg(false) }}
                      className="ml-auto text-xs rounded-md px-2 py-1 border bg-white shrink-0"
                      style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>変更</button>
                  </div>
                ) : (
                  <div className="max-w-xl">
                    {!reqSubmitted && <SearchInput onSearch={handleSearch} />}
                    {searched && searchResults.length === 0 && (
                      <div className="mt-2">
                        {!reqSubmitted && <p className="text-xs text-red-400 mb-2">該当するスタッフが見つかりませんでした</p>}
                        {!showRequestForm && !reqSubmitted && (
                          <button
                            onClick={e => { e.preventDefault(); setShowRequestForm(true) }}
                            className="text-xs px-3 py-2 rounded-lg border font-medium"
                            style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                            管理部へスタッフマスタ登録を依頼する
                          </button>
                        )}
                        {reqSubmitted && (
                          <div className="rounded-lg p-4 border mt-2" style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
                            <p className="text-sm font-medium mb-1" style={{ color: '#0D9488' }}>✓ 依頼を送信しました</p>
                            <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>
                              管理部へスタッフマスタ登録依頼を送信しました。<br />
                              登録が完了するとメール通知が届きますので、その後に再度申請してください。
                            </p>
                          </div>
                        )}
                        {showRequestForm && !reqSubmitted && (
                          <div className="mt-3 rounded-lg border overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
                            <div className="px-4 py-3 border-b" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                              <p className="text-sm font-medium" style={{ color: '#1B3A8C' }}>管理部へスタッフマスタ登録を依頼</p>
                              <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>以下の情報を入力して送信してください</p>
                            </div>
                            <div className="bg-white p-4 flex flex-col gap-3">
                              {/* 社員番号 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  社員番号
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" inputMode="numeric" maxLength={6}
                                  value={reqEmployeeNumber}
                                  onChange={e => setReqEmployeeNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs placeholder:text-gray-400"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）100001（半角数字6桁）" />
                                {reqEmployeeNumber && !/^\d{6}$/.test(reqEmployeeNumber) && (
                                  <p className="text-xs" style={{ color: '#DC2626' }}>半角数字6桁で入力してください</p>
                                )}
                              </div>
                              {/* スタッフ氏名 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  スタッフ氏名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={reqName}
                                  onChange={e => setReqName(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs placeholder:text-gray-400"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）山田 太郎" />
                              </div>
                              {/* 部門名 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  部門名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={reqDept}
                                  onChange={e => setReqDept(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs placeholder:text-gray-400"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）関西支社" />
                              </div>
                              {/* 入社日 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  入社日
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="date" value={reqHireDate}
                                  onChange={e => setReqHireDate(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none w-40 placeholder:text-gray-400"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                              </div>
                              {/* CSVインポート同時依頼 */}
                              <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox" checked={reqWithCsv}
                                    onChange={e => { setReqWithCsv(e.target.checked); setReqCsvSystem(''); setReqDispatchStart(''); setReqWorkLocation('') }}
                                    className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                                  <span className="text-xs font-medium" style={{ color: '#1A2340' }}>CSVインポートも同時に依頼する</span>
                                </label>
                                {reqWithCsv && (
                                  <div className="pl-6 flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                        使用システム
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                      </label>
                                      <div className="flex gap-2 flex-wrap">
                                        {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => (
                                          <button key={s}
                                            onClick={e => { e.preventDefault(); setReqCsvSystem(s) }}
                                            className="px-3 py-1.5 border rounded-lg text-xs transition-colors"
                                            style={{
                                              borderColor: reqCsvSystem === s ? '#1B3A8C' : '#D0DAF0',
                                              background: reqCsvSystem === s ? '#EEF2FA' : 'white',
                                              color: reqCsvSystem === s ? '#1B3A8C' : '#1A2340',
                                              fontWeight: reqCsvSystem === s ? 600 : 400,
                                            }}>{s}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                        派遣開始日
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                      </label>
                                      <input
                                        type="date" value={reqDispatchStart}
                                        onChange={e => setReqDispatchStart(e.target.value)}
                                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none w-40 placeholder:text-gray-400"
                                        style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                                    </div>
                                    {/* 就業場所名（2026-07-14：CSVインポートが絡む依頼のみ必須にするため、
                                        単独のスタッフマスタ登録依頼からはこの欄自体を外しここへ移動） */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                        就業場所名
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                      </label>
                                      <input
                                        type="text" value={reqWorkLocation}
                                        onChange={e => setReqWorkLocation(e.target.value)}
                                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-sm placeholder:text-gray-400"
                                        style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                        placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* ボタン */}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={e => { e.preventDefault(); handleSubmitRequest() }}
                                  disabled={reqSubmitting}
                                  className="text-white px-4 py-2 rounded-lg text-xs font-medium"
                                  style={{ background: '#1B3A8C', opacity: reqSubmitting ? 0.6 : 1, cursor: reqSubmitting ? 'not-allowed' : 'pointer' }}>
                                  {reqSubmitting ? '送信中…' : '依頼を送信する'}
                                </button>
                                <button
                                  onClick={e => { e.preventDefault(); setShowRequestForm(false) }}
                                  disabled={reqSubmitting}
                                  className="px-4 py-2 rounded-lg text-xs border"
                                  style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
                                  キャンセル
                                </button>
                              </div>
                              {reqError && <p className="text-xs" style={{ color: '#DC2626' }}>{reqError}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {searched && searchResults.length === 10 && (
                      <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>候補が多すぎます。もう少し詳しく入力して再検索してください。</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="border rounded-lg mt-1.5 overflow-hidden bg-white shadow-sm" style={{ borderColor: '#D0DAF0' }}>
                        {searchResults.map(s => (
                          <button key={s.id}
                            onClick={e => {
                              e.preventDefault()
                              setSelectedStaff(s)
                              setSearchResults([])
                              setShowContractTypeLockedMsg(false)
                              // 雇用区分の自動反映：スタッフマスタの契約形態が有期契約/無期契約/正社員/アルバイトのいずれかであれば自動選択する
                              // （null=雇用形態不明の場合のみ自動選択せず、手動選択可能のままにする）
                              if (['アルバイト', '有期契約', '無期契約', '正社員'].includes(s.contract_type)) {
                                setContractType(s.contract_type)
                              } else {
                                setContractType('')
                              }
                            }}
                            className="w-full text-left px-4 py-2.5 border-b last:border-0 flex items-center gap-3 hover:bg-blue-50 transition-colors"
                            style={{ borderColor: '#D0DAF0' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                              style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                              {s.name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{s.name}</p>
                              {s.department && <p className="text-xs" style={{ color: '#5A6A8A' }}>{s.department}</p>}
                            </div>
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>{s.employee_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </FormRow>

              {!reqSubmitted && (
                <>
                  <FormRow label="雇用区分" required>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex border rounded-lg overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                          {['アルバイト', '有期契約', '無期契約', '正社員'].map(v => (
                            <button key={v}
                              onClick={e => {
                                e.preventDefault()
                                if (isContractTypeLocked) {
                                  // ロック中はスタッフマスタの値以外への変更を禁止し、案内メッセージを表示する
                                  if (v !== contractType) setShowContractTypeLockedMsg(true)
                                  return
                                }
                                setContractType(v)
                              }}
                              className="py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap text-center"
                              style={{
                                width: '84px',
                                borderColor: '#D0DAF0',
                                background: contractType === v ? '#1B3A8C' : 'white',
                                color: contractType === v ? 'white' : (isContractTypeLocked ? '#A8B3C9' : '#1A2340'),
                                fontWeight: contractType === v ? 600 : 400,
                                cursor: isContractTypeLocked ? 'not-allowed' : 'pointer',
                              }}>{v}</button>
                          ))}
                        </div>
                        <div className="w-px h-7 shrink-0" style={{ background: '#D0DAF0' }} />
                        <div className="flex items-center gap-2">
                          <span className="text-sm shrink-0" style={{ color: '#5A6A8A' }}>勤務地</span>
                          <select value={workPlace} onChange={e => setWorkPlace(e.target.value)}
                            className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none"
                            style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                            <option value="現場">現場</option>
                            <option value="社内">社内</option>
                          </select>
                        </div>
                      </div>
                      {isContractTypeLocked && (
                        <p className="text-xs" style={{ color: '#5A6A8A' }}>
                          スタッフマスタの雇用区分が自動反映されています（変更不可）
                        </p>
                      )}
                      {showContractTypeLockedMsg && (
                        <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3"
                          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                          <span>先にスタッフ情報申請にて雇用区分変更の手続きを行ってください。</span>
                          <button onClick={e => { e.preventDefault(); setShowContractTypeLockedMsg(false) }}
                            className="shrink-0 underline">閉じる</button>
                        </div>
                      )}
                    </div>
                  </FormRow>

                  <FormRow label="帳票種別" required>
                    <div className="grid grid-cols-3 gap-2 max-w-2xl">
                      {getDocumentTypes(workPlace).map(d => (
                        <button key={d.value} onClick={e => { e.preventDefault(); setDocumentType(d.value) }}
                          className="text-left p-3 rounded-lg border transition-all"
                          style={{
                            borderColor: documentType === d.value ? '#1B3A8C' : '#D0DAF0',
                            background: documentType === d.value ? '#EEF2FA' : 'white',
                          }}>
                          <p className="text-xs font-medium leading-snug whitespace-pre-line"
                            style={{ color: documentType === d.value ? '#1B3A8C' : '#1A2340' }}>{d.value}</p>
                          <p className="text-xs mt-1" style={{ color: documentType === d.value ? '#4A7FD4' : '#5A6A8A' }}>{d.step}</p>
                        </button>
                      ))}
                      {workPlace === '社内' && ['就業条件明示書', '雇用契約書 兼\n就業条件明示書'].map(d => (
                        <div key={d} className="p-3 border rounded-lg opacity-40 cursor-not-allowed"
                          style={{ borderColor: '#D0DAF0', background: '#F5F7FC' }}>
                          <p className="text-xs leading-snug whitespace-pre-line" style={{ color: '#5A6A8A' }}>{d}</p>
                          <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>社内は選択不可</p>
                        </div>
                      ))}
                    </div>
                    {documentType && contractType && (
                      <div className="max-w-2xl rounded-lg px-4 py-3 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                        <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>✓ 発行する帳票</p>
                        <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{fullDocumentName}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>
                          {pattern === 'A' ? '雇用契約書のみ・6STEP で申請できます' :
                           pattern === 'B' ? '就業条件明示書のみ・給与入力なし・6STEP で申請できます' :
                           '全項目入力・8STEP で申請できます'}
                        </p>
                      </div>
                    )}
                  </FormRow>

                  {/* 最低賃金マスタ未登録による強制ブロック（7-5章の例外規定・2026-07-06実装） */}
                  {deptWageMasterMissing && (
                    <div className="max-w-2xl rounded-lg px-4 py-3 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                      <p className="text-sm font-bold" style={{ color: '#DC2626' }}>🔴 この部門は申請できません</p>
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#1A2340' }}>
                        {selectedStaff?.department || 'この部門'}は、最低賃金マスタが未登録のため、
                        <br />
                        現場配属での申請ができません。
                        <br />
                        管理部にマスタ登録を依頼してください。
                      </p>
                    </div>
                  )}

                  <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    <button onClick={e => {
                      e.preventDefault()
                      if (!selectedStaff || !documentType || !contractType) { alert('すべての項目を選択してください'); return }
                      if (deptWageMasterMissing) { alert('この部門は最低賃金マスタが未登録のため、申請できません。管理部にお問い合わせください。'); return }
                      handleNext()
                    }} disabled={deptWageMasterMissing}
                      className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ background: deptWageMasterMissing ? '#A8B3C9' : '#1B3A8C', cursor: deptWageMasterMissing ? 'not-allowed' : 'pointer' }}>次へ進む →</button>
                  </div>
                </>
              )}

              {reqSubmitted && (
                <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  <button onClick={e => {
                    e.preventDefault()
                    // 依頼送信後の画面をリセットし、別のスタッフを検索し直せる状態に戻す
                    setReqSubmitted(false)
                    setShowRequestForm(false)
                    setReqEmployeeNumber(''); setReqName(''); setReqDept(''); setReqHireDate('')
                    setReqWorkLocation(''); setReqWithCsv(false); setReqCsvSystem(''); setReqDispatchStart('')
                    setReqError('')
                    setSearched(false); setSearchResults([])
                    setContractType(''); setDocumentType(''); setShowContractTypeLockedMsg(false)
                  }} className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: '#1B3A8C' }}>別のスタッフを探す</button>
                </div>
              )}
            </>
          )}

          {/* ===== STEP2 ===== */}
          {stepType === 'workInfo' && (
            <>
              {/* CSV依頼完了画面 */}
              {csvRequestSent ? (
                <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
                  <p className="text-4xl">📨</p>
                  <p className="text-base font-bold" style={{ color: '#1A2340' }}>管理部へCSVインポート依頼を送信しました</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                    インポートが完了するとメール通知が届きます。<br />
                    お手数ですが、その後に再度申請してください。<br /><br />
                    急ぎで雇用契約書のみの発行へ切り替えたい場合は、<br />
                    前のSTEPへ戻りお手続きをお願いします。
                  </p>
                  <button onClick={e => { e.preventDefault(); setCsvRequestSent(false) }}
                    className="text-sm px-5 py-2.5 rounded-lg border"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
                    ← 前のSTEPへ戻る
                  </button>
                </div>
              ) : (
                <>
                  {/* 契約情報の入力方法 */}
                  <div style={{ height: '12px', background: '#F5F7FC' }} />
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-start gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>入力方法</span>
                      <Req />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-3"
                      style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      {/* 選択カード */}
                      <div className="grid grid-cols-2 gap-3" style={{ maxWidth: '520px' }}>
                        {[
                          { mode: 'csv' as const, icon: '/icons/step2-csv.png', label: 'CSVデータから自動入力', desc: '派遣管理システムのデータから自動で反映します' },
                          { mode: 'manual' as const, icon: '/icons/step2-manual.png', label: '手動で入力する', desc: '派遣管理システムを使わず直接入力します' },
                        ].map(({ mode, icon, label, desc }) => (
                          <button key={mode}
                            onClick={e => {
                              e.preventDefault()
                              const isModeChanging = csvMode !== mode
                              setCsvMode(mode); setCsvSearched(false); setCsvResults([]); setCsvNoResults(false)
                              // 入力方法が実際に切り替わった時だけ、新規作成時と同じ状態に完全にリセットする（確定仕様）
                              if (isModeChanging) resetStep2Step3ForModeChange()
                            }}
                            className="flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all"
                            style={{
                              borderColor: csvMode === mode ? '#1B3A8C' : '#D0DAF0',
                              borderWidth: csvMode === mode ? '1.5px' : '1px',
                              background: csvMode === mode ? '#EEF2FA' : 'white',
                            }}>
                            <img src={icon} alt={label} style={{ width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0 }} />
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold" style={{ color: '#1B3A8C' }}>{label}</span>
                              <span className="text-xs leading-relaxed" style={{ color: '#5A6A8A' }}>{desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* CSV検索エリア */}
                      {csvMode === 'csv' && (
                        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                          <div className="flex gap-3 flex-wrap items-end">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>使用システム</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => (
                                  <button key={s}
                                    onClick={e => { e.preventDefault(); setCsvSystem(s) }}
                                    className="px-3 py-1.5 border rounded-lg text-xs transition-colors"
                                    style={{
                                      borderColor: csvSystem === s ? '#1B3A8C' : '#D0DAF0',
                                      background: csvSystem === s ? '#EEF2FA' : 'white',
                                      color: csvSystem === s ? '#1B3A8C' : '#1A2340',
                                      fontWeight: csvSystem === s ? 600 : 400,
                                    }}>{s}</button>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>派遣開始日</span>
                              <input type="date" className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none placeholder:text-gray-400"
                                style={{
                                  borderColor: csvDispatchStart ? '#D0DAF0' : '#D97706',
                                  background: csvDispatchStart ? 'white' : '#FFFBEB',
                                  color: '#1A2340', width: '150px',
                                }}
                                value={csvDispatchStart} onChange={e => setCsvDispatchStart(e.target.value)} />
                            </div>
                            <button
                              disabled={!csvDispatchStart || csvLoading}
                              onClick={async e => {
                                e.preventDefault()
                                if (!csvDispatchStart) return
                                setCsvLoading(true)
                                setCsvSearched(false)
                                setCsvNoResults(false)
                                setCsvResults([])

                                // システムごとの検索キー対応（確定仕様）
                                // - e-staffing：staff_code そのまま
                                // - HRstation：staff_code（先頭の「F3810」を除いた数字部分）。CSV側の値にF3810が付くため、
                                //   ここでは社員番号の前に「F3810」を付けて比較する
                                // - winworks：CSVのstaff_codeではなく、staff.crew_code の値で検索
                                // - Staffia：staff_code（雇用元管理コード）そのまま
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
                              }}
                              className="text-white text-xs px-4 py-1.5 rounded-lg transition-opacity"
                              style={{ background: '#1B3A8C', height: '32px', whiteSpace: 'nowrap', opacity: (csvDispatchStart && !csvLoading) ? 1 : 0.4, cursor: (csvDispatchStart && !csvLoading) ? 'pointer' : 'not-allowed' }}>
                              {csvLoading ? '検索中...' : '検索'}
                            </button>
                          </div>

                          {!csvSearched && !csvLoading && (
                            <p className="text-xs" style={{ color: '#5A6A8A' }}>使用システムと派遣開始日を入力して検索してください。</p>
                          )}

                          {/* ヒットあり */}
                          {csvSearched && csvResults.length > 0 && !csvNoResults && (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs" style={{ color: '#5A6A8A' }}>{csvResults.length}件見つかりました。該当する就業先を選択してください。</p>
                              <div className="rounded-lg border overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                                {csvResults.map((r, idx) => (
                                  <button key={idx}
                                    onClick={e => {
                                      e.preventDefault()
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
                                    }}
                                    className="w-full text-left px-3.5 py-3 border-b last:border-0 transition-colors"
                                    style={{
                                      borderColor: '#D0DAF0',
                                      background: csvSelectedId === idx ? '#EEF2FA' : 'white',
                                      borderLeft: csvSelectedId === idx ? '3px solid #1B3A8C' : 'none',
                                    }}>
                                    <p className="text-xs font-medium mb-0.5" style={{ color: '#1B3A8C' }}>{r.start} 〜 {r.end}</p>
                                    <p className="text-[13px] font-medium mb-1" style={{ color: '#1A2340' }}>{r.name}</p>
                                    <p className="text-xs" style={{ color: '#5A6A8A' }}>{r.address}</p>
                                    {r.tel && <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>TEL：{r.tel}</p>}
                                  </button>
                                ))}
                              </div>
                              {/* 一覧下部：対象データが違う場合の依頼ボタン */}
                              <div className="flex flex-col gap-2 px-3 py-2 rounded-lg border"
                                style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                                <span className="text-xs" style={{ color: '#5A6A8A' }}>該当する就業先が一覧にありませんか？</span>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                    就業場所名
                                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                  </label>
                                  <input
                                    type="text" value={csvRequestWorkLocation}
                                    onChange={e => setCsvRequestWorkLocation(e.target.value)}
                                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-sm placeholder:text-gray-400"
                                    style={{ borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }}
                                    placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                                </div>
                                <button
                                  onClick={e => { e.preventDefault(); handleSubmitCsvRequest() }}
                                  disabled={csvRequestSubmitting}
                                  className="self-start text-xs px-3 py-1.5 rounded-lg border"
                                  style={{ color: '#DC2626', borderColor: '#FECACA', background: 'white', whiteSpace: 'nowrap', opacity: csvRequestSubmitting ? 0.6 : 1 }}>
                                  {csvRequestSubmitting ? '送信中…' : '管理部へCSVインポートを依頼する'}
                                </button>
                              </div>
                              {csvRequestError && <p className="text-xs" style={{ color: '#DC2626' }}>{csvRequestError}</p>}
                            </div>
                          )}

                          {/* ヒットなし */}
                          {csvSearched && (csvNoResults || csvResults.length === 0) && (
                            <div className="rounded-lg border p-3 flex flex-col gap-2"
                              style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                              <p className="text-xs" style={{ color: '#DC2626' }}>対象スタッフの就業先データが見つかりませんでした。</p>
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  就業場所名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={csvRequestWorkLocation}
                                  onChange={e => setCsvRequestWorkLocation(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-sm placeholder:text-gray-400"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }}
                                  placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={e => { e.preventDefault(); handleSubmitCsvRequest() }}
                                  disabled={csvRequestSubmitting}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white"
                                  style={{ background: '#DC2626', opacity: csvRequestSubmitting ? 0.6 : 1 }}>
                                  {csvRequestSubmitting ? '送信中…' : '管理部へCSVインポートを依頼する'}
                                </button>
                                <button
                                  onClick={e => { e.preventDefault(); setCsvMode('manual') }}
                                  className="text-xs px-3 py-1.5 rounded-lg border"
                                  style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: 'white' }}>
                                  手動で入力する
                                </button>
                              </div>
                              {csvRequestError && <p className="text-xs" style={{ color: '#DC2626' }}>{csvRequestError}</p>}
                            </div>
                          )}


              {/* 自動反映済み通知 */}
                          {csvSelectedId !== null && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                              style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: '#0D9488' }}>
                              ✅ CSVデータから契約情報を自動反映しました。内容を確認し、必要であれば修正してください。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 就業先情報 */}
                  <SectionHeader label="就業先情報" />
                  <FormRow label="就業場所名" required badge={<CsvBadge name="locationName" />} wide
                    isEmpty={showEmptyHint && !workLocationName} emptyHint="入力してください">
                    <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={workLocationName}
                      onChange={e => { setWorkLocationName(e.target.value) }}
                      placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                  </FormRow>
                  <FormRow label="就業場所住所" required badge={<CsvBadge name="locationAddress" />} wide
                    isEmpty={showEmptyHint && !workLocationAddress} emptyHint="入力してください">
                    <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={workLocationAddress}
                      onChange={e => { setWorkLocationAddress(e.target.value) }}
                      placeholder="例）東京都福生市本町36番地1" />
                  </FormRow>
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-col items-start justify-center gap-1.5"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <div className="flex items-center flex-wrap gap-1">
                        <span className="text-sm font-medium" style={{ color: '#1A2340' }}>就業場所電話番号</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#F5F7FC', color: '#5A6A8A', border: '1px solid #D0DAF0' }}>任意</span>
                      </div>
                      <CsvBadge name="locationTel" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-1.5" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <TelInput value={workLocationTel} onChange={setWorkLocationTel}
                        note="未入力の場合、帳票の「TEL:」以降は表示されません" />
                    </div>
                  </div>
                  <FormRow label="業務内容" required badge={<CsvBadge name="business" />} wide
                    isEmpty={showEmptyHint && !businessContent} emptyHint="入力してください">
                    <textarea
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 placeholder:text-gray-400"
                      style={{ borderColor: (showEmptyHint && !businessContent) ? '#DC2626' : '#D0DAF0', color: '#1A2340', maxWidth: '480px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6', width: '100%' }}
                      value={businessContent}
                      onChange={e => { setBusinessContent(e.target.value) }}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                      placeholder="例）携帯電話販売促進業務" />
                    <p className="text-xs" style={{ color: '#5A6A8A' }}>Enterキーでの改行はできません</p>
                  </FormRow>

                  <FormRow label="始業・終業時刻" required
                    badge={<div className="flex flex-col gap-0.5"><CsvBadge name="startTime" /><CsvBadge name="endTime" /></div>}
                    isEmpty={showEmptyHint && (!startTime || !endTime)} emptyHint="入力してください">
                    <div className="flex items-center gap-2 flex-nowrap">
                      <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>始業</span>
                      <input type="time" className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 shrink-0"
                        style={{ borderColor: (showEmptyHint && !startTime) ? '#DC2626' : '#D0DAF0', color: '#1A2340', width: '130px' }}
                        value={startTime}
                        onChange={e => { setStartTime(e.target.value) }} />
                      <span className="text-sm shrink-0" style={{ color: '#5A6A8A' }}>〜</span>
                      <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>終業</span>
                      <input type="time" className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 shrink-0"
                        style={{ borderColor: (showEmptyHint && !endTime) ? '#DC2626' : '#D0DAF0', color: '#1A2340', width: '130px' }}
                        value={endTime}
                        onChange={e => { setEndTime(e.target.value) }} />
                      <button
                        onClick={e => { e.preventDefault(); setIsShift(!isShift) }}
                        className="px-3 py-1.5 border rounded-lg text-xs transition-colors shrink-0"
                        style={{
                          borderColor: isShift ? '#1B3A8C' : '#D0DAF0',
                          background: isShift ? '#EEF2FA' : 'white',
                          color: isShift ? '#1B3A8C' : '#1A2340',
                          fontWeight: isShift ? 600 : 400,
                        }}>シフト制</button>
                    </div>
                  </FormRow>

                  <FormRow label="休憩時間" required badge={<CsvBadge name="breakTime" />} hintInline
                    isEmpty={showEmptyHint && !breakTime} emptyHint="入力してください">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20 placeholder:text-gray-400"
                          style={{ borderColor: (showEmptyHint && !breakTime) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={breakTime}
                          onChange={e => { setBreakTime(toHalfWidthDigits(e.target.value)) }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>分</span>
                        {showEmptyHint && !breakTime && <EmptyHintBubble text="入力してください" direction="left" />}
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）60、75、90</p>
                    </div>
                  </FormRow>

                  <FormRow label="所定労働時間" required badge={<CsvBadge name="workingHours" />} hintInline
                    isEmpty={showEmptyHint && !workingHoursH} emptyHint="入力してください">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20 placeholder:text-gray-400"
                          style={{ borderColor: (showEmptyHint && !workingHoursH) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={workingHoursH}
                          onChange={e => { setWorkingHoursH(toHalfWidthDigits(e.target.value)) }}
                          onBlur={() => setWorkingHoursH(prev => padTwoDigits(prev))} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>時間</span>
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={workingHoursM}
                          onChange={e => { setWorkingHoursM(toHalfWidthDigits(e.target.value)) }}
                          onBlur={() => setWorkingHoursM(prev => padTwoDigits(prev))} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>分</span>
                        {showEmptyHint && !workingHoursH && <EmptyHintBubble text="入力してください" direction="left" />}
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）8時間00分</p>
                      {workingHoursWarn && (
                        <div className="flex items-start gap-2 rounded-lg px-4 py-3 text-xs"
                          style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                          ⚠️ {workingHoursWarn}
                        </div>
                      )}
                    </div>
                  </FormRow>

                  {/* 所定労働日数 */}
                  <FormRow label="所定労働日数" required hintInline
                    isEmpty={showEmptyHint && (!workDays || (workDays === 'other' && !workDaysOther))} emptyHint="選択してください">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { value: '週5日', label: '週5日' },
                          { value: '週4日', label: '週4日' },
                          { value: '週3日', label: '週3日' },
                          { value: 'other', label: 'その他' },
                        ].map(({ value, label }) => (
                          <button key={value}
                            onClick={e => { e.preventDefault(); setWorkDays(value) }}
                            className="px-4 py-2 border rounded-lg text-sm transition-colors"
                            style={{
                              borderColor: workDays === value ? '#1B3A8C' : '#D0DAF0',
                              background: workDays === value ? '#EEF2FA' : 'white',
                              color: workDays === value ? '#1B3A8C' : '#1A2340',
                              fontWeight: workDays === value ? 600 : 400,
                            }}>{label}</button>
                        ))}
                      </div>
                      {showEmptyHint && !workDays && <EmptyHintBubble text="選択してください" direction="left" />}
                    </div>
                    {workDays === 'other' && (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="text" className={`${inp}`}
                          style={{ borderColor: (showEmptyHint && !workDaysOther) ? '#DC2626' : '#D0DAF0', color: '#1A2340', maxWidth: '280px' }}
                          value={workDaysOther} onChange={e => setWorkDaysOther(e.target.value)}
                          placeholder="例）18日、カレンダー暦通り" />
                        <p className="text-xs" style={{ color: '#5A6A8A' }}>帳票にそのまま表示されます</p>
                        {showEmptyHint && !workDaysOther && <EmptyHintBubble text="入力してください" direction="left" />}
                      </div>
                    )}
                  </FormRow>

                  {/* 就業条件明示書の追加項目 */}
                  {(pattern === 'B' || pattern === 'C') && (
                    <>
                      <SectionHeader label="就業条件明示書の追加項目" />
                      <FormRow label="業務に伴う責任の程度" required tooltip={TOOLTIPS['業務に伴う責任の程度']} badge={<CsvBadge name="resp" />}
                        isEmpty={showEmptyHint && !responsibility} emptyHint="選択してください">
                        <RadioGroup name="responsibility" value={responsibility}
                          onChange={v => { setResponsibility(v) }} />
                      </FormRow>
                    </>
                  )}
                  <NavButtons onNext={() => {
                    const err = validateStep2()
                    if (err) { alert(err); return }
                    handleNext()
                  }} />
                </>
              )}
            </>
          )}

          {/* ===== STEP3：派遣先担当者 ===== */}
          {stepType === 'dispatchContact' && (
            <>
              <SectionHeader label="指揮命令者" />
              <FormRow label="部署名" required badge={<CsvBadge name="cmdDept" />} wide
                isEmpty={showEmptyHint && !cmd_dept} emptyHint="入力してください">
                <input className={inp} style={deptInputStyle} value={cmd_dept} onChange={e => { setCmdDept(e.target.value) }}
                  placeholder="例）東日本ｴﾘｱ営業本部 関東営業統括部 第3営業部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="cmdRole" />}
                isEmpty={showEmptyHint && !cmd_role} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={cmd_role} onChange={e => { setCmdRole(e.target.value) }} placeholder="例）課長" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="cmdName" />}
                isEmpty={showEmptyHint && !cmd_name} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={cmd_name} onChange={e => { setCmdName(e.target.value) }} placeholder="例）山田 太郎" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="cmdTel" />}
                isEmpty={showEmptyHint && !cmd_tel} emptyHint="入力してください">
                <TelInput value={cmd_tel} onChange={v => { setCmdTel(v) }} />
              </FormRow>

              <SectionHeader label="派遣先責任者" />
              <FormRow label="部署名" required badge={<CsvBadge name="respDept" />} wide
                isEmpty={showEmptyHint && !resp_dept} emptyHint="入力してください">
                <input className={inp} style={deptInputStyle} value={resp_dept} onChange={e => { setRespDept(e.target.value) }} placeholder="例）人事部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="respRole" />}
                isEmpty={showEmptyHint && !resp_role} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={resp_role} onChange={e => { setRespRole(e.target.value) }} placeholder="例）部長" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="respName" />}
                isEmpty={showEmptyHint && !resp_name} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={resp_name} onChange={e => { setRespName(e.target.value) }} placeholder="例）鈴木 花子" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="respTel" />}
                isEmpty={showEmptyHint && !resp_tel} emptyHint="入力してください">
                <TelInput value={resp_tel} onChange={v => { setRespTel(v) }} />
              </FormRow>

              <SectionHeader label="苦情処理申出先（派遣先）" />
              <FormRow label="部署名" required badge={<CsvBadge name="compDept" />} wide
                isEmpty={showEmptyHint && !comp_dept} emptyHint="入力してください">
                <input className={inp} style={deptInputStyle} value={comp_dept} onChange={e => { setCompDept(e.target.value) }} placeholder="例）総務部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="compRole" />}
                isEmpty={showEmptyHint && !comp_role} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={comp_role} onChange={e => { setCompRole(e.target.value) }} placeholder="例）担当者" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="compName" />}
                isEmpty={showEmptyHint && !comp_name} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={comp_name} onChange={e => { setCompName(e.target.value) }} placeholder="例）田中 次郎" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="compTel" />}
                isEmpty={showEmptyHint && !comp_tel} emptyHint="入力してください">
                <TelInput value={comp_tel} onChange={v => { setCompTel(v) }} />
              </FormRow>

              <SectionHeader label="追加項目" />
              <FormRow label="福利厚生施設の利用等" required badge={<CsvBadge name="welfare" />} wide
                isEmpty={showEmptyHint && !welfare} emptyHint="入力してください">
                <NoBreakTextarea value={welfare} onChange={v => { setWelfare(v) }} placeholder="例）社員食堂・更衣室の利用可" minHeight="60px" />
              </FormRow>
              <FormRow label="安全及び衛生" required badge={<CsvBadge name="safety" />}>
                <ModeToggle mode={safetyMode} onChange={m => { setSafetyMode(m); setSafetyText(m === 'default' ? DEFAULT_SAFETY : '') }} />
                <NoBreakTextarea value={safetyText} onChange={v => { setSafetyText(v); if (csvBadges['safety'] === 'reflected') setCsvBadge('safety', 'modified') }}
                  placeholder="安全及び衛生に関する内容を入力してください" minHeight="80px"
                  bg={safetyMode === 'default' ? '#F5F7FC' : 'white'} />
                <p className="text-xs" style={{ color: '#5A6A8A' }}>
                  {safetyMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
                </p>
              </FormRow>
              <FormRow label="紛争防止措置" required badge={<CsvBadge name="conflict2" />}>
                <ModeToggle mode={conflictMode} onChange={m => { setConflictMode(m); setConflictText(m === 'default' ? DEFAULT_CONFLICT : '') }} />
                <NoBreakTextarea value={conflictText} onChange={v => { setConflictText(v); if (csvBadges['conflict2'] === 'reflected') setCsvBadge('conflict2', 'modified') }}
                  placeholder="紛争防止措置に関する内容を入力してください" minHeight="80px"
                  bg={conflictMode === 'default' ? '#F5F7FC' : 'white'} />
                <p className="text-xs" style={{ color: '#5A6A8A' }}>
                  {conflictMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
                </p>
              </FormRow>

              <NavButtons onNext={() => {
                if (!cmd_dept || !cmd_role || !cmd_name || !cmd_tel) { alert('指揮命令者の全項目を入力してください'); return }
                if (!resp_dept || !resp_role || !resp_name || !resp_tel) { alert('派遣先責任者の全項目を入力してください'); return }
                if (!comp_dept || !comp_role || !comp_name || !comp_tel) { alert('苦情処理申出先（派遣先）の全項目を入力してください'); return }
                if (!welfare) { alert('福利厚生施設の利用等を入力してください'); return }
                if (!safetyText) { alert('安全及び衛生を入力してください'); return }
                if (!conflictText) { alert('紛争防止措置を入力してください'); return }
                if (validateTel(cmd_tel) || validateTel(resp_tel) || validateTel(comp_tel)) { alert('電話番号の形式が正しくありません'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP4：派遣元担当者 ===== */}
          {stepType === 'sourceContact' && (
            <>
              <div className="px-5 py-3 border-b text-sm" style={{ background: '#EEF2FA', borderColor: '#D0DAF0', color: '#5A6A8A' }}>
                ℹ️ 以下は{mgrCmpSource === 'csv' ? 'CSVデータ' : '自社マスタ'}から自動入力されています。内容を確認し、必要であれば修正してください。
              </div>
              <SectionHeader label="派遣元責任者" />
              <FormRowAuto label="部署名" modified={masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept} source={mgrCmpSource} wide
                isEmpty={!mgr_dept} emptyHint="入力してください">
                <input className={inp} style={{ borderColor: !mgr_dept ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_dept} onChange={e => setMgrDept(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="役職" modified={masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role} source={mgrCmpSource}
                isEmpty={!mgr_role} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: !mgr_role ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_role} onChange={e => setMgrRole(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="氏名" modified={masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name} source={mgrCmpSource}
                isEmpty={!mgr_name} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: !mgr_name ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_name} onChange={e => setMgrName(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="電話番号" modified={masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel} source={mgrCmpSource}
                isEmpty={!mgr_tel} emptyHint="入力してください">
                <TelInput value={mgr_tel} onChange={setMgrTel} />
              </FormRowAuto>
              <SectionHeader label="苦情処理申出先（派遣元）" />
              <FormRowAuto label="部署名" modified={masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept} source={mgrCmpSource} wide
                isEmpty={!cmp_dept} emptyHint="入力してください">
                <input className={inp} style={{ borderColor: !cmp_dept ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_dept} onChange={e => setCmpDept(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="役職" modified={masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role} source={mgrCmpSource}
                isEmpty={!cmp_role} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: !cmp_role ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_role} onChange={e => setCmpRole(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="氏名" modified={masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name} source={mgrCmpSource}
                isEmpty={!cmp_name} emptyHint="入力してください">
                <input className={`${inp} max-w-xs`} style={{ borderColor: !cmp_name ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_name} onChange={e => setCmpName(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="電話番号" modified={masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel} source={mgrCmpSource}
                isEmpty={!cmp_tel} emptyHint="入力してください">
                <TelInput value={cmp_tel} onChange={setCmpTel} />
              </FormRowAuto>
              <NavButtons onNext={() => {
                if (!mgr_dept || !mgr_role || !mgr_name || !mgr_tel) { alert('派遣元責任者の全項目を入力してください'); return }
                if (!cmp_dept || !cmp_role || !cmp_name || !cmp_tel) { alert('苦情処理申出先（派遣元）の全項目を入力してください'); return }
                if (validateTel(mgr_tel) || validateTel(cmp_tel)) { alert('電話番号の形式が正しくありません'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP5（A=STEP3 / B・C=STEP5）：期間・労働条件 ===== */}
          {stepType === 'period' && (
            <>
              {(pattern === 'B' || pattern === 'C') && (
                <>
                  <SectionHeader label="派遣期間" />
                  <FormRow label="派遣期間" required hintInline
                    isEmpty={showEmptyHint && (!dispatchStart || !dispatchEnd)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                        <input type="date" className={inpDate} style={{ borderColor: (showEmptyHint && !dispatchStart) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={dispatchStart} onChange={e => setDispatchStart(e.target.value)} />
                      </div>
                      <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                        <input type="date" className={inpDate} style={{ borderColor: (showEmptyHint && !dispatchEnd) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={dispatchEnd} onChange={e => setDispatchEnd(e.target.value)} />
                      </div>
                    </div>
                    {showEmptyHint && (!dispatchStart || !dispatchEnd) && (
                      <EmptyHintBubble text="入力してください" direction="up" />
                    )}
                  </FormRow>
                  <FormRow label="抵触日（事業所単位）" required tooltip={TOOLTIPS['抵触日（事業所単位）']} badge={<CsvBadge name="conflict" />}
                    isEmpty={showEmptyHint && !isConflictDateExempt && !conflictDate} emptyHint="入力してください">
                    {isConflictDateExempt ? fixedText('無期雇用派遣のため該当しない（自動）') : (
                      <div>
                        <input type="date" className={`${inp} max-w-xs`}
                          style={{ borderColor: isDateBefore(conflictDate, dispatchEnd) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={conflictDate}
                          onChange={e => { setConflictDate(e.target.value) }} />
                        {isDateBefore(conflictDate, dispatchEnd) && (
                          <p className="text-xs mt-1" style={{ color: '#DC2626' }}>抵触日は派遣期間の終了日以降の日付にしてください</p>
                        )}
                      </div>
                    )}
                  </FormRow>
                  <FormRow label="抵触日（組織単位）" required tooltip={TOOLTIPS['抵触日（組織単位）']} badge={<CsvBadge name="conflictOrg" />}
                    isEmpty={showEmptyHint && !isConflictDateExempt && !conflictDateOrg} emptyHint="入力してください">
                    {isConflictDateExempt ? fixedText('無期雇用派遣のため該当しない（自動）') : (
                      <div>
                        <input type="date" className={`${inp} max-w-xs`}
                          style={{ borderColor: isDateBefore(conflictDateOrg, dispatchEnd) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={conflictDateOrg} onChange={e => { setConflictDateOrg(e.target.value) }} />
                        {isDateBefore(conflictDateOrg, dispatchEnd) && (
                          <p className="text-xs mt-1" style={{ color: '#DC2626' }}>抵触日は派遣期間の終了日以降の日付にしてください</p>
                        )}
                      </div>
                    )}
                  </FormRow>
                  <FormRow label="組織単位" required badge={<CsvBadge name="org" />} wide
                    isEmpty={showEmptyHint && !organizationUnit} emptyHint="入力してください">
                    <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={organizationUnit}
                      onChange={e => { setOrganizationUnit(e.target.value) }}
                      placeholder="例）第一営業部" />
                  </FormRow>
                </>
              )}

              {(pattern === 'A' || pattern === 'C') && (
                <>
                  <SectionHeader label="雇用期間" />
                  <FormRow label="雇用期間" required hintInline
                    isEmpty={showEmptyHint && ((period === '無期' || contractType === '正社員') ? !contractStartDate : (!employStart || !employEnd))}>
                    {(period === '無期' || contractType === '正社員') ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs" style={{ color: '#5A6A8A' }}>※雇用期間は無期契約のため、下記の固定文言で自動表示されます。開始日付だけ入力してください。</p>
                        {fixedText('期間の定めなし（自動）')}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>契約条件適用開始日</span>
                          <input type="date" className={inpDate}
                            style={{ borderColor: (showEmptyHint && !contractStartDate) ? '#DC2626' : (isDateBefore(contractStartDate, dispatchStart) ? '#DC2626' : '#D0DAF0'), color: '#1A2340' }}
                            value={contractStartDate} onChange={e => setContractStartDate(e.target.value)} />
                          {pattern === 'C' && (
                            <button type="button"
                              onClick={e => { e.preventDefault(); if (dispatchStart) setContractStartDate(dispatchStart) }}
                              disabled={!dispatchStart}
                              className="text-xs px-3 py-2 rounded-lg border font-medium transition-colors shrink-0"
                              style={{
                                background: dispatchStart ? '#1B3A8C' : '#EEF2FA',
                                color: dispatchStart ? 'white' : '#9AA5BD',
                                borderColor: dispatchStart ? '#1B3A8C' : '#D0DAF0',
                                cursor: dispatchStart ? 'pointer' : 'not-allowed',
                              }}>📋 派遣期間をコピー</button>
                          )}
                        </div>
                        {showEmptyHint && !contractStartDate && (
                          <EmptyHintBubble text="入力してください" direction="up" />
                        )}
                        {isDateBefore(contractStartDate, dispatchStart) && (
                          <p className="text-xs" style={{ color: '#DC2626' }}>契約条件適用開始日は派遣期間の開始日以降の日付にしてください</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                            <input type="date" className={inpDate}
                              style={{ borderColor: (showEmptyHint && !employStart) ? '#DC2626' : (employStartError ? '#DC2626' : '#D0DAF0'), color: '#1A2340' }}
                              value={employStart} onChange={e => setEmployStart(e.target.value)} />
                          </div>
                          <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                            <input type="date" className={inpDate}
                              style={{ borderColor: (showEmptyHint && !employEnd) ? '#DC2626' : (employEndError ? '#DC2626' : '#D0DAF0'), color: '#1A2340' }}
                              value={employEnd} onChange={e => setEmployEnd(e.target.value)} />
                          </div>
                          {pattern === 'C' && (
                            <button type="button"
                              onClick={e => { e.preventDefault(); if (dispatchStart && dispatchEnd) { setEmployStart(dispatchStart); setEmployEnd(dispatchEnd) } }}
                              disabled={!dispatchStart || !dispatchEnd}
                              className="text-xs px-3 py-2 rounded-lg border font-medium transition-colors shrink-0"
                              style={{
                                background: (dispatchStart && dispatchEnd) ? '#1B3A8C' : '#EEF2FA',
                                color: (dispatchStart && dispatchEnd) ? 'white' : '#9AA5BD',
                                borderColor: (dispatchStart && dispatchEnd) ? '#1B3A8C' : '#D0DAF0',
                                cursor: (dispatchStart && dispatchEnd) ? 'pointer' : 'not-allowed',
                              }}>📋 派遣期間をコピー</button>
                          )}
                        </div>
                        {showEmptyHint && (!employStart || !employEnd) && (
                          <EmptyHintBubble text="入力してください" direction="up" />
                        )}
                        {employStartError && <p className="text-xs" style={{ color: '#DC2626' }}>{employStartError}</p>}
                        {employEndError && <p className="text-xs" style={{ color: '#DC2626' }}>{employEndError}</p>}
                      </div>
                    )}
                  </FormRow>
                  <FormRow label="試用期間" required hintInline
                    isEmpty={showEmptyHint && (!trialPeriod || (trialPeriod === '有' && (!trialStart || !trialEnd)))}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <RadioGroup name="trial" value={trialPeriod} onChange={v => {
                        setTrialPeriod(v)
                        setTrialWarningChecked(false)
                        setNoTrialWarningChecked(false)
                      }} />
                      {showEmptyHint && !trialPeriod && <EmptyHintBubble text="選択してください" direction="left" />}
                    </div>
                    {trialPeriod === '有' && (
                      <div className="flex flex-col gap-3 mt-1">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                              <input type="date" className={inpDate}
                                style={{ borderColor: (showEmptyHint && !trialStart) ? '#DC2626' : (trialStartError ? '#DC2626' : '#D0DAF0'), color: '#1A2340' }}
                                value={trialStart} onChange={e => setTrialStart(e.target.value)} />
                            </div>
                            <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                              <input type="date" className={inpDate}
                                style={{ borderColor: (showEmptyHint && !trialEnd) ? '#DC2626' : (trialEndError ? '#DC2626' : '#D0DAF0'), color: '#1A2340' }}
                                value={trialEnd} onChange={e => setTrialEnd(e.target.value)} />
                            </div>
                          </div>
                          {showEmptyHint && (!trialStart || !trialEnd) && (
                            <EmptyHintBubble text="入力してください" direction="up" />
                          )}
                          {trialStartError && <p className="text-xs" style={{ color: '#DC2626' }}>{trialStartError}</p>}
                          {trialEndError && <p className="text-xs" style={{ color: '#DC2626' }}>{trialEndError}</p>}
                        </div>
                        {trialPreview && (
                          <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー</p>
                            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>{trialPreview}</p>
                          </div>
                        )}
                        {trialCalc?.over6 && (
                          <CriticalWarning
                            message={`就業規則第13条では試用期間は原則6ヶ月以内と定められています。\n入力された試用期間（${trialCalc.months}ヶ月${trialCalc.days > 0 ? trialCalc.days + '日' : ''}）は6ヶ月を超えています。\n延長が必要な場合は就業規則第13条第2項に基づき、本人への2週間前通知が必要です。\n本当にこのまま申請してよろしいですか？`}
                            checked={trialWarningChecked}
                            onCheck={setTrialWarningChecked}
                          />
                        )}
                      </div>
                    )}
                    {trialPeriod === '無' && contractType === '正社員' && isProbableNewHire && (
                      <CriticalWarning
                        message={`正社員の雇用では原則として試用期間（6ヶ月）が設けられます（就業規則第13条）。\n試用期間「無し」で申請する場合は、会社が適当と認めた特別なケースに限られます。\n本当にこのまま申請してよろしいですか？`}
                        checked={noTrialWarningChecked}
                        onCheck={setNoTrialWarningChecked}
                      />
                    )}
                  </FormRow>
                </>
              )}

              <SectionHeader label="労働条件" />
              <FormRow label="変形労働時間制" required tooltip={TOOLTIPS['変形労働時間制']} badge={<CsvBadge name="flexTime" />}
                isEmpty={showEmptyHint && !flexTime} emptyHint="選択してください">
                <RadioGroup name="flextime" value={flexTime}
                  onChange={v => { setFlexTime(v) }} />
              </FormRow>
              <FormRow label="所定労働時間外労働" required tooltip={TOOLTIPS['所定労働時間外労働']} badge={<CsvBadge name="overtime" />}
                isEmpty={showEmptyHint && !overtime} emptyHint="選択してください">
                <RadioGroup name="overtime" value={overtime}
                  onChange={v => { setOvertime(v) }} />
              </FormRow>

              <NavButtons onNext={() => {
                const err = validatePeriod()
                if (err) { alert(err); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP6（A=STEP4 / C=STEP6）：契約条件 ===== */}
          {stepType === 'contractCondition' && (
            <>
              <SectionHeader label="締結パターン" />
              <FormRow label="締結パターン" required>
                <div className="grid grid-cols-3 gap-3">
                  {CLOSING_PATTERNS.map(p => (
                    <button key={p.id}
                      onClick={e => { e.preventDefault(); setClosingPattern(p.id) }}
                      className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all text-center"
                      style={{
                        borderColor: closingPattern === p.id ? '#1B3A8C' : '#D0DAF0',
                        background: closingPattern === p.id ? '#EEF2FA' : 'white',
                      }}>
                      <img src={p.icon} alt={p.label} className="w-20 h-20 object-contain" />
                      <p className="text-xs font-bold" style={{ color: '#1B3A8C' }}>{p.label}</p>
                      <p className="text-xs leading-snug" style={{ color: '#5A6A8A' }}>{p.desc}</p>
                    </button>
                  ))}
                </div>
              </FormRow>

              <SectionHeader label="備考文言" />

              {needsBonusSelection(pattern, contractType) ? (
                <FormRow label="賞与" required>
                  <div className="flex gap-3">
                    {(['あり', 'なし'] as const).map(v => (
                      <button key={v}
                        onClick={e => { e.preventDefault(); setBonusType(v) }}
                        className="flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all"
                        style={{
                          borderColor: bonusType === v ? '#1B3A8C' : '#D0DAF0',
                          background: bonusType === v ? '#EEF2FA' : 'white',
                          color: bonusType === v ? '#1B3A8C' : '#5A6A8A',
                        }}>
                        賞与{v}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
                    賞与（ボーナス）が契約上支給される場合は「賞与あり」。決算賞与のみで契約書上に記載が不要な場合は「賞与なし」を選んでください。
                  </p>
                </FormRow>
              ) : (
                <FormRow label="賞与">
                  <p className="text-xs rounded-lg px-3 py-2 inline-block border"
                    style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    自動確定（選択不要）
                  </p>
                </FormRow>
              )}

              {pattern !== 'B' && (
                <FormRow label="備考欄プレビュー">
                  <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（自動生成）</p>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>
                      {remarksText}
                    </p>
                  </div>
                </FormRow>
              )}

              <NavButtons onNext={() => {
                if (!closingPattern) { alert('締結パターンを選択してください'); return }
                if (needsBonusSelection(pattern, contractType) && !bonusType) { alert('賞与の有無を選択してください'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP7（A=STEP5 / C=STEP7）：給与・保険 ===== */}
          {stepType === 'salary' && (
            <>
              <SectionHeader label="賃金" />

              {/* 給与の種類 */}
              <FormRow label="給与の種類" required>
                <div className="flex border rounded-lg overflow-hidden bg-white w-fit" style={{ borderColor: '#D0DAF0' }}>
                  {['時給', '日給', '月給'].map(v => (
                    <button key={v}
                      onClick={e => { e.preventDefault(); setSalaryType(v) }}
                      className="px-6 py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap"
                      style={{
                        borderColor: '#D0DAF0',
                        background: salaryType === v ? '#1B3A8C' : 'white',
                        color: salaryType === v ? 'white' : '#1A2340',
                        fontWeight: salaryType === v ? 600 : 400,
                      }}>{v}</button>
                  ))}
                </div>
              </FormRow>

              {/* 基本給・各種手当 */}
              <FormRow label="基本給・各種手当" required>
                {/* 2列グリッド */}
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
                  <div className="grid grid-cols-2">
                    {/* 基本給 */}
                    <div className="p-3 border-r border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>基本給</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={basicSalary} onChange={e => setBasicSalary(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: basicSalaryError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）250000</p>
                      {basicSalaryError && <p className="text-xs" style={{ color: '#DC2626' }}>{basicSalaryError}</p>}
                    </div>
                    {/* 役職手当 */}
                    <div className="p-3 border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>役職手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={rolePay} onChange={e => setRolePay(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）10000</p>
                    </div>
                    {/* 職能給 */}
                    <div className="p-3 border-r border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>職能給</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={skillPay} onChange={e => setSkillPay(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）10000</p>
                    </div>
                    {/* 営業手当 */}
                    <div className="p-3 border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>営業手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={salesPay} onChange={e => setSalesPay(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）10000</p>
                    </div>
                    {/* 定額残業手当 */}
                    <div className="p-3 border-r flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>定額残業手当</span>
                      <div className="flex items-center gap-1.5 flex-nowrap">
                        <input type="text" value={overtimePay} onChange={e => setOvertimePay(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                        <span className="text-xs" style={{ color: '#D0DAF0' }}>/</span>
                        <input type="text" value={overtimeHours} onChange={e => setOvertimeHours(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-16 placeholder:text-gray-400"
                          style={{ borderColor: overtimeHoursError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>時間分</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）30000 / 20時間分</p>
                      {overtimeHoursError && <p className="text-xs" style={{ color: '#DC2626' }}>{overtimeHoursError}</p>}
                    </div>
                    {/* 住宅手当 */}
                    <div className="p-3 flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>住宅手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={housingPay} onChange={e => setHousingPay(toHalfWidthDigits(e.target.value))}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）10000</p>
                    </div>
                  </div>
                </div>

                {/* 合計金額 */}
                {/* 時給の場合：月額換算内訳を表示 */}
                {hourlyMonthlyBreakdown && (
                  <div className="rounded-lg px-4 py-3 border flex flex-col gap-1"
                    style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    {hourlyMonthlyBreakdown.map((line, i) => (
                      <p key={i} className="text-xs" style={{ color: '#1A2340' }}>{line}</p>
                    ))}
                    <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
                      ※月所定労働日数20日・1日8時間（160時間）での計算例です。実際の支給額は勤務実績により異なります。
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg px-4 py-3 border"
                  style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>
                    {salaryType === '時給' ? '月額換算例（基本給×160時間＋各種手当）' : '合計支給額（基本給＋各種手当）'}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold" style={{ color: '#1B3A8C' }}>
                      {salaryTotal.toLocaleString()}
                    </span>
                    <span className="text-xs" style={{ color: '#5A6A8A' }}>円</span>
                  </div>
                </div>

                {/* 🔴 最重要警告：合計100万円超 */}
                {salaryTotal > 1000000 && (
                  <CriticalWarning
                    message={`合計支給額が1,000,000円を超えています。\n入力内容に誤りがないか、今一度ご確認ください。\n本当にこのまま申請してよろしいですか？`}
                    checked={salaryWarningChecked}
                    onCheck={setSalaryWarningChecked}
                  />
                )}
              </FormRow>

              {/* 割増賃金率 */}
              <FormRow label="割増賃金率">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                  style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  法定の割合に基づく。
                </p>
              </FormRow>

              <SectionHeader label="交通費" />

              {/* 交通費区分 */}
              <FormRow label="交通費区分" required>
                <div className="grid grid-cols-2 gap-2.5">
                  {TRANSPORT_TYPES.map(t => (
                    <button key={t.id}
                      onClick={e => { e.preventDefault(); setTransportType(t.id) }}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all text-center"
                      style={{
                        borderColor: transportType === t.id ? '#1B3A8C' : '#D0DAF0',
                        background: transportType === t.id ? '#EEF2FA' : 'white',
                      }}>
                      <img src={t.icon} alt={t.label} className="w-14 h-14 object-contain" />
                      <p className="text-xs font-bold leading-snug" style={{ color: '#1B3A8C' }}>{t.label}</p>
                    </button>
                  ))}
                </div>
                {/* 帳票プレビュー */}
                <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（修正不可）</p>
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>
                    {selectedTransport.preview}
                  </p>
                </div>
              </FormRow>

              <SectionHeader label="各種保険" />

              {/* 労災保険（自動）：全員一律加入の固定値であり、マスタ/CSVからの反映値ではないため
                  AutoBadge（「マスタ情報反映」表示）は付けない（2026-07-08伊藤さん指摘・修正） */}
              <FormRow label="労災保険">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                  style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  全員加入（自動）
                </p>
              </FormRow>

              {/* 加入保険 */}
              <FormRow label="加入保険" required>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={hasEmployInsurance}
                      onChange={e => setHasEmployInsurance(e.target.checked)}
                      className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                    <span className="text-sm" style={{ color: '#1A2340' }}>雇用保険に加入する</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={hasSocialInsurance}
                      onChange={e => setHasSocialInsurance(e.target.checked)}
                      className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                    <span className="text-sm" style={{ color: '#1A2340' }}>健康保険・厚生年金に加入する（必ずセット）</span>
                  </label>
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー</p>
                  <p className="text-xs" style={{ color: '#1A2340' }}>{insurancePreview}</p>
                </div>
              </FormRow>

              {/* 賃金支払時の控除 */}
              <FormRow label="賃金支払時の控除">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                  style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  {deductionText}
                </p>
              </FormRow>

              <NavButtons onNext={() => {
                const err = validateSalary()
                if (err) { alert(err); return }
                handleNext()
              }} />
            </>
          )}

          {stepType === 'finalCheck' && (
            <>
              {/* 差し戻しバナー（カード外・上部・独立表示） */}
              {isRejected && (
                <div className="rounded-lg p-4 mb-4 border" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                  <p className="text-sm font-bold flex items-center gap-1.5 mb-1.5" style={{ color: '#DC2626' }}>⚠️ この申請は差し戻されました</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>{rejectionReason}</p>
                  <p className="text-xs mt-2" style={{ color: '#5A6A8A' }}>差し戻し日時：{rejectedAt}　差し戻し担当：{rejectedBy}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 mb-3">
                <button onClick={() => setCollapsedSections({})}
                  className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>すべて展開</button>
                <button onClick={() => setCollapsedSections({
                  s1: true, s2: true, s3: true, s4: true, s5: true, s6: true, s7: true,
                })}
                  className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>すべて折りたたむ</button>
              </div>

              {/* ===== STEP1：基本情報 ===== */}
              <FinalSection id="s1" title="STEP1：基本情報" sub="契約するスタッフと書類の種類を選びます"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(1)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                <FinalRow label="対象スタッフ" value={selectedStaff ? `${selectedStaff.name}（社員番号：${selectedStaff.employee_number}）` : '―'} />
                <FinalRow label="雇用区分" value={contractType || '―'} />
                <FinalRow label="就業場所区分" value={workPlace || '―'} />
                <FinalRow label="書類種別" value={documentType || '―'} />
              </FinalSection>

              {/* ===== STEP2：就業先情報 ===== */}
              <FinalSection id="s2" title="STEP2：就業先情報" sub="就業場所・業務内容・労働時間を入力します"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(2)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                <FinalRow label="入力方法" value={csvMode === 'csv' ? `CSVデータから自動入力（${csvSystem}）` : '手動で入力する'} />
                <FinalRow label="就業場所名" value={workLocationName || '―'} badge={<CsvBadge name="locationName" />} oldValue={csvSnapshot.locationName} />
                <FinalRow label="就業場所住所" value={workLocationAddress || '―'} badge={<CsvBadge name="locationAddress" />} oldValue={csvSnapshot.locationAddress} />
                <FinalRow label="就業場所電話番号" value={workLocationTel || '―'} badge={<CsvBadge name="locationTel" />} oldValue={csvSnapshot.locationTel} />
                <FinalRow label="業務内容" value={businessContent || '―'} badge={<CsvBadge name="business" />} multiline oldValue={csvSnapshot.business} />
                <FinalRow label="始業時刻" value={startTime || '―'} badge={<CsvBadge name="startTime" />} oldValue={csvSnapshot.startTime} />
                <FinalRow label="終業時刻" value={endTime || '―'} badge={<CsvBadge name="endTime" />} oldValue={csvSnapshot.endTime} suffix={isShift ? '※シフト制' : undefined} />
                <FinalRow label="休憩時間" value={breakTime ? `${parseAmount(breakTime)}分` : '―'} badge={<CsvBadge name="breakTime" />} oldValue={csvSnapshot.breakTime ? `${parseAmount(csvSnapshot.breakTime)}分` : undefined} />
                <FinalRow label="所定労働時間" value={(workingHoursH || workingHoursM) ? `${parseAmount(workingHoursH)}時間${parseAmount(workingHoursM)}分` : '―'} badge={<CsvBadge name="workingHours" />} oldValue={csvSnapshot.workingHours ? `${parseAmount(csvSnapshot.workingHours.split('-')[0])}時間${parseAmount(csvSnapshot.workingHours.split('-')[1])}分` : undefined} />
                <FinalRow label="所定労働日数" value={workDays === 'other' ? (workDaysOther || '―') : (workDays || '―')} />
                <FinalRow label="業務に伴う責任の程度" value={responsibility || '―'} badge={<CsvBadge name="resp" />} oldValue={csvSnapshot.resp} />
              </FinalSection>

              {/* ===== STEP3：派遣先担当者（パターンB・Cのみ） ===== */}
              {(pattern === 'B' || pattern === 'C') && (
                <FinalSection id="s3" title="STEP3：派遣先担当者" sub="派遣先の担当者情報を入力します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(3)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="指揮命令者" />
                  <FinalRow label="部署" value={cmd_dept || '―'} badge={<CsvBadge name="cmdDept" />} oldValue={csvSnapshot.cmdDept} />
                  <FinalRow label="役職" value={cmd_role || '―'} badge={<CsvBadge name="cmdRole" />} oldValue={csvSnapshot.cmdRole} />
                  <FinalRow label="氏名" value={cmd_name || '―'} badge={<CsvBadge name="cmdName" />} oldValue={csvSnapshot.cmdName} />
                  <FinalRow label="電話番号" value={cmd_tel || '―'} badge={<CsvBadge name="cmdTel" />} oldValue={csvSnapshot.cmdTel} />

                  <FinalGroupHeader label="派遣先責任者" />
                  <FinalRow label="部署" value={resp_dept || '―'} badge={<CsvBadge name="respDept" />} oldValue={csvSnapshot.respDept} />
                  <FinalRow label="役職" value={resp_role || '―'} badge={<CsvBadge name="respRole" />} oldValue={csvSnapshot.respRole} />
                  <FinalRow label="氏名" value={resp_name || '―'} badge={<CsvBadge name="respName" />} oldValue={csvSnapshot.respName} />
                  <FinalRow label="電話番号" value={resp_tel || '―'} badge={<CsvBadge name="respTel" />} oldValue={csvSnapshot.respTel} />

                  <FinalGroupHeader label="苦情処理申出先（派遣先）" />
                  <FinalRow label="部署" value={comp_dept || '―'} badge={<CsvBadge name="compDept" />} oldValue={csvSnapshot.compDept} />
                  <FinalRow label="役職" value={comp_role || '―'} badge={<CsvBadge name="compRole" />} oldValue={csvSnapshot.compRole} />
                  <FinalRow label="氏名" value={comp_name || '―'} badge={<CsvBadge name="compName" />} oldValue={csvSnapshot.compName} />
                  <FinalRow label="電話番号" value={comp_tel || '―'} badge={<CsvBadge name="compTel" />} oldValue={csvSnapshot.compTel} />

                  <FinalGroupHeader label="追加項目" />
                  <FinalRow label="福利厚生施設の利用等" value={welfare || '―'} badge={<CsvBadge name="welfare" />} multiline oldValue={csvSnapshot.welfare} />
                  <FinalRow label="安全及び衛生" value={safetyText || '―'} badge={<CsvBadge name="safety" />} multiline />
                  <FinalRow label="紛争防止措置" value={conflictText || '―'} badge={<CsvBadge name="conflict2" />} multiline />
                </FinalSection>
              )}

              {/* ===== STEP4：派遣元担当者（パターンB・Cのみ） ===== */}
              {(pattern === 'B' || pattern === 'C') && (
                <FinalSection id="s4" title="STEP4：派遣元担当者" sub="自社の担当者情報を確認・修正します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(4)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="派遣元責任者" />
                  <FinalRow label="部署" value={mgr_dept || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_dept : undefined} />
                  <FinalRow label="役職" value={mgr_role || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_role : undefined} />
                  <FinalRow label="氏名" value={mgr_name || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_name : undefined} />
                  <FinalRow label="電話番号" value={mgr_tel || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_tel : undefined} />

                  <FinalGroupHeader label="苦情処理申出先（派遣元）" />
                  <FinalRow label="部署" value={cmp_dept || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_dept : undefined} />
                  <FinalRow label="役職" value={cmp_role || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_role : undefined} />
                  <FinalRow label="氏名" value={cmp_name || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_name : undefined} />
                  <FinalRow label="電話番号" value={cmp_tel || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel} source={mgrCmpSource} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_tel : undefined} />
                </FinalSection>
              )}

              {/* ===== STEP5：期間・労働条件 ===== */}
              <FinalSection id="s5" title="STEP5：期間・労働条件" sub="雇用期間・派遣期間・残業の有無を入力します"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(pattern === 'A' ? 3 : 5)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                {(pattern === 'B' || pattern === 'C') && (
                  <>
                    <FinalRow label="派遣期間" value={(dispatchStart && dispatchEnd) ? `${dispatchStart} 〜 ${dispatchEnd}` : '―'} />
                    {!isConflictDateExempt && <FinalRow label="抵触日（事業所単位）" value={conflictDate || '―'} badge={<CsvBadge name="conflict" />} oldValue={csvSnapshot.conflict} />}
                    {!isConflictDateExempt && <FinalRow label="抵触日（組織単位）" value={conflictDateOrg || '―'} badge={<CsvBadge name="conflictOrg" />} oldValue={csvSnapshot.conflictOrg} />}
                    <FinalRow label="組織単位" value={organizationUnit || '―'} badge={<CsvBadge name="org" />} oldValue={csvSnapshot.org} />
                  </>
                )}
                <FinalRow label="雇用期間" value={
                  (period === '無期' || contractType === '正社員')
                    ? (contractStartDate ? `${contractStartDate} 〜 期間の定めなし` : '―')
                    : (employStart ? `${employStart} 〜 ${employEnd || '―'}` : '―')
                } />
                <FinalRow label="試用期間" value={
                  trialPeriod === '有' ? `有　${trialStart || '―'} 〜 ${trialEnd || '―'}` : trialPeriod === '無' ? '無' : '―'
                } />
                {trialPeriod === '有' && trialCalc?.over6 && (
                  <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
                    <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
                    <div className="px-5 py-3.5">
                      <CriticalWarning
                        message={`就業規則第13条では試用期間は原則6ヶ月以内と定められています。\n入力された試用期間（${trialCalc.months}ヶ月${trialCalc.days > 0 ? trialCalc.days + '日' : ''}）は6ヶ月を超えています。\n延長が必要な場合は就業規則第13条第2項に基づき、本人への2週間前通知が必要です。\n本当にこのまま申請してよろしいですか？`}
                        checked={trialWarningChecked}
                        onCheck={setTrialWarningChecked}
                      />
                    </div>
                  </div>
                )}
                {trialPeriod === '無' && contractType === '正社員' && isProbableNewHire && (
                  <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
                    <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
                    <div className="px-5 py-3.5">
                      <CriticalWarning
                        message={`正社員の雇用では原則として試用期間（6ヶ月）が設けられます（就業規則第13条）。\n試用期間「無し」で申請する場合は、会社が適当と認めた特別なケースに限られます。\n本当にこのまま申請してよろしいですか？`}
                        checked={noTrialWarningChecked}
                        onCheck={setNoTrialWarningChecked}
                      />
                    </div>
                  </div>
                )}
                <FinalRow label="変形労働時間制" value={flexTime || '―'} badge={<CsvBadge name="flexTime" />} oldValue={csvSnapshot.flexTime} />
                <FinalRow label="所定労働時間外労働" value={overtime || '―'} badge={<CsvBadge name="overtime" />} oldValue={csvSnapshot.overtime} />
              </FinalSection>

              {/* ===== STEP6：契約条件（パターンA・Cのみ） ===== */}
              {(pattern === 'A' || pattern === 'C') && (
                <FinalSection id="s6" title="STEP6：契約条件" sub="契約書の締結方法と備考欄の内容を選びます"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(pattern === 'A' ? 4 : 6)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalRow label="締結パターン" value={
                    `${CLOSING_PATTERNS.find(p => p.id === closingPattern)?.label || '―'}\n${CLOSING_PATTERNS.find(p => p.id === closingPattern)?.desc || ''}`
                  } multiline />
                  <FinalRow label="備考欄" value={remarksText || '―'} multiline />
                </FinalSection>
              )}

              {/* ===== STEP7：給与・保険（パターンA・Cのみ） ===== */}
              {(pattern === 'A' || pattern === 'C') && (
                <FinalSection id="s7" title="STEP7：給与・保険" sub="給与の金額と加入する保険を入力します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(pattern === 'A' ? 5 : 7)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="賃金" />
                  <FinalRow label="給与の種類" value={salaryType || '―'} />
                  <FinalRow label="基本給" value={basicSalary ? `${parseAmount(basicSalary).toLocaleString()}円` : '―'} />
                  <FinalRow label="役職手当" value={parseAmount(rolePay) > 0 ? `${parseAmount(rolePay).toLocaleString()}円` : '―'} />
                  <FinalRow label="職能給" value={parseAmount(skillPay) > 0 ? `${parseAmount(skillPay).toLocaleString()}円` : '―'} />
                  <FinalRow label="営業手当" value={parseAmount(salesPay) > 0 ? `${parseAmount(salesPay).toLocaleString()}円` : '―'} />
                  <FinalRow label="定額残業手当" value={parseAmount(overtimePay) > 0 ? `${parseAmount(overtimePay).toLocaleString()}円（${parseAmount(overtimeHours)}時間分）` : '―'} />
                  <FinalRow label="住宅手当" value={parseAmount(housingPay) > 0 ? `${parseAmount(housingPay).toLocaleString()}円` : '―'} />
                  {salaryTotal > 1000000 && (
                    <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
                      <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
                      <div className="px-5 py-3.5">
                        <CriticalWarning
                          message={`合計支給額が1,000,000円を超えています。\n入力内容に誤りがないか、今一度ご確認ください。\n本当にこのまま申請してよろしいですか？`}
                          checked={salaryWarningChecked}
                          onCheck={setSalaryWarningChecked}
                        />
                      </div>
                    </div>
                  )}
                  {salaryType === '時給' && hourlyMonthlyBreakdown && (
                    <FinalRow label="月額換算（概算）" value={
                      `${hourlyMonthlyBreakdown.join('\n')}\n※月所定労働日数20日・1日8時間（160時間）での計算例です。実際の支給額は勤務実績により異なります。`
                    } multiline highlight={`月額換算例（基本給×160時間＋各種手当）：${salaryTotal.toLocaleString()}円`} />
                  )}

                  <FinalGroupHeader label="交通費" />
                  <FinalRow label="交通費区分" value={selectedTransport.label} />
                  <FinalRow label="帳票プレビュー" value={selectedTransport.preview} multiline preview />

                  <FinalGroupHeader label="各種保険" />
                  <FinalRow label="労災保険" value="全員加入（自動）" />
                  <FinalRow label="加入保険" value={
                    [hasEmployInsurance && '雇用保険に加入する', hasSocialInsurance && '健康保険・厚生年金に加入する'].filter(Boolean).join(' / ') || '―'
                  } />
                  <FinalRow label="帳票プレビュー" value={insurancePreview} preview />
                  <FinalRow label="賃金支払時の控除" value={deductionText} />
                </FinalSection>
              )}

              {/* ===== 申請エリア ===== */}
              {isSubmitted ? (
                <div className="bg-white rounded-xl border shadow-sm p-8 mt-4 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <div className="text-5xl mb-4">✅</div>
                  <h2 className="text-lg font-bold mb-2" style={{ color: '#1A2340' }}>申請が完了しました</h2>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: '#5A6A8A' }}>
                    {workPlace === '社内'
                      ? (closingPattern === 'auto'
                        ? '管理部（社内承認者）の承認をお待ちください。承認後、スタッフへ署名依頼が自動送信されます。'
                        : '管理部（社内承認者）の承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')
                      : (closingPattern === 'auto'
                        ? 'SSCの承認をお待ちください。承認後、スタッフへ署名依頼が自動送信されます。'
                        : 'SSCの承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')}
                  </p>
                  <button
                    onClick={() => {
                      // フェーズ2でSSC・管理部も/applyを使えるようになったため、戻り先もロールに応じて出し分ける（2026-07-13追加）
                      const role = user?.user_metadata?.role
                      router.push(role === 'SSC' ? '/dashboard/ssc' : role === '管理部' ? '/dashboard/admin' : '/dashboard/sales')
                    }}
                    className="px-8 py-3 rounded-lg text-white font-bold text-sm" style={{ background: '#1B3A8C' }}>
                    ダッシュボードに戻る
                  </button>
                </div>
              ) : (
              <div className="bg-white rounded-xl border shadow-sm p-6 mt-4" style={{ borderColor: '#D0DAF0' }}>
                <div className="rounded-lg px-4 py-3 mb-4 text-sm leading-relaxed border-l-4" style={{ background: '#EEF2FA', color: '#5A6A8A', borderColor: '#1B3A8C' }}>
                  {workPlace === '社内'
                    ? (closingPattern === 'auto'
                      ? '申請後は管理部（社内承認者）の承認をお待ちください。承認後、スタッフへ署名依頼が自動送信されます。'
                      : '申請後は管理部（社内承認者）の承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')
                    : (closingPattern === 'auto'
                      ? '申請後はSSCの承認をお待ちください。承認後、スタッフへ署名依頼が自動送信されます。'
                      : '申請後はSSCの承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')}
                </div>

                {/* CSV反映項目が修正されている場合の注意（2026-07-02追加） */}
                {hasCsvModifiedFields && (
                  <CriticalWarning
                    title="⚠️ CSV反映項目の修正について"
                    message="個別契約書の情報が修正されています。管理部へ個別に修正依頼を行う必要があります。"
                    checkboxLabel="上記の内容を確認しました。管理部への修正依頼が必要なことを理解しています。"
                    checked={csvModWarningChecked}
                    onCheck={setCsvModWarningChecked}
                  />
                )}

                {submitError && (
                  <div className="rounded-lg px-4 py-3 mb-3 border" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                    <p className="text-xs leading-relaxed" style={{ color: '#DC2626' }}>{submitError}</p>
                  </div>
                )}

                <button
                  disabled={isSubmitting}
                  onClick={() => {
                    if (hasCsvModifiedFields && !csvModWarningChecked) {
                      alert('CSV反映項目の修正について、内容を確認しチェックを入れてください')
                      return
                    }
                    setShowConfirmModal(true)
                  }}
                  className="w-full py-3.5 rounded-lg text-white font-bold text-sm mb-2 mt-3"
                  style={{ background: isSubmitting ? '#A8C0E8' : '#1B3A8C' }}>
                  {isSubmitting ? '送信中...' : '申請する'}
                </button>
                <button onClick={handleCancel} className="w-full text-center text-xs underline py-1" style={{ color: '#5A6A8A' }}>
                  この申請をやめる
                </button>
              </div>
              )}

              {/* ===== 申請確認モーダル ===== */}
              {showConfirmModal && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(26, 35, 64, 0.5)' }}>
                  <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                    <h3 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>この内容で申請しますか？</h3>

                    {/* 差し戻し案件で、差し戻し時点から内容が本当に変わっていない場合のみ表示する実チェック */}
                    {isRejected && originalFieldsSnapshot !== null && JSON.stringify(buildCurrentFields()) === originalFieldsSnapshot && (
                      <div className="rounded-lg px-4 py-3 mb-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                        <p className="text-xs leading-relaxed" style={{ color: '#B91C1C' }}>
                          ⚠️ 差し戻し前の内容から変更されていません。<br />内容に問題がないか今一度ご確認の上、申請してください。
                        </p>
                      </div>
                    )}

                    <div className="rounded-lg p-4 mb-5 flex flex-col gap-2" style={{ background: '#EEF2FA' }}>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: '#5A6A8A' }}>対象スタッフ</span>
                        <span className="font-medium" style={{ color: '#1A2340' }}>
                          {selectedStaff ? `${selectedStaff.name}（社員番号：${selectedStaff.employee_number}）` : '―'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: '#5A6A8A' }}>帳票の種類</span>
                        <span className="font-medium text-right" style={{ color: '#1A2340' }}>{documentType || '―'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: '#5A6A8A' }}>雇用区分</span>
                        <span className="font-medium" style={{ color: '#1A2340' }}>{contractType || '―'}</span>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed mb-5" style={{ color: '#5A6A8A' }}>
                      {workPlace === '社内'
                        ? '申請後は管理部（社内承認者）の承認が必要となり、申請内容の変更はできません。'
                        : '申請後はSSCの承認が必要となり、申請内容の変更はできません。'}<br />内容に誤りがないか今一度ご確認ください。
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowConfirmModal(false)}
                        className="flex-1 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: '#D0DAF0', color: '#5A6A8A' }}>
                        キャンセル
                      </button>
                      <button
                        disabled={isSubmitting}
                        onClick={() => { setShowConfirmModal(false); handleSubmitContract() }}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: isSubmitting ? '#A8C0E8' : '#1B3A8C' }}>
                        {isSubmitting ? '送信中...' : 'OK・申請する'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-start mt-3">
                <button onClick={handleBack}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all"
                  style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
              </div>
            </>
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
