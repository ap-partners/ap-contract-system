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
//
// 【2026-07-23 6STEP再設計】単日ごとに勤務時間が異なる実態にSTEP設計が対応できていなかった
// （STEP3の勤務パターンが日付と紐付いていなかった）問題を解消するため、6STEP構成
// （①スタッフ・帳票種別→②就業先情報→③就業日程→④業務内容→⑤給与→⑥最終確認）に再編。
// 旧workDates（日付のみ）＋shifts（日付に紐付かない最大5パターン）を廃止し、単日は
// 「日付＋開始〜終了＋休憩」を1セットで登録するsingleEntries（最大10件）、期間指定は
// 就業時間を1パターンのみ持つperiodShiftに変更。発行書類は常にpledges1行＝1枚に統合し、
// PDF内の「雇用期間」「所定労働時間及び休憩時間」は1つの表（scheduleRows）にまとめる方針
// （帳票PDF実装＝次の作業項目で使用。docs/SYSTEM_DESIGN.md 10章2026-07-23参照）。
// SSC確認画面・帳票PDF生成・署名フロー接続は別途対応する。
//
// スタッフ検索・自部門制限のロジックはapp/apply/page.tsxのhandleSearchと同じ考え方
// （担当営業のみ自部門に制限。SSC・管理部は全部門検索可）を踏襲している。
// STEP4（給与）の賃金・交通費まわりはapp/apply/_components/StepSalary.tsxの考え方を踏襲しつつ、
// 保険関連ブロックは含めない（アルバイト誓約書の元Excel仕様に保険項目が無いため）簡略版。

import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'
import { SALARY_RULES, toHalfWidthDigits, parseAmount } from '@/app/apply/_lib/helpers'
import { WAGE_PAYMENT_TEXT } from '@/lib/pdf/documentText'

const DOCUMENT_TYPES = ['AP・CL研修用', 'CP・SPOT用'] as const
// 2026-07-23：6STEP再編（就業先情報と就業日程を分離）
const STEP_LABELS = ['スタッフ・帳票種別', '就業先情報', '就業日程', '業務内容', '給与', '最終確認']
const MAX_SINGLE_ENTRIES = 10

// アルバイト誓約書専用の交通費区分（2026-07-22伊藤さん指摘：「定期代＋ガソリン代」はこのファイルのみ除外。
// 雇用契約書(/apply)側の共通TRANSPORT_TYPESは変更せず、影響範囲をこのファイルに限定するためローカルに複製）
const PLEDGE_TRANSPORT_TYPES = [
  {
    id: 'default',
    label: '実費または定期代',
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

// 2026-07-23追加：STEP3（就業日程）単日エントリ。日付＋開始〜終了＋休憩を1セットで持つ
// （旧workDatesは日付のみ・旧shiftsは日付に紐付かない汎用パターンだったため、単日ごとに
// 勤務時間が異なる実態に対応できていなかった問題を解消）。
type SingleEntry = { date: string; start: string; end: string; breakMinutes: string; contractHours: string }
// 帳票PDF実装（次の作業項目）で使う、雇用期間＋所定労働時間及び休憩時間を1つの表にまとめた行データ。
type ScheduleRow = { label: string; start: string; end: string; breakMinutes: string; contractHours: string }

type Office = { id: string; office_name: string; postal_code: string | null; address: string | null; tel: string | null }
type WorkDescriptionTemplate = { id: string; template_text: string }

// ===== アイコン（ダッシュボード画面のIcon実装と同じ手描きSVG方式。Tabler等の外部アイコンフォントは
//      本アプリでは一切読み込んでいないため使用不可。viewBox・ストローク仕様を既存画面に合わせている） =====
type PledgeIconName = 'graduationCap' | 'megaphone' | 'store' | 'building' | 'check' | 'trash' | 'calendarMulti' | 'calendarRange' | 'calendarMix' | 'arrowRight' | 'close' | 'edit' | 'plus'

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
    arrowRight: (
      <>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="M6 6l12 12" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
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
  const confirmDialog = useConfirm()
  const [user, setUser] = useState<any>(null)
  const [myDeptNo, setMyDeptNo] = useState<any>(undefined) // undefined=読み込み中 / null=特定できない
  const [currentStep, setCurrentStep] = useState(1)
  // 2026-07-22追加（alert/confirm置き換えPhase3・①必須項目チェック）：各STEPの「次へ進む」チェックで
  // 従来alert()表示していたエラーメッセージを、ボタン近くのインライン警告バナー(ValidationBanner)で表示するためのstate。
  // STEP3の就業日重複チェック（addSingleEntry内）のみ、日付追加ボタンの近くに表示したいため別state（dateAddError）を用いる。
  const [stepError, setStepError] = useState<string | null>(null)
  const [dateAddError, setDateAddError] = useState<string | null>(null)

  // ===== STEP1：スタッフ検索・帳票種別選択 =====
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchBlockedReason, setSearchBlockedReason] = useState<null | 'loading' | 'no_dept'>(null)
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [documentType, setDocumentType] = useState<typeof DOCUMENT_TYPES[number] | ''>('')

  // ===== STEP2：就業先情報 =====
  const [workPlaceType, setWorkPlaceType] = useState<'client' | 'internal' | ''>('')
  const [clientName, setClientName] = useState('')
  const [clientPostalCode, setClientPostalCode] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientTel, setClientTel] = useState('')
  const [offices, setOffices] = useState<Office[]>([])
  const [officeId, setOfficeId] = useState('')
  const selectedOffice = offices.find(o => o.id === officeId) || null

  // ===== STEP3：就業日程 =====
  // 2026-07-23実装。伊藤さんとのUI/UXレビュー（プロトタイプ複数案の確認を経て確定）により、
  // 当初の「単日／期間指定／MIXの3パターンから選ぶ」方式を廃止。実データは元々「期間（最大1件・任意）」
  // ＋「単日（最大10件・任意）」という2つの独立した要素の組み合わせに過ぎず、MIXは単にその両方を
  // 使っている状態でしかなかったため、ユーザーに分類を意識させるパターン選択自体を無くし、
  // 「期間で登録する」「単日を追加する」という2つの独立したモーダル入力に置き換えた。
  // periodPattern自体は下部の状態（rangeStart/rangeEnd/periodShift・singleEntries）から自動的に
  // 導出する（保存先DBの`period_pattern`列・buildScheduleRows等、既存の下流ロジックへの影響を
  // 避けるため、値の意味・取りうる範囲は変更していない）。
  const [periodShift, setPeriodShift] = useState<ShiftRow>(emptyShiftRow())
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  // 単日：日付＋開始〜終了＋休憩を1セットで追加。最大10件。
  const [singleEntries, setSingleEntries] = useState<SingleEntry[]>([])
  const [singleDateInput, setSingleDateInput] = useState('')
  const [singleStartInput, setSingleStartInput] = useState('')
  const [singleEndInput, setSingleEndInput] = useState('')
  const [singleBreakInput, setSingleBreakInput] = useState('')
  // STEP3のモーダル開閉状態
  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [singleModalOpen, setSingleModalOpen] = useState(false)

  // ===== STEP4：業務内容 =====
  const [workDescription, setWorkDescription] = useState('')
  const [workDescriptionTemplates, setWorkDescriptionTemplates] = useState<WorkDescriptionTemplate[]>([])

  // ===== STEP5：給与（StepSalaryの賃金・交通費ブロックの簡略版。保険ブロックなし。
  //      2026-07-22伊藤さん指摘によりアルバイト向けに簡略化：月給・定額残業手当・住宅手当は削除、
  //      給与は単日（1日7時間）計算基準に変更。2026-07-22伊藤さん再訂正：月額ではなく
  //      単日での計算。時給は基本給×7時間、日給は入力値をそのまま使用） =====
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
  // 2026-07-22伊藤さん訂正：月額換算ではなく単日（1日7時間）での計算。時給は基本給×7、日給は入力値そのまま。
  const salaryTotal = (() => {
    const basic = parseAmount(basicSalary)
    if (salaryType === '時給') return basic * 7 + allowancesTotal
    return basic + allowancesTotal
  })()
  const hourlyDailyBreakdown = (() => {
    if (salaryType !== '時給') return null
    const basic = parseAmount(basicSalary)
    if (!basic) return null
    const lines = [`基本給：${basic.toLocaleString()}円 × 7時間 = ${(basic * 7).toLocaleString()}円`]
    if (parseAmount(rolePay) > 0) lines.push(`役職手当：${parseAmount(rolePay).toLocaleString()}円`)
    if (parseAmount(skillPay) > 0) lines.push(`職能給：${parseAmount(skillPay).toLocaleString()}円`)
    if (parseAmount(salesPay) > 0) lines.push(`営業手当：${parseAmount(salesPay).toLocaleString()}円`)
    return lines
  })()
  const selectedTransport = PLEDGE_TRANSPORT_TYPES.find(t => t.id === transportType) || PLEDGE_TRANSPORT_TYPES[0]

  // ===== STEP6：最終確認・保存 =====
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  // STEP5をapp/apply STEP8と同じ「セクション区切り＋修正するボタン＋展開/折りたたみ」形式にするための状態
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const finalSectionIds = ['s1', 's2', 's3', 's4', 's5']
  const expandAllSections = () => setCollapsedSections({})
  const collapseAllSections = () => setCollapsedSections(Object.fromEntries(finalSectionIds.map(id => [id, true])))

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
      const { data } = await supabase.from('office_master').select('id, office_name, postal_code, address, tel').order('sort_order', { ascending: true })
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
    if (!(await confirmDialog('ログアウトしますか？'))) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleCancel = async () => {
    if (!(await confirmDialog('入力中の申請を中断します。入力した内容は保存されません。よろしいですか？'))) return
    handleCancel2()
  }
  const handleCancel2 = () => {
    const role = user?.user_metadata?.role
    router.push(role === 'SSC' ? '/dashboard/ssc' : role === '管理部' ? '/dashboard/admin' : '/dashboard/sales')
  }

  const step1Valid = !!selectedStaff && !!documentType

  // STEP2：就業先情報のみ（2026-07-23：雇用期間・就業日程はSTEP3へ分離）
  const step2Valid = workPlaceType === 'client'
    ? !!(clientName.trim() && clientPostalCode.trim() && clientAddress.trim() && clientTel.trim())
    : workPlaceType === 'internal' ? !!officeId : false

  // 2026-07-22指摘⑦：就業時間（開始・終了）と休憩時間から所定労働時間を自動計算する
  const computeContractHours = (start: string, end: string, breakMinutes: string): string => {
    if (!start || !end) return ''
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return ''
    let startMin = sh * 60 + sm
    let endMin = eh * 60 + em
    if (endMin <= startMin) endMin += 24 * 60 // 深夜またぎのシフトも許容
    const breakMin = parseAmount(breakMinutes) || 0
    const workMin = endMin - startMin - breakMin
    if (workMin <= 0) return ''
    const hours = workMin / 60
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  }

  // STEP3：期間指定（range・mix）の就業時間1パターンの更新
  const updatePeriodShift = (patch: Partial<ShiftRow>) => {
    setPeriodShift(prev => {
      const merged = { ...prev, ...patch }
      if ('start' in patch || 'end' in patch || 'breakMinutes' in patch) {
        merged.contractHours = computeContractHours(merged.start, merged.end, merged.breakMinutes)
      }
      return merged
    })
  }
  const periodShiftValid = !!(periodShift.start && periodShift.end && periodShift.breakMinutes && periodShift.contractHours)
  // 期間が「登録済み」とみなせるかどうか（開始日・終了日の前後関係・就業時間一式が揃っている）
  const hasPeriod = !!(rangeStart && rangeEnd && rangeStart <= rangeEnd && periodShiftValid)
  // periodPattern：既存の保存形式（DB `period_pattern`列・buildScheduleRows等）をそのまま使うための
  // 導出値。ユーザーが直接選ぶものではなく、期間・単日の登録状況から自動的に決まる。
  const periodPattern: 'single_multi' | 'range' | 'mix' | '' =
    hasPeriod && singleEntries.length > 0 ? 'mix'
      : hasPeriod ? 'range'
      : singleEntries.length > 0 ? 'single_multi'
      : ''

  // STEP3：単日の追加。日付＋開始〜終了＋休憩を1セットで検証してから追加する。
  const addSingleEntry = () => {
    setDateAddError(null)
    if (!singleDateInput || !singleStartInput || !singleEndInput || !singleBreakInput) {
      setDateAddError('日付・始業時間・終業時間・休憩時間をすべて入力してから追加してください。')
      return
    }
    if (singleEntries.length >= MAX_SINGLE_ENTRIES) {
      setDateAddError(`単日の登録は最大${MAX_SINGLE_ENTRIES}件までです。`)
      return
    }
    if (singleEntries.some(e => e.date === singleDateInput)) {
      setDateAddError('すでに追加済みの日付です。')
      return
    }
    if (hasPeriod && singleDateInput >= rangeStart && singleDateInput <= rangeEnd) {
      setDateAddError('指定した期間に含まれる日付です。期間内の日付は単日として追加する必要はありません。')
      return
    }
    const contractHours = computeContractHours(singleStartInput, singleEndInput, singleBreakInput)
    if (!contractHours) {
      setDateAddError('終業時間が始業時間より後になるよう、休憩時間も含めて入力内容をご確認ください。')
      return
    }
    setSingleEntries(prev => [...prev, { date: singleDateInput, start: singleStartInput, end: singleEndInput, breakMinutes: singleBreakInput, contractHours }].sort((a, b) => a.date.localeCompare(b.date)))
    setSingleDateInput(''); setSingleStartInput(''); setSingleEndInput(''); setSingleBreakInput('')
  }
  const removeSingleEntry = (date: string) => setSingleEntries(prev => prev.filter(e => e.date !== date))
  const clearPeriod = () => { setRangeStart(''); setRangeEnd(''); setPeriodShift(emptyShiftRow()) }

  const step3Valid = hasPeriod || singleEntries.length > 0

  const step4Valid = !!workDescription.trim()

  const validateSalary = (): string | null => {
    if (!basicSalary) return '基本給を入力してください'
    if (basicSalaryError) return basicSalaryError
    if (salaryTotal > 1000000 && !salaryWarningChecked) return '合計支給額が100万円超の警告について、上長の了承確認が必要です'
    return null
  }
  const step5Valid = !validateSalary()

  // 雇用期間・所定労働時間・休憩時間を1つの表にまとめる（帳票PDF実装で使用する行データ）。
  // mixの場合は期間の行→単日の行の順（旧buildDocumentPeriodsの並び順を踏襲）。
  const buildScheduleRows = (): ScheduleRow[] => {
    const rows: ScheduleRow[] = []
    if ((periodPattern === 'range' || periodPattern === 'mix') && rangeStart && rangeEnd) {
      rows.push({
        label: `${rangeStart.replaceAll('-', '/')}〜${rangeEnd.replaceAll('-', '/')}`,
        start: periodShift.start, end: periodShift.end, breakMinutes: periodShift.breakMinutes, contractHours: periodShift.contractHours,
      })
    }
    if (periodPattern === 'single_multi' || periodPattern === 'mix') {
      for (const e of singleEntries) {
        rows.push({ label: e.date.replaceAll('-', '/'), start: e.start, end: e.end, breakMinutes: e.breakMinutes, contractHours: e.contractHours })
      }
    }
    return rows
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

      const scheduleRows = buildScheduleRows()

      const inputData = {
        staff: {
          employee_number: selectedStaff.employee_number,
          name: selectedStaff.name,
          department: selectedStaff.department,
        },
        workDescription,
        periodPattern,
        // 2026-07-23：発行書類は常に1枚に統合するため、旧documentPeriods（複数枚想定）は廃止。
        // scheduleRowsが帳票PDF実装で使う「雇用期間＋所定労働時間及び休憩時間」の統合表データ。
        // singleEntries・periodShift・rangeStart/rangeEndは編集画面再現用に生データとして保持する。
        scheduleRows,
        singleEntries,
        periodShift: (periodPattern === 'range' || periodPattern === 'mix') ? periodShift : null,
        rangeStart: (periodPattern === 'range' || periodPattern === 'mix') ? rangeStart : null,
        rangeEnd: (periodPattern === 'range' || periodPattern === 'mix') ? rangeEnd : null,
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
            {!isSubmitted && (
              <button onClick={handleCancel}
                className="text-sm px-4 py-2 rounded-lg border font-medium transition-all"
                style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                この申請をやめる
              </button>
            )}
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

              {stepError && (
                <div className="px-5">
                  <ValidationBanner message={stepError} />
                </div>
              )}
              <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); if (!step1Valid) { setStepError('対象スタッフと帳票種別を選択してください'); return }; setStepError(null); setCurrentStep(2) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP2：就業先情報 ===== */}
          {currentStep === 2 && (
            <>
              <FormRow label="就業先情報" required>
                <div className="grid grid-cols-2 gap-3 max-w-xl mb-1">
                  {(['client', 'internal'] as const).map(v => {
                    const selected = workPlaceType === v
                    return (
                      <button key={v} onClick={e => { e.preventDefault(); setWorkPlaceType(v) }}
                        className="relative text-left p-4 rounded-xl border-2 transition-all"
                        style={{ borderColor: selected ? '#1B3A8C' : '#D0DAF0', background: selected ? '#EEF2FA' : 'white' }}>
                        {selected && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#1B3A8C' }}>
                            <PledgeIcon name="check" className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: selected ? '#1B3A8C' : '#EEF2FA' }}>
                          <PledgeIcon name={v === 'client' ? 'store' : 'building'} className="w-5 h-5" style={{ color: selected ? 'white' : '#1B3A8C' }} />
                        </div>
                        <p className="text-sm font-bold" style={{ color: selected ? '#1B3A8C' : '#1A2340' }}>
                          {v === 'client' ? 'クライアント先' : '自社拠点'}
                        </p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#5A6A8A' }}>
                          {v === 'client' ? '外部の就業先で勤務する場合' : '自社拠点での勤務の場合'}
                        </p>
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
                          {/* 2026-07-23伊藤さん指摘：PDF側の表示（lib/pdf/renderPledgePdf.ts）と合わせ、
                              「株式会社APパートナーズ　拠点名」形式で表示する（本社のみ拠点名を付けない）。 */}
                          {selectedOffice.office_name === '本社' ? '株式会社APパートナーズ' : `株式会社APパートナーズ　${selectedOffice.office_name}`}<br />
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

              {stepError && (
                <div className="px-5">
                  <ValidationBanner message={stepError} />
                </div>
              )}
              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setStepError(null); setCurrentStep(1) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); if (!step2Valid) { setStepError('就業先情報の入力を完了してください'); return }; setStepError(null); setCurrentStep(3) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP3：就業日程（2026-07-23全面再設計。モーダル方式） ===== */}
          {currentStep === 3 && (
            <>
              <FormRow label="雇用期間の指定方法" required>
                <p className="text-xs mb-3" style={{ color: '#5A6A8A' }}>
                  必要な登録方法を選んでください（両方使うこともできます）。発行される書類は常に1枚にまとまります。
                </p>

                {hasPeriod ? (
                  <div className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2.5 border"
                    style={{ borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                    <PledgeIcon name="calendarRange" className="w-5 h-5 shrink-0" style={{ color: '#1B3A8C' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: '#1B3A8C' }}>
                        期間：{rangeStart.replaceAll('-', '/')}〜{rangeEnd.replaceAll('-', '/')}　{periodShift.start}〜{periodShift.end}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>休憩{periodShift.breakMinutes}分・所定{periodShift.contractHours}時間</p>
                    </div>
                    <button onClick={e => { e.preventDefault(); setPeriodModalOpen(true) }}
                      className="text-xs font-medium shrink-0 px-2 py-1" style={{ color: '#1B3A8C' }}>編集</button>
                    <button onClick={e => { e.preventDefault(); clearPeriod() }}
                      className="text-xs font-medium shrink-0 px-2 py-1 rounded-md" style={{ color: '#DC2626' }}>削除</button>
                  </div>
                ) : (
                  <button onClick={e => { e.preventDefault(); setPeriodModalOpen(true) }}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2.5 border-2 border-dashed text-left transition-all"
                    style={{ borderColor: '#B9C6E6', background: '#F8FAFD' }}>
                    <PledgeIcon name="calendarRange" className="w-5 h-5 shrink-0" style={{ color: '#1B3A8C' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: '#1A2340' }}>期間で登録する</p>
                      <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>同じ時間帯で毎日勤務する場合</p>
                    </div>
                    <PledgeIcon name="plus" className="w-4 h-4 shrink-0" style={{ color: '#1B3A8C' }} />
                  </button>
                )}

                <button onClick={e => { e.preventDefault(); setSingleModalOpen(true) }}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-1 border-2 border-dashed text-left transition-all"
                  style={{ borderColor: '#B9C6E6', background: '#F8FAFD' }}>
                  <PledgeIcon name="calendarMulti" className="w-5 h-5 shrink-0" style={{ color: '#1B3A8C' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold" style={{ color: '#1A2340' }}>単日を追加する</p>
                    <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>日によって時間帯が異なる場合</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>{singleEntries.length} / {MAX_SINGLE_ENTRIES}件</span>
                </button>

                {singleEntries.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-1.5" style={{ color: '#5A6A8A' }}>登録済みの単日</p>
                    <div className="flex flex-col gap-1.5">
                      {singleEntries.map(entry => (
                        <div key={entry.date} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 border" style={{ borderColor: '#D0DAF0', background: 'white' }}>
                          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: '#1A2340' }}>
                            <span className="font-medium">{entry.date.replaceAll('-', '/')}</span>
                            <span style={{ color: '#5A6A8A' }}>{entry.start}</span>
                            <PledgeIcon name="arrowRight" className="w-3 h-3" style={{ color: '#B4B8C4' }} />
                            <span style={{ color: '#5A6A8A' }}>{entry.end}</span>
                            <span style={{ color: '#8A93A8' }}>（休憩{entry.breakMinutes}分・所定{entry.contractHours}時間）</span>
                          </div>
                          <button onClick={e => { e.preventDefault(); removeSingleEntry(entry.date) }} aria-label="この日程を削除"
                            className="flex items-center shrink-0" style={{ color: '#A32D2D' }}>
                            <PledgeIcon name="trash" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 mt-3" style={{ background: '#F5F7FC', border: '1px solid #D0DAF0' }}>
                  <PledgeIcon name="calendarMulti" className="w-3.5 h-3.5 shrink-0" style={{ color: '#8A93A8' }} />
                  <p className="text-xs" style={{ color: '#5A6A8A' }}>発行される書類は、上記すべての日程をまとめた1枚になります。</p>
                </div>
              </FormRow>

              {stepError && (
                <div className="px-5">
                  <ValidationBanner message={stepError} />
                </div>
              )}
              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setStepError(null); setCurrentStep(2) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); if (!step3Valid) { setStepError('期間または単日のいずれかを登録してください'); return }; setStepError(null); setDateAddError(null); setCurrentStep(4) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>

              {/* ===== 期間の日程を登録するモーダル ===== */}
              <PledgeModal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title="期間の日程を登録">
                <div className="px-6 py-5 flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: '#5A6A8A' }}>期間</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                      <PledgeIcon name="arrowRight" className="w-4 h-4 shrink-0" style={{ color: '#8A93A8' }} />
                      <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                    </div>
                    {rangeStart && rangeEnd && rangeStart > rangeEnd && <p className="text-xs mt-1.5" style={{ color: '#DC2626' }}>開始日は終了日より前にしてください</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: '#5A6A8A' }}>就業時間（毎日共通）</label>
                    <div className="flex items-center gap-2">
                      <input type="time" value={periodShift.start} onChange={e => updatePeriodShift({ start: e.target.value })}
                        className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                      <PledgeIcon name="arrowRight" className="w-4 h-4 shrink-0" style={{ color: '#8A93A8' }} />
                      <input type="time" value={periodShift.end} onChange={e => updatePeriodShift({ end: e.target.value })}
                        className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: '#5A6A8A' }}>休憩時間</label>
                    <div className="flex items-center gap-1.5">
                      <input type="text" value={periodShift.breakMinutes} onChange={e => updatePeriodShift({ breakMinutes: toHalfWidthDigits(e.target.value) })}
                        placeholder="例）60" className="w-24 border rounded-lg px-3 py-2.5 text-sm text-right focus:outline-none bg-white placeholder:text-gray-400" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                      <span className="text-xs" style={{ color: '#5A6A8A' }}>分</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: '#EEF2FA' }}>
                    <span className="text-xs font-medium" style={{ color: '#1B3A8C' }}>所定労働時間（自動計算）</span>
                    <span className="text-base font-bold" style={{ color: '#1B3A8C' }}>{periodShift.contractHours ? `${periodShift.contractHours}時間` : '－'}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: '#D0DAF0' }}>
                  <button onClick={e => { e.preventDefault(); setPeriodModalOpen(false) }}
                    className="bg-white border px-4 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>キャンセル</button>
                  <button onClick={e => { e.preventDefault(); if (!hasPeriod) { return }; setPeriodModalOpen(false) }}
                    className="text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>登録する</button>
                </div>
              </PledgeModal>

              {/* ===== 単日の日程を登録するモーダル（登録済み一覧＋新規行を1つの表で扱う） ===== */}
              <PledgeModal open={singleModalOpen} onClose={() => setSingleModalOpen(false)} title="単日の日程を登録"
                subtitle={`${singleEntries.length} / ${MAX_SINGLE_ENTRIES}件登録済み`} maxWidthClass="max-w-2xl">
                <div className="px-6 pt-5 pb-1">
                  {singleEntries.length > 0 && (
                    <div className="grid gap-y-1 mb-2" style={{ gridTemplateColumns: '1.1fr 1.6fr 0.8fr 0.6fr 32px' }}>
                      <span className="text-xs" style={{ color: '#8A93A8' }}>日付</span>
                      <span className="text-xs" style={{ color: '#8A93A8' }}>就業時間</span>
                      <span className="text-xs" style={{ color: '#8A93A8' }}>休憩</span>
                      <span className="text-xs" style={{ color: '#8A93A8' }}>所定</span>
                      <span />
                      {singleEntries.map(entry => (
                        <Fragment key={entry.date}>
                          <div className="text-sm py-2.5 border-t" style={{ color: '#1A2340', borderColor: '#EDEFF5' }}>{entry.date.replaceAll('-', '/')}</div>
                          <div className="text-sm py-2.5 border-t flex items-center gap-2" style={{ color: '#1A2340', borderColor: '#EDEFF5' }}>
                            {entry.start}<PledgeIcon name="arrowRight" className="w-3 h-3" style={{ color: '#B4B8C4' }} />{entry.end}
                          </div>
                          <div className="text-sm py-2.5 border-t" style={{ color: '#5A6A8A', borderColor: '#EDEFF5' }}>{entry.breakMinutes}分</div>
                          <div className="text-sm py-2.5 border-t" style={{ color: '#5A6A8A', borderColor: '#EDEFF5' }}>{entry.contractHours}h</div>
                          <div className="py-2.5 border-t flex items-center" style={{ borderColor: '#EDEFF5' }}>
                            <button onClick={e => { e.preventDefault(); removeSingleEntry(entry.date) }} aria-label="この日程を削除" style={{ color: '#8A93A8' }}>
                              <PledgeIcon name="trash" className="w-4 h-4" />
                            </button>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl p-3.5 mt-1" style={{ background: '#EEF2FA', border: '1px solid #D0DAF0' }}>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1 min-w-[150px]">
                        <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>日付</label>
                        <input type="date" value={singleDateInput} onChange={e => setSingleDateInput(e.target.value)}
                          className="border rounded-lg px-2.5 py-2 text-sm focus:outline-none bg-white w-full" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex flex-col gap-1 min-w-[100px]">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>始業時間</label>
                          <input type="time" value={singleStartInput} onChange={e => setSingleStartInput(e.target.value)}
                            className="border rounded-lg px-2.5 py-2 text-sm focus:outline-none bg-white w-full" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        </div>
                        <PledgeIcon name="arrowRight" className="w-4 h-4 shrink-0 mb-2.5" style={{ color: '#8A93A8' }} />
                        <div className="flex flex-col gap-1 min-w-[100px]">
                          <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>終業時間</label>
                          <input type="time" value={singleEndInput} onChange={e => setSingleEndInput(e.target.value)}
                            className="border rounded-lg px-2.5 py-2 text-sm focus:outline-none bg-white w-full" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 min-w-[90px]">
                        <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>休憩時間</label>
                        <div className="flex items-center gap-1">
                          <input type="text" value={singleBreakInput} onChange={e => setSingleBreakInput(toHalfWidthDigits(e.target.value))}
                            placeholder="例）60" className="border rounded-lg px-2 py-2 text-sm text-right focus:outline-none bg-white w-16 placeholder:text-gray-400" style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                          <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>分</span>
                        </div>
                      </div>
                      <button onClick={e => { e.preventDefault(); addSingleEntry() }}
                        className="text-xs px-4 py-2.5 rounded-lg border font-medium whitespace-nowrap" style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: 'white' }}>
                        ＋ 行を追加
                      </button>
                    </div>
                  </div>
                  <ValidationBanner message={dateAddError} />
                  {singleEntries.length === 0 && <p className="text-xs mt-2 mb-1" style={{ color: '#8A93A8' }}>まだ日程がありません。上の欄に入力して「＋ 行を追加」を押してください。</p>}
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t mt-3" style={{ borderColor: '#D0DAF0' }}>
                  <button onClick={e => { e.preventDefault(); setSingleModalOpen(false) }}
                    className="text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>完了</button>
                </div>
              </PledgeModal>
            </>
          )}

          {/* ===== STEP4：業務内容 ===== */}
          {currentStep === 4 && (
            <>
              <FormRow label="業務内容" required>
                {workDescriptionTemplates.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-1 max-w-md">
                    <label className="text-xs font-medium" style={{ color: '#5A6A8A' }}>よく使う文言から選択</label>
                    <select value=""
                      onChange={async e => {
                        const id = e.target.value
                        if (!id) return
                        const t = workDescriptionTemplates.find(x => x.id === id)
                        if (!t) return
                        if (workDescription.trim() && workDescription !== t.template_text) {
                          if (!(await confirmDialog('入力中の内容を、選択したテンプレートの文言で上書きします。よろしいですか？'))) return
                        }
                        setWorkDescription(t.template_text)
                      }}
                      className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                      <option value="">選択してください</option>
                      {workDescriptionTemplates.map(t => <option key={t.id} value={t.id}>{t.template_text}</option>)}
                    </select>
                  </div>
                )}
                <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)}
                  maxLength={2000} placeholder="例）店舗内での接客・レジ業務全般"
                  className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none placeholder:text-gray-400"
                  style={{ borderColor: '#D0DAF0', color: '#1A2340', minHeight: '80px', lineHeight: '1.6', resize: 'vertical' }} />
                <p className="text-xs text-right" style={{ color: '#5A6A8A' }}>{workDescription.length} / 2000文字</p>
              </FormRow>

              {stepError && (
                <div className="px-5">
                  <ValidationBanner message={stepError} />
                </div>
              )}
              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setStepError(null); setCurrentStep(3) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); if (!step4Valid) { setStepError('業務内容を入力してください'); return }; setStepError(null); setCurrentStep(5) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP5：給与（StepSalaryの賃金・交通費ブロックの簡略版） ===== */}
          {currentStep === 5 && (
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

                {hourlyDailyBreakdown && (
                  <div className="rounded-lg px-4 py-3 border flex flex-col gap-1" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    {hourlyDailyBreakdown.map((line, i) => <p key={i} className="text-xs" style={{ color: '#1A2340' }}>{line}</p>)}
                    <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>※1日7時間勤務した場合の日額計算例です。実際の支給額は勤務実績により異なります。</p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg px-4 py-3 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>
                    {salaryType === '時給' ? '日額換算例（基本給×7時間＋各種手当）' : '合計支給額（基本給＋各種手当）'}
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
                <div className="grid grid-cols-3 gap-2.5">
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

              {stepError && (
                <div className="px-5">
                  <ValidationBanner message={stepError} />
                </div>
              )}
              <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => { e.preventDefault(); setStepError(null); setCurrentStep(4) }}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
                <button onClick={e => { e.preventDefault(); const err = validateSalary(); if (err) { setStepError(err); return }; setStepError(null); setCurrentStep(6) }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all" style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP6：最終確認・送信 ===== */}
          {currentStep === 6 && (
            isSubmitted ? (
              <div className="px-5 py-14 flex flex-col items-center gap-4" style={{ background: 'white' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#EEF2FA' }}>
                  <PledgeIcon name="check" className="w-7 h-7" style={{ color: '#1B3A8C' }} />
                </div>
                <p className="text-base font-bold" style={{ color: '#1A2340' }}>申請が完了しました</p>
                <p className="text-xs text-center leading-relaxed" style={{ color: '#5A6A8A' }}>
                  申請を受け付けました。<br />
                  確認・承認の状況はダッシュボードからご確認いただけます。
                </p>
                <button onClick={e => { e.preventDefault(); handleCancel2() }}
                  className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all mt-2" style={{ background: '#1B3A8C' }}>
                  ダッシュボードに戻る
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 pt-4 flex items-center justify-between">
                  <p className="text-xs" style={{ color: '#5A6A8A' }}>入力内容をご確認ください。修正する場合は各セクションの「修正する」ボタンから該当STEPに戻れます。</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={e => { e.preventDefault(); expandAllSections() }} className="text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: 'white' }}>すべて展開</button>
                    <button onClick={e => { e.preventDefault(); collapseAllSections() }} className="text-xs px-3 py-1.5 rounded-lg border font-medium" style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>すべて折りたたむ</button>
                  </div>
                </div>

                <div className="px-5 py-4 flex flex-col gap-3">
                  <PledgeFinalSection id="s1" title="STEP1：スタッフ・帳票種別" sub="対象スタッフと帳票種別"
                    collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} onEdit={() => setCurrentStep(1)}>
                    <PledgeFinalRow label="対象スタッフ" value={`${selectedStaff?.name ?? ''}（社員番号：${selectedStaff?.employee_number ?? ''}）`} />
                    <PledgeFinalRow label="帳票種別" value={documentType} />
                  </PledgeFinalSection>

                  <PledgeFinalSection id="s2" title="STEP2：就業先情報" sub="就業先の情報"
                    collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} onEdit={() => setCurrentStep(2)}>
                    <PledgeFinalRow label="就業先区分" value={workPlaceType === 'client' ? 'クライアント先' : '自社拠点'} />
                    <PledgeFinalRow label="就業先"
                      value={workPlaceType === 'client'
                        ? `${clientName}\n〒${clientPostalCode}　${clientAddress}\nTEL：${clientTel}`
                        : `${selectedOffice?.office_name ?? ''}\n〒${selectedOffice?.postal_code || '未登録'}　${selectedOffice?.address || '住所未登録'}\nTEL：${selectedOffice?.tel || '未登録'}`}
                      multiline />
                  </PledgeFinalSection>

                  <PledgeFinalSection id="s3" title="STEP3：就業日程" sub="日付・就業時間"
                    collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} onEdit={() => setCurrentStep(3)}>
                    <PledgeFinalRow label="就業日程（雇用期間・所定労働時間・休憩）"
                      value={buildScheduleRows().map(r => `${r.label}：${r.start}〜${r.end}（所定${r.contractHours || '－'}時間／休憩${r.breakMinutes || '－'}分）`).join('\n')}
                      multiline suffix="（発行書類は1枚に統合されます）" />
                  </PledgeFinalSection>

                  <PledgeFinalSection id="s4" title="STEP4：業務内容" sub="業務内容"
                    collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} onEdit={() => setCurrentStep(4)}>
                    <PledgeFinalRow label="業務内容" value={workDescription} multiline />
                  </PledgeFinalSection>

                  <PledgeFinalSection id="s5" title="STEP5：給与" sub="給与・交通費の内容"
                    collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} onEdit={() => setCurrentStep(5)}>
                    <PledgeFinalRow label="給与の種類" value={salaryType} />
                    <PledgeFinalRow label="基本給・各種手当"
                      value={[
                        `基本給：${basicSalary ? parseAmount(basicSalary).toLocaleString() : '－'}円`,
                        parseAmount(rolePay) > 0 ? `役職手当：${parseAmount(rolePay).toLocaleString()}円` : null,
                        parseAmount(skillPay) > 0 ? `職能給：${parseAmount(skillPay).toLocaleString()}円` : null,
                        parseAmount(salesPay) > 0 ? `営業手当：${parseAmount(salesPay).toLocaleString()}円` : null,
                      ].filter(Boolean).join('\n')}
                      multiline />
                    <PledgeFinalRow label={salaryType === '時給' ? '日額換算例' : '合計支給額'} value={`${salaryTotal.toLocaleString()}円`} />
                    <PledgeFinalRow label="交通費区分" value={selectedTransport.label} />
                    <PledgeFinalRow label="交通費帳票プレビュー" value={selectedTransport.preview} multiline />
                  </PledgeFinalSection>
                </div>

                {submitError && (
                  <div className="mx-5 my-3 rounded-lg px-4 py-3 border text-sm" style={{ background: '#FEF2F2', borderColor: '#DC2626', color: '#DC2626' }}>{submitError}</div>
                )}

                <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  <button onClick={e => { e.preventDefault(); setCurrentStep(5) }}
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

// STEP3の「期間で登録する」「単日を追加する」入力用モーダル（2026-07-23デザインレビューで確定）。
// 背景を暗くしたオーバーレイの上に白いカードを重ねて表示する。外側クリック・×ボタンで閉じる。
function PledgeModal({
  open, onClose, title, subtitle, children, maxWidthClass = 'max-w-lg',
}: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; maxWidthClass?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`bg-white rounded-2xl w-full ${maxWidthClass} overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="flex items-center px-6 py-4 border-b shrink-0" style={{ borderColor: '#D0DAF0' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: '#1A2340' }}>{title}</p>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>{subtitle}</p>}
          </div>
          <button onClick={e => { e.preventDefault(); onClose() }} aria-label="閉じる"
            className="ml-auto shrink-0" style={{ color: '#8A93A8' }}>
            <PledgeIcon name="close" className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

// ===== 小さな共通UI部品（app/apply/_components/FormParts.tsxと同じ見た目。今回は依存関係を
//      増やさず新規ルートを自己完結させるため、必要な分だけこのファイル内に用意している） =====

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: '200px 1fr' }}>
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
          className="w-64 border rounded-lg px-3 py-2 text-sm focus:outline-none placeholder:text-gray-400"
          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          placeholder="社員番号または氏名で検索" autoComplete="off" />
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

// STEP5（最終確認）用の1行表示コンポーネント。/apply STEP8のFinalRowと同じく、値表示エリアは白背景固定。
function PledgeFinalRow({ label, value, multiline, suffix }: { label: string; value: string; multiline?: boolean; suffix?: string }) {
  return (
    <div className="grid border-b last:border-0" style={{ gridTemplateColumns: '220px 1fr', borderColor: '#D0DAF0' }}>
      <div className="border-r px-4 py-3.5 flex items-start" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <span className="text-sm font-medium" style={{ color: '#1A2340' }}>{label}</span>
      </div>
      <div className={`px-5 py-3.5 text-sm ${multiline ? 'whitespace-pre-line' : 'flex items-center'}`} style={{ color: '#1A2340', lineHeight: 1.7, background: 'white' }}>
        {value || '－'}
        {suffix && <span className="text-xs ml-1.5" style={{ color: '#5A6A8A' }}>{suffix}</span>}
      </div>
    </div>
  )
}

// STEP5（最終確認）用のセクション区切りコンポーネント。/apply STEP8のFinalSection/FinalGroupHeaderと同じ見た目
// （紺ヘッダー＋オレンジ「修正する」ボタン＋展開/折りたたみ）を、この画面用にローカルで再現している。
function PledgeFinalSection({ id, title, sub, collapsedSections, setCollapsedSections, onEdit, children }: {
  id: string; title: string; sub: string
  collapsedSections: Record<string, boolean>
  setCollapsedSections: (v: Record<string, boolean>) => void
  onEdit: () => void
  children: React.ReactNode
}) {
  const isCollapsed = !!collapsedSections[id]
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
      <div className="px-5 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none" style={{ background: '#1B3A8C' }}
        onClick={() => setCollapsedSections({ ...collapsedSections, [id]: !isCollapsed })}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-white truncate">{title}</span>
          <span className="text-xs truncate" style={{ color: '#A8C0E8' }}>{sub}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); e.preventDefault(); onEdit() }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white whitespace-nowrap" style={{ background: '#F97316' }}>修正する</button>
          <span className="text-xs transition-transform" style={{ color: 'rgba(255,255,255,0.7)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
      </div>
      {!isCollapsed && <div>{children}</div>}
    </div>
  )
}
