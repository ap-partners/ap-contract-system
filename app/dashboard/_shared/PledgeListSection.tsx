'use client'

// ===== アルバイト誓約書 一覧セクション（SSC・管理部・担当営業ダッシュボード共通） =====
// 2026-07-23新設。2026-07-24全面リデザイン（伊藤さん指摘：雇用契約書の一覧とデザイン・構成・
// 仕様が違いすぎるため統一）：
//   ①カードデザインを契約一覧（ssc/page.tsx）と同じ角丸カード×行形式に刷新
//   ②テキスト検索・並び替えを追加
//   ③一括承認機能を追加（canApprove時のみ。契約一覧のhandleBulkApproveと同じ設計＝
//     警告なし案件のみ選択可・二重承認ガード付き条件付きUPDATE・確認/処理中/完了オーバーレイ・
//     絞り込み変更時の選択クリア（総合レビュー指摘11と同じ考え方））
//   ④自動チェック警告バッジ（warning_level red/yellow）の表示
// 詳細画面は/dashboard/ssc/pledges/[id]（SSC・管理部共通）。担当営業は読み取り専用の
// /dashboard/sales/pledges/[id]を使う。
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getAuthHeader } from '@/lib/supabase'

type PledgeRow = {
  id: string
  document_type: string
  status: string
  work_place_type: string
  client_name: string | null
  created_by_name: string | null
  created_at: string
  signed_at: string | null
  warning_level: 'none' | 'yellow' | 'red' | null
  auto_check_results: { type: string; level: 'yellow' | 'red'; message: string }[] | null
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
type SortKey = 'newest' | 'oldest'

type Props = {
  // 担当営業ダッシュボードから使う場合、自部門（created_by_dept_no）のみに絞り込む。
  deptNoFilter?: number
  // 詳細画面の遷移先。SSC・管理部は/dashboard/ssc/pledges、担当営業は/dashboard/sales/pledges。
  detailBasePath?: string
  // SSC・管理部のみtrue：一括承認バーを表示する（2026-07-24追加）。
  canApprove?: boolean
}

export default function PledgeListSection({ deptNoFilter, detailBasePath = '/dashboard/ssc/pledges', canApprove = false }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<PledgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('承認待ち')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  // 一括承認（2026-07-24追加）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkDone, setBulkDone] = useState<number | null>(null)
  const [bulkSkipped, setBulkSkipped] = useState(0)
  const [bulkNotifyFailed, setBulkNotifyFailed] = useState(0)

  const load = async () => {
    setLoading(true)
    let query = supabase
      .from('pledges')
      .select('id, document_type, status, work_place_type, client_name, created_by_name, created_at, signed_at, warning_level, auto_check_results, input_data')
      .order('created_at', { ascending: false })
      .limit(200)
    if (deptNoFilter !== undefined) query = query.eq('created_by_dept_no', deptNoFilter)
    const { data } = await query
    setRows((data || []) as PledgeRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [deptNoFilter])

  // 絞り込み・検索・並び替えを変えたら選択状態を必ずクリアする（総合レビュー指摘11と同じ考え方）
  useEffect(() => {
    setSelectedIds(new Set())
    setShowBulkConfirm(false)
    setBulkDone(null)
  }, [filter, searchText, sortKey])

  const matchesSearch = (r: PledgeRow) => {
    const q = searchText.trim().toLowerCase()
    if (!q) return true
    const staffSnap = r.input_data?.staff || {}
    return [staffSnap.name, staffSnap.employee_number, staffSnap.department, r.client_name, r.created_by_name, r.document_type]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q))
  }

  const filtered = rows
    .filter(r => {
      if (filter === '承認待ち') return r.status === '申請中'
      if (filter === '差し戻し中') return r.status === '差し戻し中'
      return !['申請中', '差し戻し中'].includes(r.status)
    })
    .filter(matchesSearch)
    .sort((a, b) => sortKey === 'newest'
      ? b.created_at.localeCompare(a.created_at)
      : a.created_at.localeCompare(b.created_at))

  const pendingCount = rows.filter(r => r.status === '申請中').length
  const rejectedCount = rows.filter(r => r.status === '差し戻し中').length

  const hasAutoWarning = (r: PledgeRow) => (r.warning_level === 'red' || r.warning_level === 'yellow')
  // 一括承認の対象＝表示中の承認待ちのうち警告のないもの（契約一覧と同じルール）
  const bulkTargets = canApprove && filter === '承認待ち'
    ? filtered.filter(r => r.status === '申請中' && !hasAutoWarning(r))
    : []

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setShowBulkConfirm(false)
    setBulkDone(null)
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === bulkTargets.length ? new Set() : new Set(bulkTargets.map(r => r.id)))
    setShowBulkConfirm(false)
    setBulkDone(null)
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkError('')
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    const { data: userData } = await supabase.auth.getUser()
    // 二重承認ガード（総合レビュー指摘12と同じ考え方）：まだ「申請中」の案件だけを条件付きで更新し、
    // 実際に更新できた件数だけを完了扱い・通知対象にする。
    const { data: updatedRows, error } = await supabase
      .from('pledges')
      .update({ status: 'SSC承認済み', approved_by: userData?.user?.id || null, approved_at: now, updated_at: now })
      .in('id', ids)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      setBulkApproving(false)
      setShowBulkConfirm(false)
      alertBulkError(error.message)
      return
    }
    const approvedIds = (updatedRows || []).map(r => r.id as string)
    const skipped = ids.length - approvedIds.length

    let notifyFailedCount = 0
    if (approvedIds.length > 0) {
      const notifyAuthHeader = await getAuthHeader()
      const notifyResults = await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/pledges/${id}/notify-sign-request`, { method: 'POST', headers: notifyAuthHeader })
            .then(res => res.ok)
            .catch(() => false)
        )
      )
      notifyFailedCount = notifyResults.filter(ok => !ok).length
    }

    await load()
    setBulkApproving(false)
    setShowBulkConfirm(false)
    setBulkSkipped(skipped)
    setBulkNotifyFailed(notifyFailedCount)
    setBulkDone(approvedIds.length)
  }

  // 一括承認エラー表示（このコンポーネントはToastProvider配下とは限らないためインライン表示）
  const [bulkError, setBulkError] = useState('')
  const alertBulkError = (msg: string) => setBulkError('一括承認に失敗しました：' + msg)

  const handleBulkDoneOk = () => {
    setSelectedIds(new Set())
    setBulkDone(null)
    setBulkSkipped(0)
    setBulkNotifyFailed(0)
  }

  return (
    <div>
      {/* ===== 絞り込み・検索・並び替えツールバー（契約一覧と同等の情報量に統一） ===== */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="氏名・社員番号・就業先で検索"
            className="rounded-[14px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs font-medium text-[#1F2937] outline-none transition focus:border-[#2F5FD0] w-56"
          />
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="rounded-[14px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs font-medium text-[#1F2937] outline-none"
          >
            <option value="newest">申請日時が新しい順</option>
            <option value="oldest">申請日時が古い順</option>
          </select>
        </div>
      </div>

      {/* ===== 一括承認バー（SSC・管理部の承認待ちタブのみ） ===== */}
      {canApprove && filter === '承認待ち' && bulkTargets.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-col gap-3 rounded-[18px] border border-[#E8EDF5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#1F2937]">
              <input
                type="checkbox"
                checked={selectedIds.size === bulkTargets.length && bulkTargets.length > 0}
                onChange={toggleSelectAll}
                className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
              />
              警告のない案件をすべて選択
            </label>
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={selectedIds.size === 0}
              className="inline-flex h-[48px] items-center justify-center rounded-2xl bg-[#F59E42] px-6 text-sm font-semibold text-white transition hover:bg-[#E88525] disabled:cursor-not-allowed disabled:bg-[#D1D5DB]"
            >
              一括承認する（{selectedIds.size}件選択中）
            </button>
          </div>

          {bulkError && (
            <div className="mt-3 rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {bulkError}
            </div>
          )}

          {showBulkConfirm && selectedIds.size > 0 && !bulkApproving && bulkDone === null && (
            <div className="mt-3 rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5">
              <p className="text-base font-semibold text-[#1F2937]">選択中の{selectedIds.size}件を一括承認しますか</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
                承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                承認後、対象スタッフへ署名依頼が自動送信されます。
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkApproving}
                  className="inline-flex h-[48px] flex-1 items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:bg-[#244CB3] disabled:opacity-60"
                >
                  選択中の{selectedIds.size}件を一括承認する
                </button>
                <button
                  onClick={() => setShowBulkConfirm(false)}
                  className="inline-flex h-[48px] items-center justify-center rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-sm font-medium text-[#6B7280] mb-3">
        <span className="font-semibold text-[#1F2937]">{filtered.length}</span>件の申請が見つかりました
      </p>

      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: '#9CA3AF' }}>読み込み中…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center">
          <p className="text-sm font-semibold text-[#1F2937]">該当する申請はありません</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(r => {
            const staffSnap = r.input_data?.staff || {}
            const badge = STATUS_BADGE[r.status] || { label: r.status, bg: '#F3F4F6', color: '#6B7280' }
            const autoWarning = hasAutoWarning(r)
            const canBulkSelect = canApprove && filter === '承認待ち' && r.status === '申請中' && !autoWarning
            const isSelected = selectedIds.has(r.id)
            const autoWarningTone = r.warning_level === 'red'
              ? 'bg-[#FDECEC] text-[#E74C3C]'
              : 'bg-[#EAF1FF] text-[#2F5FD0]'
            return (
              <article
                key={r.id}
                className="grid gap-4 rounded-[18px] border border-[#E8EDF5] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)] xl:grid-cols-[36px_minmax(180px,1.3fr)_minmax(160px,1.1fr)_minmax(150px,.9fr)_minmax(140px,.85fr)_120px] xl:items-center"
              >
                <div className="flex items-center">
                  {canBulkSelect && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(r.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
                    />
                  )}
                  {canApprove && filter === '承認待ち' && autoWarning && (
                    <span title="警告あり" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF3E8] text-[#F59E42] text-lg">⚠</span>
                  )}
                </div>

                <div className="min-w-0">
                  {autoWarning && (
                    <div className="mb-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${autoWarningTone}`}>
                        {r.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）
                      </span>
                    </div>
                  )}
                  <p className="break-words text-[19px] font-semibold leading-7 text-[#1F2937]">{staffSnap.name || '―'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-medium text-[#6B7280]">
                    <span>{staffSnap.employee_number || '―'}</span>
                    <span className="h-3 w-px bg-[#E8EDF5]" />
                    <span className="break-words">{staffSnap.department || '―'}</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-[#6B7280]">就業先</p>
                  <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">
                    {r.work_place_type === 'client' ? (r.client_name || 'クライアント先') : '自社拠点'}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-[#6B7280]">ステータス</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    <span className="rounded-full bg-[#F3F5F8] px-3 py-1 text-xs font-semibold text-[#6B7280]">{r.document_type}</span>
                    {r.status === '署名済み' && r.signed_at && (
                      <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-semibold text-[#047857]">
                        {formatDateTime(r.signed_at)} 署名
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-[#6B7280]">申請日時</p>
                  <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(r.created_at)}</p>
                  <p className="mt-1 break-words text-xs font-medium text-[#6B7280]">申請者 {r.created_by_name || '―'}</p>
                </div>

                <div className="flex items-center justify-start xl:justify-end">
                  <button
                    className="inline-flex h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-2xl bg-[#EEF4FF] px-5 text-sm font-semibold text-[#2F5FD0] transition hover:bg-[#DFEAFE]"
                    onClick={() => router.push(`${detailBasePath}/${r.id}`)}
                  >
                    詳細へ
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* ===== 一括承認：処理中／完了オーバーレイ（契約一覧と同じ構成） ===== */}
      {(bulkApproving || bulkDone !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,41,55,.52)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,.18)]">
            {bulkApproving ? (
              <>
                <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-[#DDE8FF] border-t-[#2F5FD0]" />
                <p className="text-lg font-semibold text-[#1F2937]">一括承認を処理しています</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
                  完了までしばらくお待ちください。画面を閉じずにお待ちください。
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF8EE] text-[#4CAF50] text-2xl">✓</div>
                <p className="text-lg font-semibold text-[#1F2937]">一括承認が完了しました（{bulkDone}件）</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">対象スタッフへ署名依頼を送信しました。</p>
                {bulkSkipped > 0 && (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#F59E42]">
                    {bulkSkipped}件は、選択後に他の人が先に承認・差し戻し済みだったため、
                    <br />対象から除外しました。
                  </p>
                )}
                {bulkNotifyFailed > 0 && (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#E74C3C]">
                    {bulkNotifyFailed}件は承認は完了しましたが、署名依頼メールの送信に失敗しました。
                    <br />該当の申請は「SSC承認済み」のまま止まっています。管理部にご連絡ください。
                  </p>
                )}
                <button
                  onClick={handleBulkDoneOk}
                  className="mt-7 inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:bg-[#244CB3]"
                >
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
