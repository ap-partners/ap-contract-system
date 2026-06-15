'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const getDocumentTypes = (workPlace: string) => {
  if (workPlace === '社内') return [{ value: '雇用契約書', pattern: 'A', step: '6STEP' }]
  return [
    { value: '雇用契約書', pattern: 'A', step: '6STEP' },
    { value: '就業条件明示書', pattern: 'B', step: '6STEP・給与記載なし' },
    { value: '雇用契約書 兼\n就業条件明示書', pattern: 'C', step: '8STEP' },
  ]
}

const getFullDocumentName = (docType: string, contractType: string) => {
  if (!docType || !contractType) return ''
  const cleanDocType = docType.replace('\n', ' ')
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : ''
  return period ? `${cleanDocType}（${period}）` : cleanDocType
}

const getPattern = (docType: string) => {
  const clean = docType.replace('\n', ' ')
  if (clean === '雇用契約書') return 'A'
  if (clean === '就業条件明示書') return 'B'
  if (clean === '雇用契約書 兼 就業条件明示書') return 'C'
  return ''
}

const STEPS_A = ['基本情報', '就業先情報', '期間・労働条件', '契約条件', '給与・保険', '最終確認']
const STEPS_B = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '最終確認']
const STEPS_C = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '契約条件', '給与・保険', '最終確認']

const inp = "bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-full"

function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [localQuery, setLocalQuery] = useState('')
  return (
    <div className="max-w-md">
      <div className="flex gap-2">
        <input
          type="text"
          value={localQuery}
          onChange={e => setLocalQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearch(localQuery) }}
          className={inp}
          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          placeholder="社員番号または氏名で検索（例：999001）"
          autoComplete="off"
        />
        <button
          onClick={() => onSearch(localQuery)}
          className="text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap shrink-0"
          style={{ background: '#1B3A8C' }}>
          検索
        </button>
      </div>
      <p className="text-xs mt-1.5" style={{ color: '#5A6A8A' }}>氏名はスペースなしでも検索できます</p>
    </div>
  )
}

export default function ApplyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [contractType, setContractType] = useState('')
  const [workPlace, setWorkPlace] = useState('現場')
  const [documentType, setDocumentType] = useState('')

  const pattern = getPattern(documentType)
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : ''
  const fullDocumentName = getFullDocumentName(documentType, contractType)
  const steps = pattern === 'A' ? STEPS_A : pattern === 'B' ? STEPS_B : pattern === 'C' ? STEPS_C : STEPS_A

  const [workLocation, setWorkLocation] = useState('')
  const [businessContent, setBusinessContent] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakTime, setBreakTime] = useState('')
  const [workingHours, setWorkingHours] = useState('')
  const [workDays, setWorkDays] = useState('')
  const [organizationUnit, setOrganizationUnit] = useState('')
  const [conflictDate, setConflictDate] = useState('')
  const [responsibility, setResponsibility] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const totalMin = (eh * 60 + em) - (sh * 60 + sm)
      if (totalMin > 0) {
        const breakMin = totalMin > 480 ? 60 : totalMin > 360 ? 45 : 0
        setBreakTime(`${breakMin}分`)
        const workMin = totalMin - breakMin
        setWorkingHours(`${Math.floor(workMin / 60)}時間${workMin % 60 > 0 ? workMin % 60 + '分' : ''}`)
      }
    }
  }, [startTime, endTime])

  useEffect(() => {
    if (workPlace === '社内' && documentType !== '雇用契約書' && documentType !== '') {
      setDocumentType('雇用契約書')
    }
  }, [workPlace])

  const handleSearch = useCallback(async (query: string) => {
    setSearched(true)
    if (!query.trim()) { setSearchResults([]); return }
    const normalized = query.replace(/[\s　]+/g, '')
    const { data } = await supabase.from('staff').select('*')
      .or(`employee_number.ilike.%${query}%,name.ilike.%${normalized}%`).limit(10)
    setSearchResults(data || [])
  }, [])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const handleNext = () => { setCurrentStep(s => s + 1); window.scrollTo(0, 0) }
  const handleBack = () => { setCurrentStep(s => s - 1); window.scrollTo(0, 0) }
  const getStepLabel = (step: number) => steps[step - 1] || ''
  const getStepType = (step: number) => {
    if (step === 1) return 'basic'
    if (step === 2) return 'workInfo'
    return 'tbd'
  }

  const stepType = getStepType(currentStep)
  if (!user) return <div className="p-8" style={{ color: '#5A6A8A' }}>読み込み中...</div>

  const Req = () => (
    <span className="text-xs px-1.5 py-0.5 rounded ml-1 leading-none shrink-0"
      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
  )

  const FormRow = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="grid" style={{ gridTemplateColumns: '180px 1fr' }}>
      <div className="border-r border-b px-4 py-4 flex items-start"
        style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
        {required && <Req />}
      </div>
      <div className="border-b px-5 py-4 flex flex-col gap-3"
        style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
        {children}
      </div>
    </div>
  )

  const SectionHeader = ({ label }: { label: string }) => (
    <div className="border-b px-5 py-2" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
      <p className="text-xs font-medium" style={{ color: '#5A6A8A' }}>▼ {label}</p>
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
          <div className="flex gap-3">
            <button onClick={() => router.push('/dashboard/sales')}
              className="text-sm px-4 py-2 rounded-lg border transition-all"
              style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
              ← 戻る
            </button>
            <button onClick={handleLogout}
              className="text-sm px-4 py-2 rounded-lg border transition-all"
              style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        {/* ステップインジケーター */}
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
                  style={{
                    color: currentStep === i + 1 ? '#1A2340' : '#5A6A8A',
                    fontWeight: currentStep === i + 1 ? 600 : 400
                  }}>
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
          {/* STEPヘッダー */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#1B3A8C' }}>
            <span className="text-white text-sm font-medium">STEP{currentStep}：{getStepLabel(currentStep)}</span>
            <span className="text-xs" style={{ color: '#A8C0E8' }}>{currentStep} / {steps.length}</span>
          </div>

          {/* ===== STEP1 ===== */}
          {stepType === 'basic' && (
            <>
              <FormRow label="対象スタッフ" required>
                {selectedStaff ? (
                  <div className="flex items-center gap-3 rounded-lg px-4 py-3 max-w-md border"
                    style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                      style={{ background: '#1B3A8C', color: 'white' }}>
                      {selectedStaff.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{selectedStaff.name}</p>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>
                        {selectedStaff.department && `${selectedStaff.department}　`}社員番号：{selectedStaff.employee_number}
                      </p>
                    </div>
                    <button
                      onClick={() => { setSelectedStaff(null); setSearched(false); setSearchResults([]) }}
                      className="ml-auto text-xs rounded-md px-2 py-1 border bg-white shrink-0"
                      style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                      変更
                    </button>
                  </div>
                ) : (
                  <div className="max-w-md">
                    <SearchInput onSearch={handleSearch} />
                    {searched && searchResults.length === 0 && (
                      <p className="text-xs mt-1.5 text-red-400">該当するスタッフが見つかりませんでした</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="border rounded-lg mt-1.5 overflow-hidden bg-white shadow-sm" style={{ borderColor: '#D0DAF0' }}>
                        {searchResults.map(s => (
                          <button key={s.id}
                            onClick={() => { setSelectedStaff(s); setSearchResults([]) }}
                            className="w-full text-left px-4 py-2.5 border-b last:border-0 flex items-center gap-3 hover:bg-blue-50 transition-colors"
                            style={{ borderColor: '#D0DAF0' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                              style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                              {s.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{s.name}</p>
                              {s.department && (
                                <p className="text-xs" style={{ color: '#5A6A8A' }}>{s.department}</p>
                              )}
                            </div>
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>{s.employee_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </FormRow>

              <FormRow label="雇用区分" required>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex border rounded-lg overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                    {['有期契約', '無期契約', '正社員'].map(v => (
                      <button key={v} onClick={() => setContractType(v)}
                        className="px-4 py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap"
                        style={{
                          borderColor: '#D0DAF0',
                          background: contractType === v ? '#1B3A8C' : 'white',
                          color: contractType === v ? 'white' : '#1A2340',
                          fontWeight: contractType === v ? 600 : 400
                        }}>
                        {v}
                      </button>
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
              </FormRow>

              <FormRow label="帳票種別" required>
                <div className="grid grid-cols-3 gap-2 max-w-2xl">
                  {getDocumentTypes(workPlace).map(d => (
                    <button key={d.value} onClick={() => setDocumentType(d.value)}
                      className="text-left p-3 rounded-lg border transition-all"
                      style={{
                        borderColor: documentType === d.value ? '#1B3A8C' : '#D0DAF0',
                        background: documentType === d.value ? '#EEF2FA' : 'white',
                      }}>
                      <p className="text-xs font-medium leading-snug whitespace-pre-line"
                        style={{ color: documentType === d.value ? '#1B3A8C' : '#1A2340' }}>
                        {d.value}
                      </p>
                      <p className="text-xs mt-1" style={{ color: documentType === d.value ? '#4A7FD4' : '#5A6A8A' }}>
                        {d.step}
                      </p>
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
                  <div className="max-w-2xl rounded-lg px-4 py-3 border"
                    style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
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

              <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button
                  onClick={() => {
                    if (!selectedStaff || !documentType || !contractType) { alert('すべての項目を選択してください'); return }
                    handleNext()
                  }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#1B3A8C' }}>
                  次へ進む →
                </button>
              </div>
            </>
          )}

          {/* ===== STEP2 ===== */}
          {stepType === 'workInfo' && (
            <>
              <FormRow label="就業場所" required>
                <input className={`${inp} max-w-lg`}
                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={workLocation} onChange={e => setWorkLocation(e.target.value)}
                  placeholder="例）東京都渋谷区〇〇1-2-3 〇〇ビル3F" />
              </FormRow>

              <FormRow label="業務内容" required>
                <input className={`${inp} max-w-lg`}
                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={businessContent} onChange={e => setBusinessContent(e.target.value)}
                  placeholder="例）営業事務・データ入力業務" />
              </FormRow>

              <FormRow label="始業・終業時刻" required>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>始業</span>
                    <input type="time" className={`${inp} w-36`}
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>終業</span>
                    <input type="time" className={`${inp} w-36`}
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>
                {(breakTime || workingHours) && (
                  <div className="flex gap-8 rounded-lg px-5 py-3 max-w-sm border"
                    style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>休憩時間（自動）</p>
                      <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{breakTime}</p>
                    </div>
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>所定労働時間（自動）</p>
                      <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{workingHours}</p>
                    </div>
                  </div>
                )}
              </FormRow>

              <FormRow label="所定労働日数" required>
                <div className="flex gap-2 flex-wrap">
                  {['週5日（月〜金）', '週4日', '週3日', 'シフト制'].map(v => (
                    <button key={v} onClick={() => setWorkDays(v)}
                      className="px-4 py-2 border rounded-lg text-sm transition-colors"
                      style={{
                        borderColor: workDays === v ? '#1B3A8C' : '#D0DAF0',
                        background: workDays === v ? '#EEF2FA' : 'white',
                        color: workDays === v ? '#1B3A8C' : '#1A2340',
                        fontWeight: workDays === v ? 600 : 400
                      }}>
                      {v}
                    </button>
                  ))}
                </div>
              </FormRow>

              {(pattern === 'B' || pattern === 'C') && (
                <>
                  <SectionHeader label="就業条件明示書の追加項目" />
                  <FormRow label="組織単位">
                    <input className={`${inp} max-w-xs`}
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                      value={organizationUnit} onChange={e => setOrganizationUnit(e.target.value)}
                      placeholder="例）第一営業部" />
                  </FormRow>
                  <FormRow label="抵触日（事業所単位）">
                    {period === '無期' ? (
                      <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                        style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                        無期雇用派遣のため該当しない（自動）
                      </p>
                    ) : (
                      <input type="date" className={`${inp} max-w-xs`}
                        style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                        value={conflictDate} onChange={e => setConflictDate(e.target.value)} />
                    )}
                  </FormRow>
                  <FormRow label="業務に伴う責任の程度">
                    <div className="flex gap-4">
                      {['有', '無'].map(v => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={responsibility === v} onChange={() => setResponsibility(v)}
                            className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                          <span className="text-sm" style={{ color: '#1A2340' }}>{v}</span>
                        </label>
                      ))}
                    </div>
                  </FormRow>
                </>
              )}

              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={handleBack}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all"
                  style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                  ← 前へ
                </button>
                <button onClick={handleNext}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#1B3A8C' }}>
                  次へ進む →
                </button>
              </div>
            </>
          )}

          {stepType === 'tbd' && (
            <div className="bg-white px-5 py-10 text-center text-sm" style={{ color: '#5A6A8A' }}>
              このSTEPは実装中です
            </div>
          )}
        </div>
      </main>
    </div>
  )
}