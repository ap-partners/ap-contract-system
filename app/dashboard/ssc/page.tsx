'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type ContractStatus = '申請中' | 'SSC承認済み' | '差し戻し中' | '署名待ち' | '署名済み' | '完了' | '取り下げ'

// 自動チェックの警告レベル（2026-07-02追加：7-5章の骨格実装）
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
  warning_confirmations: { type: string; confirmed_at: string }[]
  warning_level: WarningLevel
  input_data: {
    staff?: {
      name?: string
      employee_number?: string
      department?: string
    }
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

type TabType = '承認待ち' | '差し戻し中' | '承認済み'

// 日時を「YYYY/MM/DD HH:mm」形式に変換
const formatDateTime = (iso: string) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 帳票種別の省略表示
const getDocumentLabel = (documentType: string, pattern: string) => {
  if (pattern === 'C') return '雇用契約書＋明示書'
  if (pattern === 'B') return '明示書'
  return '雇用契約書'
}

// 雇用形態バッジ
const ContractTypeBadge = ({ contractType, workPlace }: { contractType: string; workPlace: string }) => {
  const isInternal = workPlace === '社内'
  if (isInternal) {
    const map: Record<string, { bg: string; color: string }> = {
      '正社員':   { bg: '#EEF2FA', color: '#1B3A8C' },
      '有期契約': { bg: '#EEF2FA', color: '#1B3A8C' },
      '無期契約': { bg: '#EEF2FA', color: '#1B3A8C' },
    }
    const c = map[contractType] || { bg: '#EEF2FA', color: '#1B3A8C' }
    return <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: c.bg, color: c.color }}>{contractType || '―'}</span>
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

// 就業場所区分バッジ
const WorkPlaceBadge = ({ workPlace }: { workPlace: string }) => {
  const isInternal = workPlace === '社内'
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded"
      style={{ background: isInternal ? '#EEF2FA' : '#ECFDF5', color: isInternal ? '#1B3A8C' : '#15803D' }}>
      {workPlace || '現場'}
    </span>
  )
}

// ステータスバッジ（塗りつぶし）
const StatusBadge = ({ status }: { status: ContractStatus }) => {
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
  return (
    <span className="text-xs font-medium px-2.5 py-0.5 rounded" style={{ background: s.bg, color: 'white' }}>
      {s.label}
    </span>
  )
}

// 期日アラートの判定（雇用開始日ベース）
const getDeadlineAlert = (contract: Contract): { type: 'overdue' | 'urgent' | null; label: string } => {
  const f = contract.input_data?.fields
  if (!f) return { type: null, label: '' }

  // 雇用開始日を取得（パターンにより異なるフィールドを使う）
  const startDate = f.employStart || f.contractStartDate || f.dispatchStart
  if (!startDate) return { type: null, label: '' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { type: 'overdue', label: '開始日超過' }
  if (diffDays <= 3) return { type: 'urgent', label: `開始まで${diffDays}日` }
  return { type: null, label: '' }
}

// 警告ありかどうかの判定（担当営業がSTEP8で確認・申告した警告）
const hasWarning = (contract: Contract): boolean => {
  return contract.warning_confirmations && contract.warning_confirmations.length > 0
}

// 自動チェックの警告ありかどうかの判定（2026-07-02追加：7-5章の骨格実装）
// 中身の判定ロジック未実装のため、現状は全案件 warning_level='none' で false になる。
// 将来チェックロジックが実装され warning_level が yellow/red で入るようになった時点で
// このまま自動的に一括承認対象外・バッジ表示が有効になる。
const hasAutoCheckWarning = (contract: Contract): boolean => {
  return !!contract.warning_level && contract.warning_level !== 'none'
}

// 雇用期間の表示文字列
const getEmployPeriodLabel = (contract: Contract): string => {
  const f = contract.input_data?.fields
  if (!f) return '―'
  const contractType = f.contractType || ''
  const isSeishain = contractType === '正社員'
  const isMusei = contractType === '無期契約' || f.period === '無期'
  if (isSeishain || isMusei) {
    return f.contractStartDate ? `${f.contractStartDate} 〜 期間の定めなし` : '―'
  }
  if (f.employStart && f.employEnd) return `${f.employStart} 〜 ${f.employEnd}`
  return '―'
}

export default function SSCDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== 'SSC') { router.push('/login'); return }
      setUser(data.user)

      const { data: rows, error } = await supabase
        .from('contracts')
        .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_at, rejection_reason, warning_confirmations, warning_level, input_data')
        .order('created_at', { ascending: false })

      if (error) { console.error('contracts取得エラー:', error); setLoading(false); return }
      setContracts((rows || []) as Contract[])
      setLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filtered = contracts.filter(c => {
    if (activeTab === '承認待ち') return c.status === '申請中'
    if (activeTab === '差し戻し中') return c.status === '差し戻し中'
    if (activeTab === '承認済み') return ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)
    return false
  })

  // 承認待ちタブで一括承認対象となるのは「担当営業の自己申告警告」も「自動チェック警告」もない案件のみ
  const bulkTargets = filtered.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))

  const pendingCount = contracts.filter(c => c.status === '申請中').length
  const rejectedCount = contracts.filter(c => c.status === '差し戻し中').length
  const approvedCount = contracts.filter(c => ['SSC承認済み', '署名待ち', '署名済み', '完了'].includes(c.status)).length

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === bulkTargets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bulkTargets.map(c => c.id)))
    }
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', Array.from(selectedIds))
    if (error) { alert('一括承認に失敗しました: ' + error.message); return }
    setContracts(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status: 'SSC承認済み' as ContractStatus } : c))
    setSelectedIds(new Set())
  }

  const tabs: { key: TabType; label: string; count: number; color: string; tint: string }[] = [
    { key: '承認待ち', label: '承認待ち', count: pendingCount, color: '#1D4ED8', tint: '#EEF0F5' },
    { key: '差し戻し中', label: '差し戻し中', count: rejectedCount, color: '#B91C1C', tint: '#FEE2E2' },
    { key: '承認済み', label: '承認済み・完了', count: approvedCount, color: '#065F46', tint: '#D1FAE5' },
  ]

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
      <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      {/* ヘッダー */}
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>SSCダッシュボード</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-sm px-4 py-2 rounded-lg border"
            style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* タブバー（クリックで絞り込み） */}
        <div className="flex items-end gap-7 border-b mb-6 overflow-x-auto" style={{ borderColor: '#E5E9F2' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key
            const icon = tab.key === '承認待ち'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="13" y2="14" /></svg>
              : tab.key === '差し戻し中'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
            return (
              <button key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()) }}
                className="flex items-center gap-2 pb-3 relative transition-all"
                style={{ background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {icon}
                <span className="text-sm font-medium" style={{ color: isActive ? tab.color : '#1A2340' }}>{tab.label}</span>
                <span className="text-xs font-bold rounded-full"
                  style={{
                    color: isActive ? 'white' : '#5A6A8A',
                    background: isActive ? tab.color : tab.tint,
                    padding: '2px 8px',
                    minWidth: '20px',
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}>{tab.count}</span>
                {isActive && (
                  <div className="absolute" style={{ left: 0, right: 0, bottom: '-1px', height: '2.5px', background: tab.color, borderRadius: '2px 2px 0 0' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* 一括承認バー（承認待ちタブのみ） */}
        {activeTab === '承認待ち' && bulkTargets.length > 0 && (
          <div className="flex justify-between items-center mb-4 px-4 py-3 bg-white rounded-xl border" style={{ borderColor: '#D0DAF0' }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === bulkTargets.length && bulkTargets.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: '#1B3A8C' }}
              />
              <span className="text-sm" style={{ color: '#5A6A8A' }}>警告なし案件をすべて選択</span>
            </label>
            <button
              onClick={handleBulkApprove}
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
        )}

        {/* 申請カード一覧 */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-2xl mb-3">📋</p>
            <p className="text-sm font-medium" style={{ color: '#1A2340' }}>
              {activeTab === '承認待ち' && '承認待ちの申請はありません'}
              {activeTab === '差し戻し中' && '差し戻し中の申請はありません'}
              {activeTab === '承認済み' && '承認済みの申請はありません'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(contract => {
              const staff = contract.input_data?.staff || {}
              const f = contract.input_data?.fields || {}
              const deadline = getDeadlineAlert(contract)
              const warning = hasWarning(contract)
              const autoWarning = hasAutoCheckWarning(contract)
              const isSelected = selectedIds.has(contract.id)
              const hasAnyWarning = warning || autoWarning
              const canBulkSelect = activeTab === '承認待ち' && !hasAnyWarning
              // 承認待ちタブでチェックボックスの代わりに警告アイコンを出す条件（2026-07-02追加）
              const showWarningIcon = activeTab === '承認待ち' && hasAnyWarning
              // アイコン・バッジの色（自己申告警告 or 自動チェック赤 → 赤、自動チェック黄のみ → 黄）
              const warningColor = (warning || contract.warning_level === 'red') ? '#DC2626' : '#D97706'

              // 期日アラートに応じた左ボーダー色（赤は警告系の色として予約しているため、期日はオレンジ系で統一）
              const leftBorderColor = deadline.type === 'overdue' ? '#EA580C' : deadline.type === 'urgent' ? '#F97316' : 'transparent'

              return (
                <div key={contract.id}
                  className="bg-white rounded-xl overflow-hidden transition-all hover:shadow-md"
                  style={{
                    border: '0.5px solid #D0DAF0',
                    borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0',
                  }}>
                  <div className="px-5 py-4">
                    {/* 上段：チェックボックス＋スタッフ情報 ／ バッジ群 */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3">
                        {/* チェックボックス（警告なし案件・承認待ちタブのみ） */}
                        {canBulkSelect && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(contract.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 mt-5 flex-shrink-0 cursor-pointer"
                            style={{ accentColor: '#1B3A8C' }}
                          />
                        )}
                        {/* 警告アイコン（チェックボックスと同じ位置・サイズに表示。2026-07-02追加）
                            警告がある案件は一括承認の対象外になるため、チェックボックスの代わりにここへ表示し、
                            「なぜチェックボックスが無いのか」がその場で分かるようにする。 */}
                        {showWarningIcon && (
                          <span
                            title="警告あり（一括承認対象外）"
                            className="w-4 h-4 mt-5 flex-shrink-0 rounded flex items-center justify-center"
                            style={{ background: warningColor }}>
                            <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>!</span>
                          </span>
                        )}
                        {/* スタッフ情報 */}
                        <div className={(canBulkSelect || showWarningIcon) ? '' : 'pl-0'}>
                          <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                            <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                            <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 右側：バッジ群＋申請者名 */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
                          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                            {getDocumentLabel(contract.document_type, contract.pattern)}
                          </span>
                          {/* 縦区切り */}
                          <span style={{ display: 'inline-block', width: '1px', height: '14px', background: '#D0DAF0', margin: '0 2px' }} />
                          <StatusBadge status={contract.status} />
                        </div>
                        {/* 申請者名 ＋ 警告バッジ */}
                        <div className="flex items-center gap-2">
                          {warning && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#DC2626', color: 'white' }}>
                              🔴 個別確認が必要（一括承認対象外）
                            </span>
                          )}
                          {/* 自動チェック警告バッジ（2026-07-02追加：中身の判定ロジック実装後に表示され始める） */}
                          {autoWarning && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded"
                              style={{
                                background: contract.warning_level === 'red' ? '#DC2626' : '#D97706',
                                color: 'white',
                              }}>
                              {contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）
                            </span>
                          )}
                          {/* フェーズ2で申請者氏名に切り替え予定。現在はIDの先頭8文字 */}
                          <span className="text-xs" style={{ color: '#5A6A8A' }}>申請者：{contract.created_by.slice(0, 8)}…</span>
                        </div>
                      </div>
                    </div>

                    {/* 就業場所名エリア */}
                    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-3" style={{ background: '#F5F7FC' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm flex-shrink-0" style={{ color: '#1B3A8C' }}>📍</span>
                        <span className="text-sm" style={{ color: '#1A2340', wordBreak: 'break-all' }}>
                          {f.workLocationName || '―'}
                        </span>
                      </div>
                      {/* 期日アラートバッジ（就業場所名の右） */}
                      {deadline.type && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                          style={{
                            background: deadline.type === 'overdue' ? '#FFEDD5' : '#FFF7ED',
                            color: deadline.type === 'overdue' ? '#9A3412' : '#C2410C',
                          }}>
                          ⚠ {deadline.label}
                        </span>
                      )}
                    </div>

                    {/* 申請日時・雇用期間・派遣期間 */}
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

                    {/* 差し戻し理由（差し戻し中タブのみ） */}
                    {contract.status === '差し戻し中' && contract.rejection_reason && (
                      <div className="mt-3 rounded-lg px-3 py-2 border-l-4" style={{ background: '#FEF2F2', borderColor: '#B91C1C' }}>
                        <p className="text-xs font-medium mb-0.5" style={{ color: '#B91C1C' }}>差し戻し理由</p>
                        <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>{contract.rejection_reason}</p>
                      </div>
                    )}

                    {/* 確認ボタン（2026-07-02改訂：左揃えピル形） */}
                    <button
                      className="mt-3.5 flex items-center gap-1.5 rounded-full transition-all"
                      style={{ background: '#1B3A8C', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
                      onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}>
                      <span className="text-xs font-medium text-white">
                        {activeTab === '承認待ち' ? '内容を確認する' : '詳細を見る'}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
