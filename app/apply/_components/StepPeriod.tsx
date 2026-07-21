'use client'

// STEP5（A=STEP3 / B・C=STEP5）：期間・労働条件（派遣期間・雇用期間・試用期間・労働条件）
// app/apply/page.tsx の stepType === 'period' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetter・派生値をpropsで受け取る。

import type { ReactNode } from 'react'
import { inp, inpDate, TOOLTIPS, isDateBefore, calcTrialMonths } from '../_lib/helpers'
import { FormRow, SectionHeader, EmptyHintBubble, RadioGroup, CriticalWarning } from './FormParts'

type TrialCalc = ReturnType<typeof calcTrialMonths>

interface StepPeriodProps {
  pattern: string
  contractType: string
  period: string
  showEmptyHint: boolean
  CsvBadge: React.ComponentType<{ name: string }>
  fixedText: (text: string) => ReactNode

  dispatchStart: string; setDispatchStart: (v: string) => void
  dispatchEnd: string; setDispatchEnd: (v: string) => void

  isConflictDateExempt: boolean
  conflictDate: string; setConflictDate: (v: string) => void
  conflictDateOrg: string; setConflictDateOrg: (v: string) => void

  organizationUnit: string; setOrganizationUnit: (v: string) => void

  contractStartDate: string; setContractStartDate: (v: string) => void
  employStart: string; setEmployStart: (v: string) => void
  employEnd: string; setEmployEnd: (v: string) => void
  employStartError: string | null
  employEndError: string | null

  trialPeriod: string; setTrialPeriod: (v: string) => void
  trialStart: string; setTrialStart: (v: string) => void
  trialEnd: string; setTrialEnd: (v: string) => void
  trialStartError: string | null
  trialEndError: string | null
  trialPreview: string
  trialCalc: TrialCalc
  trialWarningChecked: boolean; setTrialWarningChecked: (v: boolean) => void
  noTrialWarningChecked: boolean; setNoTrialWarningChecked: (v: boolean) => void
  isProbableNewHire: boolean

  flexTime: string; setFlexTime: (v: string) => void
  overtime: string; setOvertime: (v: string) => void

  validatePeriod: () => string | null | undefined
  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void }>
}

export default function StepPeriod({
  pattern, contractType, period, showEmptyHint, CsvBadge, fixedText,
  dispatchStart, setDispatchStart, dispatchEnd, setDispatchEnd,
  isConflictDateExempt, conflictDate, setConflictDate, conflictDateOrg, setConflictDateOrg,
  organizationUnit, setOrganizationUnit,
  contractStartDate, setContractStartDate,
  employStart, setEmployStart, employEnd, setEmployEnd, employStartError, employEndError,
  trialPeriod, setTrialPeriod, trialStart, setTrialStart, trialEnd, setTrialEnd,
  trialStartError, trialEndError, trialPreview, trialCalc,
  trialWarningChecked, setTrialWarningChecked, noTrialWarningChecked, setNoTrialWarningChecked,
  isProbableNewHire,
  flexTime, setFlexTime, overtime, setOvertime,
  validatePeriod, handleNext, NavButtons,
}: StepPeriodProps) {
  return (
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
  )
}
