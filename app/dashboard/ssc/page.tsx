'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

// ステータスの型定義
type ContractStatus = '申請中' | 'SSC承認済み' | '差し戻し中' | '署名待ち' | '署名済み' | '完了' | '取り下げ'

// contractsテーブルから取得するデータの型
type Contract = {
  id: string
  staff_id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: ContractStatus
  created_by: string
  created_at: string
  updated_at: string
  rejection_reason: string | null
  rejected_at: string | null
  input_data: {
    staff?: {
      name?: string
      employee_number?: string
    }
  }
  // Supabase Auth からメールアドレスを取得するために使う（フェーズ2で氏名に変更予定）
  created_by_email?: string
}

// タブの種類
type TabType = '承認待ち' | '差し戻し中' | '承認済み'

// 日時を「YYYY/MM/DD HH:mm」形式に変換
const formatDateTime = (iso: string) => {
  if (!iso) return '―'
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${mo}/${day} ${h}:${mi}`
}

// パターンに応じた帳票種別バッジの色
const PatternBadge = ({ pattern }: { pattern: string }) => {
  const colors: Record<string, { bg: string; color: string }> = {
    A: { bg: '#EEF2FA', color: '#1B3A8C' },
    B: { bg: '#ECFDF5', color: '#15803D' },
    C: { bg: '#FFF7ED', color: '#C2410C' },
  }
  const c = colors[pattern] || { bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.color }}>
      パターン{pattern}
    </span>
  )
}

// ステータスに応じたバッジ
const StatusBadge = ({ status }: { status: ContractStatus }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    '申請中':     { bg: '#DBEAFE', color: '#1D4ED8', label: '申請中' },
    'SSC承認済み': { bg: '#D1FAE5', color: '#065F46', label: 'SSC承認済み' },
    '差し戻し中': { bg: '#FEE2E2', color: '#B91C1C', label: '差し戻し中' },
    '署名待ち':   { bg: '#FEF3C7', color: '#92400E', label: '署名待ち' },
    '署名済み':   { bg: '#E0E7FF', color: '#3730A3', label: '署名済み' },
    '完了':       { bg: '#F3F4F6', color: '#374151', label: '完了' },
    '取り下げ':   { bg: '#F9FAFB', color: '#9CA3AF', label: '取り下げ' },
  }
  const s = map[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export default function SSCDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('承認待ち')

  useEffect(() => {
    const init = async () => {
      // 認証チェック
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== 'SSC') { router.push('/login'); return }
      setUser(data.user)

      // contracts テーブルから全申請を取得（RLSは現在「認証ユーザー全件」設定のまま）
      const { data: rows, error } = await supabase
        .from('contracts')
        .select('id, staff_id, pattern, contract_type, document_type, work_place, status, created_by, created_at, updated_at, rejection_reason, rejected_at, input_data')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('contracts取得エラー:', error)
        setLoading(false)
        return
      }

      // created_by（ユーザーID）からメールアドレスを取得する
      // フェーズ2の認証統合後は staff テーブルの氏名に差し替える予定
      const uniqueCreatorIds = [...new Set((rows || []).map((r: any) => r.created_by).filter(Boolean))]
      const emailMap: Record<string, string> = {}

      // Supabase Auth の管理APIはクライアントサイドから叩けないため、
      // input_data.staff に氏名スナップショットが入っている場合はそちらを優先表示する
      // （apply/page.tsx の handleSubmitContract で staffSnapshot として保存済み）

      const enriched: Contract[] = (rows || []).map((r: any) => ({
        ...r,
        created_by_email: emailMap[r.created_by] || r.created_by,
      }))

      setContracts(enriched)
      setLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // タブごとにフィルタリング
  const filtered = contracts.filter(c => {
    if (activeTab === '承認待ち') return c.status === '申請中'
    if (activeTab === '差し戻し中') return c.status === '差し戻し中'
    if (activeTab === '承認済み') return c.status === 'SSC承認済み' || c.status === '署名待ち' || c.status === '署名済み' || c.status === '完了'
    return false
  })

  // サマリー数
  const pendingCount = contracts.filter(c => c.status === '申請中').length
  const rejectedCount = contracts.filter(c => c.status === '差し戻し中').length
  const approvedCount = contracts.filter(c => c.status === 'SSC承認済み' || c.status === '署名待ち' || c.status === '署名済み' || c.status === '完了').length

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
      <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
    </div>
  )

  const tabs: { key: TabType; label: string; count: number; color: string }[] = [
    { key: '承認待ち', label: '承認待ち', count: pendingCount, color: '#1D4ED8' },
    { key: '差し戻し中', label: '差し戻し中', count: rejectedCount, color: '#B91C1C' },
    { key: '承認済み', label: '承認済み・完了', count: approvedCount, color: '#065F46' },
  ]

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
            className="text-sm px-4 py-2 rounded-lg border transition-all"
            style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* サマリーカード */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#5A6A8A' }}>承認待ち</p>
            <p className="text-3xl font-bold" style={{ color: '#1D4ED8' }}>{pendingCount}</p>
            <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>件の申請が届いています</p>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#5A6A8A' }}>差し戻し中</p>
            <p className="text-3xl font-bold" style={{ color: '#B91C1C' }}>{rejectedCount}</p>
            <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>件が再申請待ちです</p>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#5A6A8A' }}>承認済み・完了</p>
            <p className="text-3xl font-bold" style={{ color: '#065F46' }}>{approvedCount}</p>
            <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>件を処理済みです</p>
          </div>
        </div>

        {/* タブ */}
        <div className="flex gap-1 mb-4 bg-white rounded-xl border p-1" style={{ borderColor: '#D0DAF0' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={activeTab === tab.key
                ? { background: '#1B3A8C', color: 'white' }
                : { color: '#5A6A8A' }
              }>
              {tab.label}
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={activeTab === tab.key
                  ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                  : { background: '#EEF2FA', color: tab.color }
                }>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

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
              const staffName = contract.input_data?.staff?.name || '―'
              const employeeNumber = contract.input_data?.staff?.employee_number || '―'
              return (
                <button
                  key={contract.id}
                  onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}
                  className="bg-white rounded-xl border text-left w-full transition-all hover:shadow-md"
                  style={{ borderColor: '#D0DAF0' }}>
                  <div className="px-5 py-4">
                    {/* 上段：スタッフ名・バッジ群 */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staffName}</span>
                        <span className="text-xs" style={{ color: '#5A6A8A' }}>（社員番号：{employeeNumber}）</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PatternBadge pattern={contract.pattern} />
                        <StatusBadge status={contract.status} />
                      </div>
                    </div>
                    {/* 下段：書類種別・申請日・申請者 */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-sm" style={{ color: '#1A2340' }}>{contract.document_type}</span>
                      <span className="text-xs" style={{ color: '#5A6A8A' }}>
                        申請日時：{formatDateTime(contract.created_at)}
                      </span>
                      {/* 担当営業の表示：フェーズ2（認証統合後）で氏名に差し替え予定。現在はIDのみ */}
                      <span className="text-xs" style={{ color: '#5A6A8A' }}>
                        申請者ID：{contract.created_by.slice(0, 8)}…
                      </span>
                    </div>
                    {/* 差し戻し理由（差し戻し中タブのみ表示） */}
                    {contract.status === '差し戻し中' && contract.rejection_reason && (
                      <div className="mt-3 rounded-lg px-3 py-2 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                        <p className="text-xs font-medium mb-0.5" style={{ color: '#B91C1C' }}>差し戻し理由</p>
                        <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>{contract.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                  {/* 右矢印 */}
                  <div className="border-t px-5 py-2.5 flex items-center justify-end" style={{ borderColor: '#EEF2FA' }}>
                    <span className="text-xs font-medium" style={{ color: '#1B3A8C' }}>
                      {activeTab === '承認待ち' ? '内容を確認する →' : '詳細を見る →'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
