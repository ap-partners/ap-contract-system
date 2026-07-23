'use client'

// STEP2：就業先情報（入力方法選択・CSV検索・就業先情報・時間/日数・就業条件明示書の追加項目）
// app/apply/page.tsx の stepType === 'workInfo' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetter・派生値・
// 大きな非同期ハンドラ（handleCsvSearch・handleCsvResultSelect）をpropsで受け取る。

import { useState } from 'react'
import { inp, toHalfWidthDigits, padTwoDigits, TOOLTIPS } from '../_lib/helpers'
import { Req, FormRow, SectionHeader, EmptyHintBubble, TelInput, RadioGroup } from './FormParts'

interface StepWorkInfoProps {
  csvRequestSent: boolean; setCsvRequestSent: (v: boolean) => void

  csvMode: 'csv' | 'manual'; setCsvMode: (v: 'csv' | 'manual') => void
  csvSearched: boolean; setCsvSearched: (v: boolean) => void
  csvResults: any[]; setCsvResults: (v: any[]) => void
  csvNoResults: boolean; setCsvNoResults: (v: boolean) => void
  csvFallbackMatch: boolean
  resetStep2Step3ForModeChange: () => void

  csvSystem: string; setCsvSystem: (v: string) => void
  csvDispatchStart: string; setCsvDispatchStart: (v: string) => void
  csvLoading: boolean
  handleCsvSearch: () => void

  csvSelectedId: number | null
  handleCsvResultSelect: (r: any, idx: number) => void

  csvRequestWorkLocation: string; setCsvRequestWorkLocation: (v: string) => void
  handleSubmitCsvRequest: () => void
  csvRequestSubmitting: boolean
  csvRequestError: string

  CsvBadge: React.ComponentType<{ name: string }>

  workLocationName: string; setWorkLocationName: (v: string) => void
  workLocationAddress: string; setWorkLocationAddress: (v: string) => void
  workLocationTel: string; setWorkLocationTel: (v: string) => void

  businessContent: string; setBusinessContent: (v: string) => void

  startTime: string; setStartTime: (v: string) => void
  endTime: string; setEndTime: (v: string) => void
  isShift: boolean; setIsShift: (v: boolean) => void

  breakTime: string; setBreakTime: (v: string) => void

  workingHoursH: string; setWorkingHoursH: (v: string | ((prev: string) => string)) => void
  workingHoursM: string; setWorkingHoursM: (v: string | ((prev: string) => string)) => void
  workingHoursWarn: string | null

  workDays: string; setWorkDays: (v: string) => void
  workDaysOther: string; setWorkDaysOther: (v: string) => void

  pattern: string
  responsibility: string; setResponsibility: (v: string) => void

  showEmptyHint: boolean

  validateStep2: () => string | null | undefined
  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void; error?: string | null }>
}

export default function StepWorkInfo({
  csvRequestSent, setCsvRequestSent,
  csvMode, setCsvMode, csvSearched, setCsvSearched, csvResults, setCsvResults, csvNoResults, setCsvNoResults,
  csvFallbackMatch,
  resetStep2Step3ForModeChange,
  csvSystem, setCsvSystem, csvDispatchStart, setCsvDispatchStart, csvLoading, handleCsvSearch,
  csvSelectedId, handleCsvResultSelect,
  csvRequestWorkLocation, setCsvRequestWorkLocation, handleSubmitCsvRequest, csvRequestSubmitting, csvRequestError,
  CsvBadge,
  workLocationName, setWorkLocationName, workLocationAddress, setWorkLocationAddress,
  workLocationTel, setWorkLocationTel,
  businessContent, setBusinessContent,
  startTime, setStartTime, endTime, setEndTime, isShift, setIsShift,
  breakTime, setBreakTime,
  workingHoursH, setWorkingHoursH, workingHoursM, setWorkingHoursM, workingHoursWarn,
  workDays, setWorkDays, workDaysOther, setWorkDaysOther,
  pattern, responsibility, setResponsibility,
  showEmptyHint,
  validateStep2, handleNext, NavButtons,
}: StepWorkInfoProps) {
  // 2026-07-22追加（alert/confirm置き換えPhase3・①必須項目チェック）：NavButtonsのerror propに
  // 渡すためのローカルstate。従来alert()表示していたエラーメッセージをバナー化する。
  const [stepError, setStepError] = useState<string | null>(null)
  return (
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
                      onClick={e => { e.preventDefault(); handleCsvSearch() }}
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
                      {csvFallbackMatch && (
                        <div className="rounded-lg border px-3 py-2"
                          style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
                          <p className="text-xs" style={{ color: '#92400E' }}>
                            この方はSBクルーコードがまだスタッフマスタに反映されていないため、氏名・生年月日で照合した候補です。
                            内容をよくご確認の上、選択してください。
                          </p>
                        </div>
                      )}
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>{csvResults.length}件見つかりました。該当する就業先を選択してください。</p>
                      <div className="rounded-lg border overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                        {csvResults.map((r, idx) => (
                          <button key={idx}
                            onClick={e => { e.preventDefault(); handleCsvResultSelect(r, idx) }}
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
              placeholder="例）携帯電話販売促進業務"
              maxLength={2000} />
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
            if (err) { setStepError(err); return }
            setStepError(null)
            handleNext()
          }} error={stepError} />
        </>
      )}
    </>
  )
}
