'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type ContractStatus = '申請中' | 'SSC承認済み' | '差し戻し中' | '署名待ち' | '署名済み' | '完了' | '取り下げ'

type Contract = {
  id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: ContractStatus
  created_by: string
  created_by_dept_no: number | null
  created_at: string
  rejection_reason: string | null
  sign_requested_at: string | null
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

const SIGN_DEADLINE_DAYS = 7 // 署名期日＝通知から7日（初期値。将来アラート日数マスタで変更可能にする予定）

// 日時を「YYYY/MM/DD HH:mm」形式に変換
const formatDateTime = (iso: string) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const formatDate = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

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
    <span className="text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap" style={{ background: s.bg, color: 'white' }}>
      {s.label}
    </span>
  )
}

// 署名期日バッジ（通常／期日間近／期日超過の3段階）
const SignDeadlineBadge = ({ signRequestedAt }: { signRequestedAt: string | null }) => {
  if (!signRequestedAt) return null
  const notified = new Date(signRequestedAt)
  const deadline = new Date(notified.getTime() + SIGN_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDay = new Date(deadline); deadlineDay.setHours(0, 0, 0, 0)
  const remain = Math.floor((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = remain < 0
  const urgent = !overdue && remain <= 2

  let tone = { bg: '#EEF2FA', color: '#1B3A8C', label: `期日まで${remain}日（${formatDate(deadline)}）` }
  if (overdue) tone = { bg: '#FEE2E2', color: '#B91C1C', label: `期日超過${Math.abs(remain)}日（${formatDate(deadline)}）` }
  else if (urgent) tone = { bg: '#FFF7ED', color: '#C2410C', label: `期日まで${remain}日（${formatDate(deadline)}）` }

  return (
    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded whitespace-nowrap" style={{ background: tone.bg, color: tone.color }}>
      {tone.label}
    </span>
  )
}

// 期日アラートの判定（雇用開始日ベース。申請中・SSC承認済みの遅延確認用）
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

// 雇用期間の表示文字列
const getEmployPeriodLabel = (contract: Contract): string => {
  const f = contract.input_data?.fields
  if (!f) return '―'
  const contractType = f.contractType || ''
  const isMusei = contractType === '正社員' || contractType === '無期契約' || f.period === '無期'
  if (isMusei) return f.contractStartDate ? `${f.contractStartDate} 〜 期間の定めなし` : '―'
  if (f.employStart && f.employEnd) return `${f.employStart} 〜 ${f.employEnd}`
  return '―'
}

type FilterKey = 'pending' | 'rejected' | 'waiting' | 'other'

export default function SalesDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [deptLookupError, setDeptLookupError] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending')

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)

      // ログインユーザーのメールアドレスから所属部門NOを取得
      const email = data.user.email
      const { data: staffRow, error: staffError } = await supabase
        .from('staff')
        .select('dept_no')
        .eq('email', email)
        .limit(1)
        .maybeSingle()

      if (staffError || !staffRow || staffRow.dept_no === null) {
        setDeptLookupError('ログインユーザーの所属部門が特定できませんでした。管理部にご確認ください。')
        setLoading(false)
        return
      }

      // 自部門の申請のみ取得
      const { data: rows, error } = await supabase
        .from('contracts')
        .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_by_dept_no, created_at, rejection_reason, sign_requested_at, input_data')
        .eq('created_by_dept_no', staffRow.dept_no)
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

  const pendingList = contracts.filter(c => ['申請中', 'SSC承認済み', '署名済み'].includes(c.status))
  const rejectedList = contracts.filter(c => c.status === '差し戻し中')
  const waitingList = contracts.filter(c => c.status === '署名待ち')

  const filterCards: { key: FilterKey; label: string; count: number | null; color: string }[] = [
    { key: 'pending',  label: '申請中',           count: pendingList.length,  color: '#1B3A8C' },
    { key: 'rejected', label: '差し戻し',         count: rejectedList.length, color: '#DC2626' },
    { key: 'waiting',  label: '署名待ち',         count: waitingList.length,  color: '#92400E' },
    { key: 'other',    label: 'その他の依頼・回答', count: null,               color: '#5A6A8A' },
  ]

  const listForFilter: Record<FilterKey, Contract[]> = {
    pending: pendingList,
    rejected: rejectedList,
    waiting: waitingList,
    other: [],
  }
  const currentList = listForFilter[activeFilter]
  const currentLabel = filterCards.find(c => c.key === activeFilter)?.label || ''

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
      <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
    </div>
  )

  // カード（一覧内の1件表示）
  const ContractCard = ({ contract }: { contract: Contract }) => {
    const staff = contract.input_data?.staff || {}
    const f = contract.input_data?.fields || {}
    const deadline = getDeadlineAlert(contract)
    const isWaitingSign = contract.status === '署名待ち'
    const leftBorderColor = deadline.type === 'overdue' ? '#DC2626' : deadline.type === 'urgent' ? '#F97316' : 'transparent'

    return (
      <div key={contract.id}
        className="bg-white rounded-xl overflow-hidden transition-all hover:shadow-md"
        style={{
          border: '0.5px solid #D0DAF0',
          borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0',
        }}>
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <StatusBadge status={contract.status} />
              {isWaitingSign && <SignDeadlineBadge signRequestedAt={contract.sign_requested_at} />}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-3" style={{ background: '#F5F7FC' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm flex-shrink-0" style={{ color: '#1B3A8C' }}>📍</span>
              <span className="text-sm" style={{ color: '#1A2340', wordBreak: 'break-all' }}>
                {f.workLocationName || '―'}
              </span>
            </div>
            {!isWaitingSign && deadline.type && (
              <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                style={{
                  background: deadline.type === 'overdue' ? '#FEE2E2' : '#FFF7ED',
                  color: deadline.type === 'overdue' ? '#B91C1C' : '#C2410C',
                }}>
                {deadline.type === 'overdue' ? '🔴' : '⚠'} {deadline.label}
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
        </div>

        <button
          className="w-full border-t flex items-center justify-end gap-1.5 px-5 py-2.5 transition-all"
          style={{ borderColor: '#D0DAF0', background: '#EEF2FA' }}
          onClick={() => router.push(`/dashboard/sales/contracts/${contract.id}`)}>
          <span className="text-xs font-medium" style={{ color: '#1B3A8C' }}>詳細を見る</span>
          <span className="text-xs" style={{ color: '#1B3A8C' }}>→</span>
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      {/* ヘッダー */}
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>担当営業ダッシュボード</p>
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
        {/* 部門特定エラー */}
        {deptLookupError && (
          <div className="rounded-xl p-5 mb-6 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>{deptLookupError}</p>
          </div>
        )}

        {/* 新規発行申請ボタン */}
        <div className="mb-6">
          <button onClick={() => router.push('/apply')}
            className="text-white px-6 py-3 rounded-lg font-medium transition-all"
            style={{ background: '#1B3A8C' }}>
            ＋ 新規発行申請
          </button>
        </div>

        {/* フィルターカード */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {filterCards.map(card => {
            const isActive = activeFilter === card.key
            return (
              <button
                key={card.key}
                onClick={() => setActiveFilter(card.key)}
                className="text-left bg-white rounded-lg p-5 transition-all"
                style={{ border: isActive ? `2px solid ${card.color}` : '0.5px solid #D0DAF0' }}>
                <p className="text-sm" style={{ color: '#5A6A8A' }}>{card.label}</p>
                {card.count === null ? (
                  <p className="text-sm mt-2" style={{ color: '#9CA3AF' }}>準備中</p>
                ) : (
                  <p className="text-3xl font-bold mt-2" style={{ color: card.color }}>{card.count}</p>
                )}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>{currentLabel}</h2>

            {activeFilter === 'other' ? (
              <div className="text-center py-10">
                <p className="text-sm mb-1" style={{ color: '#5A6A8A' }}>この機能は準備中です。</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>
                  管理部への依頼（マスタ登録・CSVインポート依頼）／更新回答　は今後追加予定です。
                </p>
              </div>
            ) : currentList.length === 0 ? (
              <p className="text-sm py-6" style={{ color: '#5A6A8A' }}>該当する書類はありません。</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {currentList.map(c => <ContractCard key={c.id} contract={c} />)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
