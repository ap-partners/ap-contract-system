'use client'

// ===== アルバイト誓約書 新規発行申請ウィザード =====
// 2026-07-22新設。CLAUDE.md・docs/SYSTEM_DESIGN.md 10章2026-07-22「アルバイト誓約書仕様」に基づく。
// 雇用契約書ウィザード（/apply）とは別画面・別テーブル（pledges）。CSV連携なし・全項目手入力。
//
// 【実装範囲の経緯】当初はSTEP1（スタッフ検索・帳票種別）→STEP2（就業先情報・雇用期間）→
// STEP3（給与）→STEP4（最終確認）の4STEPで設計・実装したが、伊藤さん提供の実物Excel
// （契約書関連/アルバイト誓約書(AP・CL研修).xlsx・(CP・SPOT).xlsx）を実際に開いて検証した結果、
// 「業務内容」（自由記述）と「所定労働時間及び休憩時間」（就業時間・休憩時間帯を最大5パターン）
// という、それまでのSTEP設計に無かった必須項目が帳票上に存在することが判明。伊藤さんと相談し、
// この2項目のための新規STEPを追加、5STEP構成（①スタッフ・帳票種別→②就業先情報・雇用期間→
// ③業務内容・就業時間→④給与→⑤最終確認）に変更して全STEP・pledgesへの保存処理まで実装した。
// SSC確認画面・帳票PDF生成・署名フロー接続は別途対応する。
//
// スタッフ検索・自部門制限のロジックはapp/apply/page.tsxのhandleSearchと同じ考え方
// （担当営業のみ自部門に制限。SSC・管理部は全部門検索可）を踏襲している。
// STEP4（給与）の賃金・交通費まわりはapp/apply/_components/StepSalary.tsxの考え方を踏襲しつつ、
// 保険関連ブロックは含めない（アルバイト誓約書の元Excel仕様に保険項目が無いため）簡略版。

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'
import { SALARY_RULES, toHalfWidthDigits, parseAmount } from '@/app/apply/_lib/helpers'
import { WAGE_PAYMENT_TEXT } from '@/lib/pdf/documentText'

const DOCUMENT_TYPES = ['AP・CL研修用', 'CP・SPOT用'] as const
const STEP_LABELS = ['スタッフ・帳票種別', '就業先情報・雇用期間', '業務内容・就業時間', '給与', '最終確認']
const MAX_SHIFT_ROWS = 5

// アルバイト誓約書専用の交通費区分（2026-07-22伊藤さん指摘：「定期代＋ガソリン代」はこのファイルのみ除外。
// 雇用契約書(/apply)側の共通TRANSPORT_TYPESは変更せず、影響範囲をこのファイルに限定するためローカルに複製）
const PLEDGE_TRANSPORT_TYPES = [
  {
    id: 'default',
    label: '実費または定期代（デフォルト）',
    icon: '/icons/transport-pass.png',
    preview: '実費または定期代(デフォルト)\n原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
  {
    id: 'included',
    label: '交通費込',
    icon: '/icons/transport-included.png',
    preview: '交通費込\n基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。',
  },
  {
    id: 'gas',
    label: 'ガソリン代',
    icon: '/icons/transport-gas.png',
    preview: 'ガソリン代\n私有車通勤：ガソリン代支給　【 12円 / km】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
]

type ShiftRow = { start: string; end: string; contractHours: string; breakMinutes: string }
const emptyShiftRow = (): ShiftRow => ({ start: '', end: '', contractHours: '', breakMinutes: '' })

type Office = { id: string; office_name: string; postal_code: string | null; address: string | null; tel: string | null }
type WorkDescriptionTemplate = { id: string; template_text: string }

// ===== アイコン（ダッシュボード画面のIcon実装と同じ手描きSVG方式。Tabler等の外部アイコンフォントは
//      本アプリでは一切読み込んでいないため使用不可。viewBox・ストローク仕様を既存画面に合わせている） =====
type PledgeIconName = 'graduationCap' | 'megaphone' | 'store' | 'building' | 'check' | 'trash' | 'calendarMulti' | 'calendarRange' | 'calendarMix'

function PledgeIcon({ name, className = 'w-5 h-5', style }: { name: PledgeIconName; className?: string; style?: React.CSSProperties }) {
  const paths: Record<PledgeIconName, React.ReactElement> = {
    graduationCap: (
      <>
        <path d="M22 10 12 5 2 10l10 5 10-5Z" />
        <path d="M6 12v5c0 1.2 2.7 3 6 3s6-1.8 6-3v-5" />
        <path d="M22 10v6" />
      </>
    ),
    megaphone: (
      <>
        <path d="M3 11v3a1 1 0 0 0 1 1h2l4 4V6l-4 4H4a1 1 0 0 0-1 1Z" />
        <path d="M15.5 8a4.2 4.2 0 0 1 0 7" />
        <path d="M18.5 5a8.5 8.5 0 0 1 0 13" />
      </>
    ),
    store: (
      <>
        <path d="M3 9.5 4.5 4h15L21 9.5" />
        <path d="M4 9.5V20h16V9.5" />
        <path d="M9 20v-6h6v6" />
        <path d="M3 9.5h18" />
      </>
    ),
    building: (
      <>
        <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" />
        <path d="M4 21h16" />
        <path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h1M14 17h1" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </>
    ),
    calendarMulti: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 2.5v4M16 2.5v4" />
        <path d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17h.01M12 17h.01" />
      </>
    ),
    calendarRange: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 2.5v4M16 2.5v4" />
        <path d="M8 15h8" />
      </>
    ),
    calendarMix: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 2.5v4M16 2.5v4" />
        <path d="M12 13.5v5M9.5 16h5" />
      </>
    ),
  }
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

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

  // ===== STEP3：業務内容・就業時間 =====
  const [workDescription, setWorkDescription] = useState('')
  const [shifts, setShifts] = useState<ShiftRow[]>([emptyShiftRow()])
  const [workDescriptionTemplates, setWorkDescriptionTemplates] = useState<WorkDescriptionTemplate[]>([])

  // ===== STEP4：給与（StepSalaryの賃金・交通費ブロックの簡略版。保険ブロックなし。
  //      2026-07-22伊藤さん指摘によりアルバイト向けに簡略化：月給・定額残業手当・住宅手当は削除、
  //      月額換算基準は1日7時間×20日（140時間）に変更） =====
  const [salaryType, setSalaryType] = useState('時給')
  const [basicSalary, setBasicSalary] = useState('')
  const [rolePay, setRolePay] = useState('')
  const [skillPay, setSkillPay] = useState('')
  const [salesPay, setSalesPay] = useState('')
  const [transportType, setTransportType] = useState(PLEDGE_TRANSPORT_TYPES[0].id)
  const [salaryWarningChecked, setSalaryWarningChecked] = useState(false)

  const basicSalaryError = (() => {
    if (!basicSalary) return null
    const val = parseAmount(basicSalary)
    const rule = SALARY_RULES[salaryType]
    if (!rule) return null
    if (val < rule.min || val > rule.max) return '桁数をご確認ください'
    return null
  })()

  const allowancesTotal = parseAmount(skillPay) + parseAmount(rolePay) + parseAmount(salesPay)
  const salaryTotal = (() => {
    const basic = parseAmount(basicSalary)
    if (salaryType === '時給') return basic * 140 + allowancesTotal
    return basic + allowancesTotal
  })()
  const hourlyMonthlyBreakdown = (() => {
    if (salaryType !== '時給') return null
    const basic = parseAmount(basicSalary)
    if (!basic) return null
    const lines = [`基本給：${basic.toLocaleString()}円 × 140時間 = ${(basic * 140).toLocaleString()}円`]
    if (parseAmount(rolePay) > 0) lines.push(`役職手当：${parseAmount(rolePay).toLocaleString()}円`)
    if (parseAmount(skillPay) > 0) lines.push(`職能給：${parseAmount(skillPay).toLocaleString()}円`)
    if (parseAmount(salesPay) > 0) lines.push(`営業手当：${parseAmount(salesPay).toLocaleString()}円`)
    return lines
  })()
  const selectedTransport = PLEDGE_TRANSPORT_TYPES.find(t => t.id === transportType) || PLEDGE_TRANSPORT_TYPES[0]

  // ===== STEP5：最終確認・保存 =====
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

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

  // 業務内容テンプレートマスタの読み込み（STEP3で使用。2026-07-22追加）
  useEffect(() => {
    const loadTemplates = async () => {
      const { data } = await supabase.from('work_description_templates').select('id, template_text').order('sort_order', { ascending: true })
      setWorkDescriptionTemplates(data || [])
    }
    loadTemplates()
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
    handleCancel2()
  }
  const handleCancel2 = () => {
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

  // STEP3：就業時間表の行操作（必ず1行・最大5行）
  const updateShift = (idx: number, patch: Partial<ShiftRow>) => {
    setShifts(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }
  const addShiftRow = () => setShifts(prev => (prev.length >= MAX_SHIFT_ROWS ? prev : [...prev, emptyShiftRow()]))
  const removeShiftRow = (idx: number) => setShifts(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))

  const step3Valid = !!workDescription.trim() && shifts.every(s => !!s.start && !!s.end)

  const validateSalary = (): string | null => {
    if (!basicSalary) return '基本給を入力してください'
    if (basicSalaryError) return basicSalaryError
    if (salaryTotal > 1000000 && !salaryWarningChecked) return '合計支給額が100万円超の警告について、上長の了承確認が必要です'
    return null
  }
  const step4Valid = !validateSalary()

  // STEP2の雇用期間パターンから、実際に発行する帳票の枚数分の「雇用期間（開始日・終了日）」一覧を組み立てる。
  // single_multi：選択した日ごとに1枚（開始=終了=その日）／range：期間で1枚／mix：期間で1枚＋単日ごとに1枚
  const buildDocumentPeriods = (): { start: string; end: string }[] => {
    const singleDocs = workDates.map(d => ({ start: d, end: d }))
    const rangeDoc = rangeStart && rangeEnd ? [{ start: rangeStart, end: rangeEnd }] : []
    if (periodPattern === 'single_multi') return singleDocs
    if (periodPattern === 'range') return rangeDoc
    if (periodPattern === 'mix') return [...rangeDoc, ...singleDocs]
    return []
  }

  const handleSubmit = async () => {
    setSubmitError('')
    setIsSubmitting(true)
    try {
      const { data: submitterStaffRow } = await supabase
        .from('staff')
        .select('dept_no, name')
        .eq('email', user.email)
        .limit(1)
        .maybeSingle()

      const documentPeriods = buildDocumentPeriods()

      const inputData = {
        staff: {
          employee_number: selectedStaff.employee_number,
          name: selectedStaff.name,
          department: selectedStaff.department,
        },
        workDescription,
        shifts,
        periodPattern,
        documentPeriods,
        salary: {
          salaryType, basicSalary, rolePay, skillPay, salesPay,
          salaryTotal, transportType,
        },
        wagePaymentText: WAGE_PAYMENT_TEXT,
        deductionText: '源泉所得税',
        allowancesText: '－',
      }

      const { error } = await supabase.from('pledges').insert([{
        staff_id: selectedStaff.id,
        document_type: documentType,
        status: '申請中',
        work_place_type: workPlaceType,
        client_name: workPlaceType === 'client' ? clientName : null,
        client_postal_code: workPlaceType === 'client' ? clientPostalCode : null,
        client_address: workPlaceType === 'client' ? clientAddress : null,
        client_tel: workPlaceType === 'client' ? clientTel : null,
        office_id: workPlaceType === 'internal' ? officeId : null,
        period_pattern: periodPattern,
        input_data: inputData,
        created_by: user.id,
        created_by_dept_no: submitterStaffRow?.dept_no ?? null,
        created_by_name: submitterStaffRow?.name ?? user.email ?? null,
        search_text: [selectedStaff.employee_number, selectedStaff.name, selectedStaff.department].filter(Boolean).join(' '),
      }])

      if (error) {
        setSubmitError('申請の保存に失敗しました：' + error.message)
        setIsSubmitting(false)
        return
      }
      setIsSubmitted(true)
    } catch (e: any) {
      setSubmitError('申請の保存中にエラーが発生しました：' + (e?.message || ''))
    } finally {
      setIsSubmitting(false)
    }
  }

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
                <div className="grid grid-cols-2 gap-3 max-w-xl">
                  {DOCUMENT_TYPES.map(d => {
                    const selected = documentType === d
                    return (
                      <button key={d} onClick={e => { e.preventDefault(); setDocumentType(d) }}
                        className="relative text-left p-4 rounded-xl border-2 transition-all"
                        style={{ borderColor: selected ? '#1B3A8C' : '#D0DAF0', background: selected ? '#EEF2FA' : 'white' }}>
                        {selected && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#1B3A8C' }}>
                            <PledgeIcon name="check" className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: selected ? '#1B3A8C' : '#EEF2FA' }}>
                          <PledgeIcon name={d === 'AP・CL研修用' ? 'graduationCap' : 'megaphone'} className="w-5 h-5" style={{ color: selected ? 'white' : '#1B3A8C' }} />
                        </div>
                        <p className="text-sm font-bold" style={{ color: selected ? '#1B3A8C' : '#1A2340' }}>{d}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#5A6A8A' }}>
                          {d === 'AP・CL研修用' ? 'APパートナーズ・クライアント研修向け' : 'キャンペーン・スポット案件向け'}
                        </p>
                      </button>
                    )
                  })}
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
                <div className="inline-flex rounded-lg border p-1 mb-2" style={{ borderColor: '#D0DAF0', background: '#F5F7FC' }}>
                  {(['client', 'internal'] as const).map(v => {
                    const selected = workPlaceType === v
                    return (
                      <button key={v} onClick={e => { e.preventDefault(); setWorkPlaceType(v) }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm border transition-all hover:bg-white"
                        style={{
                          background: selected ? '#1B3A8C' : 'white',
                          color: selected ? 'white' : '#5A6A8A',
                          fontWeight: selected ? 600 : 500,
                          borderColor: selected ? '#1B3A8C' : '#D0DAF0',
                        }}>
                        <PledgeIcon name={v === 'client' ? 'store' : 'building'} className="w-4 h-4" />
                        {v === 'client' ? 'クライアント先' : '自社（研修等）'}
                      </button>
                    )
                  })}
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

              <FormRow label="雇用期間の指定方法" required>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-1" style={{ background: '#EEF2FA', border: '1px solid #D0DAF0' }}>
                  <PledgeIcon name="check" className="w-4 h-4 shrink-0" style={{ color: '#1B3A8C' }} />
                  <p className="text-xs font-bold" style={{ color: '#1B3A8C' }}>選択したパターンによって、発行される書類の枚数が変わります。下から働き方に合うものを選んでください。</p>
                </div>
                <div className="grid grid-cols-3 gap-2 max-w-2xl mb-2">
                  {([
                    { id: 'single_multi', label: '単日・複数日選択', desc: '特定の日を1日ずつ登録（例：7/1と7/23）→選んだ日数分、書類を発行', icon: 'calendarMulti' },
                    { id: 'range', label: '期間指定', desc: '開始日〜終了日で契約（例：8/1〜8/10）→期間全体で書類を1枚発行', icon: 'calendarRange' },
                    { id: 'mix', label: 'MIX', desc: '期間指定に単日も追加可能→期間分1枚＋単日ごとに1枚発行', icon: 'calendarMix' },
                  ] as const).map(p => {
                    const selected = periodPattern === p.id
                    return (
                      <button key={p.id} onClick={e => { e.preventDefault(); setPeriodPattern(p.id) }}
                        className="relative text-left p-3 rounded-xl border-2 transition-all"
                        style={{ borderColor: selected ? '#1B3A8C' : '#D0DAF0', background: selected ? '#EEF2FA' : 'white' }}>
                        {selected && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#1B3A8C' }}>
                            <PledgeIcon name="check" className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <PledgeIcon name={p.icon} className="w-5 h-5 mb-1.5" style={{ color: selected ? '#1B3A8C' : '#5A6A8A' }} />
                        <p className="text-xs font-bold" style={{ color: selected ? '#1B3A8C' : '#1A2340' }}>{p.label}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#5A6A8A' }}>{p.desc}</p>
                      </button>
                    )
                  })}
                </div>

                {periodPattern && (
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>
                    {periodPattern === 'single_multi' && '就業日を1日ずつ追加してください。追加した日数分、書類を発行します。'}
                    {periodPattern === 'range' && '雇用期間の開始日と終了日を指定してください。この期間で書類を1枚発行します。'}
                    {periodPattern === 'mix' && '期間指定に加えて、単日の就業日も追加できます。期間分＋単日ごとに書類を発行します。'}
                  </p>
                )}

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
                      <div className="flex flex-col gap-1.5">
                        {workDates.map(d => (
                          <div key={d} className="inline-flex items-center gap-6 rounded-lg pl-3 pr-2 py-2 border w-fit" style={{ borderColor: '#D0DAF0', background: 'white' }}>
                            <span className="text-sm" style={{ color: '#1A2340' }}>{d.replaceAll('-', '/')}</span>
                            <button onClick={e => { e.preventDefault(); removeWorkDate(d) }}
                              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md shrink-0" style={{ color: '#DC2626' }}>
                              <PledgeIcon name="trash" className="w-3.5 h-3.5" />
                              削除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {workDates.length === 0 && <p className="text-xs" style={{ color: '#5A6A8A' }}>就業日を1件以上追加してください（選択した日数分、帳票を各1枚発行します）</p>}
                  </div>
                )}

                {periodPattern && step2PeriodValid && (
                  <div className="mt-3 rounded-lg px-4 py-2.5 border flex items-center gap-2" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <PledgeIcon name="check" className="w-4 h-4" style={{ color: '#1B3A8C' }} />
                    <p className="text-xs font-medium" style={{ color: '#1B3A8C' }}>
                      この内容で{buildDocumentPeriods().length}枚の書類を発行します
                    </p>
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

          {/* ===== STEP3：業務内容・就業時間 ===== */}
          {currentStep === 3 && (
            <>
              <FormRow label="業務内容" required>
                {documentType === 'AP・CL研修用' && workDescriptionTemplates.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-1">
                    <p className="text-xs font-medium" style={{ color: '#5A6A8A' }}>よく使う文言から選択（クリックで入力欄に反映）</p>
                    <div className="flex flex-wrap gap-2">
                      {workDescriptionTemplates.map(t => (
                        <button key={t.id} onClick={e => { e.preventDefault(); setWorkDescription(t.template_text) }}
                          className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:bg-white"
                          style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                          {t.template_text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)}
                  maxLength={2000} placeholder="例）店舗内での接客・レジ業務全般"
                  className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none placeholder:text-gray-400"
                  style={{ borderColor: '#D0DAF0', color: '#1A2340', minHeight: '80px', lineHeight: '1.6', resize: 'vertical' }} />
                <p className="text-xs text-right" style={{ color: '#5A6A8A' }}>{workDescription.length} / 2000文字</p>
              </FormRow>

              <FormRow label="所定労働時間及び休憩時間" required>
                <p className="text-xs -mt-1" style={{ color: '#5A6A8A' }}>
                  勤務パターンごとに1行ずつ登録してください（最大{MAX_SHIFT_ROWS}パターン）。
                </p>
                <div className="flex flex-col gap-2.5">
                  {shifts.map((s, idx) => (
                    <div key={idx} className="rounded-xl border p-3.5" style={{ borderColor: '#D0DAF0', background: '#F5F7FC' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: '#1B3A8C', color: 'white' }}>パターン{idx + 1}</span>
                        {shifts.length > 1 && (
                          <button onClick={e => { e.preventDefault(); removeShiftRow(idx) }}
                            className="flex items-center gap-1 text-xs font-medium" style={{ color: '#DC2626' }}>
                            <PledgeIcon name="trash" className="w-3.5 h-3.5" />
                            削除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>就業時間（開始）</label>
                          <input type="time" value={s.start} onChange={e => updateShift(idx, { start: e.target.value })}
                            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>就業時間（終了）</label>
                          <input type="time" value={s.end} onChange={e => updateShift(idx, { end: e.target.value })}
                            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>所定労働時間</label>
                          <div className="flex items-center gap-1">
                            <input type="text" value={s.contractHours} onChange={e => updateShift(idx, { contractHours: toHalfWidthDigits(e.target.value) })}
                              placeholder="例）8" className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none bg-white w-full placeholder:text-gray-400" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>時間</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>休憩時間</label>
                          <div className="flex items-center gap-1">
                            <input type="text" value={s.breakMinutes} onChange={e => updateShift(idx, { breakMinutes: toHalfWidthDigits(e.target.value) })}
                              placeholder="例）60" className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none bg-white w-full placeholder:text-gray-400" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>分</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {shifts.length < MAX_SHIFT_ROWS && (
                  <button onClick={e => { e.preventDefault(); addShiftRow() }}
                    className="flex items-center justify-center gap-1.5 w-fit text-xs px-3 py-2 rounded-lg border font-medium"
                    style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                    ＋ 勤務パターンを追加
                  </button>
                )}
              </FormRow>

              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setCurrentStep(2) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); if (!step3Valid) { alert('業務内容と就業時間（開始・終了）を入力してください'); return }; setCurrentStep(4) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP4：給与（StepSalaryの賃金・交通費ブロックの簡略版） ===== */}
          {currentStep === 4 && (
            <>
              <PledgeSectionHeader label="賃金" />

              <FormRow label="給与の種類" required>
                <div className="flex border rounded-lg overflow-hidden bg-white w-fit" style={{ borderColor: '#D0DAF0' }}>
                  {['時給', '日給'].map(v => (
                    <button key={v} onClick={e => { e.preventDefault(); setSalaryType(v) }}
                      className="px-6 py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap"
                      style={{ borderColor: '#D0DAF0', background: salaryType === v ? '#1B3A8C' : 'white', color: salaryType === v ? 'white' : '#1A2340', fontWeight: salaryType === v ? 600 : 400 }}>{v}</button>
                  ))}
                </div>
              </FormRow>

              <FormRow label="基本給・各種手当" required>
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
                  <div className="grid grid-cols-2">
                    <SalaryField label="基本給" value={basicSalary} onChange={setBasicSalary} error={basicSalaryError} example="250000" borderRight borderBottom />
                    <SalaryField label="役職手当" value={rolePay} onChange={setRolePay} example="10000" borderBottom />
                    <SalaryField label="職能給" value={skillPay} onChange={setSkillPay} example="10000" borderRight />
                    <SalaryField label="営業手当" value={salesPay} onChange={setSalesPay} example="10000" />
                  </div>
                </div>

                {hourlyMonthlyBreakdown && (
                  <div className="rounded-lg px-4 py-3 border flex flex-col gap-1" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    {hourlyMonthlyBreakdown.map((line, i) => <p key={i} className="text-xs" style={{ color: '#1A2340' }}>{line}</p>)}
                    <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>※月所定労働日数20日・1日7時間（140時間）での計算例です。実際の支給額は勤務実績により異なります。</p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg px-4 py-3 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>
                    {salaryType === '時給' ? '月額換算例（基本給×140時間＋各種手当）' : '合計支給額（基本給＋各種手当）'}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold" style={{ color: '#1B3A8C' }}>{salaryTotal.toLocaleString()}</span>
                    <span className="text-xs" style={{ color: '#5A6A8A' }}>円</span>
                  </div>
                </div>

                {salaryTotal > 1000000 && (
                  <PledgeCriticalWarning
                    message={`合計支給額が1,000,000円を超えています。\n入力内容に誤りがないか、今一度ご確認ください。\n本当にこのまま申請してよろしいですか？`}
                    checked={salaryWarningChecked} onCheck={setSalaryWarningChecked}
                  />
                )}
              </FormRow>

              <FormRow label="諸控除">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border" style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>源泉所得税</p>
              </FormRow>
              <FormRow label="賃金締切日・支払日">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border whitespace-pre-line" style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>{WAGE_PAYMENT_TEXT}</p>
              </FormRow>

              <PledgeSectionHeader label="交通費" />
              <FormRow label="交通費区分" required>
                <div className="grid grid-cols-2 gap-2.5">
                  {PLEDGE_TRANSPORT_TYPES.map(t => (
                    <button key={t.id} onClick={e => { e.preventDefault(); setTransportType(t.id) }}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all text-center"
                      style={{ borderColor: transportType === t.id ? '#1B3A8C' : '#D0DAF0', background: transportType === t.id ? '#EEF2FA' : 'white' }}>
                      <img src={t.icon} alt={t.label} className="w-14 h-14 object-contain" />
                      <p className="text-xs font-bold leading-snug" style={{ color: '#1B3A8C' }}>{t.label}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（修正不可）</p>
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>{selectedTransport.preview}</p>
                </div>
              </FormRow>

              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setCurrentStep(3) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); const err = validateSalary(); if (err) { alert(err); return }; setCurrentStep(5) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP5：最終確認・送信 ===== */}
          {currentStep === 5 && (
            isSubmitted ? (
              <div className="px-5 py-14 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#EEF2FA' }}>
                  <PledgeIcon name="check" className="w-7 h-7" style={{ color: '#1B3A8C' }} />
                </div>
                <p className="text-base font-bold" style={{ color: '#1A2340' }}>申請が完了しました</p>
                <p className="text-xs text-center leading-relaxed" style={{ color: '#5A6A8A' }}>
                  {buildDocumentPeriods().length}枚の書類として申請を受け付けました。<br />
                  確認・承認の状況はダッシュボードからご確認いただけます。
                </p>
                <button onClick={e => { e.preventDefault(); handleCancel2() }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all mt-2" style={{ background: '#1B3A8C' }}>
                  ダッシュボードに戻る
                </button>
              </div>
            ) : (
              <>
                <PledgeFinalRow label="対象スタッフ" value={`${selectedStaff?.name ?? ''}（社員番号：${selectedStaff?.employee_number ?? ''}）`} />
                <PledgeFinalRow label="帳票種別" value={documentType} />
                <PledgeFinalRow label="就業先"
                  value={workPlaceType === 'client'
                    ? `${clientName}\n〒${clientPostalCode}　${clientAddress}\nTEL：${clientTel}`
                    : `${selectedOffice?.office_name ?? ''}\n〒${selectedOffice?.postal_code || '未登録'}　${selectedOffice?.address || '住所未登録'}\nTEL：${selectedOffice?.tel || '未登録'}`}
                  multiline />
                <PledgeFinalRow label="雇用期間"
                  value={buildDocumentPeriods().map(p => p.start === p.end ? p.start.replaceAll('-', '/') : `${p.start.replaceAll('-', '/')}〜${p.end.replaceAll('-', '/')}`).join('\n')}
                  multiline suffix={`（計${buildDocumentPeriods().length}枚）`} />
                <PledgeFinalRow label="業務内容" value={workDescription} multiline />
                <PledgeFinalRow label="所定労働時間・休憩"
                  value={shifts.map((s, i) => `パターン${i + 1}：${s.start}〜${s.end}（所定${s.contractHours || '－'}時間／休憩${s.breakMinutes || '－'}分）`).join('\n')}
                  multiline />
                <PledgeFinalRow label="給与"
                  value={`${salaryType}：${basicSalary ? parseAmount(basicSalary).toLocaleString() : '－'}円\n${salaryType === '時給' ? '月額換算例' : '合計支給額'}：${salaryTotal.toLocaleString()}円`}
                  multiline />
                <PledgeFinalRow label="交通費" value={selectedTransport.label} />

                {submitError && (
                  <div className="mx-5 my-3 rounded-lg px-4 py-3 border text-sm" style={{ background: '#FEF2F2', borderColor: '#DC2626', color: '#DC2626' }}>{submitError}</div>
                )}

                <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  <button onClick={e => { e.preventDefault(); setCurrentStep(4) }}
                    className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                  <button onClick={e => { e.preventDefault(); handleSubmit() }} disabled={isSubmitting}
                    className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: isSubmitting ? '#A8C0E8' : '#1B3A8C' }}>
                    {isSubmitting ? '送信中...' : 'この内容で申請する'}
                  </button>
                </div>
              </>
            )
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

// STEP4（給与）用：app/apply/_components/FormParts.tsxのSectionHeader・CriticalWarningと同じ見た目
function PledgeSectionHeader({ label }: { label: string }) {
  return (
    <>
      <div style={{ height: '12px', background: '#F5F7FC' }} />
      <div className="px-5 py-2.5 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
        <p className="text-sm font-medium text-white">▼ {label}</p>
      </div>
    </>
  )
}

function PledgeCriticalWarning({ message, checked, onCheck }: { message: string; checked: boolean; onCheck: (v: boolean) => void }) {
  return (
    <div className="rounded-lg p-4 border-2 mt-3" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
      <p className="text-sm font-bold mb-2" style={{ color: '#DC2626' }}>🔴 最重要警告</p>
      <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#1A2340' }}>{message}</p>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)}
          className="w-4 h-4" style={{ accentColor: '#DC2626' }} />
        <span className="text-sm font-medium" style={{ color: '#DC2626' }}>上記の警告内容について、上長の了承を得ています。</span>
      </label>
    </div>
  )
}

// STEP4の給与2列グリッド内、1マスあたりの入力欄（基本給以外の各種手当で共通利用）
function SalaryField({ label, value, onChange, example, error, borderRight, borderBottom }: {
  label: string; value: string; onChange: (v: string) => void; example: string; error?: string | null; borderRight?: boolean; borderBottom?: boolean
}) {
  return (
    <div className={`p-3 flex flex-col gap-1.5 ${borderRight ? 'border-r' : ''} ${borderBottom ? 'border-b' : ''}`} style={{ borderColor: '#D0DAF0' }}>
      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="text" value={value} onChange={e => onChange(toHalfWidthDigits(e.target.value))}
          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28 placeholder:text-gray-400"
          style={{ borderColor: error ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} />
        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
      </div>
      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）{example}</p>
      {error && <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  )
}

// STEP5（最終確認）用の1行表示コンポーネント
function PledgeFinalRow({ label, value, multiline, suffix }: { label: string; value: string; multiline?: boolean; suffix?: string }) {
  return (
    <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
      <div className="border-r px-4 py-3.5 flex items-start" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <span className="text-sm font-medium" style={{ color: '#1A2340' }}>{label}</span>
      </div>
      <div className={`px-5 py-3.5 text-sm ${multiline ? 'whitespace-pre-line' : 'flex items-center'}`} style={{ color: '#1A2340', lineHeight: 1.7 }}>
        {value || '－'}
        {suffix && <span className="text-xs ml-1.5" style={{ color: '#5A6A8A' }}>{suffix}</span>}
      </div>
    </div>
  )
}
