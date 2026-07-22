'use client'

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useSessionCollisionGuard } from '@/lib/useSessionCollisionGuard'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
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
import { useApprovedAccumulator, APPROVED_WINDOW_DAYS, CONTRACT_COLUMNS } from '../_shared/useApprovedAccumulator'
import RenewalManagementTab from '../_shared/RenewalManagementTab'
import { useRenewalCandidates } from '../_shared/useRenewalCandidates'
import { useToast } from '@/app/_shared/ui/ToastProvider'

type Contract = ContractForDisplay

type TabType = '承認待ち' | '差し戻し中' | '承認済み' | '更新期限管理'

type IconName =
  | 'home'
  | 'file'
  | 'search'
  | 'filter'
  | 'clock'
  | 'check'
  | 'refresh'
  | 'arrow'
  | 'alert'
  | 'map'
  | 'logout'
  | 'bell'
  | 'plus'

const Icon = ({ name, className = '' }: { name: IconName; className?: string }) => {
  const paths: Record<IconName, ReactElement> = {
    home: (
      <>
        <path d="m3 10.5 9-7 9 7" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    filter: (
      <>
        <path d="M3 5h18" />
        <path d="M7 12h10" />
        <path d="M10 19h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 1-15.5 6.2" />
        <path d="M3 12A9 9 0 0 1 18.5 5.8" />
        <path d="M18 2v4h4" />
        <path d="M6 22v-4H2" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
    plus: (
      <>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M12 12v5" />
        <path d="M9.5 14.5h5" />
      </>
    ),
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export default function SSCDashboard() {
  const router = useRouter()
  const { showError } = useToast()
  const [user, setUser] = useState<any>(null)
  // 総合レビュー（QA監査2026-07-22）指摘C1対応：別タブで別アカウントにログインされ
  // 認証情報が裏で切り替わったことを検知したら、安全のため強制ログアウトする
  useSessionCollisionGuard(user?.id)
  // 「承認待ち」「差し戻し中」は対応が終われば別タブへ移るフロー型のため、件数は自然に少数のまま
  // 留まる。全件取得のままで問題ない（docs/SYSTEM_DESIGN.md 10章 2026-07-14参照）。
  const [flowContracts, setFlowContracts] = useState<Contract[]>([])
  // 「承認済み・署名状況」（蓄積型）は共通フックで直近45日・ページ単位で取得する。
  const {
    approvedContracts, approvedTotalCount, approvedHasMore, approvedLoadingMore,
    approvedSearchMode, approvedSearching, approvedSearchNotice,
    fetchApprovedRecent, loadMoreApproved, runApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.neq('work_place', '社内'))
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkApproveDone, setBulkApproveDone] = useState<number | null>(null)
  // 二重承認ガード（総合レビュー指摘12）：一括承認完了時に「他の人が先に処理済みだった」件数が
  // あった場合にここへ入れて、完了ダイアログで伝える
  const [bulkApproveSkipped, setBulkApproveSkipped] = useState(0)
  // 総合レビュー指摘24対応：notify-sign-request（署名依頼メール送信）が失敗しても、以前は
  // .catch(()=>{})で握りつぶし「送信しました」と断言していた。実際の失敗件数を完了ダイアログで
  // 伝える（個別の再送信UIは今回のスコープ外。失敗した契約は「SSC承認済み」のまま止まるため、
  // 管理部・伊藤さんへの連絡で個別対応する運用とする）。
  const [bulkApproveNotifyFailed, setBulkApproveNotifyFailed] = useState(0)
  // 更新期限管理タブ：SSCは全部門を閲覧・意向確認できる（承認権限に相当する「送付準備完了」
  // の一括確定は管理部・担当営業のみ。2026-07-14「SSCも管理部も管理する」要件を踏まえ追加）
  const {
    candidates: renewalCandidates, loading: renewalLoading,
    syncCandidates, fetchCandidates, updateCandidate,
    searchCsvRenewal, requestCsvImport, switchToManualOverride,
    copyDispatchToEmploy, confirmNotRenewing, setTriageMode, executeBulkApply,
  } = useRenewalCandidates()

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== 'SSC') { router.push('/login'); return }
      setUser(data.user)

      const { data: flowRows, error } = await supabase
        .from('contracts')
        .select(CONTRACT_COLUMNS)
        .neq('work_place', '社内')
        .in('status', ['申請中', '差し戻し中'])
        .order('created_at', { ascending: false })

      if (error) { console.error('contracts取得エラー:', error); setLoading(false); return }
      setFlowContracts((flowRows || []) as Contract[])
      await fetchApprovedRecent()
      await syncCandidates()
      await fetchCandidates(null)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filtered = activeTab === '承認済み'
    ? approvedContracts
    : flowContracts.filter(c => {
        if (activeTab === '承認待ち') return c.status === '申請中'
        if (activeTab === '差し戻し中') return c.status === '差し戻し中'
        return false
      })

  const statusOptionsByTab: Record<TabType, { value: string; label: string }[]> = {
    '承認待ち': [],
    '差し戻し中': [],
    '承認済み': [
      { value: 'SSC承認済み', label: 'SSC承認済み' },
      { value: '署名待ち', label: '署名待ち' },
      { value: '署名済み', label: '署名済み' },
    ],
    '更新期限管理': [],
  }

  const { result: visibleContracts, toolbar: listToolbar, statusFilter: listStatusFilter, searchText, sortKey: listSortKey } = useContractListToolbar(filtered, {
    statusOptions: statusOptionsByTab[activeTab],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: activeTab,
  })

  // 絞り込み・検索・並び替えを変えると、画面から消えた案件のチェックが選択状態のまま残ってしまい、
  // 見えていない案件まで一括承認に巻き込まれる恐れがあった（総合レビュー指摘11・2026-07-15対応）。
  // RenewalManagementTab.tsxと同じ考え方で、条件を変えたタイミングで選択を必ずクリアする。
  useEffect(() => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
  }, [listStatusFilter, searchText, listSortKey])

  const bulkTargets = visibleContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))

  const pendingCount = flowContracts.filter(c => c.status === '申請中').length
  const rejectedCount = flowContracts.filter(c => c.status === '差し戻し中').length
  const approvedCount = approvedTotalCount

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
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    // 二重承認ガード（総合レビュー指摘12）：SSCと管理部が同時に同じ案件を承認すると二重更新・
    // notify-sign-requestの二重送信（メール2通）が起きうるため、更新時に「まだ申請中の案件だけ」
    // という条件を必ずつけ、実際に更新できた件数だけを対象にする。
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      showError('一括承認に失敗しました: ' + error.message)
      setBulkApproving(false)
      return
    }

    const approvedIds = (updatedRows || []).map(r => r.id as string)
    const skipped = ids.length - approvedIds.length

    let notifyFailedCount = 0
    if (approvedIds.length > 0) {
      const notifyAuthHeader = await getAuthHeader()
      const notifyResults = await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST', headers: notifyAuthHeader })
            .then(res => res.ok)
            .catch(() => false)
        )
      )
      notifyFailedCount = notifyResults.filter(ok => !ok).length
    }

    setFlowContracts(prev => prev.filter(c => !ids.includes(c.id)))
    await fetchApprovedRecent()
    setBulkApproving(false)
    setBulkApproveSkipped(skipped)
    setBulkApproveNotifyFailed(notifyFailedCount)
    setBulkApproveDone(approvedIds.length)
  }

  const handleBulkApproveDoneOk = () => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
    setBulkApproveSkipped(0)
    setBulkApproveNotifyFailed(0)
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: '承認待ち', label: '承認待ち', count: pendingCount },
    { key: '差し戻し中', label: '差し戻し', count: rejectedCount },
    { key: '承認済み', label: '承認済み・署名状況', count: approvedCount },
    { key: '更新期限管理', label: '更新期限管理', count: renewalCandidates.length },
  ]

  const summaryCards = [
    { label: '承認待ち', value: pendingCount, tone: 'text-[#2F5FD0]', icon: 'clock' as const, bar: 'bg-[#2F5FD0]' },
    { label: '差し戻し', value: rejectedCount, tone: 'text-[#E74C3C]', icon: 'refresh' as const, bar: 'bg-[#E74C3C]' },
    { label: '承認済み・署名状況', value: approvedCount, tone: 'text-[#4CAF50]', icon: 'check' as const, bar: 'bg-[#4CAF50]' },
  ]

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
      <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F8FAFD] text-[#1F2937]">
      <header className="border-b border-[#E8EDF5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="APパートナーズ" width={64} height={38} className="h-auto w-[64px]" />
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">APパートナーズ</p>
                <p className="text-xs font-medium text-[#6B7280]">SSCダッシュボード</p>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-[#E8EDF5] md:block" />
            <div className="hidden md:block">
              <h1 className="text-2xl font-semibold tracking-normal text-[#1F2937]">契約書管理システム</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">承認状況を確認し、必要な申請を処理できます</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/apply')}
              className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl bg-[#2F5FD0] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]"
            >
              <Icon name="plus" className="h-4 w-4" />
              雇用契約書 新規発行
            </button>
            <button
              onClick={() => router.push('/pledge/apply')}
              className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl bg-[#F59E42] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(245,158,66,.2)] transition hover:-translate-y-0.5 hover:bg-[#E88525] hover:shadow-[0_15px_34px_rgba(245,158,66,.28)]"
            >
              <Icon name="plus" className="h-4 w-4" />
              アルバイト誓約書 新規発行
            </button>
            <button
              onClick={handleLogout}
              className="flex h-12 items-center gap-2 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] shadow-[0_10px_30px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0] hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]"
            >
              <Icon name="logout" className="h-4 w-4" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_1.45fr] xl:items-center">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
                <Icon name="file" className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">本日の承認状況</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#2F5FD0] md:text-5xl">
                  承認待ち {pendingCount}件
                </h2>
                <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">
                  期限超過や個別確認が必要な案件を優先して確認してください。
                </p>
                <button
                  onClick={() => { setActiveTab('承認待ち'); setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                  className="mt-6 inline-flex h-[52px] items-center gap-3 rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]"
                >
                  すべての承認待ちを確認する
                  <Icon name="arrow" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {summaryCards.map(card => (
                <div key={card.label} className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-semibold text-[#1F2937]">{card.label}</p>
                    <Icon name={card.icon} className="h-6 w-6 text-[#1F2937]" />
                  </div>
                  <div className="mt-6 flex items-end gap-2">
                    <span className={`text-4xl font-semibold tracking-normal ${card.tone}`}>{card.value}</span>
                    <span className={`pb-1 text-base font-semibold ${card.tone}`}>件</span>
                  </div>
                  <div className="mt-6 h-1 rounded-full bg-[#E8EDF5]">
                    <div className={`h-1 w-8 rounded-full ${card.bar}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav className="mt-6 border-b border-[#E8EDF5]">
          <div className="flex gap-8 overflow-x-auto overflow-y-hidden">
            {tabs.map(tab => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                  className={`group relative whitespace-nowrap px-1 pb-4 text-sm font-semibold transition ${isActive ? 'text-[#2F5FD0]' : 'text-[#1F2937] hover:text-[#2F5FD0]'}`}
                >
                  {tab.label}
                  <span className="ml-2 text-[#6B7280]">({tab.count})</span>
                  <span className={`absolute bottom-[-1px] left-0 h-0.5 rounded-full bg-[#2F5FD0] transition-all duration-300 ${isActive ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </button>
              )
            })}
          </div>
        </nav>

        {!loading && filtered.length > 0 && (
          <section className="mt-5 rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Icon name="filter" className="h-5 w-5 text-[#1F2937]" />
                <h2 className="text-base font-semibold text-[#1F2937]">絞り込み条件</h2>
              </div>
              <Icon name="search" className="h-5 w-5 text-[#6B7280]" />
            </div>
            <div className="[&_button]:rounded-[14px] [&_button]:font-semibold [&_input]:rounded-[14px] [&_input]:border-[#E8EDF5] [&_input]:transition [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[14px] [&_select]:border-[#E8EDF5]">
              {listToolbar}
            </div>
            {activeTab === '承認済み' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!approvedSearchMode ? (
                  <>
                    <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                    <button onClick={() => runApprovedSearch(searchText)} disabled={!searchText.trim() || approvedSearching}
                      className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50">
                      {approvedSearching ? '検索中…' : '全期間で検索'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-[#6B7280]">全期間検索の結果です{approvedSearchNotice ? '（' + approvedSearchNotice + '）' : ''}</p>
                    <button onClick={fetchApprovedRecent} className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0]">
                      直近{APPROVED_WINDOW_DAYS}日の表示に戻す
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === '承認待ち' && bulkTargets.length > 0 && (
          <section className="mt-5">
            <div className="flex flex-col gap-4 rounded-[18px] border border-[#E8EDF5] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,.05)] sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={selectedIds.size === bulkTargets.length && bulkTargets.length > 0}
                  onChange={() => { toggleSelectAll(); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                  className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
                />
                警告のない案件をすべて選択
              </label>
              <button
                onClick={() => setShowBulkApproveConfirm(true)}
                disabled={selectedIds.size === 0}
                className="inline-flex h-[52px] items-center justify-center gap-3 rounded-2xl bg-[#F59E42] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(245,158,66,.2)] transition hover:-translate-y-0.5 hover:bg-[#E88525] hover:shadow-[0_15px_34px_rgba(245,158,66,.28)] disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:shadow-none disabled:hover:translate-y-0"
              >
                <Icon name="check" className="h-5 w-5" />
                一括承認する（{selectedIds.size}件選択中）
              </button>
            </div>

            {showBulkApproveConfirm && selectedIds.size > 0 && !bulkApproving && bulkApproveDone === null && (
              <div className="mt-4 rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
                <p className="text-base font-semibold text-[#1F2937]">
                  選択中の{selectedIds.size}件を一括承認しますか
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
                  承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                  承認後、対象スタッフへ署名・確認依頼が自動送信されます（雇用契約書は署名、就業条件明示書は内容確認の依頼になります。対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）。
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkApproving}
                    className="inline-flex h-[52px] flex-1 items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#244CB3] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    選択中の{selectedIds.size}件を一括承認する
                  </button>
                  <button
                    onClick={() => setShowBulkApproveConfirm(false)}
                    className="inline-flex h-[52px] items-center justify-center rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab !== '更新期限管理' && (
        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-[#6B7280]">
            <span className="font-semibold text-[#1F2937]">{visibleContracts.length}</span>件の申請が見つかりました
          </p>
        </div>
        )}

        {activeTab !== '更新期限管理' && (loading ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-5 rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <Icon name="file" className="mx-auto h-10 w-10 text-[#6B7280]" />
            <p className="mt-4 text-sm font-semibold text-[#1F2937]">
              {activeTab === '承認待ち' && '承認待ちの申請はありません'}
              {activeTab === '差し戻し中' && '差し戻し中の申請はありません'}
              {activeTab === '承認済み' && '承認済みの申請はありません'}
            </p>
          </div>
        ) : visibleContracts.length === 0 ? (
          <div className="mt-5 rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <Icon name="search" className="mx-auto h-10 w-10 text-[#6B7280]" />
            <p className="mt-4 text-sm font-semibold text-[#1F2937]">
              条件に一致する申請が見つかりませんでした
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {visibleContracts.map(contract => {
              const staff = contract.input_data?.staff || {}
              const f = contract.input_data?.fields || {}
              const deadline = getDeadlineAlert(contract)
              const warning = hasWarning(contract)
              const autoWarning = hasAutoCheckWarning(contract)
              const isSelected = selectedIds.has(contract.id)
              const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
              const hasAnyWarning = warning || autoWarning
              const canBulkSelect = activeTab === '承認待ち' && !hasAnyWarning
              const showWarningIcon = activeTab === '承認待ち' && hasAnyWarning
              // 自動チェック警告の重要度で色を出し分ける（red＝赤、それ以外（yellow）＝青）。
              // 以前の一覧では🔴／🟡で重要度を区別していたため、その差が消えないようにする。
              const autoWarningTone = contract.warning_level === 'red'
                ? 'bg-[#FDECEC] text-[#E74C3C]'
                : 'bg-[#EAF1FF] text-[#2F5FD0]'

              return (
                <article
                  key={contract.id}
                  className="grid gap-4 rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)] 2xl:grid-cols-[36px_minmax(180px,1.3fr)_minmax(180px,1.2fr)_minmax(150px,.9fr)_minmax(140px,.85fr)_minmax(130px,.75fr)_136px] 2xl:items-center"
                >
                  <div className="flex items-center">
                    {canBulkSelect && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => { toggleSelect(contract.id); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                        onClick={e => e.stopPropagation()}
                        className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
                      />
                    )}
                    {showWarningIcon && (
                      <span title="警告あり" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF3E8] text-[#F59E42]">
                        <Icon name="alert" className="h-5 w-5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {deadline.type && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deadline.type === 'overdue' ? 'bg-[#FDECEC] text-[#E74C3C]' : 'bg-[#FFF3E8] text-[#F59E42]'}`}>
                          {deadline.label}
                        </span>
                      )}
                      {warning && (
                        // 総合レビュー指摘F対応（2026-07-16）：🔴（赤＝要注意）の絵文字なのに
                        // 背景がオレンジで危険度の直感が働かないという指摘。赤系に統一。
                        <span className="rounded-full bg-[#FDECEC] px-3 py-1 text-xs font-semibold text-[#E74C3C]">
                          🔴 個別確認が必要（一括承認対象外）
                        </span>
                      )}
                      {autoWarning && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${autoWarningTone}`}>
                          {contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）
                        </span>
                      )}
                    </div>
                    <p className="break-words text-[21px] font-semibold leading-7 text-[#1F2937]">{staff.name || '-'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#6B7280]">
                      <span>{staff.employee_number || '-'}</span>
                      <span className="h-3 w-px bg-[#E8EDF5]" />
                      <span className="break-words">{staff.department || '-'}</span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-[#6B7280]">勤務先</p>
                    <div className="flex items-start gap-2">
                      <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#2F5FD0]" />
                      <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{f.workLocationName || '-'}</p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-[#6B7280]">ステータス</p>
                    <div className="flex flex-wrap gap-2">
                      <ContractStatusBadge status={contract.status} />
                      <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                      <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
                      <span className="rounded-full bg-[#F3F5F8] px-3 py-1 text-xs font-semibold text-[#6B7280]">
                        {getDocumentLabel(contract.document_type, contract.pattern)}
                      </span>
                      {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-[#6B7280]">契約期間</p>
                    <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{getEmployPeriodLabel(contract)}</p>
                    {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
                      <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B7280]">{f.dispatchStart} 〜 {f.dispatchEnd}</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-[#6B7280]">申請日時</p>
                    <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(contract.created_at)}</p>
                    <p className="mt-1 break-words text-xs font-medium text-[#6B7280]">申請者 {contract.created_by_name || `ID:${contract.created_by.slice(0, 8)}`}</p>
                  </div>

                  <div className="flex items-center justify-start 2xl:justify-end">
                    <button
                      className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#EEF4FF] px-5 text-sm font-semibold text-[#2F5FD0] transition hover:-translate-y-0.5 hover:bg-[#DFEAFE]"
                      onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}
                    >
                      {activeTab === '承認待ち' ? '詳細へ' : '詳細を見る'}
                      <Icon name="arrow" className="h-4 w-4" />
                    </button>
                  </div>

                  {contract.status === '差し戻し中' && contract.rejection_reason && (
                    <div className="rounded-2xl border border-[#FFE2C7] bg-[#FFF8F1] p-4 2xl:col-span-7">
                      <p className="text-xs font-semibold text-[#F59E42]">差し戻し理由</p>
                      <p className="mt-2 break-words text-sm font-medium leading-6 text-[#1F2937]">{contract.rejection_reason}</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ))}

        {activeTab === '更新期限管理' && user && (
          <div className="mt-5">
            <RenewalManagementTab
              candidates={renewalCandidates}
              loading={renewalLoading}
              updateCandidate={updateCandidate}
              searchCsvRenewal={searchCsvRenewal}
              requestCsvImport={requestCsvImport}
              switchToManualOverride={switchToManualOverride}
              copyDispatchToEmploy={copyDispatchToEmploy}
              confirmNotRenewing={confirmNotRenewing}
              setTriageMode={setTriageMode}
              executeBulkApply={executeBulkApply}
              currentUserId={user.id}
              currentUserEmail={user.email}
              currentUserDeptName="SSC"
              canFinalize={false}
            />
          </div>
        )}

        {activeTab === '承認済み' && approvedHasMore && !approvedSearchMode && (
          <div className="mt-5 flex justify-center">
            <button onClick={loadMoreApproved} disabled={approvedLoadingMore}
              className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
              {approvedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
            </button>
          </div>
        )}
      </main>

      {(bulkApproving || bulkApproveDone !== null) && (
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
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF8EE] text-[#4CAF50]">
                  <Icon name="check" className="h-7 w-7" />
                </div>
                <p className="text-lg font-semibold text-[#1F2937]">
                  一括承認が完了しました（{bulkApproveDone}件）
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
                  対象スタッフへ署名の確認依頼を送信しました。
                </p>
                {bulkApproveSkipped > 0 && (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#F59E42]">
                    {bulkApproveSkipped}件は、選択後に他の人が先に承認・差し戻し済みだったため、
                    <br />対象から除外しました。
                  </p>
                )}
                {bulkApproveNotifyFailed > 0 && (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#E74C3C]">
                    {bulkApproveNotifyFailed}件は承認は完了しましたが、送信依頼メールの送信に失敗しました。
                    <br />該当の契約は「SSC承認済み」のまま止まっています。管理部にご連絡ください。
                  </p>
                )}
                <button
                  onClick={handleBulkApproveDoneOk}
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
