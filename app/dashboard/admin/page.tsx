'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ContractForDisplay,
  formatDateTime,
  getDocumentLabel,
  ContractTypeBadge,
  WorkPlaceBadge,
  ContractStatusBadge,
  ConfirmedBadge,
  getDeadlineAlert,
  hasWarning,
  hasAutoCheckWarning,
  getEmployPeriodLabel,
} from '../_shared/contractDisplay'
import { useContractListToolbar, buildDateSortOptions } from '../_shared/useContractListToolbar'
import { useApprovedAccumulator, APPROVED_WINDOW_DAYS, CONTRACT_COLUMNS } from '../_shared/useApprovedAccumulator'
import RenewalManagementTab from '../_shared/RenewalManagementTab'
import { useRenewalCandidates } from '../_shared/useRenewalCandidates'

type RequestRow = {
  id: string
  request_type: 'staff_register' | 'csv_import'
  staff_name: string | null
  staff_code: string | null
  staff_id: string | null
  staff_dept: string | null
  staff_hire_date: string | null
  client_name: string | null
  system_type: string | null
  dispatch_start_date: string | null
  staff_register_status: string | null
  csv_import_status: string | null
  staff_register_cancel_reason: string | null
  csv_import_cancel_reason: string | null
  requested_by_name: string | null
  requested_by_dept: string | null
  requested_at: string
  displayDept?: string | null
}

type TabType = 'overview' | 'requests' | 'contracts' | 'internal' | 'csvImport' | 'csvDiff' | 'renewal'
type Contract = ContractForDisplay
type ContractSubTab = '承認待ち' | '差し戻し中' | '承認済み'
type IconName = 'file' | 'list' | 'shield' | 'upload' | 'alert' | 'clock' | 'search' | 'refresh' | 'check' | 'arrow' | 'logout' | 'map' | 'user' | 'building' | 'plus' | 'grid'

const PAGE_SIZE = 50
// 依頼一覧（「すべて／完了済みのみ／取消済みのみ」表示時）の既定絞り込み日数。
// 「未対応のみ」表示は対応漏れ発見のため常に全期間対象（2026-07-14）
const REQUEST_WINDOW_DAYS = 45
const cardBase = 'rounded-[18px] border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]'
const primaryButton = 'inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]'
const secondaryButton = 'inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]'
const accentButton = 'inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#F59E42] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(245,158,66,.2)] transition hover:-translate-y-0.5 hover:bg-[#E88525] hover:shadow-[0_15px_34px_rgba(245,158,66,.28)] disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:shadow-none disabled:hover:translate-y-0'

function formatDate(str: string | null) {
  if (!str) return ''
  const d = new Date(str)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

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
    list: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m17 8-5-5-5 5" />
        <path d="M12 3v12" />
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
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
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
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
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
    map: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        <path d="M9 7h1" />
        <path d="M14 7h1" />
        <path d="M9 11h1" />
        <path d="M14 11h1" />
        <path d="M9 15h1" />
        <path d="M14 15h1" />
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
    grid: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
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

function isPending(r: RequestRow) {
  return r.staff_register_status === 'pending' || r.csv_import_status === 'pending'
}

function hasCancelled(r: RequestRow) {
  return r.staff_register_status === 'cancelled' || r.csv_import_status === 'cancelled'
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const [requests, setRequests] = useState<RequestRow[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [reqError, setReqError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // 総合レビュー指摘19対応：タブバッジ・サマリーカードの「未対応」件数は、絞り込み・検索・
  // 期間指定の影響を一切受けない独立した件数であるべき（そうでないと、他のタブや検索条件を
  // 見ている間だけ「未対応0件」等の誤表示になる）。requests（絞り込み後の一覧用state）とは
  // 別に、常に全期間・全条件のpending件数だけを数える専用state・取得処理を持つ。
  const [pendingTotalCountAll, setPendingTotalCountAll] = useState(0)

  const [searchText, setSearchText] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [requesterFilter, setRequesterFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'staff_register' | 'csv_import'>('')
  const [systemFilter, setSystemFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed' | 'cancelled'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 依頼管理タブの「絞り込み」リセットボタン用（ビルドエラー修正・2026-07-15：
  // JSX側から参照されていたが未定義だった）
  const resetFilters = () => {
    setSearchText('')
    setDeptFilter('')
    setRequesterFilter('')
    setTypeFilter('')
    setSystemFilter('')
    setStatusFilter('pending')
    setDateFrom('')
    setDateTo('')
  }

  const [flowContracts, setFlowContracts] = useState<Contract[]>([])
  const {
    approvedContracts, approvedTotalCount, approvedHasMore, approvedLoadingMore,
    approvedSearchMode, approvedSearching, approvedSearchNotice,
    fetchApprovedRecent, loadMoreApproved, runApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.neq('work_place', '社内'))
  const [contractsLoading, setContractsLoading] = useState(true)
  const [contractsError, setContractsError] = useState('')
  const [contractsSubTab, setContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkApproveDone, setBulkApproveDone] = useState<number | null>(null)
  // 二重承認ガード（総合レビュー指摘12）：一括承認完了時に「他の人が先に処理済みだった」件数
  const [bulkApproveSkipped, setBulkApproveSkipped] = useState(0)
  // 総合レビュー指摘24対応：署名依頼メール送信の失敗を隠さず件数で伝える
  const [bulkApproveNotifyFailed, setBulkApproveNotifyFailed] = useState(0)

  const {
    candidates: renewalCandidates, loading: renewalLoading,
    syncCandidates, fetchCandidates, updateCandidate,
    searchCsvRenewal, requestCsvImport, switchToManualOverride,
    copyDispatchToEmploy, bulkMarkReady, confirmNotRenewing,
  } = useRenewalCandidates()

  const [internalFlowContracts, setInternalFlowContracts] = useState<Contract[]>([])
  const {
    approvedContracts: internalApprovedContracts, approvedTotalCount: internalApprovedTotalCount,
    approvedHasMore: internalApprovedHasMore, approvedLoadingMore: internalApprovedLoadingMore,
    approvedSearchMode: internalApprovedSearchMode, approvedSearching: internalApprovedSearching,
    approvedSearchNotice: internalApprovedSearchNotice, fetchApprovedRecent: fetchInternalApprovedRecent,
    loadMoreApproved: loadMoreInternalApproved, runApprovedSearch: runInternalApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.eq('work_place', '社内'))
  const [internalContractsLoading, setInternalContractsLoading] = useState(true)
  const [internalContractsError, setInternalContractsError] = useState('')
  const [internalContractsSubTab, setInternalContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set())
  const [internalShowBulkApproveConfirm, setInternalShowBulkApproveConfirm] = useState(false)
  const [internalBulkApproving, setInternalBulkApproving] = useState(false)
  const [internalBulkApproveDone, setInternalBulkApproveDone] = useState<number | null>(null)
  const [internalBulkApproveSkipped, setInternalBulkApproveSkipped] = useState(0)
  const [internalBulkApproveNotifyFailed, setInternalBulkApproveNotifyFailed] = useState(0)

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '管理部') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  // 更新期限管理：管理部は全部門横断のためdeptNo=null（絞り込みなし）
  useEffect(() => {
    if (!user) return
    (async () => { await syncCandidates(); await fetchCandidates(null) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    const loadContracts = async () => {
      setContractsLoading(true)
      setContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACT_COLUMNS)
        .neq('work_place', '社内')
        .in('status', ['申請中', '差し戻し中'])
        .order('created_at', { ascending: false })
      if (error) { setContractsError('契約一覧の取得に失敗しました: ' + error.message); setContractsLoading(false); return }
      setFlowContracts((data || []) as Contract[])
      await fetchApprovedRecent()
      setContractsLoading(false)
    }
    loadContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    // 二重承認ガード（総合レビュー指摘12）：SSCと管理部が同時に同じ案件を承認すると二重更新・
    // notify-sign-requestの二重送信（メール2通）が起きうるため、「まだ申請中の案件だけ」を
    // 条件につけ、実際に更新できた分だけを対象にする。
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      alert('一括承認に失敗しました: ' + error.message)
      setBulkApproving(false)
      return
    }
    const approvedIds = (updatedRows || []).map(r => r.id as string)
    const skipped = ids.length - approvedIds.length
    let notifyFailedCount = 0
    if (approvedIds.length > 0) {
      const notifyAuthHeader = await getAuthHeader()
      const notifyResults = await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST', headers: notifyAuthHeader })
            .then(res => res.ok)
            .catch(() => false)
        )
      )
      notifyFailedCount = notifyResults.filter(ok => !ok).length
    }
    setFlowContracts(prev => prev.filter(c => !ids.includes(c.id)))
    await fetchApprovedRecent()
    setBulkApproving(false)
    setBulkApproveSkipped(skipped)
    setBulkApproveNotifyFailed(notifyFailedCount)
    setBulkApproveDone(approvedIds.length)
  }

  const handleBulkApproveDoneOk = () => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
    setBulkApproveSkipped(0)
    setBulkApproveNotifyFailed(0)
  }

  useEffect(() => {
    if (!user) return
    if (user.user_metadata?.is_internal_approver !== true) { setInternalContractsLoading(false); return }
    const loadInternalContracts = async () => {
      setInternalContractsLoading(true)
      setInternalContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACT_COLUMNS)
        .eq('work_place', '社内')
        .in('status', ['申請中', '差し戻し中'])
        .order('created_at', { ascending: false })
      if (error) { setInternalContractsError('社内案件の取得に失敗しました: ' + error.message); setInternalContractsLoading(false); return }
      setInternalFlowContracts((data || []) as Contract[])
      await fetchInternalApprovedRecent()
      setInternalContractsLoading(false)
    }
    loadInternalContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleSelectInternal = (id: string) => {
    setInternalSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkApproveInternal = async () => {
    if (internalSelectedIds.size === 0 || internalBulkApproving) return
    setInternalBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(internalSelectedIds)
    // 二重承認ガード（総合レビュー指摘12。社内承認タブ側）
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      alert('一括承認に失敗しました: ' + error.message)
      setInternalBulkApproving(false)
      return
    }
    const approvedIds = (updatedRows || []).map(r => r.id as string)
    const skipped = ids.length - approvedIds.length
    let notifyFailedCount = 0
    if (approvedIds.length > 0) {
      const notifyAuthHeader = await getAuthHeader()
      const notifyResults = await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST', headers: notifyAuthHeader })
            .then(res => res.ok)
            .catch(() => false)
        )
      )
      notifyFailedCount = notifyResults.filter(ok => !ok).length
    }
    setInternalFlowContracts(prev => prev.filter(c => !ids.includes(c.id)))
    await fetchInternalApprovedRecent()
    setInternalBulkApproving(false)
    setInternalBulkApproveSkipped(skipped)
    setInternalBulkApproveNotifyFailed(notifyFailedCount)
    setInternalBulkApproveDone(approvedIds.length)
  }

  const handleBulkApproveInternalDoneOk = () => {
    setInternalSelectedIds(new Set())
    setInternalShowBulkApproveConfirm(false)
    setInternalBulkApproveDone(null)
    setInternalBulkApproveSkipped(0)
    setInternalBulkApproveNotifyFailed(0)
  }

  useEffect(() => {
    if (!user) return
    const loadRequests = async () => {
      setReqLoading(true)
      setReqError('')
      try {
        let query = supabase.from('requests').select('*').order('requested_at', { ascending: false })

        if (searchText) {
          query = query.or(`staff_name.ilike.%${searchText}%,staff_code.ilike.%${searchText}%`)
        }
        if (systemFilter) query = query.eq('system_type', systemFilter)
        if (requesterFilter) query = query.ilike('requested_by_name', `%${requesterFilter}%`)
        if (dateFrom) query = query.gte('requested_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = query.lte('requested_at', `${dateTo}T23:59:59`)
        // 依頼日を明示的に指定していない場合、未対応(pending)だけを見ている時は
        // （対応漏れの発見のため）全期間を対象にするが、それ以外（すべて／完了済みのみ／取消済みのみ）
        // は蓄積し続けて意味が薄れていくため、既定で直近REQUEST_WINDOW_DAYS日に絞る
        // （伊藤さん指摘・2026-07-14：contracts側で先に対応した設計を依頼側にも適用）
        if (!dateFrom && !dateTo && statusFilter !== 'pending') {
          const windowStart = new Date()
          windowStart.setDate(windowStart.getDate() - REQUEST_WINDOW_DAYS)
          query = query.gte('requested_at', windowStart.toISOString())
        }
        // 総合レビュー指摘20対応：「未対応のみは常に全期間対象」という上のコメント通りの
        // 動作にするため、pending表示時（かつ期間未指定）はlimitを付けない。以前は新しい順
        // 500件で一律に切っていたため、総依頼数が500件を超えると古い未対応依頼が
        // 一覧から恒久的に見えなくなっていた（対応漏れの発見という目的に反する不具合だった）。
        // それ以外（すべて／完了済み／取消済み）は直近の窓で既に絞られているため500件で十分。
        if (!(statusFilter === 'pending' && !dateFrom && !dateTo)) {
          query = query.limit(500)
        }

        const { data, error } = await query
        if (error) { setReqError('依頼一覧の取得に失敗しました: ' + error.message); setReqLoading(false); return }

        let rows = (data || []) as RequestRow[]

        if (typeFilter === 'staff_register') rows = rows.filter(r => !!r.staff_register_status)
        if (typeFilter === 'csv_import') rows = rows.filter(r => !!r.csv_import_status && r.csv_import_status !== 'not_required')

        const staffIds = Array.from(new Set(rows.filter(r => r.request_type === 'csv_import' && r.staff_id).map(r => r.staff_id as string)))
        let deptByStaffId: Record<string, string | null> = {}
        if (staffIds.length > 0) {
          const { data: staffRows } = await supabase
            .from('staff')
            .select('id, department_master(dept_name)')
            .in('id', staffIds)
          for (const s of (staffRows || []) as any[]) {
            deptByStaffId[s.id] = s.department_master?.dept_name || null
          }
        }
        rows = rows.map(r => ({
          ...r,
          displayDept: r.request_type === 'staff_register' ? r.staff_dept : (r.staff_id ? deptByStaffId[r.staff_id] || null : null),
        }))

        if (deptFilter) rows = rows.filter(r => r.displayDept && r.displayDept.includes(deptFilter))

        if (statusFilter === 'pending') rows = rows.filter(r => isPending(r))
        if (statusFilter === 'completed') rows = rows.filter(r => !isPending(r) && !hasCancelled(r))
        if (statusFilter === 'cancelled') rows = rows.filter(r => hasCancelled(r))

        setRequests(rows)
        setVisibleCount(PAGE_SIZE)
      } finally {
        setReqLoading(false)
      }
    }
    loadRequests()
  }, [user, searchText, deptFilter, requesterFilter, typeFilter, systemFilter, statusFilter, dateFrom, dateTo])

  // 総合レビュー指摘19対応：タブバッジ・サマリーカード用の「未対応」件数は、上の一覧取得とは
  // 独立して、絞り込み・検索・期間指定の影響を一切受けない全期間・全件のクエリで数える。
  const fetchPendingTotalCountAll = useCallback(async () => {
    const { count } = await supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .or('staff_register_status.eq.pending,csv_import_status.eq.pending')
    setPendingTotalCountAll(count ?? 0)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchPendingTotalCountAll()
  }, [user, fetchPendingTotalCountAll])

  const visibleRequests = requests.slice(0, visibleCount)

  const handleCancelTask = async (
    requestId: string,
    statusField: 'staff_register_status' | 'csv_import_status',
    reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason',
    reason: string
  ) => {
    const { error } = await supabase
      .from('requests')
      .update({ [statusField]: 'cancelled', [reasonField]: reason })
      .eq('id', requestId)
    if (error) { alert('取消の保存に失敗しました: ' + error.message); return false }
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, [statusField]: 'cancelled', [reasonField]: reason } : r))
    // 取消により「未対応」から外れる可能性があるため、独立集計のバッジ件数も更新する
    fetchPendingTotalCountAll()
    return true
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filteredContracts = contractsSubTab === '承認済み'
    ? approvedContracts
    : flowContracts.filter(c => {
        if (contractsSubTab === '承認待ち') return c.status === '申請中'
        if (contractsSubTab === '差し戻し中') return c.status === '差し戻し中'
        return false
      })
  const contractsPendingCount = flowContracts.filter(c => c.status === '申請中').length
  const contractsRejectedCount = flowContracts.filter(c => c.status === '差し戻し中').length
  const contractsApprovedCount = approvedTotalCount

  const {
    result: visibleContracts, toolbar: contractsToolbar,
    statusFilter: contractsStatusFilter, searchText: contractsSearchText, sortKey: contractsSortKey,
  } = useContractListToolbar(filteredContracts, {
    statusOptions: contractsSubTab === '承認済み'
      ? [
          { value: 'SSC承認済み', label: 'SSC承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
        ]
      : [],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: contractsSubTab,
  })

  // 絞り込み・検索・並び替えを変えると、画面から消えた案件のチェックが選択状態のまま残ってしまい、
  // 見えていない案件まで一括承認に巻き込まれる恐れがあった（総合レビュー指摘11・2026-07-15対応）。
  // RenewalManagementTab.tsxと同じ考え方で、条件を変えたタイミングで選択を必ずクリアする。
  useEffect(() => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
  }, [contractsStatusFilter, contractsSearchText, contractsSortKey])

  const bulkTargets = visibleContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAll = () => {
    if (selectedIds.size === bulkTargets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bulkTargets.map(c => c.id)))
    }
  }

  const filteredInternalContracts = internalContractsSubTab === '承認済み'
    ? internalApprovedContracts
    : internalFlowContracts.filter(c => {
        if (internalContractsSubTab === '承認待ち') return c.status === '申請中'
        if (internalContractsSubTab === '差し戻し中') return c.status === '差し戻し中'
        return false
      })
  const internalPendingCount = internalFlowContracts.filter(c => c.status === '申請中').length
  const internalRejectedCount = internalFlowContracts.filter(c => c.status === '差し戻し中').length
  const internalApprovedCount = internalApprovedTotalCount

  const {
    result: visibleInternalContracts, toolbar: internalToolbar,
    statusFilter: internalStatusFilter, searchText: internalSearchText, sortKey: internalSortKey,
  } = useContractListToolbar(filteredInternalContracts, {
    statusOptions: internalContractsSubTab === '承認済み'
      ? [
          // 総合レビュー指摘21対応：社内承認タブはカード側が「承認済み」表示（isInternal=true）
          // なので、絞り込みピルも合わせる（値自体は変更せず、実際のstatus文字列のまま絞り込む）。
          { value: 'SSC承認済み', label: '承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
        ]
      : [],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: internalContractsSubTab,
  })

  // 絞り込み・検索・並び替えを変えると選択状態が残ってしまう問題への対応（指摘11。社内承認タブ側）。
  useEffect(() => {
    setInternalSelectedIds(new Set())
    setInternalShowBulkApproveConfirm(false)
    setInternalBulkApproveDone(null)
  }, [internalStatusFilter, internalSearchText, internalSortKey])

  const internalBulkTargets = visibleInternalContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAllInternal = () => {
    if (internalSelectedIds.size === internalBulkTargets.length) {
      setInternalSelectedIds(new Set())
    } else {
      setInternalSelectedIds(new Set(internalBulkTargets.map(c => c.id)))
    }
  }

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
      <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
    </div>
  )

  const isInternalApprover = user.user_metadata?.is_internal_approver === true

  const tabs: { key: TabType; label: string; icon: IconName; count?: number }[] = [
    { key: 'overview', label: 'サマリー', icon: 'grid' },
    { key: 'requests', label: '依頼管理', icon: 'file', count: pendingTotalCountAll },
    { key: 'contracts', label: '契約一覧', icon: 'list' },
    ...(isInternalApprover ? [{ key: 'internal' as TabType, label: '社内承認', icon: 'shield' as IconName, count: internalPendingCount }] : []),
    { key: 'csvImport', label: 'CSVインポート', icon: 'upload' },
    { key: 'csvDiff', label: 'CSV差異アラート', icon: 'alert' },
    { key: 'renewal', label: '更新期限管理', icon: 'clock', count: renewalCandidates.length },
  ]

  // サマリータブ用：ドメイン横断で「今どこに未対応があるか」を一目で見せるカード（2026-07-14新設）。
  // 実データのある3枚（依頼・契約・社内承認）はクリックで該当タブへ切り替わる。
  // CSV差異・更新期限はまだ機能自体が未実装のため「準備中」の非活性カードとして枠だけ用意しておく
  // （CLAUDE.md運用ルール10番：将来の完成形を見据えた骨格を先に作っておく）。
  const overviewCards: { key: TabType; label: string; value: number; icon: IconName }[] = [
    { key: 'requests', label: '依頼 未対応', value: pendingTotalCountAll, icon: 'file' },
    { key: 'contracts', label: '契約 承認待ち', value: contractsPendingCount, icon: 'list' },
    ...(isInternalApprover ? [{ key: 'internal' as TabType, label: '社内承認待ち', value: internalPendingCount, icon: 'shield' as IconName }] : []),
    { key: 'renewal', label: '更新期限 対象', value: renewalCandidates.length, icon: 'clock' },
  ]
  const overviewPlaceholders: { label: string; icon: IconName }[] = [
    { label: 'CSV差異', icon: 'alert' },
  ]

  const requestSummary = [
    { label: '総依頼件数', value: requests.length, color: '#2F5FD0', tone: 'blue' as const, icon: 'file' as const },
    // 総合レビュー指摘19対応：ここだけ絞り込みと無関係な全社の未対応件数（タブバッジと同じ値）にする。
    // 他のカード（総依頼件数・対応中・完了・取消済み）は「今表示している一覧の内訳」のままでよいが、
    // 「未対応」は対応漏れの発見という目的上、常に全体件数でないと意味が薄れるため。
    { label: '未対応', value: pendingTotalCountAll, color: '#E74C3C', tone: 'red' as const, icon: 'alert' as const },
    { label: '対応中', value: requests.filter(r => r.staff_register_status === 'in_progress' || r.csv_import_status === 'in_progress').length, color: '#F59E42', tone: 'orange' as const, icon: 'refresh' as const },
    { label: '完了', value: requests.filter(r => !isPending(r) && !hasCancelled(r)).length, color: '#4CAF50', tone: 'green' as const, icon: 'check' as const },
    { label: '取消済み', value: requests.filter(hasCancelled).length, color: '#6B7280', tone: 'gray' as const, icon: 'refresh' as const },
  ]

  const contractSummary = [
    { label: '承認待ち', value: contractsPendingCount, color: '#2F5FD0', icon: 'file' as const },
    { label: '差し戻し中', value: contractsRejectedCount, color: '#E74C3C', icon: 'refresh' as const },
    { label: '承認済み・署名状況', value: contractsApprovedCount, color: '#4CAF50', icon: 'check' as const },
  ]

  const internalSummary = [
    { label: '承認待ち', value: internalPendingCount, color: '#2F5FD0', icon: 'file' as const },
    { label: '差し戻し中', value: internalRejectedCount, color: '#F59E42', icon: 'refresh' as const },
    { label: '承認済み・署名状況', value: internalApprovedCount, color: '#4CAF50', icon: 'check' as const },
  ]

  const ContractCard = ({
    contract,
    subTab,
    selectedIdsSet,
    toggle,
    clearConfirm,
    isInternal = false,
  }: {
    contract: Contract
    subTab: ContractSubTab
    selectedIdsSet: Set<string>
    toggle: (id: string) => void
    clearConfirm: () => void
    isInternal?: boolean
  }) => {
    const staff = contract.input_data?.staff || {}
    const f = contract.input_data?.fields || {}
    const deadline = getDeadlineAlert(contract)
    const warning = hasWarning(contract)
    const autoWarning = hasAutoCheckWarning(contract)
    const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
    const hasAnyWarning = warning || autoWarning
    const isSelected = selectedIdsSet.has(contract.id)
    const canBulkSelect = subTab === '承認待ち' && !hasAnyWarning
    const showWarningIcon = subTab === '承認待ち' && hasAnyWarning
    // 自動チェック警告の重要度で色を出し分ける（red＝赤、それ以外（yellow）＝青）。
    // SSCダッシュボードと同じ考え方（2026-07-14修正）で、管理部側にも合わせる。
    const autoWarningTone: 'red' | 'blue' = contract.warning_level === 'red' ? 'red' : 'blue'

    return (
      <article className={`${cardBase} grid gap-4 p-5 lg:grid-cols-[36px_minmax(220px,1.3fr)_minmax(220px,1.2fr)_minmax(180px,.9fr)_minmax(170px,.85fr)_minmax(160px,.75fr)_auto] lg:items-center`}>
        <div className="flex items-center">
          {canBulkSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => { toggle(contract.id); clearConfirm() }}
              onClick={e => e.stopPropagation()}
              className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
            />
          )}
          {showWarningIcon && (
            <span title="警告あり" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF3E8] text-[#F59E42]">
              <Icon name="alert" className="h-5 w-5" />
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {deadline.type && <Pill tone={deadline.type === 'overdue' ? 'red' : 'orange'}>{deadline.label}</Pill>}
            {warning && <Pill tone="orange">🔴 個別確認が必要（一括承認対象外）</Pill>}
            {autoWarning && <Pill tone={autoWarningTone}>{contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）</Pill>}
          </div>
          <p className="break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{staff.name || '-'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#6B7280]">
            <span className="break-words">{staff.department || '-'}</span>
            <span className="h-3 w-px bg-[#E8EDF5]" />
            <span>{staff.employee_number || '-'}</span>
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
            <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
            <Pill tone="blue">{getDocumentLabel(contract.document_type, contract.pattern)}</Pill>
            <ContractStatusBadge status={contract.status} isInternal={isInternal} />
            {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">雇用期間</p>
          <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{getEmployPeriodLabel(contract)}</p>
          {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
            <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B7280]">派遣期間 {f.dispatchStart} 〜 {f.dispatchEnd}</p>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">申請日時</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(contract.created_at)}</p>
          <p className="mt-1 break-words text-xs font-medium text-[#6B7280]">申請者 {contract.created_by.slice(0, 8)}</p>
        </div>

        <div className="flex items-center justify-start lg:justify-end">
          <button className={primaryButton} onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}>
            {subTab === '承認待ち' ? '内容を確認する' : '詳細を見る'}
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>

        {contract.status === '差し戻し中' && contract.rejection_reason && (
          <div className="rounded-2xl border border-[#FFE2C7] bg-[#FFF8F1] p-4 lg:col-span-7">
            <p className="text-xs font-semibold text-[#F59E42]">差し戻し理由</p>
            <p className="mt-2 break-words text-sm font-medium leading-6 text-[#1F2937]">{contract.rejection_reason}</p>
          </div>
        )}
      </article>
    )
  }

  const SubTabs = ({
    value,
    setValue,
    counts,
    clear,
  }: {
    value: ContractSubTab
    setValue: (v: ContractSubTab) => void
    counts: { pending: number; rejected: number; approved: number }
    clear: () => void
  }) => {
    const items = [
      { key: '承認待ち' as ContractSubTab, label: '承認待ち', count: counts.pending },
      { key: '差し戻し中' as ContractSubTab, label: '差し戻し', count: counts.rejected },
      { key: '承認済み' as ContractSubTab, label: '承認済み・署名状況', count: counts.approved },
    ]

    return (
      <nav className="border-b border-[#E8EDF5]">
        <div className="flex gap-8 overflow-x-auto">
          {items.map(item => {
            const active = value === item.key
            return (
              <button
                key={item.key}
                onClick={() => { setValue(item.key); clear() }}
                className={`group relative whitespace-nowrap px-1 pb-4 text-sm font-semibold transition ${active ? 'text-[#2F5FD0]' : 'text-[#1F2937] hover:text-[#2F5FD0]'}`}
              >
                {item.label}
                <span className="ml-2 text-[#6B7280]">({item.count})</span>
                <span className={`absolute bottom-[-1px] left-0 h-0.5 rounded-full bg-[#2F5FD0] transition-all duration-300 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
              </button>
            )
          })}
        </div>
      </nav>
    )
  }

  const BulkPanel = ({
    visible,
    selectedSize,
    targetsSize,
    checked,
    onSelectAll,
    onOpenConfirm,
    showConfirm,
    onApprove,
    onCancel,
    approving = false,
  }: {
    visible: boolean
    selectedSize: number
    targetsSize: number
    checked: boolean
    onSelectAll: () => void
    onOpenConfirm: () => void
    showConfirm: boolean
    onApprove: () => void
    onCancel: () => void
    approving?: boolean
  }) => {
    if (!visible) return null

    return (
      <section className="mt-5">
        <div className="flex flex-col gap-4 rounded-[18px] border border-[#E8EDF5] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,.05)] sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#1F2937]">
            <input
              type="checkbox"
              checked={checked && targetsSize > 0}
              onChange={onSelectAll}
              className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
            />
            警告のない案件をすべて選択
          </label>
          <button onClick={onOpenConfirm} disabled={selectedSize === 0} className={accentButton}>
            <Icon name="check" className="h-5 w-5" />
            一括承認する（{selectedSize}件選択中）
          </button>
        </div>

        {showConfirm && selectedSize > 0 && (
          <div className="mt-4 rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <p className="text-base font-semibold text-[#1F2937]">選択中の{selectedSize}件を一括承認しますか</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
              承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
              承認後、対象スタッフへ署名・確認依頼が自動送信されます（雇用契約書は署名、就業条件明示書は内容確認の依頼になります。対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）。
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={onApprove} disabled={approving} className={`${primaryButton} flex-1 disabled:cursor-not-allowed disabled:opacity-60`}>
                選択中の{selectedSize}件を一括承認する
              </button>
              <button onClick={onCancel} className={secondaryButton}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>
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
              <p className="mt-1 text-sm font-medium text-[#6B7280]">管理部ダッシュボード</p>
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
        <nav className="mb-6 border-b border-[#E8EDF5]">
          <div className="flex gap-8 overflow-x-auto">
            {tabs.map(tab => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1 pb-4 text-sm font-semibold transition ${active ? 'text-[#2F5FD0]' : 'text-[#1F2937] hover:text-[#2F5FD0]'}`}
                >
                  <Icon name={tab.icon} className="h-5 w-5" />
                  {tab.label}
                  {!!tab.count && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-[#2F5FD0] text-white' : 'bg-[#E74C3C] text-white'}`}>
                      {tab.count}
                    </span>
                  )}
                  <span className={`absolute bottom-[-1px] left-0 h-0.5 rounded-full bg-[#2F5FD0] transition-all duration-300 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </button>
              )
            })}
          </div>
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-6">
              <p className="mb-4 text-sm font-semibold text-[#1F2937]">対応が必要な件数（ドメイン横断）</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {overviewCards.map(card => (
                  <button
                    key={card.key}
                    onClick={() => setActiveTab(card.key)}
                    className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name={card.icon} className="h-4 w-4 text-[#6B7280]" />
                      <p className="text-sm font-semibold text-[#1F2937]">{card.label}</p>
                    </div>
                    <div className="mt-5 flex items-end gap-1">
                      <span className="text-4xl font-semibold tracking-normal text-[#2F5FD0]">{card.value}</span>
                      <span className="pb-1 text-sm font-semibold text-[#2F5FD0]">件</span>
                    </div>
                  </button>
                ))}
                {overviewPlaceholders.map(item => (
                  <div key={item.label} className="rounded-[18px] border border-[#E8EDF5] bg-white/60 p-5 opacity-60">
                    <div className="flex items-center gap-2">
                      <Icon name={item.icon} className="h-4 w-4 text-[#6B7280]" />
                      <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                    </div>
                    <p className="mt-5 text-base font-semibold text-[#6B7280]">準備中</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-6">
              <div className="grid gap-4 md:grid-cols-[1.2fr_repeat(4,1fr)]">
                {requestSummary.map((item, index) => (
                  <div key={item.label} className={`${index === 0 ? 'md:col-span-1' : ''} rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 backdrop-blur`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                        <div className="mt-5 flex items-end gap-1">
                          <span className="text-4xl font-semibold tracking-normal" style={{ color: item.color }}>{item.value}</span>
                          <span className="pb-1 text-sm font-semibold" style={{ color: item.color }}>件</span>
                        </div>
                      </div>
                      <Icon name={item.icon} className="h-6 w-6 text-[#6B7280]" />
                    </div>
                    <div className="mt-5 h-1 rounded-full bg-[#E8EDF5]">
                      <div className="h-1 w-8 rounded-full" style={{ background: item.color }} />
                    </div>
                    {index === 0 && <p className="mt-3 text-sm font-medium text-[#6B7280]">対応が必要な依頼があります</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className={`${cardBase} p-5`}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                <button onClick={resetFilters} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#2F5FD0] transition hover:border-[#2F5FD0]">
                  <Icon name="refresh" className="h-4 w-4" />
                  リセット
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.4fr_.9fr_.9fr_.7fr_.7fr]">
                <input value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="社員番号または氏名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <input value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                  placeholder="部門名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <input value={requesterFilter} onChange={e => setRequesterFilter(e.target.value)}
                  placeholder="申請者名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as any); setSystemFilter('') }}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                  <option value="">依頼種別：すべて</option>
                  <option value="staff_register">スタッフマスタ登録</option>
                  <option value="csv_import">CSVインポート</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                  <option value="pending">ステータス：未対応のみ</option>
                  <option value="all">すべて</option>
                  <option value="completed">完了済みのみ</option>
                  <option value="cancelled">取消済みのみ</option>
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {typeFilter === 'csv_import' && (
                  <select value={systemFilter} onChange={e => setSystemFilter(e.target.value)}
                    className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                    <option value="">CSVシステム：すべて</option>
                    {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <span className="text-sm font-semibold text-[#6B7280]">依頼日</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition focus:border-[#2F5FD0]" />
                <span className="text-sm font-semibold text-[#6B7280]">〜</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition focus:border-[#2F5FD0]" />
              </div>

              {statusFilter !== 'pending' && !dateFrom && !dateTo && (
                <p className="mt-3 text-xs font-medium text-[#6B7280]">
                  表示は直近{REQUEST_WINDOW_DAYS}日分です。それより前を見るには、上の「依頼日」で期間を指定してください。
                </p>
              )}
            </section>

            {reqError && <p className="text-sm font-semibold text-[#E74C3C]">{reqError}</p>}
            {reqLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}

            {!reqLoading && !reqError && visibleRequests.length === 0 && (
              <section className={`${cardBase} p-12 text-center`}>
                <p className="text-sm font-semibold text-[#1F2937]">該当する依頼はありません。</p>
              </section>
            )}

            <div className="grid gap-3">
              {visibleRequests.map(r => (
                <RequestCard key={r.id} r={r}
                  onCancel={(statusField, reasonField, reason) => handleCancelTask(r.id, statusField, reasonField, reason)} />
              ))}
            </div>

            {visibleCount < requests.length && (
              <div className="text-center">
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} className={secondaryButton}>
                  もっと見る（次の{Math.min(PAGE_SIZE, requests.length - visibleCount)}件を表示）
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="space-y-6">
            <HeroSummary title="契約一覧" description="社外案件の契約状況を確認し、承認・差し戻し・署名状況を管理できます。" items={contractSummary} />
            <SubTabs value={contractsSubTab} setValue={setContractsSubTab} counts={{ pending: contractsPendingCount, rejected: contractsRejectedCount, approved: contractsApprovedCount }} clear={() => { setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }} />
            <BulkPanel
              visible={contractsSubTab === '承認待ち' && bulkTargets.length > 0}
              selectedSize={selectedIds.size}
              targetsSize={bulkTargets.length}
              checked={selectedIds.size === bulkTargets.length}
              onSelectAll={() => { toggleSelectAll(); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
              onOpenConfirm={() => setShowBulkApproveConfirm(true)}
              showConfirm={showBulkApproveConfirm && !bulkApproving && bulkApproveDone === null}
              onApprove={handleBulkApprove}
              onCancel={() => setShowBulkApproveConfirm(false)}
              approving={bulkApproving}
            />
            {contractsError && <p className="text-sm font-semibold text-[#E74C3C]">{contractsError}</p>}
            {contractsLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}
            {!contractsLoading && !contractsError && filteredContracts.length > 0 && (
              <section className={`${cardBase} p-5 [&_button]:rounded-[16px] [&_button]:font-semibold [&_input]:rounded-[16px] [&_input]:border-[#E8EDF5] [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[16px] [&_select]:border-[#E8EDF5]`}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                {contractsToolbar}
                {contractsSubTab === '承認済み' && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!approvedSearchMode ? (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                        <button onClick={() => runApprovedSearch(contractsSearchText)} disabled={!contractsSearchText.trim() || approvedSearching}
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
            {!contractsLoading && !contractsError && filteredContracts.length === 0 && <EmptyState text="該当する契約はありません" />}
            {!contractsLoading && !contractsError && filteredContracts.length > 0 && visibleContracts.length === 0 && <EmptyState text="条件に一致する契約が見つかりませんでした" />}
            <div className="grid gap-3">
              {visibleContracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  subTab={contractsSubTab}
                  selectedIdsSet={selectedIds}
                  toggle={toggleSelect}
                  clearConfirm={() => { setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                />
              ))}
            </div>
            {contractsSubTab === '承認済み' && approvedHasMore && !approvedSearchMode && (
              <div className="flex justify-center">
                <button onClick={loadMoreApproved} disabled={approvedLoadingMore}
                  className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
                  {approvedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'internal' && isInternalApprover && (
          <div className="space-y-6">
            <section className={`${cardBase} p-6`}>
              <div className="rounded-[18px] border border-[#D7E5FF] bg-[#F5F9FF] p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2F5FD0] text-white">
                    <Icon name="shield" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold leading-7 text-[#1F2937]">
                    社内案件（APパートナーズ自社スタッフの雇用契約書）のみを表示します。SSCを通さず、社内承認者がここで直接承認・差し戻しを行います。
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <HeroSummary title="社内承認" description="社内案件の承認状況と署名状況を確認できます。" items={internalSummary} compact />
              </div>
            </section>
            <SubTabs value={internalContractsSubTab} setValue={setInternalContractsSubTab} counts={{ pending: internalPendingCount, rejected: internalRejectedCount, approved: internalApprovedCount }} clear={() => { setInternalSelectedIds(new Set()); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }} />
            <BulkPanel
              visible={internalContractsSubTab === '承認待ち' && internalBulkTargets.length > 0}
              selectedSize={internalSelectedIds.size}
              targetsSize={internalBulkTargets.length}
              checked={internalSelectedIds.size === internalBulkTargets.length}
              onSelectAll={() => { toggleSelectAllInternal(); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
              onOpenConfirm={() => setInternalShowBulkApproveConfirm(true)}
              showConfirm={internalShowBulkApproveConfirm && !internalBulkApproving && internalBulkApproveDone === null}
              onApprove={handleBulkApproveInternal}
              onCancel={() => setInternalShowBulkApproveConfirm(false)}
              approving={internalBulkApproving}
            />
            {internalContractsError && <p className="text-sm font-semibold text-[#E74C3C]">{internalContractsError}</p>}
            {internalContractsLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && (
              <section className={`${cardBase} p-5 [&_button]:rounded-[16px] [&_button]:font-semibold [&_input]:rounded-[16px] [&_input]:border-[#E8EDF5] [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[16px] [&_select]:border-[#E8EDF5]`}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                {internalToolbar}
                {internalContractsSubTab === '承認済み' && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!internalApprovedSearchMode ? (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                        <button onClick={() => runInternalApprovedSearch(internalSearchText)} disabled={!internalSearchText.trim() || internalApprovedSearching}
                          className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50">
                          {internalApprovedSearching ? '検索中…' : '全期間で検索'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">全期間検索の結果です{internalApprovedSearchNotice ? '（' + internalApprovedSearchNotice + '）' : ''}</p>
                        <button onClick={fetchInternalApprovedRecent} className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0]">
                          直近{APPROVED_WINDOW_DAYS}日の表示に戻す
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length === 0 && <EmptyState text="該当する社内案件はありません" />}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && visibleInternalContracts.length === 0 && <EmptyState text="条件に一致する社内案件が見つかりませんでした" />}
            <div className="grid gap-3">
              {visibleInternalContracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  subTab={internalContractsSubTab}
                  selectedIdsSet={internalSelectedIds}
                  toggle={toggleSelectInternal}
                  clearConfirm={() => { setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
                  isInternal
                />
              ))}
            </div>
            {internalContractsSubTab === '承認済み' && internalApprovedHasMore && !internalApprovedSearchMode && (
              <div className="flex justify-center">
                <button onClick={loadMoreInternalApproved} disabled={internalApprovedLoadingMore}
                  className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
                  {internalApprovedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'csvImport' && <PlaceholderTab title="CSVインポート" description="CSVインポートタブは未実装です。次のフェーズで実装予定です。" icon="upload" />}
        {activeTab === 'csvDiff' && <PlaceholderTab title="CSV差異アラート" description="CSV差異アラートタブは未実装です。次のフェーズで実装予定です。" icon="alert" />}
        {activeTab === 'renewal' && user && (
          <RenewalManagementTab
            candidates={renewalCandidates}
            loading={renewalLoading}
            updateCandidate={updateCandidate}
            searchCsvRenewal={searchCsvRenewal}
            requestCsvImport={requestCsvImport}
            switchToManualOverride={switchToManualOverride}
            copyDispatchToEmploy={copyDispatchToEmploy}
            bulkMarkReady={bulkMarkReady}
            confirmNotRenewing={confirmNotRenewing}
            currentUserId={user.id}
            currentUserDeptName="管理部"
          />
        )}
      </main>

      {(bulkApproving || bulkApproveDone !== null) && (
        <BulkOverlay
          loading={bulkApproving}
          doneCount={bulkApproveDone}
          skippedCount={bulkApproveSkipped}
          notifyFailedCount={bulkApproveNotifyFailed}
          onOk={handleBulkApproveDoneOk}
        />
      )}

      {(internalBulkApproving || internalBulkApproveDone !== null) && (
        <BulkOverlay
          loading={internalBulkApproving}
          doneCount={internalBulkApproveDone}
          skippedCount={internalBulkApproveSkipped}
          notifyFailedCount={internalBulkApproveNotifyFailed}
          onOk={handleBulkApproveInternalDoneOk}
        />
      )}
    </div>
  )
}

function HeroSummary({
  title,
  description,
  items,
  compact = false,
}: {
  title: string
  description: string
  items: { label: string; value: number; color: string; icon: IconName }[]
  compact?: boolean
}) {
  return (
    <section className={`${compact ? '' : 'overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-8'}`}>
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.6fr] lg:items-center">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
            <Icon name={items[0]?.icon || 'file'} className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">本日の状況</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#2F5FD0] md:text-5xl">{title}</h2>
            <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">{description}</p>
          </div>
        </div>
        <div className={`grid gap-4 ${items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-3 xl:grid-cols-6'}`}>
          {items.map(item => (
            <div key={item.label} className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                <Icon name={item.icon} className="h-6 w-6 text-[#6B7280]" />
              </div>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-normal" style={{ color: item.color }}>{item.value}</span>
                <span className="pb-1 text-base font-semibold" style={{ color: item.color }}>件</span>
              </div>
              <div className="mt-6 h-1 rounded-full bg-[#E8EDF5]">
                <div className="h-1 w-8 rounded-full" style={{ background: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <section className={`${cardBase} p-12 text-center`}>
      <Icon name="search" className="mx-auto h-10 w-10 text-[#6B7280]" />
      <p className="mt-4 text-sm font-semibold text-[#1F2937]">{text}</p>
    </section>
  )
}

function PlaceholderTab({ title, description, icon }: { title: string; description: string; icon: IconName }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-8 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
      <div className="flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
          <Icon name={icon} className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#2F5FD0]">{title}</h2>
          <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">{description}</p>
        </div>
      </div>
    </section>
  )
}

function BulkOverlay({ loading, doneCount, skippedCount = 0, notifyFailedCount = 0, onOk }: { loading: boolean; doneCount: number | null; skippedCount?: number; notifyFailedCount?: number; onOk: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,41,55,.52)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,.18)]">
        {loading ? (
          <>
            <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-[#DDE8FF] border-t-[#2F5FD0]" />
            <p className="text-lg font-semibold text-[#1F2937]">一括承認を処理しています</p>
            <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
              完了までしばらくお待ちください。画面を閉じずにお待ちください。
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF8EE] text-[#4CAF50]">
              <Icon name="check" className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold text-[#1F2937]">一括承認が完了しました（{doneCount}件）</p>
            <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
              対象スタッフへ署名の確認依頼を送信しました。
            </p>
            {skippedCount > 0 && (
              <p className="mt-3 text-sm font-medium leading-6 text-[#F59E42]">
                {skippedCount}件は、選択後に他の人が先に承認・差し戻し済みだったため、
                <br />対象から除外しました。
              </p>
            )}
            {notifyFailedCount > 0 && (
              <p className="mt-3 text-sm font-medium leading-6 text-[#E74C3C]">
                {notifyFailedCount}件は承認は完了しましたが、送信依頼メールの送信に失敗しました。
                <br />該当の契約は「SSC承認済み」のまま止まっています。管理部にご連絡ください。
              </p>
            )}
            <button onClick={onOk} className="mt-7 inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:bg-[#244CB3]">
              OK
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RequestCard({ r, onCancel }: {
  r: RequestRow
  onCancel: (statusField: 'staff_register_status' | 'csv_import_status', reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason', reason: string) => Promise<boolean>
}) {
  return (
    <article className={`${cardBase} p-5`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.15fr)_minmax(180px,.8fr)_minmax(220px,1fr)_minmax(180px,.8fr)_1.35fr] lg:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6B7280]">{r.displayDept || '-'}</p>
          <p className="mt-1 break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{r.staff_name || '-'}</p>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">社員番号</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{r.staff_code || '-'}</p>
          {r.staff_hire_date && <p className="mt-1 text-xs font-medium text-[#6B7280]">入社日 {formatDate(r.staff_hire_date)}</p>}
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">就業先</p>
          <div className="flex items-start gap-2">
            <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#2F5FD0]" />
            <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{r.client_name || '-'}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">依頼日時</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(r.requested_at)}</p>
          <p className="mb-1 mt-3 text-xs font-semibold text-[#6B7280]">申請者</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">
            {r.requested_by_name || '-'}
            {r.requested_by_dept && <span className="text-[#6B7280]">（{r.requested_by_dept}）</span>}
          </p>
        </div>

        <div className="grid gap-3">
          {r.staff_register_status && (
            <StatusRow
              label="スタッフマスタ登録"
              status={r.staff_register_status}
              cancelReason={r.staff_register_cancel_reason}
              onCancel={reason => onCancel('staff_register_status', 'staff_register_cancel_reason', reason)}
            />
          )}
          {r.csv_import_status && r.csv_import_status !== 'not_required' && (
            <StatusRow
              label={`CSVインポート${r.system_type ? `（${r.system_type}${r.dispatch_start_date ? '・派遣開始日 ' + formatDate(r.dispatch_start_date) : ''}）` : ''}`}
              status={r.csv_import_status}
              cancelReason={r.csv_import_cancel_reason}
              onCancel={reason => onCancel('csv_import_status', 'csv_import_cancel_reason', reason)}
            />
          )}
        </div>
      </div>
    </article>
  )
}

function StatusRow({ label, status, cancelReason, onCancel }: {
  label: string
  status: string
  cancelReason: string | null
  onCancel: (reason: string) => Promise<boolean>
}) {
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isDone = status === 'completed'
  const isCancelled = status === 'cancelled'
  const badgeLabel = isDone ? '完了' : isCancelled ? '取消済み' : status === 'in_progress' ? '対応中' : '未対応'
  const tone = isDone ? 'green' : isCancelled ? 'gray' : status === 'in_progress' ? 'orange' : 'red'
  const rowTone = isDone ? 'border-[#BFE7CF] bg-[#F0FBF4]' : isCancelled ? 'border-[#E8EDF5] bg-[#F8FAFD]' : 'border-[#F7C7C1] bg-[#FDECEC]'

  const submitCancel = async () => {
    if (!reasonText.trim()) { alert('取消理由を入力してください'); return }
    setSubmitting(true)
    const ok = await onCancel(reasonText.trim())
    setSubmitting(false)
    if (ok) setShowCancelForm(false)
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${rowTone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone={tone as any}>{badgeLabel}</Pill>
          <span className="break-words text-sm font-semibold text-[#1F2937]">{label}</span>
        </div>
        {status === 'pending' && !showCancelForm && (
          <button onClick={() => setShowCancelForm(true)}
            className="shrink-0 rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-xs font-semibold text-[#6B7280] transition hover:border-[#F59E42] hover:text-[#F59E42]">
            取消
          </button>
        )}
      </div>

      {isCancelled && cancelReason && (
        <p className="mt-2 break-words text-xs font-medium leading-5 text-[#6B7280]">取消理由：{cancelReason}</p>
      )}

      {showCancelForm && (
        <div className="mt-3 grid gap-3">
          <input
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="取消理由を入力"
            className="h-11 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={submitCancel} disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#F59E42] px-4 text-xs font-semibold text-white transition hover:bg-[#E88525] disabled:opacity-60">
              {submitting ? '送信中...' : 'この理由で取消する'}
            </button>
            <button onClick={() => { setShowCancelForm(false); setReasonText('') }} disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E8EDF5] bg-white px-4 text-xs font-semibold text-[#6B7280] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
