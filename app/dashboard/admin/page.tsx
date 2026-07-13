'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ContractStatus,
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
  // 表示用に後から補完する項目
  displayDept?: string | null
}

type TabType = 'requests' | 'contracts' | 'internal' | 'csvImport' | 'csvDiff' | 'renewal'

const PAGE_SIZE = 50

function formatDate(str: string | null) {
  if (!str) return ''
  const d = new Date(str)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

// ===== 契約一覧タブ（2026-07-13追加）=====
// 「SSCが出来ることは管理部もすべて出来る」という伊藤さんの明確な方針（docs/SYSTEM_DESIGN.md
// 10章2026-07-13参照）に基づき、SSCダッシュボード（app/dashboard/ssc/page.tsx）の一覧表示・
// 一括承認ロジックをそのまま流用した。当初は「閲覧のみ」として実装したが、伊藤さんから
// 「なぜ承認できないのか」と指摘を受け、承認・差し戻し・一括承認まで含めて完全に同等の
// 操作ができるよう修正した。
// 2026-07-14追加：バッジ・日付フォーマット・警告判定等はSSC・担当営業ダッシュボードと
// 完全に重複していたため、共通部品（../_shared/contractDisplay）に切り出した。
type Contract = ContractForDisplay
type ContractSubTab = '承認待ち' | '差し戻し中' | '承認済み'

// この依頼行が「未対応のタスクを1つでも持っているか」（一覧のステータス絞り込みに使う）
function isPending(r: RequestRow) {
  return r.staff_register_status === 'pending' || r.csv_import_status === 'pending'
}
// この依頼行が「取消されたタスクを1つでも持っているか」
function hasCancelled(r: RequestRow) {
  return r.staff_register_status === 'cancelled' || r.csv_import_status === 'cancelled'
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<TabType>('requests')

  // 依頼管理タブ
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [reqError, setReqError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 絞り込み条件
  const [searchText, setSearchText] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [requesterFilter, setRequesterFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'staff_register' | 'csv_import'>('')
  const [systemFilter, setSystemFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed' | 'cancelled'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 契約一覧タブ（2026-07-13追加：SSCと完全に同等の操作ができる）
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)
  const [contractsError, setContractsError] = useState('')
  const [contractsSubTab, setContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 一括承認の確認ステップ・処理中・完了表示（SSCダッシュボードと同じUXをそのまま流用）
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkApproveDone, setBulkApproveDone] = useState<number | null>(null)

  // 社内承認タブ（2026-07-13追加：フェーズ3）。管理部の中でも「社内承認者」フラグ
  // （user_metadata.is_internal_approver === true）を持つ人にだけ表示・利用させる。
  // staff_rolesテーブル本格実装（フェーズ2.5）を待たず、伊藤さんと相談のうえ、
  // 既存のuser_metadataに軽量なフラグを追加する方式を採用した（10章2026-07-13参照）。
  const [internalContracts, setInternalContracts] = useState<Contract[]>([])
  const [internalContractsLoading, setInternalContractsLoading] = useState(true)
  const [internalContractsError, setInternalContractsError] = useState('')
  const [internalContractsSubTab, setInternalContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set())
  const [internalShowBulkApproveConfirm, setInternalShowBulkApproveConfirm] = useState(false)
  const [internalBulkApproving, setInternalBulkApproving] = useState(false)
  const [internalBulkApproveDone, setInternalBulkApproveDone] = useState<number | null>(null)

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

  // 契約一覧の取得（SSCダッシュボードと同じクエリ・同じ「社内除外」条件。管理部もSSCと
  // 同じ範囲＝社内以外の契約を閲覧・操作できるようにする。社内案件の可視化・承認は
  // 「社内承認」タブ実装（次フェーズ）とあわせて別途対応する）
  useEffect(() => {
    if (!user) return
    const loadContracts = async () => {
      setContractsLoading(true)
      setContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_at, rejection_reason, signed_at, warning_confirmations, warning_level, input_data')
        .neq('work_place', '社内')
        .order('created_at', { ascending: false })
      if (error) { setContractsError('契約一覧の取得に失敗しました。（' + error.message + '）'); setContractsLoading(false); return }
      setContracts((data || []) as Contract[])
      setContractsLoading(false)
    }
    loadContracts()
  }, [user])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 一括承認処理（SSCダッシュボードのhandleBulkApproveと同一ロジック。2026-07-13追加）
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
    if (error) {
      alert('一括承認に失敗しました: ' + error.message)
      setBulkApproving(false)
      return
    }
    await Promise.all(
      ids.map(id =>
        fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST' }).catch(() => {})
      )
    )
    const { data: refreshed } = await supabase
      .from('contracts')
      .select('id, status')
      .in('id', ids)
    const statusMap = new Map((refreshed || []).map(r => [r.id, r.status as ContractStatus]))
    setContracts(prev => prev.map(c => statusMap.has(c.id) ? { ...c, status: statusMap.get(c.id)! } : c))
    setBulkApproving(false)
    setBulkApproveDone(ids.length)
  }

  const handleBulkApproveDoneOk = () => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
  }

  // 社内承認タブ：社内案件（work_place='社内'）の取得。フラグを持つ人のみ取得する
  // （画面側での制御。contractsテーブルのRLSは現状「認証済みなら誰でも」のままなので、
  // DBレベルの制限ではない点は他のロール分けと同じ。10章2026-07-13参照）
  useEffect(() => {
    if (!user) return
    if (user.user_metadata?.is_internal_approver !== true) { setInternalContractsLoading(false); return }
    const loadInternalContracts = async () => {
      setInternalContractsLoading(true)
      setInternalContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_at, rejection_reason, signed_at, warning_confirmations, warning_level, input_data')
        .eq('work_place', '社内')
        .order('created_at', { ascending: false })
      if (error) { setInternalContractsError('社内案件の取得に失敗しました。（' + error.message + '）'); setInternalContractsLoading(false); return }
      setInternalContracts((data || []) as Contract[])
      setInternalContractsLoading(false)
    }
    loadInternalContracts()
  }, [user])

  const toggleSelectInternal = (id: string) => {
    setInternalSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 社内案件の一括承認（雇用契約書＝パターンAのみのため、確認文言はSSC/契約一覧タブより単純化）
  const handleBulkApproveInternal = async () => {
    if (internalSelectedIds.size === 0 || internalBulkApproving) return
    setInternalBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(internalSelectedIds)
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
    if (error) {
      alert('一括承認に失敗しました: ' + error.message)
      setInternalBulkApproving(false)
      return
    }
    await Promise.all(
      ids.map(id =>
        fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST' }).catch(() => {})
      )
    )
    const { data: refreshed } = await supabase
      .from('contracts')
      .select('id, status')
      .in('id', ids)
    const statusMap = new Map((refreshed || []).map(r => [r.id, r.status as ContractStatus]))
    setInternalContracts(prev => prev.map(c => statusMap.has(c.id) ? { ...c, status: statusMap.get(c.id)! } : c))
    setInternalBulkApproving(false)
    setInternalBulkApproveDone(ids.length)
  }

  const handleBulkApproveInternalDoneOk = () => {
    setInternalSelectedIds(new Set())
    setInternalShowBulkApproveConfirm(false)
    setInternalBulkApproveDone(null)
  }

  // 依頼一覧の取得（絞り込み条件が変わるたびに再取得。件数はもっと見るで増やす）
  useEffect(() => {
    if (!user) return
    const loadRequests = async () => {
      setReqLoading(true)
      setReqError('')
      try {
        let query = supabase.from('requests').select('*').order('requested_at', { ascending: false }).limit(500)

        if (searchText) {
          query = query.or(`staff_name.ilike.%${searchText}%,staff_code.ilike.%${searchText}%`)
        }
        // 依頼種別は request_type 列そのものではなく「該当タスクが実在するか」で絞り込む。
        // request_type='staff_register' の依頼でも「CSVインポートも同時に依頼する」がオンなら
        // csv_import_status も入っているため、request_type だけで絞ると同時依頼分を取りこぼす。
        if (systemFilter) query = query.eq('system_type', systemFilter)
        if (requesterFilter) query = query.ilike('requested_by_name', `%${requesterFilter}%`)
        if (dateFrom) query = query.gte('requested_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = query.lte('requested_at', `${dateTo}T23:59:59`)

        const { data, error } = await query
        if (error) { setReqError('依頼一覧の取得に失敗しました。（' + error.message + '）'); setReqLoading(false); return }

        let rows = (data || []) as RequestRow[]

        if (typeFilter === 'staff_register') rows = rows.filter(r => !!r.staff_register_status)
        if (typeFilter === 'csv_import') rows = rows.filter(r => !!r.csv_import_status && r.csv_import_status !== 'not_required')

        // staff_register型は入力済みのstaff_deptをそのまま表示用部門名にする
        // csv_import型はstaff_idからstaff→department_masterを引いて表示用部門名を補完する
        // （requestsテーブルには外部キー制約が無いため、PostgRESTの自動結合は使えず別クエリで取得する）
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

  const resetFilters = () => {
    setSearchText(''); setDeptFilter(''); setRequesterFilter(''); setTypeFilter(''); setSystemFilter('')
    setStatusFilter('pending'); setDateFrom(''); setDateTo('')
  }

  const pendingTotalCount = requests.filter(isPending).length
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
    if (error) { alert('取消の保存に失敗しました。（' + error.message + '）'); return false }
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, [statusField]: 'cancelled', [reasonField]: reason } : r))
    return true
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 2026-07-14追加：「承認済み」に案件が蓄積すると署名待ち・署名済みが混在して分かりづらい、
  // 絞り込み・並び替えが無く目当ての案件を探しにくい、という伊藤さんの指摘を受けて、共通部品
  // （useContractListToolbar）による絞り込み・並び替え・検索を追加した（docs/SYSTEM_DESIGN.md
  // 10章2026-07-14参照）。Hooksはルール上、早期return（if (!user) return、この少し下にある）より
  // 前で呼ぶ必要があるため、この位置に置く。
  const filteredContracts = contracts.filter(c => {
    if (contractsSubTab === '承認待ち') return c.status === '申請中'
    if (contractsSubTab === '差し戻し中') return c.status === '差し戻し中'
    if (contractsSubTab === '承認済み') return ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)
    return false
  })
  const contractsPendingCount = contracts.filter(c => c.status === '申請中').length
  const contractsRejectedCount = contracts.filter(c => c.status === '差し戻し中').length
  const contractsApprovedCount = contracts.filter(c => ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)).length

  const { result: visibleContracts, toolbar: contractsToolbar } = useContractListToolbar(filteredContracts, {
    statusOptions: contractsSubTab === '承認済み'
      ? [
          { value: 'SSC承認済み', label: 'SSC承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
          { value: '完了', label: '完了' },
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

  // 一括承認対象（承認待ちタブで、警告のない案件のみ。SSCダッシュボードと同じ条件。
  // 絞り込み・検索後の一覧＝画面に見えている案件を対象にする）
  const bulkTargets = visibleContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAll = () => {
    if (selectedIds.size === bulkTargets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bulkTargets.map(c => c.id)))
    }
  }

  // 社内承認タブ用の集計（契約一覧タブと同じロジックをinternalContractsに対して適用）
  const filteredInternalContracts = internalContracts.filter(c => {
    if (internalContractsSubTab === '承認待ち') return c.status === '申請中'
    if (internalContractsSubTab === '差し戻し中') return c.status === '差し戻し中'
    if (internalContractsSubTab === '承認済み') return ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)
    return false
  })
  const internalPendingCount = internalContracts.filter(c => c.status === '申請中').length
  const internalRejectedCount = internalContracts.filter(c => c.status === '差し戻し中').length
  const internalApprovedCount = internalContracts.filter(c => ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)).length

  const { result: visibleInternalContracts, toolbar: internalToolbar } = useContractListToolbar(filteredInternalContracts, {
    statusOptions: internalContractsSubTab === '承認済み'
      ? [
          { value: 'SSC承認済み', label: 'SSC承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
          { value: '完了', label: '完了' },
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

  const internalBulkTargets = visibleInternalContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAllInternal = () => {
    if (internalSelectedIds.size === internalBulkTargets.length) {
      setInternalSelectedIds(new Set())
    } else {
      setInternalSelectedIds(new Set(internalBulkTargets.map(c => c.id)))
    }
  }

  if (!user) return <div className="p-8">読み込み中...</div>

  const isInternalApprover = user.user_metadata?.is_internal_approver === true

  const tabs: { key: TabType; label: string }[] = [
    { key: 'requests', label: '依頼管理' },
    { key: 'contracts', label: '契約一覧' },
    ...(isInternalApprover ? [{ key: 'internal' as TabType, label: '社内承認' }] : []),
    { key: 'csvImport', label: 'CSVインポート' },
    { key: 'csvDiff', label: 'CSV差異アラート' },
    { key: 'renewal', label: '更新期限管理' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>管理部ダッシュボード</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-sm px-4 py-2 rounded-lg border transition-all"
            style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* タブバー */}
        <div className="flex gap-0.5 bg-white rounded-t-lg border border-b-0 overflow-hidden" style={{ borderColor: '#E3E8F4' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="px-5 py-3 text-sm transition-colors flex items-center gap-2"
              style={{
                fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? '#1B3A8C' : '#A8B3C9',
                borderBottom: activeTab === t.key ? '2px solid #1B3A8C' : '2px solid transparent',
              }}>
              {t.label}
              {t.key === 'requests' && pendingTotalCount > 0 && (
                <span className="text-white text-xs rounded-full px-2 py-0.5" style={{ background: '#DC2626' }}>{pendingTotalCount}</span>
              )}
              {t.key === 'internal' && internalPendingCount > 0 && (
                <span className="text-white text-xs rounded-full px-2 py-0.5" style={{ background: '#DC2626' }}>{internalPendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white border rounded-b-lg p-6" style={{ borderColor: '#E3E8F4' }}>
          {activeTab === 'requests' && (
            <div>
              {/* 絞り込み枠 */}
              <div className="rounded-lg border p-3 mb-4" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <div className="flex items-center justify-between mb-2 pb-2 border-b" style={{ borderColor: '#D0DAF0' }}>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B3A8C" strokeWidth={2.5}>
                      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="text-xs font-semibold" style={{ color: '#1B3A8C' }}>絞り込み</span>
                  </div>
                  <button onClick={resetFilters}
                    className="text-xs px-3 py-1 rounded-md border bg-white"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>リセット</button>
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  <input value={searchText} onChange={e => setSearchText(e.target.value)}
                    placeholder="社員番号または氏名で検索（例）100001 or 山田"
                    className="flex-1 min-w-[220px] text-xs px-3 py-2 rounded-md border focus:outline-none"
                    style={{ borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
                  <input value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    placeholder="部門名で検索（空欄ですべて）"
                    className="text-xs px-3 py-2 rounded-md border focus:outline-none"
                    style={{ width: 180, borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
                  <input value={requesterFilter} onChange={e => setRequesterFilter(e.target.value)}
                    placeholder="申請者名で検索（空欄ですべて）"
                    className="text-xs px-3 py-2 rounded-md border focus:outline-none"
                    style={{ width: 180, borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
                  <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as any); setSystemFilter('') }}
                    className="text-xs px-3 py-2 rounded-md border bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                    <option value="">依頼種別：すべて</option>
                    <option value="staff_register">スタッフマスタ登録</option>
                    <option value="csv_import">CSVインポート</option>
                  </select>
                  {typeFilter === 'csv_import' && (
                    <select value={systemFilter} onChange={e => setSystemFilter(e.target.value)}
                      className="text-xs px-3 py-2 rounded-md border bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                      <option value="">CSVシステム：すべて</option>
                      {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                    className="text-xs px-3 py-2 rounded-md border bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                    <option value="pending">ステータス：未対応のみ</option>
                    <option value="all">すべて（未対応・完了・取消済み）</option>
                    <option value="completed">完了済みのみ</option>
                    <option value="cancelled">取消済みのみ</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs whitespace-nowrap" style={{ color: '#5A6A8A' }}>依頼日</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-md border" style={{ width: 130, borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
                  <span className="text-xs" style={{ color: '#5A6A8A' }}>〜</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-md border" style={{ width: 130, borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
                </div>
              </div>

              {reqError && <p className="text-xs mb-3" style={{ color: '#DC2626' }}>{reqError}</p>}
              {reqLoading && <p className="text-xs" style={{ color: '#5A6A8A' }}>読み込み中...</p>}

              {!reqLoading && !reqError && visibleRequests.length === 0 && (
                <p className="text-xs" style={{ color: '#5A6A8A' }}>該当する依頼はありません。</p>
              )}

              <div className="flex flex-col gap-3">
                {visibleRequests.map(r => (
                  <RequestCard key={r.id} r={r}
                    onCancel={(statusField, reasonField, reason) => handleCancelTask(r.id, statusField, reasonField, reason)} />
                ))}
              </div>

              {visibleCount < requests.length && (
                <div className="text-center pt-3">
                  <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    className="text-xs px-4 py-2 rounded-md border bg-white"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                    もっと見る（次の{Math.min(PAGE_SIZE, requests.length - visibleCount)}件を表示）
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'contracts' && (
            <div>
              <p className="text-xs mb-4" style={{ color: '#5A6A8A' }}>
                SSCダッシュボードと同じ範囲（社内案件を除く）の契約状況を確認できます。承認・差し戻し・一括承認もSSCと同様に行えます。
              </p>

              {/* 一括承認バー（承認待ちタブのみ。SSCダッシュボードと同じUI・ロジック） */}
              {contractsSubTab === '承認待ち' && bulkTargets.length > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between items-center px-4 py-3 bg-white rounded-xl border" style={{ borderColor: '#D0DAF0' }}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === bulkTargets.length && bulkTargets.length > 0}
                        onChange={() => { toggleSelectAll(); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                        className="w-4 h-4 cursor-pointer"
                        style={{ accentColor: '#1B3A8C' }}
                      />
                      <span className="text-sm" style={{ color: '#5A6A8A' }}>警告なし案件をすべて選択</span>
                    </label>
                    <button
                      onClick={() => setShowBulkApproveConfirm(true)}
                      disabled={selectedIds.size === 0}
                      className="text-sm font-medium px-5 py-2 rounded-lg transition-all"
                      style={{
                        background: selectedIds.size > 0 ? '#1B3A8C' : '#D1D5DB',
                        color: 'white',
                        cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                      }}>
                      ✅ 一括承認（{selectedIds.size}件）
                    </button>
                  </div>

                  {showBulkApproveConfirm && selectedIds.size > 0 && !bulkApproving && bulkApproveDone === null && (
                    <div className="mt-3 rounded-xl p-4 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
                      <p className="text-sm font-bold mb-2" style={{ color: '#065F46' }}>
                        ✅ 選択中の{selectedIds.size}件を本当に一括承認してよいですか？
                      </p>
                      <p className="text-sm mb-3 leading-relaxed" style={{ color: '#1A2340' }}>
                        承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                        承認後、対象スタッフへ署名・確認依頼が自動送信されます（雇用契約書は署名、就業条件明示書は内容確認の依頼になります。対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）。
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleBulkApprove}
                          className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                          style={{ background: '#1B3A8C' }}>
                          選択中の{selectedIds.size}件を一括承認する
                        </button>
                        <button
                          onClick={() => setShowBulkApproveConfirm(false)}
                          className="px-4 py-2.5 rounded-lg text-sm border"
                          style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* サブタブ */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {([
                  { key: '承認待ち' as ContractSubTab, count: contractsPendingCount, color: '#1D4ED8', tint: '#EEF0F5' },
                  { key: '差し戻し中' as ContractSubTab, count: contractsRejectedCount, color: '#B91C1C', tint: '#FEE2E2' },
                  { key: '承認済み' as ContractSubTab, count: contractsApprovedCount, color: '#065F46', tint: '#D1FAE5' },
                ]).map(tab => {
                  const isActive = contractsSubTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => { setContractsSubTab(tab.key); setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                      className="text-left rounded-xl px-4 py-3.5 transition-all"
                      style={isActive
                        ? { background: tab.tint, borderLeft: `3px solid ${tab.color}`, borderTop: '0.5px solid #D0DAF0', borderRight: '0.5px solid #D0DAF0', borderBottom: '0.5px solid #D0DAF0' }
                        : { background: 'white', border: '0.5px solid #D0DAF0' }}>
                      <p className="text-xs font-medium" style={{ color: isActive ? tab.color : '#5A6A8A' }}>{tab.key}</p>
                      <span className="text-2xl font-bold" style={{ color: isActive ? tab.color : '#1A2340' }}>{tab.count}</span>
                    </button>
                  )
                })}
              </div>

              {contractsError && <p className="text-xs mb-3" style={{ color: '#DC2626' }}>{contractsError}</p>}
              {contractsLoading && <p className="text-xs" style={{ color: '#5A6A8A' }}>読み込み中...</p>}

              {/* 絞り込み・並び替え・検索（2026-07-14追加） */}
              {!contractsLoading && !contractsError && filteredContracts.length > 0 && contractsToolbar}

              {!contractsLoading && !contractsError && filteredContracts.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>該当する契約はありません</p>
                </div>
              )}
              {!contractsLoading && !contractsError && filteredContracts.length > 0 && visibleContracts.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>条件に一致する契約が見つかりませんでした</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {visibleContracts.map(contract => {
                  const staff = contract.input_data?.staff || {}
                  const f = contract.input_data?.fields || {}
                  const deadline = getDeadlineAlert(contract)
                  const warning = hasWarning(contract)
                  const autoWarning = hasAutoCheckWarning(contract)
                  const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
                  const leftBorderColor = deadline.type === 'overdue' ? '#EA580C' : deadline.type === 'urgent' ? '#F97316' : 'transparent'
                  // SSCダッシュボードと表示内容・操作を完全一致させる（2026-07-13追記：伊藤さん指摘。
                  // 「SSCが出来ることは管理部もすべて出来る」という方針のため、一括承認のチェックボックスも
                  // SSCと同じ条件で表示する）
                  const hasAnyWarning = warning || autoWarning
                  const warningColor = (warning || contract.warning_level === 'red') ? '#DC2626' : '#D97706'
                  const isSelected = selectedIds.has(contract.id)
                  const canBulkSelect = contractsSubTab === '承認待ち' && !hasAnyWarning
                  const showWarningIcon = contractsSubTab === '承認待ち' && hasAnyWarning

                  return (
                    <div key={contract.id} className="bg-white rounded-xl overflow-hidden"
                      style={{ border: '0.5px solid #D0DAF0', borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0' }}>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3">
                            {/* チェックボックス（警告なし案件・承認待ちタブのみ。SSCダッシュボードと同じ） */}
                            {canBulkSelect && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => { toggleSelect(contract.id); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 mt-5 flex-shrink-0 cursor-pointer"
                                style={{ accentColor: '#1B3A8C' }}
                              />
                            )}
                            {/* 警告アイコン（チェックボックスの代わりに表示。SSCダッシュボードと同じ） */}
                            {showWarningIcon && (
                              <span
                                title="警告あり（一括承認対象外）"
                                className="w-4 h-4 mt-5 flex-shrink-0 rounded flex items-center justify-center"
                                style={{ background: warningColor }}>
                                <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>!</span>
                              </span>
                            )}
                            <div>
                              <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                                <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                                <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
                              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                                {getDocumentLabel(contract.document_type, contract.pattern)}
                              </span>
                              <span style={{ display: 'inline-block', width: '1px', height: '14px', background: '#D0DAF0', margin: '0 2px' }} />
                              <ContractStatusBadge status={contract.status} />
                            </div>
                            {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
                            <div className="flex items-center gap-2">
                              {warning && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#DC2626', color: 'white' }}>
                                  🔴 個別確認が必要（一括承認対象外）
                                </span>
                              )}
                              {autoWarning && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded"
                                  style={{ background: contract.warning_level === 'red' ? '#DC2626' : '#D97706', color: 'white' }}>
                                  {contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）
                                </span>
                              )}
                              {/* 申請者名（フェーズ2で氏名表示に切り替え予定。SSCと同じ暫定表示） */}
                              <span className="text-xs" style={{ color: '#5A6A8A' }}>申請者：{contract.created_by.slice(0, 8)}…</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-3" style={{ background: '#F5F7FC' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm flex-shrink-0" style={{ color: '#1B3A8C' }}>📍</span>
                            <span className="text-sm" style={{ color: '#1A2340', wordBreak: 'break-all' }}>{f.workLocationName || '―'}</span>
                          </div>
                          {deadline.type && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                              style={{ background: deadline.type === 'overdue' ? '#FFEDD5' : '#FFF7ED', color: deadline.type === 'overdue' ? '#9A3412' : '#C2410C' }}>
                              ⚠ {deadline.label}
                            </span>
                          )}
                        </div>

                        <div className="flex items-start gap-6 flex-wrap">
                          <div>
                            <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>申請日時</p>
                            <p className="text-xs" style={{ color: '#1A2340' }}>{formatDateTime(contract.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>雇用期間</p>
                            <p className="text-xs" style={{ color: '#1A2340' }}>{getEmployPeriodLabel(contract)}</p>
                          </div>
                          {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
                            <div>
                              <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>派遣期間</p>
                              <p className="text-xs" style={{ color: '#1A2340' }}>{f.dispatchStart} 〜 {f.dispatchEnd}</p>
                            </div>
                          )}
                        </div>

                        {contract.status === '差し戻し中' && contract.rejection_reason && (
                          <div className="mt-3 rounded-lg px-3 py-2 border-l-4" style={{ background: '#FEF2F2', borderColor: '#B91C1C' }}>
                            <p className="text-xs font-medium mb-0.5" style={{ color: '#B91C1C' }}>差し戻し理由</p>
                            <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>{contract.rejection_reason}</p>
                          </div>
                        )}

                        {/* 内容を確認する／詳細を見る（2026-07-13追加：SSCの契約詳細画面を管理部にも開放。
                            SSCと同じく、承認待ちタブでは承認・差し戻し操作もそのままこの遷移先で行える） */}
                        <button
                          className="mt-3.5 flex items-center gap-1.5 rounded-full transition-all"
                          style={{ background: '#1B3A8C', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
                          onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}>
                          <span className="text-xs font-medium text-white">
                            {contractsSubTab === '承認待ち' ? '内容を確認する' : '詳細を見る'}
                          </span>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'internal' && isInternalApprover && (
            <div>
              <p className="text-xs mb-4" style={{ color: '#5A6A8A' }}>
                社内案件（APパートナーズ自社スタッフの雇用契約書）のみを表示します。SSCを通さず、社内承認者がここで直接承認・差し戻しを行います。
              </p>

              {/* 一括承認バー（承認待ちタブのみ） */}
              {internalContractsSubTab === '承認待ち' && internalBulkTargets.length > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between items-center px-4 py-3 bg-white rounded-xl border" style={{ borderColor: '#D0DAF0' }}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={internalSelectedIds.size === internalBulkTargets.length && internalBulkTargets.length > 0}
                        onChange={() => { toggleSelectAllInternal(); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
                        className="w-4 h-4 cursor-pointer"
                        style={{ accentColor: '#1B3A8C' }}
                      />
                      <span className="text-sm" style={{ color: '#5A6A8A' }}>警告なし案件をすべて選択</span>
                    </label>
                    <button
                      onClick={() => setInternalShowBulkApproveConfirm(true)}
                      disabled={internalSelectedIds.size === 0}
                      className="text-sm font-medium px-5 py-2 rounded-lg transition-all"
                      style={{
                        background: internalSelectedIds.size > 0 ? '#1B3A8C' : '#D1D5DB',
                        color: 'white',
                        cursor: internalSelectedIds.size > 0 ? 'pointer' : 'not-allowed',
                      }}>
                      ✅ 一括承認（{internalSelectedIds.size}件）
                    </button>
                  </div>

                  {internalShowBulkApproveConfirm && internalSelectedIds.size > 0 && !internalBulkApproving && internalBulkApproveDone === null && (
                    <div className="mt-3 rounded-xl p-4 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
                      <p className="text-sm font-bold mb-2" style={{ color: '#065F46' }}>
                        ✅ 選択中の{internalSelectedIds.size}件を本当に一括承認してよいですか？
                      </p>
                      <p className="text-sm mb-3 leading-relaxed" style={{ color: '#1A2340' }}>
                        承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                        承認後、対象スタッフへ署名依頼が自動送信されます。
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleBulkApproveInternal}
                          className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                          style={{ background: '#1B3A8C' }}>
                          選択中の{internalSelectedIds.size}件を一括承認する
                        </button>
                        <button
                          onClick={() => setInternalShowBulkApproveConfirm(false)}
                          className="px-4 py-2.5 rounded-lg text-sm border"
                          style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* サブタブ */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {([
                  { key: '承認待ち' as ContractSubTab, count: internalPendingCount, color: '#1D4ED8', tint: '#EEF0F5' },
                  { key: '差し戻し中' as ContractSubTab, count: internalRejectedCount, color: '#B91C1C', tint: '#FEE2E2' },
                  { key: '承認済み' as ContractSubTab, count: internalApprovedCount, color: '#065F46', tint: '#D1FAE5' },
                ]).map(tab => {
                  const isActive = internalContractsSubTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => { setInternalContractsSubTab(tab.key); setInternalSelectedIds(new Set()); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
                      className="text-left rounded-xl px-4 py-3.5 transition-all"
                      style={isActive
                        ? { background: tab.tint, borderLeft: `3px solid ${tab.color}`, borderTop: '0.5px solid #D0DAF0', borderRight: '0.5px solid #D0DAF0', borderBottom: '0.5px solid #D0DAF0' }
                        : { background: 'white', border: '0.5px solid #D0DAF0' }}>
                      <p className="text-xs font-medium" style={{ color: isActive ? tab.color : '#5A6A8A' }}>{tab.key}</p>
                      <span className="text-2xl font-bold" style={{ color: isActive ? tab.color : '#1A2340' }}>{tab.count}</span>
                    </button>
                  )
                })}
              </div>

              {internalContractsError && <p className="text-xs mb-3" style={{ color: '#DC2626' }}>{internalContractsError}</p>}
              {internalContractsLoading && <p className="text-xs" style={{ color: '#5A6A8A' }}>読み込み中...</p>}

              {/* 絞り込み・並び替え・検索（2026-07-14追加） */}
              {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && internalToolbar}

              {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>該当する社内案件はありません</p>
                </div>
              )}
              {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && visibleInternalContracts.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>条件に一致する社内案件が見つかりませんでした</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {visibleInternalContracts.map(contract => {
                  const staff = contract.input_data?.staff || {}
                  const f = contract.input_data?.fields || {}
                  const deadline = getDeadlineAlert(contract)
                  const warning = hasWarning(contract)
                  const autoWarning = hasAutoCheckWarning(contract)
                  const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
                  const leftBorderColor = deadline.type === 'overdue' ? '#EA580C' : deadline.type === 'urgent' ? '#F97316' : 'transparent'
                  const hasAnyWarning = warning || autoWarning
                  const warningColor = (warning || contract.warning_level === 'red') ? '#DC2626' : '#D97706'
                  const isSelected = internalSelectedIds.has(contract.id)
                  const canBulkSelect = internalContractsSubTab === '承認待ち' && !hasAnyWarning
                  const showWarningIcon = internalContractsSubTab === '承認待ち' && hasAnyWarning

                  return (
                    <div key={contract.id} className="bg-white rounded-xl overflow-hidden"
                      style={{ border: '0.5px solid #D0DAF0', borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0' }}>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3">
                            {canBulkSelect && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => { toggleSelectInternal(contract.id); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 mt-5 flex-shrink-0 cursor-pointer"
                                style={{ accentColor: '#1B3A8C' }}
                              />
                            )}
                            {showWarningIcon && (
                              <span
                                title="警告あり（一括承認対象外）"
                                className="w-4 h-4 mt-5 flex-shrink-0 rounded flex items-center justify-center"
                                style={{ background: warningColor }}>
                                <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>!</span>
                              </span>
                            )}
                            <div>
                              <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                                <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                                <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
                              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                                {getDocumentLabel(contract.document_type, contract.pattern)}
                              </span>
                              <span style={{ display: 'inline-block', width: '1px', height: '14px', background: '#D0DAF0', margin: '0 2px' }} />
                              <ContractStatusBadge status={contract.status} isInternal />
                            </div>
                            {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
                            <div className="flex items-center gap-2">
                              {warning && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#DC2626', color: 'white' }}>
                                  🔴 個別確認が必要（一括承認対象外）
                                </span>
                              )}
                              {autoWarning && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded"
                                  style={{ background: contract.warning_level === 'red' ? '#DC2626' : '#D97706', color: 'white' }}>
                                  {contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）
                                </span>
                              )}
                              <span className="text-xs" style={{ color: '#5A6A8A' }}>申請者：{contract.created_by.slice(0, 8)}…</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-3" style={{ background: '#F5F7FC' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm flex-shrink-0" style={{ color: '#1B3A8C' }}>📍</span>
                            <span className="text-sm" style={{ color: '#1A2340', wordBreak: 'break-all' }}>{f.workLocationName || '―'}</span>
                          </div>
                          {deadline.type && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                              style={{ background: deadline.type === 'overdue' ? '#FFEDD5' : '#FFF7ED', color: deadline.type === 'overdue' ? '#9A3412' : '#C2410C' }}>
                              ⚠ {deadline.label}
                            </span>
                          )}
                        </div>

                        <div className="flex items-start gap-6 flex-wrap">
                          <div>
                            <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>申請日時</p>
                            <p className="text-xs" style={{ color: '#1A2340' }}>{formatDateTime(contract.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>雇用期間</p>
                            <p className="text-xs" style={{ color: '#1A2340' }}>{getEmployPeriodLabel(contract)}</p>
                          </div>
                        </div>

                        {contract.status === '差し戻し中' && contract.rejection_reason && (
                          <div className="mt-3 rounded-lg px-3 py-2 border-l-4" style={{ background: '#FEF2F2', borderColor: '#B91C1C' }}>
                            <p className="text-xs font-medium mb-0.5" style={{ color: '#B91C1C' }}>差し戻し理由</p>
                            <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>{contract.rejection_reason}</p>
                          </div>
                        )}

                        <button
                          className="mt-3.5 flex items-center gap-1.5 rounded-full transition-all"
                          style={{ background: '#1B3A8C', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
                          onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}>
                          <span className="text-xs font-medium text-white">
                            {internalContractsSubTab === '承認待ち' ? '内容を確認する' : '詳細を見る'}
                          </span>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'csvImport' && (
            <p className="text-sm" style={{ color: '#5A6A8A' }}>CSVインポートタブは未実装です（次のフェーズで実装予定）。</p>
          )}
          {activeTab === 'csvDiff' && (
            <p className="text-sm" style={{ color: '#5A6A8A' }}>CSV差異アラートタブは未実装です（次のフェーズで実装予定）。</p>
          )}
          {activeTab === 'renewal' && (
            <p className="text-sm" style={{ color: '#5A6A8A' }}>更新期限管理タブは未実装です（次のフェーズで実装予定）。</p>
          )}
        </div>
      </main>

      {/* 一括承認：処理中／完了の全画面オーバーレイ（SSCダッシュボードと同じ。2026-07-13追加） */}
      {(bulkApproving || bulkApproveDone !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,64,0.6)' }}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            {bulkApproving ? (
              <>
                <div className="mx-auto mb-5 w-14 h-14 rounded-full border-4 animate-spin"
                  style={{ borderColor: '#1B3A8C', borderTopColor: 'transparent' }} />
                <p className="text-lg font-bold mb-2" style={{ color: '#1A2340' }}>一括承認処理中です</p>
                <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                  しばらくお待ちください。<br />
                  画面を閉じたり、戻ったりしないでください。
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl mb-3">✅</p>
                <p className="text-lg font-bold mb-2" style={{ color: '#065F46' }}>
                  一括承認が完了しました（{bulkApproveDone}件）
                </p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#1A2340' }}>
                  対象スタッフへ署名・確認依頼が自動送信されました。<br />
                  （対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）
                </p>
                <button
                  onClick={handleBulkApproveDoneOk}
                  className="w-full py-3 rounded-lg text-base font-bold text-white"
                  style={{ background: '#1B3A8C' }}>
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 社内承認タブの一括承認：処理中／完了の全画面オーバーレイ（2026-07-13追加・フェーズ3） */}
      {(internalBulkApproving || internalBulkApproveDone !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,64,0.6)' }}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            {internalBulkApproving ? (
              <>
                <div className="mx-auto mb-5 w-14 h-14 rounded-full border-4 animate-spin"
                  style={{ borderColor: '#1B3A8C', borderTopColor: 'transparent' }} />
                <p className="text-lg font-bold mb-2" style={{ color: '#1A2340' }}>一括承認処理中です</p>
                <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                  しばらくお待ちください。<br />
                  画面を閉じたり、戻ったりしないでください。
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl mb-3">✅</p>
                <p className="text-lg font-bold mb-2" style={{ color: '#065F46' }}>
                  一括承認が完了しました（{internalBulkApproveDone}件）
                </p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#1A2340' }}>
                  対象スタッフへ署名依頼が自動送信されました。
                </p>
                <button
                  onClick={handleBulkApproveInternalDoneOk}
                  className="w-full py-3 rounded-lg text-base font-bold text-white"
                  style={{ background: '#1B3A8C' }}>
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


function RequestCard({ r, onCancel }: {
  r: RequestRow
  onCancel: (statusField: 'staff_register_status' | 'csv_import_status', reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason', reason: string) => Promise<boolean>
}) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: '#D0DAF0' }}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-xs" style={{ color: '#5A6A8A' }}>
            {r.displayDept ? `${r.displayDept}　` : ''}社員番号：{r.staff_code || '―'}
          </p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: '#1A2340' }}>{r.staff_name || '―'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: '#A8B3C9' }}>依頼日</p>
          <p className="text-xs" style={{ color: '#5A6A8A' }}>{formatDateTime(r.requested_at)}</p>
          {r.requested_by_name && (
            <p className="text-[11px] mt-0.5" style={{ color: '#5A6A8A' }}>
              申請者：{r.requested_by_name}{r.requested_by_dept ? `（${r.requested_by_dept}）` : ''}
            </p>
          )}
        </div>
      </div>

      {r.request_type === 'staff_register' && (
        <div className="flex gap-4 flex-wrap text-xs mb-3" style={{ color: '#5A6A8A' }}>
          {r.staff_hire_date && <span>入社日：{formatDate(r.staff_hire_date)}</span>}
          {r.client_name && <span>就業場所名：{r.client_name}</span>}
        </div>
      )}

      <div className="flex flex-col gap-2">
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
  const badgeColor = isDone ? '#0D9488' : isCancelled ? '#5A6A8A' : '#DC2626'
  const bgColor = isDone ? '#ECFDF5' : isCancelled ? '#F1F2F5' : '#FEF2F2'
  const borderColor = isDone ? '#A7F3D0' : isCancelled ? '#D0DAF0' : '#FECACA'

  const submitCancel = async () => {
    if (!reasonText.trim()) { alert('取消理由を入力してください'); return }
    setSubmitting(true)
    const ok = await onCancel(reasonText.trim())
    setSubmitting(false)
    if (ok) setShowCancelForm(false)
  }

  return (
    <div className="rounded-md border px-3 py-2" style={{ background: bgColor, borderColor }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-white text-[10px] px-2 py-0.5 rounded-full" style={{ background: badgeColor }}>{badgeLabel}</span>
          <span className="text-xs" style={{ color: '#1A2340' }}>{label}</span>
        </div>
        {status === 'pending' && !showCancelForm && (
          <button onClick={() => setShowCancelForm(true)}
            className="text-[11px] px-2 py-1 rounded border bg-white shrink-0"
            style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>取消</button>
        )}
      </div>

      {isCancelled && cancelReason && (
        <p className="text-[11px] mt-1.5" style={{ color: '#5A6A8A' }}>取消理由：{cancelReason}</p>
      )}

      {showCancelForm && (
        <div className="mt-2 flex flex-col gap-2">
          <input value={reasonText} onChange={e => setReasonText(e.target.value)}
            placeholder="取消理由を入力（例：社員番号の入力ミスのため）"
            className="text-xs px-3 py-2 rounded-md border focus:outline-none"
            style={{ borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }} />
          <div className="flex gap-2">
            <button onClick={submitCancel} disabled={submitting}
              className="text-[11px] px-3 py-1.5 rounded text-white"
              style={{ background: '#DC2626', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '送信中…' : 'この理由で取消す'}
            </button>
            <button onClick={() => { setShowCancelForm(false); setReasonText('') }} disabled={submitting}
              className="text-[11px] px-3 py-1.5 rounded border bg-white"
              style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}
