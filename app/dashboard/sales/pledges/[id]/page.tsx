'use client'

// ===== アルバイト誓約書：担当営業 確認画面（読み取り専用） =====
// 2026-07-23新設。承認・差し戻し操作を持つSSC・管理部向け（/dashboard/ssc/pledges/[id]）とは
// 別に、担当営業が自分（自部門）の申請の状況・内容・帳票PDFを確認するためだけの画面。
// アクセス制御はapp/dashboard/sales/contracts/[id]/page.tsxと同じ考え方
// （role==='担当営業'かつ自部門の申請のみ閲覧可。他部門の申請は「見つかりません」扱い）。
// PDFプレビューが呼ぶ /api/pledges/[id]/pdf は、担当営業が自部門の申請を閲覧する場合を
// 実装時点で既に許可する設計になっていたため（route.ts参照）、バックエンド側の変更は不要だった。
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useSessionCollisionGuard } from '@/lib/useSessionCollisionGuard'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'

type ScheduleRow = { label: string; start: string; end: string; breakMinutes: string; contractHours: string }

type PledgeDetail = {
  id: string
  document_type: string
  status: string
  work_place_type: string
  client_name: string | null
  client_postal_code: string | null
  client_address: string | null
  client_tel: string | null
  office_id: string | null
  created_by_dept_no: number | null
  rejection_reason: string | null
  rejected_at: string | null
  approved_at: string | null
  created_by_name: string | null
  created_at: string
  input_data: {
    staff?: { name?: string; employee_number?: string; department?: string }
    workDescription?: string
    scheduleRows?: ScheduleRow[]
    salary?: { salaryType?: string; basicSalary?: string; rolePay?: string; skillPay?: string; salesPay?: string; transportType?: string }
  }
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const formatYen = (v: string | undefined) => {
  const n = Number(v)
  return n ? `${n.toLocaleString()}円` : '―'
}

const TRANSPORT_LABEL: Record<string, string> = { default: '実費または定期代', included: '交通費込', gas: 'ガソリン代' }

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  '申請中': { label: '承認待ち', bg: '#EEF2FA', color: '#1B3A8C' },
  '差し戻し中': { label: '差し戻し中', bg: '#FEF2F2', color: '#B91C1C' },
  'SSC承認済み': { label: '承認済み（通知準備中）', bg: '#FFF7E6', color: '#B45309' },
  '署名待ち': { label: '署名待ち', bg: '#FFF7E6', color: '#B45309' },
  '署名済み': { label: '署名済み', bg: '#ECFDF5', color: '#047857' },
  '取り下げ': { label: '取り下げ', bg: '#F3F4F6', color: '#6B7280' },
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
    <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>{label}</div>
    <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>{value}</div>
  </div>
)

export default function SalesPledgeDetail() {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
  const params = useParams()
  const id = params?.id as string

  const [user, setUser] = useState<any>(null)
  useSessionCollisionGuard(user?.id)
  const [pledge, setPledge] = useState<PledgeDetail | null>(null)
  const [officeLabel, setOfficeLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ===== 自己取り下げ機能（2026-07-24新設。contracts側と同じ設計） =====
  // 「申請中」「差し戻し中」の間だけ、担当営業自身が申請を取り下げられるようにする。
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)

  const handleWithdraw = async () => {
    if (!pledge) return
    setWithdrawError(null)
    setWithdrawing(true)
    const { data, error } = await supabase
      .from('pledges')
      .update({
        status: '取り下げ',
        withdrawn_at: new Date().toISOString(),
        withdrawn_by: user?.id || null,
        withdrawn_reason: withdrawReason.trim() || null,
      })
      .eq('id', pledge.id)
      .in('status', ['申請中', '差し戻し中'])
      .select()
      .maybeSingle()
    setWithdrawing(false)
    if (error) { showError('取り下げの保存に失敗しました: ' + error.message); return }
    if (!data) {
      showError('この申請はすでに状況が変わっているため、取り下げできませんでした。画面を更新してご確認ください。')
      return
    }
    setPledge(data as PledgeDetail)
    setShowWithdrawForm(false)
    setWithdrawReason('')
    showSuccess('申請を取り下げました。')
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)

      if (!id) { setNotFound(true); setLoading(false); return }

      const { data: staffRow } = await supabase
        .from('staff')
        .select('dept_no')
        .eq('email', data.user.email)
        .limit(1)
        .maybeSingle()

      const { data: row, error } = await supabase.from('pledges').select('*').eq('id', id).single()

      // 自部門以外の申請は「見つかりません」扱い（契約書側の詳細画面と同じ方針）
      if (error || !row || !staffRow || (row as any).created_by_dept_no !== staffRow.dept_no) {
        setNotFound(true); setLoading(false); return
      }
      setPledge(row as PledgeDetail)

      if ((row as any).work_place_type === 'internal' && (row as any).office_id) {
        const { data: officeRow } = await supabase.from('office_master').select('office_name').eq('id', (row as any).office_id).maybeSingle()
        setOfficeLabel(officeRow?.office_name || '自社拠点')
      }
      setLoading(false)
    }
    init()
  }, [id, router])

  const openPdfPreview = async () => {
    const res = await fetch(`/api/pledges/${id}/pdf`, { headers: await getAuthHeader() })
    if (!res.ok) { showError('PDFの取得に失敗しました。'); return }
    const blobUrl = URL.createObjectURL(await res.blob())
    window.open(blobUrl, '_blank')
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]"><p className="text-sm font-medium text-[#6B7280]">読み込み中</p></div>
  }
  if (notFound || !pledge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
        <div className="text-center">
          <p className="text-sm font-medium text-[#6B7280] mb-4">申請データが見つかりませんでした。</p>
          <button onClick={() => router.push('/dashboard/sales')} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>一覧に戻る</button>
        </div>
      </div>
    )
  }

  const staffSnap = pledge.input_data?.staff || {}
  const scheduleRows = pledge.input_data?.scheduleRows || []
  const salary = pledge.input_data?.salary || {}
  const badge = STATUS_BADGE[pledge.status] || { label: pledge.status, bg: '#F3F4F6', color: '#6B7280' }

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFD' }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => router.push('/dashboard/sales')} className="text-sm mb-4" style={{ color: '#5A6A8A' }}>← 一覧に戻る</button>

        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#1B3A8C' }}>
            <p className="text-sm font-bold text-white">申請概要（アルバイト誓約書）</p>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          </div>
          <div className="divide-y" style={{ borderColor: '#D0DAF0' }}>
            <Row label="対象スタッフ" value={<span className="font-bold">{staffSnap.name || '―'}　<span className="font-normal text-xs" style={{ color: '#5A6A8A' }}>（社員番号：{staffSnap.employee_number || '―'}／{staffSnap.department || '―'}）</span></span>} />
            <Row label="帳票種別" value={
              <div className="flex items-center gap-3">
                {pledge.document_type}
                <button type="button" onClick={openPdfPreview} className="text-xs font-medium px-3 py-1 rounded-full border" style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                  📄 帳票PDFプレビュー
                </button>
              </div>
            } />
            <Row label="就業先" value={
              pledge.work_place_type === 'client'
                ? <>{pledge.client_name}<br /><span className="text-xs" style={{ color: '#5A6A8A' }}>〒{pledge.client_postal_code}　{pledge.client_address}　TEL：{pledge.client_tel}</span></>
                : (officeLabel || '自社拠点')
            } />
            <Row label="申請日時" value={formatDateTime(pledge.created_at)} />
            <Row label="申請者" value={pledge.created_by_name || '―'} />
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-4 py-3" style={{ background: '#1B3A8C' }}>
            <p className="text-sm font-bold text-white">就業日程</p>
          </div>
          <div className="p-4">
            {scheduleRows.length === 0 ? (
              <p className="text-sm" style={{ color: '#9CA3AF' }}>登録されていません</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: '#5A6A8A' }}>
                    <th className="text-left font-medium pb-2">年月日</th>
                    <th className="text-left font-medium pb-2">就業時間</th>
                    <th className="text-left font-medium pb-2">休憩時間</th>
                    <th className="text-left font-medium pb-2">契約時間</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #EEF0F5', color: '#1A2340' }}>
                      <td className="py-2">{r.label}</td>
                      <td className="py-2">{r.start}〜{r.end}</td>
                      <td className="py-2">{r.breakMinutes}分</td>
                      <td className="py-2">{r.contractHours}時間</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-4 py-3" style={{ background: '#1B3A8C' }}>
            <p className="text-sm font-bold text-white">業務内容・給与</p>
          </div>
          <div className="divide-y" style={{ borderColor: '#D0DAF0' }}>
            <Row label="業務内容" value={pledge.input_data?.workDescription || '―'} />
            <Row label="給与の種類" value={salary.salaryType || '―'} />
            <Row label="基本給" value={formatYen(salary.basicSalary)} />
            <Row label="役職手当／職能給／営業手当" value={`${formatYen(salary.rolePay)}／${formatYen(salary.skillPay)}／${formatYen(salary.salesPay)}`} />
            <Row label="交通費区分" value={TRANSPORT_LABEL[salary.transportType || 'default'] || '―'} />
          </div>
        </div>

        {pledge.status === '差し戻し中' && pledge.rejection_reason && (
          <div className="rounded-xl p-4 mb-6 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#B91C1C' }}>↩ 差し戻し理由（{formatDateTime(pledge.rejected_at)}）</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#1A2340' }}>{pledge.rejection_reason}</p>
          </div>
        )}

        {(pledge.status === '申請中' || pledge.status === '差し戻し中') && (
          <div className="rounded-xl p-4 mb-6 border" style={{ background: '#F9FAFB', borderColor: '#D1D5DB' }}>
            {!showWithdrawForm ? (
              <button
                onClick={() => setShowWithdrawForm(true)}
                className="text-sm px-4 py-2 rounded-lg border font-bold transition-all"
                style={{ color: '#6B7280', borderColor: '#D1D5DB', background: 'white' }}>
                この申請を取り下げる
              </button>
            ) : (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#1A2340' }}>この申請を取り下げますか？</p>
                <p className="text-xs mb-3" style={{ color: '#6B7280' }}>取り下げると、この申請は一覧の承認待ち・差し戻し中から消え、再申請が必要になります。この操作は取り消せません。</p>
                <textarea
                  value={withdrawReason}
                  onChange={e => setWithdrawReason(e.target.value)}
                  placeholder="取り下げ理由（任意）"
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                />
                <ValidationBanner message={withdrawError} />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className="text-sm px-4 py-2 rounded-lg font-bold text-white transition-all disabled:opacity-60"
                    style={{ background: '#DC2626' }}>
                    {withdrawing ? '処理中...' : '取り下げる'}
                  </button>
                  <button
                    onClick={() => { setShowWithdrawForm(false); setWithdrawReason(''); setWithdrawError(null) }}
                    disabled={withdrawing}
                    className="text-sm px-4 py-2 rounded-lg border font-medium transition-all"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
