'use client'

// ===== アルバイト誓約書 一覧セクション（SSC・管理部ダッシュボード共通） =====
// 2026-07-23新設。雇用契約書側の高度な絞り込み・蓄積型読み込み（useApprovedAccumulator等）は
// pledgesにはまだ不要な規模（本稼働前・件数少）と判断し、シンプルな全件取得＋ステータス別
// タブ切り替えのみで実装する。詳細画面は/dashboard/ssc/pledges/[id]（SSC・管理部共通。
// contracts側の「SSCの詳細画面を管理部にも開放する」設計を踏襲）。
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PledgeRow = {
  id: string
  document_type: string
  status: string
  work_place_type: string
  client_name: string | null
  created_by_name: string | null
  created_at: string
  input_data: { staff?: { name?: string; employee_number?: string; department?: string } }
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  '申請中': { label: '承認待ち', bg: '#EEF2FA', color: '#1B3A8C' },
  '差し戻し中': { label: '差し戻し中', bg: '#FEF2F2', color: '#B91C1C' },
  'SSC承認済み': { label: '承認済み（通知準備中）', bg: '#FFF7E6', color: '#B45309' },
  '署名待ち': { label: '署名待ち', bg: '#FFF7E6', color: '#B45309' },
  '署名済み': { label: '署名済み', bg: '#ECFDF5', color: '#047857' },
  '取り下げ': { label: '取り下げ', bg: '#F3F4F6', color: '#6B7280' },
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type FilterKey = '承認待ち' | '差し戻し中' | 'それ以外'

type Props = {
  // 担当営業ダッシュボードから使う場合、雇用契約書の「契約一覧」タブと同じ考え方で
  // 自部門（created_by_dept_no）のみに絞り込む（2026-07-23追加）。SSC・管理部は
  // 従来通り未指定＝全件表示のまま。
  deptNoFilter?: number
  // 詳細画面の遷移先。SSC・管理部は承認操作もできる/dashboard/ssc/pledges/[id]（ロール専用
  // ガード付き）、担当営業は読み取り専用の/dashboard/sales/pledges/[id]を使う
  // （2026-07-23追加。SSC側の画面は担当営業がアクセスするとログイン画面へ戻されてしまうため）。
  detailBasePath?: string
}

export default function PledgeListSection({ deptNoFilter, detailBasePath = '/dashboard/ssc/pledges' }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<PledgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('承認待ち')

  const load = async () => {
    setLoading(true)
    let query = supabase
      .from('pledges')
      .select('id, document_type, status, work_place_type, client_name, created_by_name, created_at, input_data')
      .order('created_at', { ascending: false })
      .limit(200)
    if (deptNoFilter !== undefined) query = query.eq('created_by_dept_no', deptNoFilter)
    const { data } = await query
    setRows((data || []) as PledgeRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [deptNoFilter])

  const filtered = rows.filter(r => {
    if (filter === '承認待ち') return r.status === '申請中'
    if (filter === '差し戻し中') return r.status === '差し戻し中'
    return !['申請中', '差し戻し中'].includes(r.status)
  })

  const pendingCount = rows.filter(r => r.status === '申請中').length
  const rejectedCount = rows.filter(r => r.status === '差し戻し中').length

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {([
          { key: '承認待ち' as const, label: '承認待ち', count: pendingCount },
          { key: '差し戻し中' as const, label: '差し戻し中', count: rejectedCount },
          { key: 'それ以外' as const, label: '承認済み・署名状況', count: rows.length - pendingCount - rejectedCount },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className="px-4 py-2 rounded-full text-xs font-bold transition-all"
            style={filter === t.key
              ? { background: '#1B3A8C', color: '#FFFFFF' }
              : { background: '#EEF2FA', color: '#5A6A8A' }}
          >
            {t.label}（{t.count}）
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: '#9CA3AF' }}>読み込み中…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: '#9CA3AF' }}>該当する申請はありません</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => {
            const staffSnap = r.input_data?.staff || {}
            const badge = STATUS_BADGE[r.status] || { label: r.status, bg: '#F3F4F6', color: '#6B7280' }
            return (
              <button
                key={r.id}
                onClick={() => router.push(`${detailBasePath}/${r.id}`)}
                className="text-left rounded-xl border p-4 bg-white hover:shadow-sm transition-all"
                style={{ borderColor: '#E5EAF5' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold" style={{ color: '#1A2340' }}>
                    {staffSnap.name || '―'}
                    <span className="font-normal text-xs ml-2" style={{ color: '#8A94AA' }}>
                      （社員番号：{staffSnap.employee_number || '―'}）
                    </span>
                  </p>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs" style={{ color: '#5A6A8A' }}>
                  {r.document_type}　｜　{r.work_place_type === 'client' ? (r.client_name || 'クライアント先') : '自社拠点'}　｜　申請日時：{formatDateTime(r.created_at)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8A94AA' }}>申請者：{r.created_by_name || '―'}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
