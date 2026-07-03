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
  requested_by_dept: string | null
  requested_at: string
  // 表示用に後から補完する項目
  displayDept?: string | null
}

type TabType = 'requests' | 'csvImport' | 'csvDiff' | 'renewal'

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

// この依頼行が「未対応のタスクを1つでも持っているか」（一覧のステータス絞り込みに使う）
function isPending(r: RequestRow) {
  return r.staff_register_status === 'pending' || r.csv_import_status === 'pending'
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<TabType>('requests')

  // 依頼管理タブ
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [reqError, setReqError] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 絞り込み条件
  const [searchText, setSearchText] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'staff_register' | 'csv_import'>('')
  const [systemFilter, setSystemFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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

  // 部門マスタ（絞り込みの選択肢用）
  useEffect(() => {
    const loadDepts = async () => {
      const { data } = await supabase.from('department_master').select('dept_name').order('dept_no')
      setDepartmentOptions((data || []).map((d: any) => d.dept_name).filter(Boolean))
    }
    loadDepts()
  }, [])

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
        if (typeFilter) query = query.eq('request_type', typeFilter)
        if (systemFilter) query = query.eq('system_type', systemFilter)
        if (dateFrom) query = query.gte('requested_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = query.lte('requested_at', `${dateTo}T23:59:59`)

        const { data, error } = await query
        if (error) { setReqError('依頼一覧の取得に失敗しました。（' + error.message + '）'); setReqLoading(false); return }

        let rows = (data || []) as RequestRow[]

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

        if (deptFilter) rows = rows.filter(r => r.displayDept === deptFilter)

        if (statusFilter === 'pending') rows = rows.filter(r => isPending(r))
        if (statusFilter === 'completed') rows = rows.filter(r => !isPending(r))

        setRequests(rows)
        setVisibleCount(PAGE_SIZE)
      } finally {
        setReqLoading(false)
      }
    }
    loadRequests()
  }, [user, searchText, deptFilter, typeFilter, systemFilter, statusFilter, dateFrom, dateTo])

  const resetFilters = () => {
    setSearchText(''); setDeptFilter(''); setTypeFilter(''); setSystemFilter('')
    setStatusFilter('pending'); setDateFrom(''); setDateTo('')
  }

  const pendingTotalCount = requests.filter(isPending).length
  const visibleRequests = requests.slice(0, visibleCount)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return <div className="p-8">読み込み中...</div>

  const tabs: { key: TabType; label: string }[] = [
    { key: 'requests', label: '依頼管理' },
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
                    style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                  <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    className="text-xs px-3 py-2 rounded-md border bg-white" style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                    <option value="">部門名：すべて</option>
                    {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
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
                    <option value="all">未対応＋完了済み</option>
                    <option value="completed">完了済みのみ</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs whitespace-nowrap" style={{ color: '#5A6A8A' }}>依頼日</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-md border" style={{ width: 130, borderColor: '#D0DAF0', color: '#1A2340' }} />
                  <span className="text-xs" style={{ color: '#5A6A8A' }}>〜</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-md border" style={{ width: 130, borderColor: '#D0DAF0', color: '#1A2340' }} />
                </div>
              </div>

              {reqError && <p className="text-xs mb-3" style={{ color: '#DC2626' }}>{reqError}</p>}
              {reqLoading && <p className="text-xs" style={{ color: '#5A6A8A' }}>読み込み中...</p>}

              {!reqLoading && !reqError && visibleRequests.length === 0 && (
                <p className="text-xs" style={{ color: '#5A6A8A' }}>該当する依頼はありません。</p>
              )}

              <div className="flex flex-col gap-3">
                {visibleRequests.map(r => (
                  <RequestCard key={r.id} r={r} />
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

function RequestCard({ r }: { r: RequestRow }) {
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
          />
        )}
        {r.csv_import_status && r.csv_import_status !== 'not_required' && (
          <StatusRow
            label={`CSVインポート${r.system_type ? `（${r.system_type}${r.dispatch_start_date ? '・派遣開始日 ' + formatDate(r.dispatch_start_date) : ''}）` : ''}`}
            status={r.csv_import_status}
          />
        )}
      </div>
    </div>
  )
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const isDone = status === 'completed'
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2"
      style={{
        background: isDone ? '#ECFDF5' : '#FEF2F2',
        borderColor: isDone ? '#A7F3D0' : '#FECACA',
      }}>
      <span className="text-white text-[10px] px-2 py-0.5 rounded-full" style={{ background: isDone ? '#0D9488' : '#DC2626' }}>
        {isDone ? '完了' : status === 'in_progress' ? '対応中' : '未対応'}
      </span>
      <span className="text-xs" style={{ color: '#1A2340' }}>{label}</span>
    </div>
  )
}

