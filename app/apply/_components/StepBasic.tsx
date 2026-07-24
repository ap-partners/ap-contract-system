'use client'

// STEP1：基本情報（対象スタッフ検索・スタッフマスタ登録依頼・雇用区分・帳票種別）
// app/apply/page.tsx の stepType === 'basic' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetter・派生値をpropsで受け取る。

import { useState } from 'react'
import { getDocumentTypes, clampDateYear } from '../_lib/helpers'
import { FormRow, SearchInput } from './FormParts'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'

interface StepBasicProps {
  selectedStaff: any
  setSelectedStaff: (v: any) => void
  searched: boolean
  setSearched: (v: boolean) => void
  searchResults: any[]
  setSearchResults: (v: any[]) => void
  searchBlockedReason: null | 'loading' | 'no_dept'
  handleSearch: (query: string) => void

  reqSubmitted: boolean
  setReqSubmitted: (v: boolean) => void
  showRequestForm: boolean
  setShowRequestForm: (v: boolean) => void
  reqEmployeeNumber: string; setReqEmployeeNumber: (v: string) => void
  reqName: string; setReqName: (v: string) => void
  reqDept: string; setReqDept: (v: string) => void
  reqHireDate: string; setReqHireDate: (v: string) => void
  reqWorkLocation: string; setReqWorkLocation: (v: string) => void
  reqWithCsv: boolean; setReqWithCsv: (v: boolean) => void
  reqCsvSystem: string; setReqCsvSystem: (v: string) => void
  reqDispatchStart: string; setReqDispatchStart: (v: string) => void
  reqSubmitting: boolean
  reqError: string; setReqError: (v: string) => void
  handleSubmitRequest: () => void

  contractType: string
  setContractType: (v: string) => void
  isContractTypeLocked: boolean
  showContractTypeLockedMsg: boolean
  setShowContractTypeLockedMsg: (v: boolean) => void
  workPlace: string
  setWorkPlace: (v: string) => void
  documentType: string
  setDocumentType: (v: string) => void
  fullDocumentName: string
  pattern: string
  deptWageMasterMissing: boolean

  handleNext: () => void
}

export default function StepBasic({
  selectedStaff, setSelectedStaff, searched, setSearched, searchResults, setSearchResults,
  searchBlockedReason, handleSearch,
  reqSubmitted, setReqSubmitted, showRequestForm, setShowRequestForm,
  reqEmployeeNumber, setReqEmployeeNumber, reqName, setReqName, reqDept, setReqDept,
  reqHireDate, setReqHireDate, reqWorkLocation, setReqWorkLocation,
  reqWithCsv, setReqWithCsv, reqCsvSystem, setReqCsvSystem, reqDispatchStart, setReqDispatchStart,
  reqSubmitting, reqError, setReqError, handleSubmitRequest,
  contractType, setContractType, isContractTypeLocked,
  showContractTypeLockedMsg, setShowContractTypeLockedMsg,
  workPlace, setWorkPlace, documentType, setDocumentType,
  fullDocumentName, pattern, deptWageMasterMissing,
  handleNext,
}: StepBasicProps) {
  // 2026-07-22追加（alert/confirm置き換えPhase3・①必須項目チェック）：「次へ進む」時のalert()を
  // インライン警告バナー(ValidationBanner)に置き換えるためのローカルstate。
  const [stepError, setStepError] = useState<string | null>(null)
  return (
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
            {searched && searchBlockedReason === 'loading' && (
              <div className="mt-2">
                <p className="text-xs mb-2" style={{ color: '#5A6A8A' }}>所属部門の情報を読み込んでいます。少し待ってからもう一度検索してください。</p>
              </div>
            )}
            {searched && searchBlockedReason === 'no_dept' && (
              <div className="mt-2">
                <p className="text-xs mb-2 text-red-400">ご自身の所属部門情報が確認できないため検索できません。管理部にご連絡ください。</p>
              </div>
            )}
            {searched && !searchBlockedReason && searchResults.length === 0 && (
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
                          onChange={e => setReqHireDate(clampDateYear(e.target.value))}
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
                                onChange={e => setReqDispatchStart(clampDateYear(e.target.value))}
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

          {stepError && (
            <div className="px-5">
              <ValidationBanner message={stepError} />
            </div>
          )}
          <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
            <button onClick={e => {
              e.preventDefault()
              if (!selectedStaff || !documentType || !contractType) { setStepError('すべての項目を選択してください'); return }
              if (deptWageMasterMissing) { setStepError('この部門は最低賃金マスタが未登録のため、申請できません。管理部にお問い合わせください。'); return }
              setStepError(null)
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
  )
}
