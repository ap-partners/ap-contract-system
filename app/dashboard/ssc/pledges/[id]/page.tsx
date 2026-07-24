'use client'

// ===== アルバイト誓約書：SSC・管理部 確認画面 =====
// 2026-07-23新設。雇用契約書側の/dashboard/ssc/contracts/[id]と同じ「SSCの詳細画面を
// 管理部にも開放する」設計を踏襲（承認権限を含め完全に同等。2026-07-13の方針決定と同じ）。
// pledgesにはCSV連携・自動チェック・締結パターン選択が無いため、承認・差し戻しのみの
// シンプルな構成にしている（強制承認の概念も無い＝そもそも自動警告が存在しない）。
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useSessionCollisionGuard } from '@/lib/useSessionCollisionGuard'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'

type ScheduleRow = { label: string; start: string; end: string; breakMinutes: string; contractHours: string }

type PledgeDetail = {
  id: string
  staff_id: string
  document_type: string
  status: string
  created_by: string
  work_place_type: string
  client_name: string | null
  client_postal_code: string | null
  client_address: string | null
  client_tel: string | null
  office_id: string | null
  rejection_reason: string | null
  rejected_at: string | null
  approved_at: string | null
  created_by_name: string | null
  created_at: string
  // 2026-07-24追加：金額異常値・最低賃金の自動チェック結果（契約書と同じ列構成）
  auto_check_results: { type: string; level: 'yellow' | 'red'; message: string }[] | null
  warning_level: 'none' | 'yellow' | 'red' | null
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

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
    <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>{label}</div>
    <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>{value}</div>
  </div>
)

export default function SSCPledgeDetail() {
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

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [actionDone, setActionDone] = useState<'approved' | 'rejected' | null>(null)

  // 自己取り下げ機能（2026-07-24新設。contracts側と同じ設計）
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== 'SSC' && role !== '管理部') { router.push('/login'); return }
      setUser(data.user)

      if (!id) { setNotFound(true); setLoading(false); return }

      const { data: row, error } = await supabase.from('pledges').select('*').eq('id', id).single()
      if (error || !row) { setNotFound(true); setLoading(false); return }
      setPledge(row as PledgeDetail)

      if ((row as any).work_place_type === 'internal' && (row as any).office_id) {
        const { data: officeRow } = await supabase.from('office_master').select('office_name').eq('id', (row as any).office_id).maybeSingle()
        setOfficeLabel(officeRow?.office_name || '自社拠点')
      }
      setLoading(false)
    }
    init()
  }, [id, router])

  const refetch = async () => {
    const { data: row } = await supabase.from('pledges').select('*').eq('id', id).single()
    if (row) setPledge(row as PledgeDetail)
  }

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
      await refetch()
      return
    }
    setPledge(data as PledgeDetail)
    setShowWithdrawForm(false)
    setWithdrawReason('')
    showSuccess('申請を取り下げました。')
  }

  const handleApprove = async () => {
    if (!pledge || actionLoading) return
    setActionLoading(true)
    setActionError('')
    const { data: updatedRows, error } = await supabase
      .from('pledges')
      .update({ status: 'SSC承認済み', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', pledge.id)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      setActionError('承認の保存に失敗しました。もう一度お試しください。（' + error.message + '）')
      setActionLoading(false)
      return
    }
    if (!updatedRows || updatedRows.length === 0) {
      setActionError('この申請は、あなたが確認している間に他の人が先に処理していました。最新の状態に更新しました。')
      setShowApproveConfirm(false)
      await refetch()
      setActionLoading(false)
      return
    }
    try {
      await fetch(`/api/pledges/${pledge.id}/notify-sign-request`, { method: 'POST', headers: await getAuthHeader() })
    } catch {
      // 通知の失敗は承認をブロックしない
    }
    setActionDone('approved')
    setActionLoading(false)
    setShowApproveConfirm(false)
  }

  const handleReject = async () => {
    if (!pledge || actionLoading) return
    if (!rejectReason.trim()) { setActionError('差し戻し理由を入力してください。'); return }
    setActionLoading(true)
    setActionError('')
    const { data: updatedRows, error } = await supabase
      .from('pledges')
      .update({
        status: '差し戻し中',
        rejection_reason: rejectReason.trim(),
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pledge.id)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      setActionError('差し戻しの保存に失敗しました。もう一度お試しください。（' + error.message + '）')
      setActionLoading(false)
      return
    }
    if (!updatedRows || updatedRows.length === 0) {
      setActionError('この申請は、あなたが確認している間に他の人が先に処理していました。最新の状態に更新しました。')
      setShowRejectForm(false)
      await refetch()
      setActionLoading(false)
      return
    }
    setActionDone('rejected')
    setActionLoading(false)
    setShowRejectForm(false)
  }

  const openPdfPreview = async () => {
    const res = await fetch(`/api/pledges/${id}/pdf`, { headers: await getAuthHeader() })
    if (!res.ok) { showError('PDFの取得に失敗しました。'); return }
    const blobUrl = URL.createObjectURL(await res.blob())
    window.open(blobUrl, '_blank')
  }

  const backPath = user?.user_metadata?.role === '管理部' ? '/dashboard/admin' : '/dashboard/ssc'

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]"><p className="text-sm font-medium text-[#6B7280]">読み込み中</p></div>
  }
  if (notFound || !pledge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
        <div className="text-center">
          <p className="text-sm font-medium text-[#6B7280] mb-4">申請データが見つかりませんでした。</p>
          <button onClick={() => router.push(backPath)} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>一覧に戻る</button>
        </div>
      </div>
    )
  }

  const staffSnap = pledge.input_data?.staff || {}
  const scheduleRows = pledge.input_data?.scheduleRows || []
  const salary = pledge.input_data?.salary || {}
  const isAlreadyProcessed = pledge.status !== '申請中'
  const isOwnSubmission = pledge.created_by === user?.id
  const isWithdrawable = pledge.status === '申請中' || pledge.status === '差し戻し中'

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFD' }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => router.push(backPath)} className="text-sm mb-4" style={{ color: '#5A6A8A' }}>← 一覧に戻る</button>

        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-4 py-3" style={{ background: '#1B3A8C' }}>
            <p className="text-sm font-bold text-white">申請概要（アルバイト誓約書）</p>
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

        {/* ===== 自動チェック結果（2026-07-24追加。契約書詳細画面と同じ考え方で表示） ===== */}
        {(pledge.auto_check_results?.length || 0) > 0 && (
          <div className="rounded-xl p-4 mb-6 border-2" style={{
            background: pledge.warning_level === 'red' ? '#FEF2F2' : '#FFFBEB',
            borderColor: pledge.warning_level === 'red' ? '#F87171' : '#FBBF24',
          }}>
            <p className="text-sm font-bold mb-2" style={{ color: pledge.warning_level === 'red' ? '#B91C1C' : '#92400E' }}>
              {pledge.warning_level === 'red' ? '🚨 自動チェックで重要な警告があります' : '⚠️ 自動チェックで確認事項があります'}
            </p>
            <ul className="flex flex-col gap-2">
              {pledge.auto_check_results!.map((r, i) => (
                <li key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: '#1A2340' }}>
                  <span className="shrink-0">{r.level === 'red' ? '🔴' : '🟡'}</span>
                  <span>{r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pledge.status === '差し戻し中' && pledge.rejection_reason && (
          <div className="rounded-xl p-4 mb-6 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#B91C1C' }}>↩ 差し戻し理由（{formatDateTime(pledge.rejected_at)}）</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#1A2340' }}>{pledge.rejection_reason}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: '#D0DAF0' }}>
          {actionDone === 'approved' ? (
            <div className="rounded-xl p-5 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
              <p className="text-base font-bold mb-1" style={{ color: '#065F46' }}>✅ 承認しました</p>
              <p className="text-sm" style={{ color: '#065F46' }}>スタッフへ署名依頼を自動送信しました。</p>
              <button onClick={() => router.push(backPath)} className="mt-3 text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>一覧に戻る</button>
            </div>
          ) : actionDone === 'rejected' ? (
            <div className="rounded-xl p-5 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
              <p className="text-base font-bold mb-1" style={{ color: '#B91C1C' }}>↩ 差し戻しました</p>
              <p className="text-sm" style={{ color: '#B91C1C' }}>申請者へ差し戻し理由を表示しました。</p>
              <button onClick={() => router.push(backPath)} className="mt-3 text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>一覧に戻る</button>
            </div>
          ) : isOwnSubmission && isWithdrawable ? (
            <>
              <div className="rounded-xl p-4 mb-2 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
                <p className="text-sm font-bold mb-1" style={{ color: '#92400E' }}>この申請はあなた自身が申請したものです</p>
                <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>自分自身の申請を承認することはできません。内容を修正したい場合は、取り下げて再申請してください。</p>
              </div>
              {!showWithdrawForm ? (
                <button
                  onClick={() => setShowWithdrawForm(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold border-2 transition-all"
                  style={{ color: '#6B7280', borderColor: '#D1D5DB', background: 'white' }}>
                  この申請を取り下げる
                </button>
              ) : (
                <div className="rounded-xl p-4 border-2" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
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
            </>
          ) : isAlreadyProcessed ? (
            <p className="text-sm text-center" style={{ color: '#9CA3AF' }}>この申請は処理済みです（ステータス：{pledge.status}）</p>
          ) : (
            <>
              <p className="text-sm font-bold mb-4 text-center" style={{ color: '#1A2340' }}>内容をご確認のうえ、どちらかを選んでください。</p>

              {actionError && (
                <div className="rounded-lg p-3 mb-4 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                  <p className="text-sm" style={{ color: '#B91C1C' }}>{actionError}</p>
                </div>
              )}

              {showRejectForm && (
                <div className="rounded-xl p-4 mb-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                  <p className="text-sm font-bold mb-2" style={{ color: '#B91C1C' }}>↩ 差し戻し理由を入力してください</p>
                  <textarea
                    className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none"
                    style={{ borderColor: '#D0DAF0', color: '#1A2340', background: '#FFFFFF', minHeight: '100px', lineHeight: '1.6', resize: 'vertical' }}
                    placeholder="例：業務内容欄の記載を具体化してください。"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-3 mt-3">
                    <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50" style={{ background: '#DC2626' }}>
                      {actionLoading ? '送信中...' : '差し戻す'}
                    </button>
                    <button onClick={() => { setShowRejectForm(false); setRejectReason(''); setActionError('') }}
                      className="px-4 py-2.5 rounded-lg text-sm border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>キャンセル</button>
                  </div>
                </div>
              )}

              {showApproveConfirm && (
                <div className="rounded-xl p-4 mb-4 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
                  <p className="text-sm font-bold mb-2" style={{ color: '#065F46' }}>✅ 本当に承認してよいですか？</p>
                  <p className="text-sm mb-3 leading-relaxed" style={{ color: '#1A2340' }}>
                    承認すると、申請内容の変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                    承認後、スタッフへ署名依頼が自動送信されます。
                  </p>
                  <div className="flex gap-3">
                    <button onClick={handleApprove} disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50" style={{ background: '#1B3A8C' }}>
                      {actionLoading ? '処理中...' : '承認する'}
                    </button>
                    <button onClick={() => { setShowApproveConfirm(false); setActionError('') }}
                      className="px-4 py-2.5 rounded-lg text-sm border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>キャンセル</button>
                  </div>
                </div>
              )}

              {!showRejectForm && !showApproveConfirm && (
                <div className="flex gap-3">
                  <button onClick={() => setShowApproveConfirm(true)}
                    className="flex-1 py-3 rounded-lg text-sm font-bold text-white" style={{ background: '#1B3A8C' }}>承認する</button>
                  <button onClick={() => setShowRejectForm(true)}
                    className="flex-1 py-3 rounded-lg text-sm font-bold" style={{ color: '#DC2626', background: '#FEF2F2', border: '1px solid #F87171' }}>差し戻す</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
