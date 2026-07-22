'use client'

// ===== アルバイト誓約書 新規発行申請ウィザード =====
// 2026-07-22新設。CLAUDE.md・docs/SYSTEM_DESIGN.md 10章2026-07-22「アルバイト誓約書仕様」に基づく。
// 雇用契約書ウィザード（/apply）とは別画面・別テーブル（pledges）。CSV連携なし・全項目手入力。
//
// 【今回（このチャット）の実装範囲】
// STEP1（スタッフ検索・帳票種別選択）・STEP2（就業先情報・雇用期間パターン選択）の画面のみ。
// STEP3（給与）・STEP4（最終確認）・実際の申請保存（pledgesへのinsert）・SSC確認画面・
// 帳票PDF生成・署名フロー接続は次回以降のチャットで実装する（CLAUDE.mdルール1「1チャット4機能まで」）。
// このためSTEP3・4は画面遷移だけ用意した骨格（準備中表示）としている。
//
// スタッフ検索・自部門制限のロジックはapp/apply/page.tsxのhandleSearchと同じ考え方
// （担当営業のみ自部門に制限。SSC・管理部は全部門検索可）を踏襲している。

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'

const DOCUMENT_TYPES = ['AP・CL研修用', 'CP・SPOT用'] as const
const STEP_LABELS = ['スタッフ・帳票種別', '就業先情報・雇用期間', '給与', '最終確認']

type Office = { id: string; office_name: string; postal_code: string | null; address: string | null; tel: string | null }

export default function PledgeApplyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [myDeptNo, setMyDeptNo] = useState<any>(undefined) // undefined=読み込み中 / null=特定できない
  const [currentStep, setCurrentStep] = useState(1)

  // ===== STEP1：スタッフ検索・帳票種別選択 =====
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchBlockedReason, setSearchBlockedReason] = useState<null | 'loading' | 'no_dept'>(null)
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [documentType, setDocumentType] = useState<typeof DOCUMENT_TYPES[number] | ''>('')

  // ===== STEP2：就業先情報・雇用期間パターン =====
  const [workPlaceType, setWorkPlaceType] = useState<'client' | 'internal' | ''>('')
  const [clientName, setClientName] = useState('')
  const [clientPostalCode, setClientPostalCode] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientTel, setClientTel] = useState('')
  const [offices, setOffices] = useState<Office[]>([])
  const [officeId, setOfficeId] = useState('')
  const selectedOffice = offices.find(o => o.id === officeId) || null

  const [periodPattern, setPeriodPattern] = useState<'single_multi' | 'range' | 'mix' | ''>('')
  const [workDates, setWorkDates] = useState<string[]>([])
  const [dateInput, setDateInput] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')

  // ===== 認証チェック（雇用契約書ウィザードと同じ3ロールに開放） =====
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業' && role !== 'SSC' && role !== '管理部') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [router])

  // STEP1スタッフ検索の自部門制限用：担当営業自身の部門番号を取得（/applyと同じロジック）
  useEffect(() => {
    if (!user) return
    const role = user.user_metadata?.role
    if (role !== '担当営業') { setMyDeptNo(null); return }
    const loadMyDeptNo = async () => {
      const { data } = await supabase.from('staff').select('dept_no').eq('email', user.email).limit(1).maybeSingle()
      setMyDeptNo(data?.dept_no ?? null)
    }
    loadMyDeptNo()
  }, [user])

  // 自社拠点マスタの読み込み（STEP2で使用。ページ読み込み時に一度だけ取得）
  useEffect(() => {
    const loadOffices = async () => {
      const { data } = await supabase.from('office_master').select('id, office_name, postal_code, address, tel').order('office_name', { ascending: true })
      setOffices(data || [])
    }
    loadOffices()
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setSearched(false); return }
    const normalized = query.replace(/[\s　]+/g, '')

    const role = user?.user_metadata?.role
    const restrictToOwnDept = role === '担当営業'
    if (restrictToOwnDept && myDeptNo === undefined) {
      setSearchBlockedReason('loading'); setSearchResults([]); setSearched(true)
      return
    }
    if (restrictToOwnDept && myDeptNo === null) {
      setSearchBlockedReason('no_dept'); setSearchResults([]); setSearched(true)
      return
    }
    setSearchBlockedReason(null)

    const [retiredAtOk, retirementScheduledOk] = excludeRetiredStaffOr()
    let byNumberQuery = supabase.from('staff').select('*, department_master(dept_name)').ilike('employee_number', `%${query}%`).or(retiredAtOk).or(retirementScheduledOk).limit(20)
    let byNameQuery = supabase.from('staff').select('*, department_master(dept_name)').ilike('name', `%${normalized}%`).or(retiredAtOk).or(retirementScheduledOk).limit(20)
    if (restrictToOwnDept) {
      byNumberQuery = byNumberQuery.eq('dept_no', myDeptNo)
      byNameQuery = byNameQuery.eq('dept_no', myDeptNo)
    }
    const [byNumber, byName] = await Promise.all([byNumberQuery, byNameQuery])
    const merged = [...(byNumber.data || []), ...(byName.data || [])]
    const data = Array.from(new Map(merged.map((s: any) => [s.employee_number, s])).values())
    const flattened = data.slice(0, 10).map((s: any) => ({ ...s, department: s.department_master?.dept_name || null }))
    setSearchResults(flattened)
    setSearched(true)
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

  const step1Valid = !!selectedStaff && !!documentType
  const step2WorkPlaceValid = workPlaceType === 'client'
    ? !!(clientName.trim() && clientPostalCode.trim() && clientAddress.trim() && clientTel.trim())
    : workPlaceType === 'internal' ? !!officeId : false
  const step2PeriodValid = periodPattern === 'single_multi' ? workDates.length > 0
    : periodPattern === 'range' ? !!(rangeStart && rangeEnd && rangeStart <= rangeEnd)
    : periodPattern === 'mix' ? !!(rangeStart && rangeEnd && rangeStart <= rangeEnd) && workDates.length > 0
    : false
  const step2Valid = step2WorkPlaceValid && step2PeriodValid

  const addWorkDate = () => {
    if (!dateInput) return
    if (workDates.includes(dateInput)) { setDateInput(''); return }
    setWorkDates(prev => [...prev, dateInput].sort())
    setDateInput('')
  }
  const removeWorkDate = (d: string) => setWorkDates(prev => prev.filter(x => x !== d))

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
        <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>アルバイト誓約書 新規発行申請</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleCancel}
              className="text-sm px-4 py-2 rounded-lg border font-medium transition-all"
              style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
              この申請をやめる
            </button>
            <button onClick={handleLogout} className="text-sm" style={{ color: '#5A6A8A' }}>ログアウト</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        <div className="flex items-center overflow-x-auto pb-2 mb-6">
          {STEP_LABELS.map((label, i) => (
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
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="w-5 h-px mx-1.5 shrink-0" style={{ background: currentStep > i + 1 ? '#0D9488' : '#D0DAF0' }} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#1B3A8C' }}>
            <span className="text-white text-sm font-medium">STEP{currentStep}：{STEP_LABELS[currentStep - 1]}</span>
            <span className="text-xs" style={{ color: '#A8C0E8' }}>{currentStep} / {STEP_LABELS.length}</span>
          </div>

          {/* ===== STEP1：スタッフ検索・帳票種別選択 ===== */}
          {currentStep === 1 && (
            <>
              <FormRow label="対象スタッフ" required>
                {selectedStaff ? (
                  <div className="flex items-center gap-3 rounded-lg px-4 py-3 max-w-xl border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0" style={{ background: '#1B3A8C', color: 'white' }}>
                      {selectedStaff.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words" style={{ color: '#1A2340' }}>{selectedStaff.name}</p>
                      <p className="text-xs break-words" style={{ color: '#5A6A8A' }}>
                        {selectedStaff.department && `${selectedStaff.department}　`}社員番号：{selectedStaff.employee_number}
                      </p>
                    </div>
                    <button onClick={e => { e.preventDefault(); setSelectedStaff(null); setSearched(false); setSearchResults([]) }}
                      className="ml-auto text-xs rounded-md px-2 py-1 border bg-white shrink-0" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>変更</button>
                  </div>
                ) : (
                  <div className="max-w-xl">
                    <SearchInput onSearch={handleSearch} />
                    {searched && searchBlockedReason === 'loading' && (
                      <p className="text-xs mt-2" style={{ color: '#5A6A8A' }}>所属部門の情報を読み込んでいます。少し待ってからもう一度検索してください。</p>
                    )}
                    {searched && searchBlockedReason === 'no_dept' && (
                      <p className="text-xs mt-2 text-red-400">ご自身の所属部門情報が確認できないため検索できません。管理部にご連絡ください。</p>
                    )}
                    {searched && !searchBlockedReason && searchResults.length === 0 && (
                      <p className="text-xs mt-2 text-red-400">該当するスタッフが見つかりませんでした。スタッフマスタに登録済みの方のみ申請できます。</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="border rounded-lg mt-1.5 overflow-hidden bg-white shadow-sm" style={{ borderColor: '#D0DAF0' }}>
                        {searchResults.map(s => (
                          <button key={s.id} onClick={e => { e.preventDefault(); setSelectedStaff(s); setSearchResults([]) }}
                            className="w-full text-left px-4 py-2.5 border-b last:border-0 flex items-center gap-3 hover:bg-blue-50 transition-colors" style={{ borderColor: '#D0DAF0' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
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

              <FormRow label="帳票種別" required>
                <div className="grid grid-cols-2 gap-2 max-w-xl">
                  {DOCUMENT_TYPES.map(d => (
                    <button key={d} onClick={e => { e.preventDefault(); setDocumentType(d) }}
                      className="text-left p-3 rounded-lg border transition-all"
                      style={{ borderColor: documentType === d ? '#1B3A8C' : '#D0DAF0', background: documentType === d ? '#EEF2FA' : 'white' }}>
                      <p className="text-sm font-medium" style={{ color: documentType === d ? '#1B3A8C' : '#1A2340' }}>{d}</p>
                      <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
                        {d === 'AP・CL研修用' ? 'APパートナーズ・クライアント研修向け' : 'コールセンター・スポット案件向け'}
                      </p>
                    </button>
                  ))}
                </div>
              </FormRow>

              <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); if (!step1Valid) { alert('対象スタッフと帳票種別を選択してください'); return }; setCurrentStep(2) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP2：就業先情報・雇用期間パターン ===== */}
          {currentStep === 2 && (
            <>
              <FormRow label="就業先情報" required>
                <div className="flex gap-2 mb-2">
                  {(['client', 'internal'] as const).map(v => (
                    <button key={v} onClick={e => { e.preventDefault(); setWorkPlaceType(v) }}
                      className="px-4 py-2 rounded-lg border text-sm transition-all"
                      style={{ borderColor: workPlaceType === v ? '#1B3A8C' : '#D0DAF0', background: workPlaceType === v ? '#1B3A8C' : 'white', color: workPlaceType === v ? 'white' : '#1A2340', fontWeight: workPlaceType === v ? 600 : 400 }}>
                      {v === 'client' ? 'クライアント先' : '自社（研修等）'}
                    </button>
                  ))}
                </div>

                {workPlaceType === 'client' && (
                  <div className="flex flex-col gap-2 max-w-xl">
                    <LabeledInput label="就業先名" value={clientName} onChange={setClientName} placeholder="例）〇〇株式会社 新宿店" />
                    <LabeledInput label="郵便番号" value={clientPostalCode} onChange={setClientPostalCode} placeholder="例）123-4567" />
                    <LabeledInput label="住所" value={clientAddress} onChange={setClientAddress} placeholder="例）東京都新宿区〇〇1-2-3" />
                    <LabeledInput label="電話番号" value={clientTel} onChange={setClientTel} placeholder="例）03-1234-5678" />
                  </div>
                )}

                {workPlaceType === 'internal' && (
                  <div className="flex flex-col gap-2 max-w-xl">
                    {offices.length === 0 ? (
                      <p className="text-xs text-red-400">自社拠点マスタが未登録です。管理部にマスタ管理タブでの登録を依頼してください。</p>
                    ) : (
                      <select value={officeId} onChange={e => setOfficeId(e.target.value)}
                        className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                        <option value="">拠点を選択してください</option>
                        {offices.map(o => <option key={o.id} value={o.id}>{o.office_name}</option>)}
                      </select>
                    )}
                    {selectedOffice && (
                      <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（修正不可）</p>
                        <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>
                          {selectedOffice.office_name}<br />
                          〒{selectedOffice.postal_code || '未登録'}　{selectedOffice.address || '住所未登録'}<br />
                          TEL：{selectedOffice.tel || '未登録'}
                        </p>
                        {(!selectedOffice.postal_code || !selectedOffice.address || !selectedOffice.tel) && (
                          <p className="text-xs mt-2" style={{ color: '#DC2626' }}>この拠点は住所等が未登録です。管理部にマスタ登録を依頼してください。</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </FormRow>

              <FormRow label="雇用期間パターン" required>
                <div className="grid grid-cols-3 gap-2 max-w-2xl mb-2">
                  {([
                    { id: 'single_multi', label: '単日・複数日選択', desc: '選択した日数分、各1枚発行' },
                    { id: 'range', label: '期間指定', desc: '期間で1枚発行' },
                    { id: 'mix', label: 'MIX', desc: '期間分1枚＋単日ごと各1枚' },
                  ] as const).map(p => (
                    <button key={p.id} onClick={e => { e.preventDefault(); setPeriodPattern(p.id) }}
                      className="text-left p-3 rounded-lg border transition-all"
                      style={{ borderColor: periodPattern === p.id ? '#1B3A8C' : '#D0DAF0', background: periodPattern === p.id ? '#EEF2FA' : 'white' }}>
                      <p className="text-xs font-medium" style={{ color: periodPattern === p.id ? '#1B3A8C' : '#1A2340' }}>{p.label}</p>
                      <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>{p.desc}</p>
                    </button>
                  ))}
                </div>

                {(periodPattern === 'range' || periodPattern === 'mix') && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs" style={{ color: '#5A6A8A' }}>期間</span>
                    <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                    <span className="text-xs" style={{ color: '#5A6A8A' }}>〜</span>
                    <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                    {rangeStart && rangeEnd && rangeStart > rangeEnd && <span className="text-xs" style={{ color: '#DC2626' }}>開始日は終了日より前にしてください</span>}
                  </div>
                )}

                {(periodPattern === 'single_multi' || periodPattern === 'mix') && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#5A6A8A' }}>就業日</span>
                      <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                      <button onClick={e => { e.preventDefault(); addWorkDate() }}
                        className="text-xs px-3 py-2 rounded-lg border font-medium" style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>追加</button>
                    </div>
                    {workDates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {workDates.map(d => (
                          <span key={d} className="text-xs rounded-full px-3 py-1 border flex items-center gap-2" style={{ borderColor: '#D0DAF0', background: 'white', color: '#1A2340' }}>
                            {d}
                            <button onClick={e => { e.preventDefault(); removeWorkDate(d) }} style={{ color: '#DC2626' }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {workDates.length === 0 && <p className="text-xs" style={{ color: '#5A6A8A' }}>就業日を1件以上追加してください（選択した日数分、帳票を各1枚発行します）</p>}
                  </div>
                )}
              </FormRow>

              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setCurrentStep(1) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); if (!step2Valid) { alert('就業先情報と雇用期間の入力を完了してください'); return }; setCurrentStep(3) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP3・4：骨格のみ（次回以降のチャットで実装） ===== */}
          {(currentStep === 3 || currentStep === 4) && (
            <>
              <div className="px-5 py-10 flex flex-col items-center gap-3">
                <p className="text-sm font-medium" style={{ color: '#1A2340' }}>
                  STEP{currentStep}「{STEP_LABELS[currentStep - 1]}」は準備中です。
                </p>
                <p className="text-xs text-center leading-relaxed" style={{ color: '#5A6A8A' }}>
                  この画面は次回以降のチャットで実装予定です。<br />
                  ここまでのSTEP1・2の入力内容はまだ保存されていません。
                </p>
              </div>
              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setCurrentStep(currentStep - 1) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ===== 小さな共通UI部品（app/apply/_components/FormParts.tsxと同じ見た目。今回は依存関係を
//      増やさず新規ルートを自己完結させるため、必要な分だけこのファイル内に用意している） =====

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
      <div className="border-r border-b px-4 py-4 flex flex-col items-start justify-center gap-1.5" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <div className="flex items-center flex-wrap gap-1">
          <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
          {required && (
            <span className="text-xs px-1.5 py-0.5 rounded ml-1 leading-none shrink-0" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
          )}
        </div>
      </div>
      <div className="border-b px-5 py-4 flex flex-col gap-3" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
        {children}
      </div>
    </div>
  )
}

function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [localQuery, setLocalQuery] = useState('')
  const [localSearching, setLocalSearching] = useState(false)
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    setLocalSearching(true)
    await onSearch(localQuery)
    setLocalSearching(false)
  }
  return (
    <div className="max-w-xl">
      <div className="flex gap-2">
        <input type="text" value={localQuery} onChange={e => setLocalQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleClick(e as any) }}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none placeholder:text-gray-400"
          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          placeholder="社員番号または氏名で検索（例：100001）" autoComplete="off" />
        <button onClick={handleClick} disabled={localSearching}
          className="text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap shrink-0"
          style={{ background: localSearching ? '#A8C0E8' : '#1B3A8C' }}>
          {localSearching ? '検索中...' : '検索'}
        </button>
      </div>
      <p className="text-xs mt-1.5" style={{ color: '#5A6A8A' }}>氏名はスペースなしでも検索できます</p>
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: '#1A2340' }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="border rounded-lg px-3 py-2 text-sm focus:outline-none placeholder:text-gray-400"
        style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder={placeholder} />
    </div>
  )
}
