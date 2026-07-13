'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

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

type TabType = 'requests' | 'contracts' | 'csvImport' | 'csvDiff' | 'renewal'

const PAGE_SIZE = 50

function formatDateTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function formatDate(str: string | null) {
  if (!str) return ''
  const d = new Date(str)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

// ===== 契約一覧タブ（2026-07-13追加：フェーズ1）=====
// SSCダッシュボード（app/dashboard/ssc/page.tsx）が出来ることを管理部でも出来るようにする方針
// （docs/SYSTEM_DESIGN.md 10章2026-07-13参照）に基づき、契約一覧・ステータス確認（確認済み日時を
// 含む）をSSCの表示ロジックをそのまま流用して追加した。今回のフェーズ1は「閲覧のみ」であり、
// 承認操作（個別承認・一括承認）は含まない（承認を管理部が行うかどうかは別途整理・別タスク）。
type ContractStatus = '申請中' | 'SSC承認済み' | '差し戻し中' | '署名待ち' | '署名済み' | '完了' | '取り下げ'
type WarningLevel = 'none' | 'yellow' | 'red'
type Contract = {
  id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: ContractStatus
  created_by: string
  created_at: string
  rejection_reason: string | null
  signed_at: string | null
  warning_confirmations: { type: string; confirmed_at: string }[]
  warning_level: WarningLevel
  input_data: {
    staff?: { name?: string; employee_number?: string; department?: string }
    fields?: {
      contractType?: string
      workPlace?: string
      workLocationName?: string
      employStart?: string
      employEnd?: string
      contractStartDate?: string
      dispatchStart?: string
      dispatchEnd?: string
      period?: string
    }
  }
}
type ContractSubTab = '承認待ち' | '差し戻し中' | '承認済み'

const getDocumentLabel = (documentType: string, pattern: string) => {
  if (pattern === 'C') return '雇用契約書＋明示書'
  if (pattern === 'B') return '明示書'
  return '雇用契約書'
}

const ContractTypeBadge = ({ contractType, workPlace }: { contractType: string; workPlace: string }) => {
  const isInternal = workPlace === '社内'
  if (isInternal) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>{contractType || '―'}</span>
  }
  const map: Record<string, { bg: string; color: string }> = {
    '正社員':   { bg: '#ECFDF5', color: '#15803D' },
    '有期契約': { bg: '#ECFDF5', color: '#15803D' },
    '無期契約': { bg: '#ECFDF5', color: '#15803D' },
    'アルバイト': { bg: '#FFF7ED', color: '#C2410C' },
  }
  const c = map[contractType] || { bg: '#F3F4F6', color: '#6B7280' }
  return <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: c.bg, color: c.color }}>{contractType || '―'}</span>
}

const WorkPlaceBadge = ({ workPlace }: { workPlace: string }) => {
  const isInternal = workPlace === '社内'
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded"
      style={{ background: isInternal ? '#EEF2FA' : '#ECFDF5', color: isInternal ? '#1B3A8C' : '#15803D' }}>
      {workPlace || '現場'}
    </span>
  )
}

const ContractStatusBadge = ({ status }: { status: ContractStatus }) => {
  const map: Record<string, { bg: string; label: string }> = {
    '申請中':     { bg: '#1D4ED8', label: '申請中' },
    'SSC承認済み': { bg: '#065F46', label: 'SSC承認済み' },
    '差し戻し中': { bg: '#B91C1C', label: '差し戻し中' },
    '署名待ち':   { bg: '#92400E', label: '署名待ち' },
    '署名済み':   { bg: '#3730A3', label: '署名済み' },
    '完了':       { bg: '#374151', label: '完了' },
    '取り下げ':   { bg: '#9CA3AF', label: '取り下げ' },
  }
  const s = map[status] || { bg: '#9CA3AF', label: status }
  return <span className="text-xs font-medium px-2.5 py-0.5 rounded" style={{ background: s.bg, color: 'white' }}>{s.label}</span>
}

const ConfirmedBadge = ({ signedAt }: { signedAt: string | null }) => {
  if (!signedAt) return null
  return (
    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded whitespace-nowrap" style={{ background: '#D1FAE5', color: '#065F46' }}>
      ✓ 確認済み：{formatDateTime(signedAt)}
    </span>
  )
}

const getDeadlineAlert = (contract: Contract): { type: 'overdue' | 'urgent' | null; label: string } => {
  const f = contract.input_data?.fields
  if (!f) return { type: null, label: '' }
  const startDate = f.employStart || f.contractStartDate || f.dispatchStart
  if (!startDate) return { type: null, label: '' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(startDate); start.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { type: 'overdue', label: '開始日超過' }
  if (diffDays <= 3) return { type: 'urgent', label: `開始まで${diffDays}日` }
  return { type: null, label: '' }
}

const hasWarning = (contract: Contract): boolean => contract.warning_confirmations && contract.warning_confirmations.length > 0
const hasAutoCheckWarning = (contract: Contract): boolean => !!contract.warning_level && contract.warning_level !== 'none'

const getEmployPeriodLabel = (contract: Contract): string => {
  const f = contract.input_data?.fields
  if (!f) return '―'
  const contractType = f.contractType || ''
  const isSeishain = contractType === '正社員'
  const isMusei = contractType === '無期契約' || f.period === '無期'
  if (isSeishain || isMusei) return f.contractStartDate ? `${f.contractStartDate} 〜 期間の定めなし` : '―'
  if (f.employStart && f.employEnd) return `${f.employStart} 〜 ${f.employEnd}`
  return '―'
}

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

  // 契約一覧タブ（2026-07-13追加：フェーズ1・閲覧専用）
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)
  const [contractsError, setContractsError] = useState('')
  const [contractsSubTab, setContractsSubTab] = useState<ContractSubTab>('承認待ち')

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

  // 契約一覧の取得（SSCダッシュボードと同じクエリ・同じ「社内除外」条件。フェーズ1では
  // 管理部もSSCと同じ範囲＝社内以外の契約を閲覧できるようにする。社内案件の可視化は
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

  if (!user) return <div className="p-8">読み込み中...</div>

  const tabs: { key: TabType; label: string }[] = [
    { key: 'requests', label: '依頼管理' },
    { key: 'contracts', label: '契約一覧' },
    { key: 'csvImport', label: 'CSVインポート' },
    { key: 'csvDiff', label: 'CSV差異アラート' },
    { key: 'renewal', label: '更新期限管理' },
  ]

  const filteredContracts = contracts.filter(c => {
    if (contractsSubTab === '承認待ち') return c.status === '申請中'
    if (contractsSubTab === '差し戻し中') return c.status === '差し戻し中'
    if (contractsSubTab === '承認済み') return ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)
    return false
  })
  const contractsPendingCount = contracts.filter(c => c.status === '申請中').length
  const contractsRejectedCount = contracts.filter(c => c.status === '差し戻し中').length
  const contractsApprovedCount = contracts.filter(c => ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)).length

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
                SSCダッシュボードと同じ範囲（社内案件を除く）の契約状況を閲覧できます。承認操作はこの画面では行えません。
              </p>

              {/* サブタブ */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {([
                  { key: '承認待ち' as ContractSubTab, count: contractsPendingCount, color: '#1D4ED8', tint: '#EEF0F5' },
                  { key: '差し戻し中' as ContractSubTab, count: contractsRejectedCount, color: '#B91C1C', tint: '#FEE2E2' },
                  { key: '承認済み' as ContractSubTab, count: contractsApprovedCount, color: '#065F46', tint: '#D1FAE5' },
                ]).map(tab => {
                  const isActive = contractsSubTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => setContractsSubTab(tab.key)}
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

              {!contractsLoading && !contractsError && filteredContracts.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>該当する契約はありません</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {filteredContracts.map(contract => {
                  const staff = contract.input_data?.staff || {}
                  const f = contract.input_data?.fields || {}
                  const deadline = getDeadlineAlert(contract)
                  const warning = hasWarning(contract)
                  const autoWarning = hasAutoCheckWarning(contract)
                  const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
                  const leftBorderColor = deadline.type === 'overdue' ? '#EA580C' : deadline.type === 'urgent' ? '#F97316' : 'transparent'

                  return (
                    <div key={contract.id} className="bg-white rounded-xl overflow-hidden"
                      style={{ border: '0.5px solid #D0DAF0', borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0' }}>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                              <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                              <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
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
                            {(warning || autoWarning) && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{ background: (warning || contract.warning_level === 'red') ? '#DC2626' : '#D97706', color: 'white' }}>
                                {(warning || contract.warning_level === 'red') ? '🔴' : '🟡'} 要確認
                              </span>
                            )}
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
