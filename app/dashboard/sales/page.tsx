'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ContractStatus,
  ContractForDisplay,
  formatDateTime,
  getDocumentLabel,
  ContractTypeBadge,
  ContractStatusBadge,
  ConfirmedBadge,
  getDeadlineAlert,
  getEmployPeriodLabel,
} from '../_shared/contractDisplay'
import { useContractListToolbar, buildDateSortOptions } from '../_shared/useContractListToolbar'
import { useApprovedAccumulator, APPROVED_WINDOW_DAYS } from '../_shared/useApprovedAccumulator'

type Contract = ContractForDisplay & {
  created_by_dept_no: number | null
  sign_requested_at: string | null
}

type MyRequest = {
  id: string
  request_type: 'staff_register' | 'csv_import'
  staff_name: string | null
  staff_code: string | null
  system_type: string | null
  dispatch_start_date: string | null
  staff_register_status: string | null
  csv_import_status: string | null
  staff_register_cancel_reason: string | null
  csv_import_cancel_reason: string | null
  requested_by_name: string | null
  requested_by_dept: string | null
  requested_at: string
}

type FilterKey = 'pending' | 'explain' | 'rejected' | 'waiting' | 'completed' | 'other'
type IconName = 'file' | 'message' | 'refresh' | 'pen' | 'check' | 'mail' | 'search' | 'filter' | 'map' | 'arrow' | 'logout' | 'plus' | 'alert' | 'clock'

const SIGN_DEADLINE_DAYS = 7 // 署名期日＝通知から7日（初期値。将来アラート日数マスタで変更可能にする予定）
const CLOSING_PATTERN_LABEL: Record<string, string> = {
  auto: '指定なし',
  face: '対面でその場説明',
  print: '印刷して説明後にリンク送付',
}

const cardBase = 'rounded-[18px] border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]'
const primaryButton = 'inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]'
const secondaryButton = 'inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]'
const accentButton = 'inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#F59E42] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(245,158,66,.2)] transition hover:-translate-y-0.5 hover:bg-[#E88525] hover:shadow-[0_15px_34px_rgba(245,158,66,.28)]'

const formatDate = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

const Icon = ({ name, className = '' }: { name: IconName; className?: string }) => {
  const paths: Record<IconName, ReactNode> = {
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    message: (
      <>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 1-15.5 6.2" />
        <path d="M3 12A9 9 0 0 1 18.5 5.8" />
        <path d="M18 2v4h4" />
        <path d="M6 22v-4H2" />
      </>
    ),
    pen: (
      <>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    filter: (
      <>
        <path d="M3 5h18" />
        <path d="M7 12h10" />
        <path d="M10 19h4" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    plus: (
      <>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M12 12v5" />
        <path d="M9.5 14.5h5" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const Pill = ({ children, tone = 'gray' }: { children: ReactNode; tone?: 'blue' | 'orange' | 'red' | 'green' | 'gray' | 'purple' }) => {
  const tones = {
    blue: 'bg-[#EAF1FF] text-[#2F5FD0]',
    orange: 'bg-[#FFF3E8] text-[#F59E42]',
    red: 'bg-[#FDECEC] text-[#E74C3C]',
    green: 'bg-[#EAF8EE] text-[#4CAF50]',
    gray: 'bg-[#F3F5F8] text-[#6B7280]',
    purple: 'bg-[#F3ECFF] text-[#7C3AED]',
  }
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

const SignDeadlineBadge = ({ signRequestedAt }: { signRequestedAt: string | null }) => {
  if (!signRequestedAt) return null
  const notified = new Date(signRequestedAt)
  const deadline = new Date(notified.getTime() + SIGN_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadlineDay = new Date(deadline); deadlineDay.setHours(0, 0, 0, 0)
  const remain = Math.floor((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = remain < 0
  const urgent = !overdue && remain <= 2
  const label = overdue ? `期限超過${Math.abs(remain)}日（${formatDate(deadline)}）` : `期限まで${remain}日（${formatDate(deadline)}）`

  return <Pill tone={overdue ? 'red' : urgent ? 'orange' : 'blue'}>{label}</Pill>
}

export default function SalesDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [deptLookupError, setDeptLookupError] = useState('')
  // 「完了」（署名済み・完了）は蓄積型のため共通フックで直近45日・ページ単位で取得する。
  // それ以外（進行中・要説明・差し戻し・署名待ち）はフロー型なので全件取得のまま。
  const [flowContracts, setFlowContracts] = useState<Contract[]>([])
  const deptNoRef = useRef<number | null>(null)
  const {
    approvedContracts, approvedTotalCount, approvedHasMore, approvedLoadingMore,
    approvedSearchMode, approvedSearching, approvedSearchNotice,
    fetchApprovedRecent, loadMoreApproved, runApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.eq('created_by_dept_no', deptNoRef.current), ['署名済み', '完了'])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending')
  const [confirmingExplainId, setConfirmingExplainId] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [myRequestsLoading, setMyRequestsLoading] = useState(true)
  const [includeCompletedRequests, setIncludeCompletedRequests] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)

      const email = data.user.email
      const { data: staffRow, error: staffError } = await supabase
        .from('staff')
        .select('dept_no, department_master(dept_name)')
        .eq('email', email)
        .limit(1)
        .maybeSingle()

      if (staffError || !staffRow || staffRow.dept_no === null) {
        setDeptLookupError('ログインユーザーの所属部門を特定できませんでした。管理部にご確認ください。')
        setLoading(false)
        setMyRequestsLoading(false)
        return
      }

      const deptName = (staffRow as any)?.department_master?.dept_name || null
      deptNoRef.current = staffRow.dept_no

      await Promise.all([
        loadContracts(staffRow.dept_no),
        fetchApprovedRecent(),
        loadMyRequests(deptName),
      ])
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const loadMyRequests = async (deptName: string | null) => {
    setMyRequestsLoading(true)
    if (!deptName) { setMyRequests([]); setMyRequestsLoading(false); return }
    const { data: rows, error } = await supabase
      .from('requests')
      .select('id, request_type, staff_name, staff_code, system_type, dispatch_start_date, staff_register_status, csv_import_status, staff_register_cancel_reason, csv_import_cancel_reason, requested_by_name, requested_by_dept, requested_at')
      .eq('requested_by_dept', deptName)
      .order('requested_at', { ascending: false })
    if (error) { console.error('requests取得エラー:', error); setMyRequestsLoading(false); return }
    setMyRequests((rows || []) as MyRequest[])
    setMyRequestsLoading(false)
  }

  const loadContracts = async (deptNo: number) => {
    const { data: rows, error } = await supabase
      .from('contracts')
      .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_by_dept_no, created_at, rejection_reason, sign_requested_at, signed_at, input_data')
      .eq('created_by_dept_no', deptNo)
      .in('status', ['申請中', 'SSC承認済み', '差し戻し中', '署名待ち'])
      .order('created_at', { ascending: false })

    if (error) { console.error('contracts取得エラー:', error); return }
    setFlowContracts((rows || []) as Contract[])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isExplainNeeded = (c: Contract) => {
    const cp = c.input_data?.fields?.closingPattern
    return c.status === 'SSC承認済み' && (cp === 'face' || cp === 'print')
  }

  const explainList = flowContracts.filter(isExplainNeeded)
  const pendingList = flowContracts.filter(c => ['申請中', 'SSC承認済み'].includes(c.status) && !isExplainNeeded(c))
  const rejectedList = flowContracts.filter(c => c.status === '差し戻し中')
  const waitingList = flowContracts.filter(c => c.status === '署名待ち')
  const completedList = approvedContracts

  const hasVisibleTask = (r: MyRequest, includeCompleted: boolean) => {
    const srVisible = !!r.staff_register_status && (r.staff_register_status !== 'completed' || includeCompleted)
    const csvVisible = !!r.csv_import_status && r.csv_import_status !== 'not_required' && (r.csv_import_status !== 'completed' || includeCompleted)
    return srVisible || csvVisible
  }
  const visibleMyRequests = myRequests.filter(r => hasVisibleTask(r, includeCompletedRequests))

  const filterCards: { key: FilterKey; label: string; count: number | null; color: string; tone: 'blue' | 'orange' | 'red' | 'green' | 'gray' | 'purple'; icon: IconName }[] = [
    { key: 'pending', label: '進行中', count: pendingList.length, color: '#2F5FD0', tone: 'blue', icon: 'file' },
    { key: 'explain', label: '要説明', count: explainList.length, color: '#6B7280', tone: 'gray', icon: 'message' },
    { key: 'rejected', label: '差し戻し', count: rejectedList.length, color: '#E74C3C', tone: 'red', icon: 'refresh' },
    { key: 'waiting', label: '署名待ち', count: waitingList.length, color: '#F59E42', tone: 'orange', icon: 'pen' },
    { key: 'completed', label: '完了', count: approvedTotalCount, color: '#4CAF50', tone: 'green', icon: 'check' },
    { key: 'other', label: '依頼状況', count: visibleMyRequests.length, color: '#7C3AED', tone: 'purple', icon: 'mail' },
  ]

  const baseListForFilter: Record<FilterKey, Contract[]> = {
    pending: pendingList,
    explain: explainList,
    rejected: rejectedList,
    waiting: waitingList,
    completed: completedList,
    other: [],
  }
  const baseCurrentList = baseListForFilter[activeFilter]
  const currentLabel = filterCards.find(c => c.key === activeFilter)?.label || ''

  const statusOptionsForFilter: Record<FilterKey, { value: string; label: string }[]> = {
    pending: [
      { value: '申請中', label: '申請中' },
      { value: 'SSC承認済み', label: 'SSC承認済み' },
    ],
    explain: [],
    rejected: [],
    waiting: [],
    completed: [],
    other: [],
  }

  const { result: currentList, toolbar: listToolbar, searchText: contractSearchText } = useContractListToolbar(baseCurrentList, {
    statusOptions: statusOptionsForFilter[activeFilter],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: activeFilter,
  })

  const handleExplainDone = async (contractId: string) => {
    if (explainLoading) return
    setExplainLoading(true)
    const res = await fetch(`/api/contracts/${contractId}/notify-sign-request?trigger=explain`, { method: 'POST' })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('更新に失敗しました: ' + (result.error || '不明なエラー'))
      setExplainLoading(false)
      return
    }
    const now = new Date().toISOString()
    setFlowContracts(prev => prev.map(c => c.id === contractId ? { ...c, status: '署名待ち' as ContractStatus, sign_requested_at: now } : c))
    setConfirmingExplainId(null)
    setExplainLoading(false)
  }

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
      <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
    </div>
  )

  const ContractCard = ({ contract }: { contract: Contract }) => {
    const staff = contract.input_data?.staff || {}
    const f = contract.input_data?.fields || {}
    const deadline = getDeadlineAlert(contract)
    const isWaitingSign = contract.status === '署名待ち'
    const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
    const isExplain = isExplainNeeded(contract)

    return (
      <article className={`${cardBase} grid gap-4 p-5 lg:grid-cols-[minmax(220px,1.25fr)_minmax(220px,1.15fr)_minmax(190px,.95fr)_minmax(170px,.85fr)_minmax(160px,.75fr)_auto] lg:items-center`}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {deadline.type && !isWaitingSign && (
              <Pill tone={deadline.type === 'overdue' ? 'red' : 'orange'}>{deadline.label}</Pill>
            )}
            {isExplain && <Pill tone="orange">説明対応が必要</Pill>}
          </div>
          <p className="break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{staff.name || '-'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#6B7280]">
            <span className="break-words">{staff.department || '-'}</span>
            <span className="h-3 w-px bg-[#E8EDF5]" />
            <span>{staff.employee_number || '-'}</span>
            <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">就業先</p>
          <div className="flex items-start gap-2">
            <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#2F5FD0]" />
            <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{f.workLocationName || '-'}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">ステータス</p>
          <div className="flex flex-wrap gap-2">
            <Pill tone="blue">{getDocumentLabel(contract.document_type, contract.pattern)}</Pill>
            <ContractStatusBadge status={contract.status} overrideLabel={isExplain ? '説明対応が必要' : undefined} />
            {isWaitingSign && <SignDeadlineBadge signRequestedAt={contract.sign_requested_at} />}
            {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">雇用期間</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{getEmployPeriodLabel(contract)}</p>
          {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
            <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B7280]">派遣期間 {f.dispatchStart} 〜 {f.dispatchEnd}</p>
          )}
          {isExplain && f.closingPattern && (
            <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B7280]">締結パターン {CLOSING_PATTERN_LABEL[f.closingPattern] || f.closingPattern}</p>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">申請日時</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(contract.created_at)}</p>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <button
            className={isExplain || contract.status === '差し戻し中' ? secondaryButton : primaryButton}
            onClick={() => router.push(`/dashboard/sales/contracts/${contract.id}`)}
          >
            詳細を見る
            <Icon name="arrow" className="h-4 w-4" />
          </button>
          {isExplain && confirmingExplainId !== contract.id && (
            <button className={primaryButton} onClick={() => setConfirmingExplainId(contract.id)}>
              <Icon name="check" className="h-4 w-4" />
              説明完了
            </button>
          )}
          {contract.status === '差し戻し中' && (
            <button className={accentButton} onClick={() => router.push(`/apply?edit=${contract.id}`)}>
              再申請する
            </button>
          )}
        </div>

        {contract.status === '差し戻し中' && contract.rejection_reason && (
          <div className="rounded-2xl border border-[#FFE2C7] bg-[#FFF8F1] p-4 lg:col-span-6">
            <p className="text-xs font-semibold text-[#F59E42]">差し戻し理由</p>
            <p className="mt-2 break-words text-sm font-medium leading-6 text-[#1F2937]">{contract.rejection_reason}</p>
          </div>
        )}

        {isExplain && contract.status === 'SSC承認済み' && (
          <div className="rounded-2xl border border-[#D7E5FF] bg-[#F5F9FF] p-4 lg:col-span-6">
            <p className="text-sm font-medium leading-6 text-[#2F5FD0]">
              {contract.work_place === '社内'
                ? '承認済みです。従業員への説明が完了したら「説明完了」を押してください。押すと従業員が署名待ちの状態になります。'
                : 'SSC承認済みです。従業員への説明が完了したら「説明完了」を押してください。押すと従業員が署名待ちの状態になります。'}
            </p>
          </div>
        )}

        {isExplain && confirmingExplainId === contract.id && (
          <div className="rounded-2xl border border-[#D7E5FF] bg-[#F5F9FF] p-4 lg:col-span-6">
            <p className="text-sm font-semibold text-[#1F2937]">従業員への説明は完了しましたか？</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">押すと、従業員が署名待ちの状態に切り替わります。</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => handleExplainDone(contract.id)}
                disabled={explainLoading}
                className={`${primaryButton} flex-1 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {explainLoading ? '処理中...' : '説明完了'}
              </button>
              <button onClick={() => setConfirmingExplainId(null)} className={secondaryButton}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFD] text-[#1F2937]">
      <header className="border-b border-[#E8EDF5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-5">
            <Image src="/logo.png" alt="APパートナーズ" width={64} height={38} className="h-auto w-[64px]" />
            <div className="h-8 w-px bg-[#E8EDF5]" />
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-[#1F2937]">契約書管理システム</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">担当営業ダッシュボード</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/apply')} className={primaryButton}>
              <Icon name="plus" className="h-5 w-5" />
              新規発行申請
            </button>
            <button onClick={handleLogout} className={secondaryButton}>
              <Icon name="logout" className="h-4 w-4" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        {deptLookupError && (
          <div className="mb-6 rounded-[18px] border border-[#F7C7C1] bg-[#FDECEC] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <p className="text-sm font-semibold text-[#E74C3C]">{deptLookupError}</p>
          </div>
        )}

        <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-8">
          <div className="grid gap-6 xl:grid-cols-[.8fr_1.6fr] xl:items-center">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
                <Icon name={filterCards.find(c => c.key === activeFilter)?.icon || 'file'} className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">本日の状況</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#2F5FD0] md:text-5xl">
                  {currentLabel} {activeFilter === 'other' ? visibleMyRequests.length : activeFilter === 'completed' ? approvedTotalCount : baseCurrentList.length}件
                </h2>
                <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">
                  対応が必要な案件を確認し、次のアクションへ進めてください。
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {filterCards.map(card => (
                <button
                  key={card.key}
                  onClick={() => setActiveFilter(card.key)}
                  className={`rounded-[18px] border bg-white/86 p-5 text-left shadow-[0_10px_30px_rgba(15,23,42,.05)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)] ${activeFilter === card.key ? 'border-[#2F5FD0]' : 'border-[#E8EDF5]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1F2937]">{card.label}</p>
                    <Icon name={card.icon} className="h-5 w-5 text-[#6B7280]" />
                  </div>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-normal" style={{ color: card.color }}>{card.count}</span>
                    <span className="pb-1 text-sm font-semibold" style={{ color: card.color }}>件</span>
                  </div>
                  <div className="mt-5 h-1 rounded-full bg-[#E8EDF5]">
                    <div className="h-1 w-8 rounded-full" style={{ background: card.color }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <nav className="mt-6 border-b border-[#E8EDF5]">
          <div className="flex gap-8 overflow-x-auto">
            {filterCards.map(card => {
              const isActive = activeFilter === card.key
              return (
                <button
                  key={card.key}
                  onClick={() => setActiveFilter(card.key)}
                  className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1 pb-4 text-sm font-semibold transition ${isActive ? 'text-[#2F5FD0]' : 'text-[#1F2937] hover:text-[#2F5FD0]'}`}
                >
                  <Icon name={card.icon} className="h-4 w-4" />
                  {card.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isActive ? 'bg-[#2F5FD0] text-white' : 'bg-[#EEF0F5] text-[#6B7280]'}`}>{card.count}</span>
                  <span className={`absolute bottom-[-1px] left-0 h-0.5 rounded-full bg-[#2F5FD0] transition-all duration-300 ${isActive ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </button>
              )
            })}
          </div>
        </nav>

        {activeFilter !== 'other' && (
          <section className="mt-5 rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Icon name="filter" className="h-5 w-5 text-[#1F2937]" />
                <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
              </div>
              <Icon name="search" className="h-5 w-5 text-[#6B7280]" />
            </div>
            <div className="[&_button]:rounded-[16px] [&_button]:font-semibold [&_input]:rounded-[16px] [&_input]:border-[#E8EDF5] [&_input]:transition [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[16px] [&_select]:border-[#E8EDF5]">
              {listToolbar}
            </div>
            {activeFilter === 'completed' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!approvedSearchMode ? (
                  <>
                    <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                    <button onClick={() => runApprovedSearch(contractSearchText)} disabled={!contractSearchText.trim() || approvedSearching}
                      className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50">
                      {approvedSearching ? '検索中…' : '全期間で検索'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-[#6B7280]">全期間検索の結果です{approvedSearchNotice ? '（' + approvedSearchNotice + '）' : ''}</p>
                    <button onClick={fetchApprovedRecent} className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0]">
                      直近{APPROVED_WINDOW_DAYS}日の表示に戻す
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
          </div>
        ) : (
          <section className={`${cardBase} mt-5 p-6`}>
            {activeFilter === 'other' ? (
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-[#1F2937]">依頼状況一覧（{visibleMyRequests.length}件）</h2>
                <label className="flex items-center gap-2 text-sm font-medium text-[#6B7280]">
                  <input
                    type="checkbox"
                    checked={includeCompletedRequests}
                    onChange={e => setIncludeCompletedRequests(e.target.checked)}
                    className="h-4 w-4 rounded border-[#E8EDF5] accent-[#2F5FD0]"
                  />
                  完了したものも表示する
                </label>
              </div>
            ) : (
              <h2 className="mb-5 text-lg font-semibold text-[#1F2937]">{currentLabel}（{currentList.length}件）</h2>
            )}

            {activeFilter === 'other' ? (
              myRequestsLoading ? (
                <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>
              ) : visibleMyRequests.length === 0 ? (
                <p className="py-8 text-sm font-medium text-[#6B7280]">該当する依頼はありません。</p>
              ) : (
                <div className="grid gap-3">
                  {visibleMyRequests.map(r => <MyRequestCard key={r.id} r={r} includeCompleted={includeCompletedRequests} />)}
                </div>
              )
            ) : currentList.length === 0 ? (
              <p className="py-8 text-sm font-medium text-[#6B7280]">該当する書類はありません。</p>
            ) : (
              <div className="grid gap-3">
                {currentList.map(c => <ContractCard key={c.id} contract={c} />)}
              </div>
            )}

            {activeFilter === 'completed' && approvedHasMore && !approvedSearchMode && (
              <div className="mt-5 flex justify-center">
                <button onClick={loadMoreApproved} disabled={approvedLoadingMore}
                  className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
                  {approvedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
                </button>
              </div>
            )}

            {activeFilter === 'other' && (
              <div className="mt-5 border-t border-[#E8EDF5] pt-4 text-center">
                <span className="text-xs font-medium text-[#6B7280]">更新回答機能は準備中です。</span>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function MyRequestCard({ r, includeCompleted }: { r: MyRequest; includeCompleted: boolean }) {
  const badge = (status: string) => {
    const isDone = status === 'completed'
    const isCancelled = status === 'cancelled'
    const label = isDone ? '完了' : isCancelled ? '要確認・取消済み' : status === 'in_progress' ? '対応中' : '未対応'
    const tone = isDone ? 'green' : isCancelled ? 'orange' : 'blue'
    return <Pill tone={tone}>{label}</Pill>
  }
  const taskVisible = (status: string | null) => !!status && status !== 'not_required' && (status !== 'completed' || includeCompleted)

  const showStaffRegister = taskVisible(r.staff_register_status)
  const showCsvImport = taskVisible(r.csv_import_status)
  const hasCancelled = r.staff_register_status === 'cancelled' || r.csv_import_status === 'cancelled'

  return (
    <article className={`${cardBase} p-5 ${hasCancelled ? 'border-[#FFE2C7] bg-[#FFF8F1]' : ''}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,1.2fr)_minmax(220px,.9fr)_1.6fr] lg:items-start">
        <div className="min-w-0">
          <p className="break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{r.staff_name || '-'}</p>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">社員番号 {r.staff_code || '-'}</p>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">依頼情報</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">
            {r.requested_by_name && <>依頼者 {r.requested_by_name}{r.requested_by_dept ? `（${r.requested_by_dept}）` : ''}<br /></>}
            依頼日 {formatDateTime(r.requested_at)}
          </p>
        </div>

        <div className="grid gap-3">
          {showStaffRegister && (
            <div className="rounded-2xl border border-[#E8EDF5] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {badge(r.staff_register_status as string)}
                <span className="text-sm font-semibold text-[#1F2937]">スタッフマスタ登録</span>
              </div>
              {r.staff_register_status === 'cancelled' && r.staff_register_cancel_reason && (
                <p className="mt-2 break-words text-sm font-medium leading-6 text-[#F59E42]">取消理由：{r.staff_register_cancel_reason}</p>
              )}
            </div>
          )}
          {showCsvImport && (
            <div className="rounded-2xl border border-[#E8EDF5] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {badge(r.csv_import_status as string)}
                <span className="break-words text-sm font-semibold text-[#1F2937]">
                  CSVインポート{r.system_type ? `（${r.system_type}${r.dispatch_start_date ? '・派遣開始日 ' + formatDate(new Date(r.dispatch_start_date)) : ''}）` : ''}
                </span>
              </div>
              {r.csv_import_status === 'cancelled' && r.csv_import_cancel_reason && (
                <p className="mt-2 break-words text-sm font-medium leading-6 text-[#F59E42]">取消理由：{r.csv_import_cancel_reason}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
