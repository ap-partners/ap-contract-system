'use client'

// STEP7（A=STEP5 / C=STEP7）：給与・保険（賃金・交通費・各種保険）
// app/apply/page.tsx の stepType === 'salary' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetter・派生値をpropsで受け取る。

import { TRANSPORT_TYPES, toHalfWidthDigits } from '../_lib/helpers'
import { FormRow, SectionHeader, CriticalWarning } from './FormParts'

type TransportType = (typeof TRANSPORT_TYPES)[number]

interface StepSalaryProps {
  salaryType: string; setSalaryType: (v: string) => void

  basicSalary: string; setBasicSalary: (v: string) => void
  basicSalaryError: string | null
  rolePay: string; setRolePay: (v: string) => void
  skillPay: string; setSkillPay: (v: string) => void
  salesPay: string; setSalesPay: (v: string) => void
  overtimePay: string; setOvertimePay: (v: string) => void
  overtimeHours: string; setOvertimeHours: (v: string) => void
  overtimeHoursError: string | null
  housingPay: string; setHousingPay: (v: string) => void

  hourlyMonthlyBreakdown: string[] | null
  salaryTotal: number
  salaryWarningChecked: boolean; setSalaryWarningChecked: (v: boolean) => void

  transportType: string; setTransportType: (v: string) => void
  selectedTransport: TransportType

  hasEmployInsurance: boolean; setHasEmployInsurance: (v: boolean) => void
  hasSocialInsurance: boolean; setHasSocialInsurance: (v: boolean) => void
  insurancePreview: string
  deductionText: string

  validateSalary: () => string | null | undefined
  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void }>
}

export default function StepSalary({
  salaryType, setSalaryType,
  basicSalary, setBasicSalary, basicSalaryError,
  rolePay, setRolePay, skillPay, setSkillPay, salesPay, setSalesPay,
  overtimePay, setOvertimePay, overtimeHours, setOvertimeHours, overtimeHoursError,
  housingPay, setHousingPay,
  hourlyMonthlyBreakdown, salaryTotal, salaryWarningChecked, setSalaryWarningChecked,
  transportType, setTransportType, selectedTransport,
  hasEmployInsurance, setHasEmployInsurance, hasSocialInsurance, setHasSocialInsurance,
  insurancePreview, deductionText,
  validateSalary, handleNext, NavButtons,
}: StepSalaryProps) {
  return (
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
  )
}
