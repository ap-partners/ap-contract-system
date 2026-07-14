// ===== 更新期限管理タブ（共通コンポーネント） =====
// 管理部ダッシュボード（全部門）・担当営業ダッシュボード（自部門のみ）・SSCダッシュボード
// （全部門・閲覧＋意向確認のみ）で共有する。
// docs/SYSTEM_DESIGN.md 10章 2026-07-14「更新期限管理タブの仕様を確定」・2026-07-14
// 「UI/UX再監査・カード型リストへの刷新」参照。
'use client'

import { useState, useEffect, Fragment } from 'react'
import {
  remainingDays,
  RenewalCandidate,
  isBothConfirmedToRenew,
  hasNonRenewalIntent,
  addDays,
} from './useRenewalCandidates'
import { useContractListToolbar } from './useContractListToolbar'

// データ取得・同期は親（管理部・担当営業・SSCダッシュボード）側でuseRenewalCandidatesを1回だけ
// 呼び出し、そこで得られる件数を「本日の状況」カード・タブ件数バッジにも使う（2026-07-14修正：
// このコンポーネント内で個別にhookを呼んでいたため、タブを開くまで件数が0のまま表示される
// 不具合があった）。このコンポーネントは表示・入力操作のみを担当する。
type Props = {
  candidates: RenewalCandidate[]
  loading: boolean
  updateCandidate: (id: string, patch: Partial<RenewalCandidate>) => Promise<void>
  searchCsvRenewal: (c: RenewalCandidate) => Promise<void>
  requestCsvImport: (c: RenewalCandidate, userId: string, dept: string | null) => Promise<void>
  switchToManualOverride: (id: string, reason: string) => Promise<void>
  copyDispatchToEmploy: (id: string, start: string, end: string) => Promise<void>
  bulkMarkReady: (ids: string[]) => Promise<{ updatedCount: number; skippedCount: number }>
  confirmNotRenewing: (id: string, reason: string) => Promise<void>
  currentUserId: string
  currentUserDeptName: string | null
  // SSCは「閲覧＋意向確認」までの権限とし、最終的な「送付準備完了」への一括確定操作は
  // 管理部・担当営業のみに残す（伊藤さんとの2026-07-14合意。原要件「SSCも管理部も管理する」を
  // 踏まえ、意向確認・CSV依頼・手入力切替・更新しない確定は引き続きSSCも操作可能にする）。
  canFinalize?: boolean
}

// 45/30/20/14/7日を目安にした段階表示（伊藤さん要件：45日前に初回通知、以降
// 30/20/14/7日でまだ更新できていない人を追う）。メール通知は次フェーズだが、
// 視覚的な緊急度はこの4段階の区切りに合わせておく。
function daysTier(days: number | null): { key: string; bg: string; color: string; label: string } {
  if (days === null) return { key: 'none', bg: '#EEF2FA', color: '#8B98B1', label: '―' }
  if (days < 0) return { key: 'overdue', bg: '#FDECEC', color: '#E74C3C', label: `${Math.abs(days)}日超過` }
  if (days <= 7) return { key: 't7', bg: '#FDECEC', color: '#E74C3C', label: `残${days}日` }
  if (days <= 14) return { key: 't14', bg: '#FFE2C7', color: '#C2410C', label: `残${days}日` }
  if (days <= 20) return { key: 't20', bg: '#FFF3E8', color: '#F59E42', label: `残${days}日` }
  if (days <= 30) return { key: 't30', bg: '#FFF8F1', color: '#B45309', label: `残${days}日` }
  if (days <= 45) return { key: 't45', bg: '#EEF2FA', color: '#1B3A8C', label: `残${days}日` }
  return { key: 'other', bg: '#EEF2FA', color: '#1B3A8C', label: `残${days}日` }
}

function daysBadge(days: number | null) {
  const t = daysTier(days)
  if (days === null) return <span className="text-xs text-[#8B98B1]">―</span>
  return (
    <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: t.bg, color: t.color }}>
      {t.label}
    </span>
  )
}

function Segmented({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: '#E8EDF5' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap transition"
          style={value === o.value ? { background: '#2F5FD0', color: '#fff' } : { color: '#6B7280' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  pending: '確認中',
  csv_pending: 'CSV未反映',
  ready: '送付準備完了',
  not_renewing: '更新しない',
}

// カード上でひと目でわかるよう、ステータスごとにバッジを出す（現状の唯一の抜けは
// 'ready'：以前は一括確定した後に画面上で見分けがつかず、二重処理につながる恐れがあった。
// 2026-07-14修正）。'pending'は通常状態のため出さない。
function StatusBadge({ status }: { status: RenewalCandidate['status'] }) {
  if (status === 'ready') {
    return <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: '#D1FAE5', color: '#065F46' }}>✓ 送付準備完了</span>
  }
  return null
}

export default function RenewalManagementTab({
  candidates, loading, updateCandidate,
  searchCsvRenewal, requestCsvImport, switchToManualOverride,
  copyDispatchToEmploy, bulkMarkReady, confirmNotRenewing,
  currentUserId, currentUserDeptName, canFinalize = true,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrideReasonId, setOverrideReasonId] = useState<string | null>(null)
  const [overrideReasonText, setOverrideReasonText] = useState('')
  const [manualDraft, setManualDraft] = useState<Record<string, { start: string; end: string }>>({})
  const [notRenewingReasonId, setNotRenewingReasonId] = useState<string | null>(null)
  const [notRenewingReasonText, setNotRenewingReasonText] = useState('')
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const [recheckingId, setRecheckingId] = useState<string | null>(null)

  // 残日数の内訳をKPIカードとして先頭に出す（伊藤さんご指摘：残日数の内訳が一目でわからず、
  // 今日どれから手をつけるべきか掴みにくい、への対応。2026-07-14追加）。45日前から対象に
  // 入る原要件に合わせ31〜45日の枠も持たせ、KPIの合計が一覧件数とズレないようにする
  // （2026-07-14修正：以前は31〜45日の対象がどのKPIにもカウントされていなかった）。
  const kpiBuckets = [
    { key: 't7', label: '7日以内（要対応）', color: '#E74C3C' },
    { key: 't14', label: '8〜14日', color: '#C2410C' },
    { key: 't20', label: '15〜20日', color: '#F59E42' },
    { key: 't30', label: '21〜30日', color: '#B45309' },
    { key: 't45', label: '31〜45日', color: '#1B3A8C' },
  ]
  const kpiCounts: Record<string, number> = { t7: 0, t14: 0, t20: 0, t30: 0, t45: 0 }
  for (const c of candidates) {
    const t = daysTier(remainingDays(c)).key
    const bucket = t === 'overdue' ? 't7' : t
    if (bucket in kpiCounts) kpiCounts[bucket]++
  }
  const unconfirmedCount = candidates.filter(c => c.staff_intent === 'unconfirmed' || c.client_intent === 'unconfirmed').length

  const statusOptions = Array.from(new Set(candidates.map(c => c.status)))
    .map(s => ({ value: s, label: STATUS_LABEL[s] || s }))

  const { result: filtered, toolbar, statusFilter, searchText, sortKey } = useContractListToolbar<RenewalCandidate>(candidates, {
    statusOptions,
    sortOptions: [
      { key: 'days_asc', label: '残日数が近い順', compare: (a, b) => (remainingDays(a) ?? 9999) - (remainingDays(b) ?? 9999) },
      { key: 'days_desc', label: '残日数が遠い順', compare: (a, b) => (remainingDays(b) ?? -9999) - (remainingDays(a) ?? -9999) },
      { key: 'empno', label: '社員番号順', compare: (a, b) => a.employee_number.localeCompare(b.employee_number) },
    ],
    getSearchText: c => `${c.staff_name || ''} ${c.employee_number} ${c.work_location_name || ''}`,
    searchPlaceholder: '氏名・社員番号・就業場所で検索',
  })

  // 絞り込み・検索・並び替えを変えると、画面から消えた案件のチェックが選択状態のまま
  // 残ってしまい、見えていない案件まで一括操作に巻き込まれる恐れがあった（2026-07-14修正）。
  // 条件を変えたタイミングで選択を必ずクリアする。
  useEffect(() => {
    setSelected(new Set())
  }, [statusFilter, searchText, sortKey])

  const toggleExpand = async (c: RenewalCandidate) => {
    const opening = expandedId !== c.id
    setExpandedId(opening ? c.id : null)
    if (opening && c.data_source === 'csv' && !c.manual_override && !c.new_csv_raw_data_id && c.status !== 'csv_pending') {
      await searchCsvRenewal(c)
    }
  }

  // csv_pending状態になった後、管理部がCSVインポートを完了しても、これまでは再検索する手段が
  // なく行が永久にcsv_pendingのまま止まっていた。「再検索」ボタンで明示的にやり直せるようにする
  // （2026-07-14修正）。
  const handleRecheck = async (c: RenewalCandidate) => {
    setRecheckingId(c.id)
    await searchCsvRenewal(c)
    setRecheckingId(null)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const showManualForm = (c: RenewalCandidate) => c.data_source === 'manual' || c.manual_override

  if (loading) {
    return <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#6B7280]">読み込み中です…</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiBuckets.map(b => (
          <div key={b.key} className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 backdrop-blur">
            <p className="text-sm font-semibold text-[#1F2937]">{b.label}</p>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-3xl font-semibold tracking-normal" style={{ color: b.color }}>{kpiCounts[b.key]}</span>
              <span className="pb-1 text-xs font-semibold" style={{ color: b.color }}>件</span>
            </div>
          </div>
        ))}
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 backdrop-blur">
          <p className="text-sm font-semibold text-[#1F2937]">意向未確定</p>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-3xl font-semibold tracking-normal text-[#6B7280]">{unconfirmedCount}</span>
            <span className="pb-1 text-xs font-semibold text-[#6B7280]">件</span>
          </div>
        </div>
      </div>

      {candidates.length > 0 && (
        <section className="rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <div className="[&_button]:rounded-[14px] [&_button]:font-semibold [&_input]:rounded-[14px] [&_input]:border-[#E8EDF5] [&_input]:transition [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[14px] [&_select]:border-[#E8EDF5]">
            {toolbar}
          </div>
        </section>
      )}

      {candidates.length === 0 ? (
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <p className="text-sm font-semibold text-[#1F2937]">現在、更新期限が近い対象者はいません。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <p className="text-sm font-semibold text-[#1F2937]">条件に一致する対象者が見つかりませんでした</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(c => {
            const days = remainingDays(c)
            const sameDate = c.employ_end_date && c.dispatch_end_date && c.employ_end_date === c.dispatch_end_date
            const periodLabel = sameDate
              ? `同一・${c.employ_end_date}`
              : `雇${c.employ_end_date || '―'} / 派${c.dispatch_end_date || '―'}`
            const isManual = showManualForm(c)
            // 「派遣期間_自」の初期候補は前回終了日そのものではなく、その翌日にする
            // （前回終了日をそのまま使うと新しい派遣期間が1日重複してしまうバグがあった。
            // 2026-07-14修正）。ユーザーが未入力のままコピー操作をしても、この候補値で
            // 動くようにdraft自体の初期値としても持たせる。
            const draft = manualDraft[c.id] || {
              start: c.new_dispatch_start || (c.dispatch_end_date ? addDays(c.dispatch_end_date, 1) : ''),
              end: c.new_dispatch_end || '',
            }

            return (
              <Fragment key={c.id}>
                <article className="rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]">
                  <div className="grid gap-4 lg:grid-cols-[28px_minmax(180px,1.3fr)_90px_minmax(170px,1fr)_150px_130px_150px_auto] lg:items-center">
                    <div className="flex items-center">
                      {canFinalize && (
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-semibold leading-6 text-[#1F2937]">{c.staff_name || '―'}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-1 text-xs font-medium text-[#8B98B1]">{c.employee_number}</p>
                    </div>

                    <div>{daysBadge(days)}</div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">雇用/派遣期間_至</p>
                      <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{periodLabel}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">スタッフ意向</p>
                      <Segmented
                        value={c.staff_intent}
                        onChange={v => updateCandidate(c.id, { staff_intent: (c.staff_intent === v ? 'unconfirmed' : v) as any })}
                        options={[{ value: 'renew', label: '希望' }, { value: 'end', label: '希望しない' }]}
                      />
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">クライアント意向</p>
                      <Segmented
                        value={c.client_intent}
                        onChange={v => updateCandidate(c.id, { client_intent: (c.client_intent === v ? 'unconfirmed' : v) as any })}
                        options={[{ value: 'ok', label: 'OK' }, { value: 'ng', label: 'NG' }]}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">データ元</p>
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
                        style={isManual ? { background: '#F3ECFF', color: '#5A3EC8' } : { background: '#EAF1FF', color: '#244CB3' }}>
                        {isManual ? (c.manual_override ? '手入力（クライアント変更）' : '手入力') : 'CSV自動'}
                      </span>
                      {!isManual && (
                        <button
                          onClick={() => { setOverrideReasonId(c.id); setOverrideReasonText('') }}
                          className="block mt-1 text-[10px] font-semibold underline"
                          style={{ color: '#F59E42' }}
                        >
                          派遣先変更のため手入力に切替
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-start lg:justify-end">
                      <button
                        onClick={() => toggleExpand(c)}
                        className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#EEF4FF] px-5 text-sm font-semibold text-[#2F5FD0] transition hover:-translate-y-0.5 hover:bg-[#DFEAFE]"
                      >
                        {expandedId === c.id ? '閉じる' : (c.status === 'csv_pending' ? 'CSV未反映' : !isManual ? '差異を確認' : '内容を入力')}
                      </button>
                    </div>
                  </div>

                  {c.status === 'not_renewing' && (
                    <div className="mt-4 rounded-2xl bg-[#F3F5F8] px-4 py-3">
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 mr-2" style={{ background: '#E8EDF5', color: '#6B7280' }}>更新しないで確定</span>
                      <span className="text-xs text-[#6B7280]">理由：{c.no_renewal_reason || '―'}</span>
                    </div>
                  )}

                  {c.status !== 'not_renewing' && hasNonRenewalIntent(c) && (
                    <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3">
                      <div className="text-xs mb-2" style={{ color: '#B91C1C' }}>
                        {c.staff_intent === 'end' ? 'スタッフが更新を希望していません。' : ''}
                        {c.client_intent === 'ng' ? 'クライアントの更新確認がNGです。' : ''}
                        　このまま「更新しない」で確定する場合は理由を入力してください。
                      </div>
                      {notRenewingReasonId === c.id ? (
                        <div className="flex gap-2">
                          <input
                            value={notRenewingReasonText}
                            onChange={e => setNotRenewingReasonText(e.target.value)}
                            placeholder="例：クライアントの案件終了のため"
                            className="flex-1 text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                          />
                          <button
                            onClick={async () => {
                              if (!notRenewingReasonText.trim()) return
                              await confirmNotRenewing(c.id, notRenewingReasonText.trim())
                              setNotRenewingReasonId(null)
                            }}
                            className="rounded-2xl bg-[#E74C3C] text-white text-xs font-semibold px-4 py-1.5 whitespace-nowrap"
                          >更新しないで確定</button>
                          <button onClick={() => setNotRenewingReasonId(null)} className="rounded-2xl border border-[#E8EDF5] text-xs font-semibold px-4 py-1.5 whitespace-nowrap">キャンセル</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setNotRenewingReasonId(c.id); setNotRenewingReasonText('') }}
                          className="rounded-2xl border border-[#E74C3C] text-xs font-semibold px-4 py-1.5 whitespace-nowrap"
                          style={{ color: '#E74C3C' }}
                        >更新しないで確定する</button>
                      )}
                    </div>
                  )}

                  {overrideReasonId === c.id && (
                    <div className="mt-4 rounded-2xl bg-[#FFF8F1] px-4 py-3">
                      <div className="text-xs text-[#8B98B1] mb-2">派遣先クライアントの変更理由を入力してください（手入力に切り替わります）</div>
                      <div className="flex gap-2">
                        <input
                          value={overrideReasonText}
                          onChange={e => setOverrideReasonText(e.target.value)}
                          placeholder="例：派遣先が◯◯から××に変更"
                          className="flex-1 text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                        />
                        <button
                          onClick={async () => {
                            if (!overrideReasonText.trim()) return
                            await switchToManualOverride(c.id, overrideReasonText.trim())
                            setOverrideReasonId(null)
                          }}
                          className="rounded-2xl bg-[#2F5FD0] text-white text-xs font-semibold px-4 py-1.5 whitespace-nowrap"
                        >切替確定</button>
                        <button onClick={() => setOverrideReasonId(null)} className="rounded-2xl border border-[#E8EDF5] text-xs font-semibold px-4 py-1.5 whitespace-nowrap">キャンセル</button>
                      </div>
                    </div>
                  )}

                  {expandedId === c.id && (
                    <div className="mt-4 rounded-2xl bg-[#F7FBFF] px-4 py-4">
                      {!isManual ? (
                        c.status === 'csv_pending' ? (
                          <div className="flex flex-col gap-2">
                            <div className="text-xs text-[#8B98B1]">CSVに新しい個別契約データがまだ反映されていません。管理部へインポートを依頼するか、既にインポート済みの場合は再検索してください。</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => requestCsvImport(c, currentUserId, currentUserDeptName)}
                                className="self-start rounded-2xl border border-[#E8EDF5] bg-white px-4 py-1.5 text-xs font-semibold text-[#2F5FD0]"
                              >CSVインポートを依頼</button>
                              <button
                                onClick={() => handleRecheck(c)}
                                disabled={recheckingId === c.id}
                                className="self-start rounded-2xl border border-[#D0DAF0] bg-white px-4 py-1.5 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50"
                              >{recheckingId === c.id ? '再検索中…' : 'CSVを再検索'}</button>
                            </div>
                          </div>
                        ) : (() => {
                          // 実際に値が変わった項目だけを表示する（前回と今回が同一の項目は
                          // 一覧に出さない。全項目を常に並べると「変わっていないのに変わって
                          // 見える」という誤解を招くため。2026-07-14修正）
                          const diffRows = [
                            { label: '雇用期間_至', before: c.employ_end_date, after: c.new_employ_end },
                            { label: '派遣期間_至', before: c.dispatch_end_date, after: c.new_dispatch_end },
                            { label: '就業場所', before: c.work_location_name, after: c.new_work_location_name },
                          ].filter(r => (r.before || null) !== (r.after || null))
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="text-[11px] text-[#8B98B1]">CSVから自動取得した最新内容との差異</div>
                              {diffRows.length === 0 ? (
                                <div className="text-xs text-[#6B7280]">前回契約から変更点はありません。</div>
                              ) : (
                                <table className="text-xs w-full">
                                  <tbody>
                                    <tr className="text-[#6B7280]"><td className="py-1 pr-3 w-1/5">項目</td><td className="py-1 pr-3 w-2/5">前回</td><td className="py-1 w-2/5">今回</td></tr>
                                    {diffRows.map(r => (
                                      <tr key={r.label}>
                                        <td className="py-1 pr-3">{r.label}</td>
                                        <td className="py-1 pr-3 text-[#8B98B1] line-through">{r.before || '―'}</td>
                                        <td className="py-1 font-semibold" style={{ color: '#E74C3C' }}>{r.after || '―'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )
                        })()
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="text-[11px] text-[#8B98B1]">
                            {c.manual_override ? '派遣先クライアント変更のため手入力です。' : '前回終了日の翌日をデフォルト表示しています。'}
                            派遣期間を入力すると雇用期間に自動でコピーされます。
                          </div>
                          <div className="grid grid-cols-3 gap-2 items-end">
                            <div>
                              <div className="text-[11px] text-[#6B7280] mb-1">派遣期間_自</div>
                              <input
                                type="date"
                                value={draft.start || (c.dispatch_end_date ? addDays(c.dispatch_end_date, 1) : '')}
                                onChange={e => setManualDraft(prev => ({ ...prev, [c.id]: { start: e.target.value, end: prev[c.id]?.end || draft.end } }))}
                                className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                              />
                            </div>
                            <div>
                              <div className="text-[11px] text-[#6B7280] mb-1">派遣期間_至</div>
                              <input
                                type="date"
                                value={draft.end}
                                onChange={e => setManualDraft(prev => ({ ...prev, [c.id]: { start: prev[c.id]?.start || draft.start, end: e.target.value } }))}
                                className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                              />
                            </div>
                            <button
                              onClick={() => draft.start && draft.end && copyDispatchToEmploy(c.id, draft.start, draft.end)}
                              className="rounded-2xl border border-[#E8EDF5] px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                              style={{ background: '#EAF1FF', color: '#244CB3' }}
                            >雇用期間へコピー ↓</button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[11px] text-[#6B7280] mb-1">雇用期間_自</div>
                              <input readOnly value={c.new_employ_start || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                            </div>
                            <div>
                              <div className="text-[11px] text-[#6B7280] mb-1">雇用期間_至</div>
                              <input readOnly value={c.new_employ_end || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              </Fragment>
            )
          })}
        </div>
      )}

      {canFinalize && candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#8B98B1]">
              {selected.size}件選択中
              {selected.size > 0 && `（うちスタッフ・クライアントとも「更新する」で確定済み：${Array.from(selected).filter(id => { const c = candidates.find(x => x.id === id); return c && isBothConfirmedToRenew(c) }).length}件）`}
            </span>
            <button
              disabled={selected.size === 0}
              onClick={async () => {
                const { updatedCount, skippedCount } = await bulkMarkReady(Array.from(selected))
                setBulkNotice(
                  skippedCount > 0
                    ? `${updatedCount}件を送付準備完了にしました（${skippedCount}件はスタッフ・クライアントどちらかの意向が未確定/更新しないのためスキップしました）`
                    : `${updatedCount}件を送付準備完了にしました`
                )
                setSelected(new Set())
              }}
              className="rounded-2xl bg-[#2F5FD0] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              選択行を一括で送付準備完了に
            </button>
          </div>
          {bulkNotice && <p className="text-xs text-[#6B7280] text-right">{bulkNotice}</p>}
        </div>
      )}
    </div>
  )
}
