'use client'

// STEP8：最終確認（全STEPのサマリー表示・申請確認モーダル・申請完了画面）
// app/apply/page.tsx の stepType === 'finalCheck' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetter・派生値・
// 関数をpropsで受け取る。router.push()だけは next/navigation の useRouter() を直接呼び出す
// （next/navigationのuseRouter自体は親と同じシングルトンのため挙動は変わらない）。

import { useRouter } from 'next/navigation'
import { CLOSING_PATTERNS, parseAmount } from '../_lib/helpers'
import { FinalSection, FinalRow, FinalGroupHeader, CriticalWarning, AutoBadge } from './FormParts'

type TrialCalc = { over6: boolean; months: number; days: number } | null

interface StepFinalCheckProps {
  isRejected: boolean
  rejectionReason: string
  rejectedAt: string
  rejectedBy: string

  collapsedSections: Record<string, boolean>
  setCollapsedSections: (v: Record<string, boolean>) => void
  setCurrentStep: (fn: number | ((s: number) => number)) => void

  selectedStaff: any
  contractType: string
  workPlace: string
  documentType: string

  csvMode: 'csv' | 'manual'
  csvSystem: string
  csvSnapshot: Record<string, string>
  CsvBadge: React.ComponentType<{ name: string }>

  workLocationName: string
  workLocationAddress: string
  workLocationTel: string
  businessContent: string
  startTime: string
  endTime: string
  isShift: boolean
  breakTime: string
  workingHoursH: string
  workingHoursM: string
  workDays: string
  workDaysOther: string
  responsibility: string

  pattern: string
  cmd_dept: string; cmd_role: string; cmd_name: string; cmd_tel: string
  resp_dept: string; resp_role: string; resp_name: string; resp_tel: string
  comp_dept: string; comp_role: string; comp_name: string; comp_tel: string
  welfare: string; safetyText: string; conflictText: string

  mgr_dept: string; mgr_role: string; mgr_name: string; mgr_tel: string
  cmp_dept: string; cmp_role: string; cmp_name: string; cmp_tel: string
  masterSnapshot: Record<string, string>
  mgrCmpSource: 'master' | 'csv'

  dispatchStart: string; dispatchEnd: string
  isConflictDateExempt: boolean
  conflictDate: string; conflictDateOrg: string
  organizationUnit: string
  period: string
  contractStartDate: string
  employStart: string; employEnd: string
  trialPeriod: string; trialStart: string; trialEnd: string
  trialCalc: TrialCalc
  trialWarningChecked: boolean; setTrialWarningChecked: (v: boolean) => void
  isProbableNewHire: boolean
  noTrialWarningChecked: boolean; setNoTrialWarningChecked: (v: boolean) => void
  flexTime: string; overtime: string

  closingPattern: string
  remarksText: string

  salaryType: string
  basicSalary: string; rolePay: string; skillPay: string; salesPay: string
  overtimePay: string; overtimeHours: string; housingPay: string
  salaryTotal: number
  salaryWarningChecked: boolean; setSalaryWarningChecked: (v: boolean) => void
  hourlyMonthlyBreakdown: string[] | null
  selectedTransport: { label: string; preview: string }
  hasEmployInsurance: boolean; hasSocialInsurance: boolean
  insurancePreview: string; deductionText: string

  isSubmitted: boolean
  user: any

  hasCsvModifiedFields: boolean
  csvModWarningChecked: boolean; setCsvModWarningChecked: (v: boolean) => void
  submitError: string
  isSubmitting: boolean
  setShowConfirmModal: (v: boolean) => void
  handleSubmitContract: () => void

  showConfirmModal: boolean
  originalFieldsSnapshot: string | null
  buildCurrentFields: () => any

  handleBack: () => void
}

export default function StepFinalCheck({
  isRejected, rejectionReason, rejectedAt, rejectedBy,
  collapsedSections, setCollapsedSections, setCurrentStep,
  selectedStaff, contractType, workPlace, documentType,
  csvMode, csvSystem, csvSnapshot, CsvBadge,
  workLocationName, workLocationAddress, workLocationTel, businessContent,
  startTime, endTime, isShift, breakTime, workingHoursH, workingHoursM,
  workDays, workDaysOther, responsibility,
  pattern,
  cmd_dept, cmd_role, cmd_name, cmd_tel,
  resp_dept, resp_role, resp_name, resp_tel,
  comp_dept, comp_role, comp_name, comp_tel,
  welfare, safetyText, conflictText,
  mgr_dept, mgr_role, mgr_name, mgr_tel,
  cmp_dept, cmp_role, cmp_name, cmp_tel,
  masterSnapshot, mgrCmpSource,
  dispatchStart, dispatchEnd, isConflictDateExempt, conflictDate, conflictDateOrg, organizationUnit,
  period, contractStartDate, employStart, employEnd,
  trialPeriod, trialStart, trialEnd, trialCalc, trialWarningChecked, setTrialWarningChecked,
  isProbableNewHire, noTrialWarningChecked, setNoTrialWarningChecked,
  flexTime, overtime,
  closingPattern, remarksText,
  salaryType, basicSalary, rolePay, skillPay, salesPay, overtimePay, overtimeHours, housingPay,
  salaryTotal, salaryWarningChecked, setSalaryWarningChecked, hourlyMonthlyBreakdown,
  selectedTransport, hasEmployInsurance, hasSocialInsurance, insurancePreview, deductionText,
  isSubmitted, user,
  hasCsvModifiedFields, csvModWarningChecked, setCsvModWarningChecked,
  submitError, isSubmitting, setShowConfirmModal, handleSubmitContract,
  showConfirmModal, originalFieldsSnapshot, buildCurrentFields,
  handleBack,
}: StepFinalCheckProps) {
  const router = useRouter()

  return (
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
                // 総合レビュー指摘22対応：パターンB（就業条件明示書のみ）はスタッフの操作が
                // 「署名」ではなく「内容確認」のため、案内文もそれに合わせる。
                ? `管理部（社内承認者）の承認をお待ちください。承認後、スタッフへ${pattern === 'B' ? '内容確認の依頼' : '署名依頼'}が自動送信されます。`
                : '管理部（社内承認者）の承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')
              : (closingPattern === 'auto'
                ? `SSCの承認をお待ちください。承認後、スタッフへ${pattern === 'B' ? '内容確認の依頼' : '署名依頼'}が自動送信されます。`
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
              // 総合レビュー指摘22対応：パターンB（就業条件明示書のみ）はスタッフの操作が
              // 「署名」ではなく「内容確認」のため、案内文もそれに合わせる。
              ? `申請後は管理部（社内承認者）の承認をお待ちください。承認後、スタッフへ${pattern === 'B' ? '内容確認の依頼' : '署名依頼'}が自動送信されます。`
              : '申請後は管理部（社内承認者）の承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。')
            : (closingPattern === 'auto'
              ? `申請後はSSCの承認をお待ちください。承認後、スタッフへ${pattern === 'B' ? '内容確認の依頼' : '署名依頼'}が自動送信されます。`
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
        <button onClick={handleBack} className="w-full text-center text-xs underline py-1" style={{ color: '#5A6A8A' }}>
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
  )
}
