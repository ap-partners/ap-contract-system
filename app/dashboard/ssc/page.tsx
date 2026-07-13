'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ContractStatus,
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

type Contract = ContractForDisplay

type TabType = '承認待ち' | '差し戻し中' | '承認済み'

export default function SSCDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 一括承認の確認ステップ（2026-07-13追加：確認なしで即実行されてしまい、誤操作時に取り返しが
  // つかないとの伊藤さん指摘を受けて、個別承認画面と同じ確認カードを挟むようにした）
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  // 一括承認の処理中フラグ（2026-07-13追加：承認〜通知APIの呼び出しに数秒かかり、
  // 押せているかどうか分かりにくいとの伊藤さん指摘を受けて、処理中であることを画面に出すようにした）
  const [bulkApproving, setBulkApproving] = useState(false)
  // 一括承認の完了件数（2026-07-13追加：処理完了後にOKを押すまで完了メッセージを表示し続けるための状態。
  // nullの間は未完了、数値が入ったら完了メッセージ＋OKボタンを表示する）
  const [bulkApproveDone, setBulkApproveDone] = useState<number | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== 'SSC') { router.push('/login'); return }
      setUser(data.user)

      const { data: rows, error } = await supabase
        .from('contracts')
        .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_at, rejection_reason, signed_at, warning_confirmations, warning_level, input_data')
        .neq('work_place', '社内')
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

  // 2026-07-14追加：「承認済み・完了」タブに案件が蓄積すると、署名待ち／署名済みが混在して
  // 分かりづらい・目当ての案件を探しにくい、との伊藤さんの指摘を受けて、絞り込み・並び替え・
  // テキスト検索を共通部品（useContractListToolbar）で追加した（docs/SYSTEM_DESIGN.md 10章
  // 2026-07-14参照）。承認待ち・差し戻し中タブはステータスが1種類のみのため、ピルボタンは
  // 出さず検索・並び替えのみ表示する（statusOptionsを空配列にすると自動的にピル行が消える）。
  const statusOptionsByTab: Record<TabType, { value: string; label: string }[]> = {
    '承認待ち': [],
    '差し戻し中': [],
    '承認済み': [
      { value: 'SSC承認済み', label: 'SSC承認済み' },
      { value: '署名待ち', label: '署名待ち' },
      { value: '署名済み', label: '署名済み' },
    ],
  }

  const { result: visibleContracts, toolbar: listToolbar } = useContractListToolbar(filtered, {
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

  // 承認待ちタブで一括承認対象となるのは「担当営業の自己申告警告」も「自動チェック警告」もない案件のみ
  // （絞り込み・検索後の一覧＝画面に見えている案件を対象にする。見えていない案件が選択されると
  // 分かりにくいため）
  const bulkTargets = visibleContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))

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
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
    if (error) {
      alert('一括承認に失敗しました: ' + error.message)
      setBulkApproving(false)
      return
    }

    // 個別承認（app/dashboard/ssc/contracts/[id]/page.tsx の handleApprove）と同様、
    // 承認直後に署名依頼通知APIを呼ぶ。締結パターンが「指定しない（自動送信）」の案件は
    // ここで「SSC承認済み→署名待ち」へ自動遷移し、従業員へ署名依頼メールが送られる。
    // 「対面」「印刷」パターンはこのAPI内で何もしない（担当営業の「説明完了」時に送信）。
    // 通知の失敗は承認自体をブロックしない（個別承認と同じ方針。2026-07-13対応）。
    await Promise.all(
      ids.map(id =>
        fetch(`/api/contracts/${id}/notify-sign-request`, { method: 'POST' }).catch(() => {})
      )
    )

    // 通知APIによる遷移（署名待ちへ進んだ案件がある）を画面に反映するため、対象契約の
    // 最新ステータスをDBから再取得する（一律「SSC承認済み」にしてしまうと、自動送信パターンの
    // 案件が実際には署名待ちに進んでいても一覧上は古いステータスのまま表示されてしまうため）。
    const { data: refreshed } = await supabase
      .from('contracts')
      .select('id, status')
      .in('id', ids)
    const statusMap = new Map((refreshed || []).map(r => [r.id, r.status as ContractStatus]))
    setContracts(prev => prev.map(c => statusMap.has(c.id) ? { ...c, status: statusMap.get(c.id)! } : c))
    // ここではまだ selectedIds・確認カードを閉じない。伊藤さんの指摘（2026-07-13）を受けて、
    // 完了メッセージ＋OKボタンをこの後表示し、OKを押した時点で初めて片付ける。
    setBulkApproving(false)
    setBulkApproveDone(ids.length)
  }

  // 一括承認の完了メッセージでOKを押した時のクローズ処理
  const handleBulkApproveDoneOk = () => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
  }

  const tabs: { key: TabType; label: string; count: number; color: string; tint: string }[] = [
    { key: '承認待ち', label: '承認待ち', count: pendingCount, color: '#1D4ED8', tint: '#EEF0F5' },
    { key: '差し戻し中', label: '差し戻し中', count: rejectedCount, color: '#B91C1C', tint: '#FEE2E2' },
    { key: '承認済み', label: '承認済み・署名状況', count: approvedCount, color: '#065F46', tint: '#D1FAE5' },
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
        {/* タブ型サマリーカード（クリックで絞り込み） */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key
            const icon = tab.key === '承認待ち'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="13" y2="14" /></svg>
              : tab.key === '差し戻し中'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isActive ? tab.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
            return (
              <div key={tab.key}
                className="rounded-xl px-4 py-3.5 transition-all"
                style={isActive
                  ? { background: tab.tint, borderLeft: `3px solid ${tab.color}`, borderTop: '0.5px solid #D0DAF0', borderRight: '0.5px solid #D0DAF0', borderBottom: '0.5px solid #D0DAF0' }
                  : { background: 'white', border: '0.5px solid #D0DAF0' }}>
                <div className="flex items-center gap-1.5">
                  {icon}
                  <p className="text-xs font-medium" style={{ color: isActive ? tab.color : '#5A6A8A' }}>{tab.label}</p>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-2xl font-bold" style={{ color: isActive ? tab.color : '#1A2340' }}>{tab.count}</span>
                  <button
                    onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                    className="flex items-center gap-1 rounded-full transition-all"
                    style={isActive
                      ? { background: tab.color, border: 'none', padding: '6px 13px', cursor: 'pointer' }
                      : { background: 'white', border: `1px solid ${tab.color}`, padding: '5px 12px', cursor: 'pointer' }}>
                    <span className="text-xs font-medium" style={{ color: isActive ? 'white' : tab.color }}>一覧を見る</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isActive ? 'white' : tab.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 一括承認バー（承認待ちタブのみ） */}
        {activeTab === '承認待ち' && bulkTargets.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-between items-center px-4 py-3 bg-white rounded-xl border" style={{ borderColor: '#D0DAF0' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === bulkTargets.length && bulkTargets.length > 0}
                  onChange={() => { toggleSelectAll(); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: '#1B3A8C' }}
                />
                <span className="text-sm" style={{ color: '#5A6A8A' }}>警告なし案件をすべて選択</span>
              </label>
              <button
                onClick={() => setShowBulkApproveConfirm(true)}
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

            {/* 一括承認の確認カード（2026-07-13追加：個別承認画面と同じ確認ステップを挟む。
                誤操作で即実行されてしまわないようにするための対応。処理中・完了時は下の全画面オーバーレイに切り替わる） */}
            {showBulkApproveConfirm && selectedIds.size > 0 && !bulkApproving && bulkApproveDone === null && (
              <div className="mt-3 rounded-xl p-4 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
                <p className="text-sm font-bold mb-2" style={{ color: '#065F46' }}>
                  ✅ 選択中の{selectedIds.size}件を本当に一括承認してよいですか？
                </p>
                <p className="text-sm mb-3 leading-relaxed" style={{ color: '#1A2340' }}>
                  承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                  承認後、対象スタッフへ署名・確認依頼が自動送信されます（雇用契約書は署名、就業条件明示書は内容確認の依頼になります。対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleBulkApprove}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                    style={{ background: '#1B3A8C' }}>
                    選択中の{selectedIds.size}件を一括承認する
                  </button>
                  <button
                    onClick={() => setShowBulkApproveConfirm(false)}
                    className="px-4 py-2.5 rounded-lg text-sm border"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 絞り込み・並び替え・検索（2026-07-14追加） */}
        {!loading && filtered.length > 0 && listToolbar}

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
        ) : visibleContracts.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-sm font-medium" style={{ color: '#1A2340' }}>
              条件に一致する申請が見つかりませんでした
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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
                            onChange={() => { toggleSelect(contract.id); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
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
                          <ContractStatusBadge status={contract.status} />
                        </div>
                        {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
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

      {/* 一括承認：処理中／完了の全画面オーバーレイ（2026-07-13追加：確認カード内の小さい表示だと
          目立たず進捗が分かりにくいとの伊藤さん指摘を受けて、画面全体を覆う形に変更。完了後はOKを
          押すまで表示され続ける） */}
      {(bulkApproving || bulkApproveDone !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,64,0.6)' }}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            {bulkApproving ? (
              <>
                <div className="mx-auto mb-5 w-14 h-14 rounded-full border-4 animate-spin"
                  style={{ borderColor: '#1B3A8C', borderTopColor: 'transparent' }} />
                <p className="text-lg font-bold mb-2" style={{ color: '#1A2340' }}>一括承認処理中です</p>
                <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                  しばらくお待ちください。<br />
                  画面を閉じたり、戻ったりしないでください。
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl mb-3">✅</p>
                <p className="text-lg font-bold mb-2" style={{ color: '#065F46' }}>
                  一括承認が完了しました（{bulkApproveDone}件）
                </p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#1A2340' }}>
                  対象スタッフへ署名・確認依頼が自動送信されました。<br />
                  （対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）
                </p>
                <button
                  onClick={handleBulkApproveDoneOk}
                  className="w-full py-3 rounded-lg text-base font-bold text-white"
                  style={{ background: '#1B3A8C' }}>
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
