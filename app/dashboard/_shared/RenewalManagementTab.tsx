// ===== 更新期限管理タブ（共通コンポーネント） =====
// 管理部ダッシュボード（全部門）・担当営業ダッシュボード（自部門のみ）・SSCダッシュボード
// （全部門・閲覧のみ）で共有する。
// docs/SYSTEM_DESIGN.md 10章 2026-07-14「更新期限管理タブの仕様を確定」・2026-07-16
// 「更新期限管理タブの改修方針を確定」（チャットA）参照。
'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  remainingDays,
  RenewalCandidate,
  addDays,
  ContactFields,
} from './useRenewalCandidates'

// 2026-07-16追加（チャットB・④差異確認の表示範囲拡大）：指揮命令者・派遣先責任者・
// 苦情処理申出先の3グループ×4項目の表示ラベル
const CONTACT_GROUP_LABELS: Record<keyof ContactFields, string> = {
  cmd: '指揮命令者',
  resp: '派遣先責任者',
  comp: '苦情処理申出先',
}
const CONTACT_FIELD_LABELS: Record<'dept' | 'role' | 'name' | 'tel', string> = {
  dept: '部署', role: '役職', name: '氏名', tel: 'TEL',
}
import { useContractListToolbar } from './useContractListToolbar'
import RenewalContractConfirmModal from './RenewalContractConfirmModal'

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
  confirmNotRenewing: (id: string, reason: string) => Promise<void>
  // 2026-07-17追加（チャットC・⑤）：仕分けフラグ（未定/一括申請/個別申請）の切り替え
  setTriageMode: (id: string, mode: RenewalCandidate['triage_mode']) => Promise<void>
  // 2026-07-17追加（チャットC・⑤の契約データ生成処理）：「一括申請」に仕分けた行を実際に
  // contracts行として作成する処理本体。useRenewalCandidates()から渡される。
  executeBulkApply: (
    targets: RenewalCandidate[],
    submitterUserId: string,
    submitterEmail: string
  ) => Promise<{ successIds: string[]; failed: { employeeNumber: string; staffName: string | null; reason: string }[] }>
  currentUserId: string
  currentUserEmail: string
  currentUserDeptName: string | null
  // SSCは「閲覧のみ」の想定（伊藤さんとの2026-07-14合意）。チャットCで実装した仕分けトグル・
  // 一括申請の実行ボタンは、このpropがfalseの場合は操作不可（閲覧のみ）にする。
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

// トグル系UIの共通見た目。チャットC・⑤の「未定／一括申請／個別申請」トグルで使用。
// disabledを指定したoptionは選択できず、選択理由をtitle属性で表示する。
function Segmented({
  value, onChange, options, disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; disabled?: boolean; disabledReason?: string }[]
  disabled?: boolean
}) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: '#E8EDF5' }}>
      {options.map(o => {
        const isDisabled = disabled || o.disabled
        return (
          <button
            key={o.value}
            onClick={() => !isDisabled && onChange(o.value)}
            disabled={isDisabled}
            title={o.disabled ? o.disabledReason : undefined}
            className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40"
            style={value === o.value && !isDisabled ? { background: '#2F5FD0', color: '#fff' } : { color: '#6B7280' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  pending: '確認中',
  csv_pending: 'CSV未反映',
  not_renewing: '更新しない',
}

// document_typeにはSTEP1の選択ボタン表示用のliteralな改行（'雇用契約書 兼\n就業条件明示書'）が
// そのまま入っていることがあるため、一覧表示用に改行をスペースへ変換する
// （app/api/contracts/[id]/pdf/route.tsのgetDocumentLabel()と同じ考え方）。
function formatDocumentType(documentType: string | null): string {
  if (!documentType) return '―'
  return documentType.replace(/\n/g, ' ').trim()
}

// 2026-07-17追加（チャットC・⑤）：「一括申請」に切り替えられるのは、新しい雇用期間・派遣期間
// の両方が確定している行のみ（伊藤さんご指摘：CSV未反映のまま、または手入力の期間が未入力の
// 状態で一括申請対象にできてしまうと危険なため）。「更新しない」で確定済みの行も対象外。
function periodReady(c: RenewalCandidate): boolean {
  if (c.status !== 'pending') return false
  return Boolean(c.new_employ_start && c.new_employ_end && c.new_dispatch_start && c.new_dispatch_end)
}

const TRIAGE_LABEL: Record<RenewalCandidate['triage_mode'], string> = {
  undecided: '未対応',
  bulk: '一括申請',
  individual: '個別申請',
}

export default function RenewalManagementTab({
  candidates, loading, updateCandidate,
  searchCsvRenewal, requestCsvImport, switchToManualOverride,
  copyDispatchToEmploy, confirmNotRenewing, setTriageMode, executeBulkApply,
  currentUserId, currentUserEmail, currentUserDeptName, canFinalize = true,
}: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideReasonId, setOverrideReasonId] = useState<string | null>(null)
  const [overrideReasonText, setOverrideReasonText] = useState('')
  const [manualDraft, setManualDraft] = useState<Record<string, { start: string; end: string }>>({})
  const [notRenewingReasonId, setNotRenewingReasonId] = useState<string | null>(null)
  const [notRenewingReasonText, setNotRenewingReasonText] = useState('')
  const [recheckingId, setRecheckingId] = useState<string | null>(null)
  // 2026-07-16追加（チャットB・④）：指揮命令者等12項目の差異詳細の開閉状態
  const [contactDetailId, setContactDetailId] = useState<string | null>(null)
  // 2026-07-17追加（チャットB・⑥）：契約内容の全項目確認モーダルの開閉対象
  const [confirmModalCandidate, setConfirmModalCandidate] = useState<RenewalCandidate | null>(null)
  // 2026-07-17追加（チャットC・⑤の契約データ生成処理）：一括申請の確認ダイアログ→処理中の
  // 全画面オーバーレイ→完了件数の結果表示（SSC・管理部の一括承認と同じパターン）
  const [showBulkApplyConfirm, setShowBulkApplyConfirm] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkApplyResult, setBulkApplyResult] = useState<{ successCount: number; failed: { employeeNumber: string; staffName: string | null; reason: string }[] } | null>(null)

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

  const statusOptions = Array.from(new Set(candidates.map(c => c.status)))
    .map(s => ({ value: s, label: STATUS_LABEL[s] || s }))

  const { result: filtered, toolbar } = useContractListToolbar<RenewalCandidate>(candidates, {
    statusOptions,
    sortOptions: [
      { key: 'days_asc', label: '残日数が近い順', compare: (a, b) => (remainingDays(a) ?? 9999) - (remainingDays(b) ?? 9999) },
      { key: 'days_desc', label: '残日数が遠い順', compare: (a, b) => (remainingDays(b) ?? -9999) - (remainingDays(a) ?? -9999) },
      { key: 'empno', label: '社員番号順', compare: (a, b) => a.employee_number.localeCompare(b.employee_number) },
    ],
    getSearchText: c => `${c.staff_name || ''} ${c.employee_number} ${c.work_location_name || ''}`,
    searchPlaceholder: '氏名・社員番号・就業場所で検索',
  })

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

  const showManualForm = (c: RenewalCandidate) => c.data_source === 'manual' || c.manual_override

  const handleExecuteBulkApply = async (targets: RenewalCandidate[]) => {
    if (targets.length === 0 || bulkApplying) return
    setBulkApplying(true)
    const { successIds, failed } = await executeBulkApply(targets, currentUserId, currentUserEmail)
    setBulkApplying(false)
    setBulkApplyResult({ successCount: successIds.length, failed })
  }

  const handleBulkApplyDoneOk = () => {
    setShowBulkApplyConfirm(false)
    setBulkApplyResult(null)
  }

  if (loading) {
    return <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#6B7280]">読み込み中です…</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpiBuckets.map(b => (
          <div key={b.key} className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 backdrop-blur">
            <p className="text-sm font-semibold text-[#1F2937]">{b.label}</p>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-3xl font-semibold tracking-normal" style={{ color: b.color }}>{kpiCounts[b.key]}</span>
              <span className="pb-1 text-xs font-semibold" style={{ color: b.color }}>件</span>
            </div>
          </div>
        ))}
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
            // メタ情報（所属部署・雇用形態）：staffマスタの現在値。2026-07-16追加。
            const metaParts = [c.current_dept_name, c.current_contract_type].filter(Boolean)
            // 「派遣期間_自」の初期候補は前回終了日そのものではなく、その翌日にする
            // （前回終了日をそのまま使うと新しい派遣期間が1日重複してしまうバグがあった。
            // 2026-07-14修正）。ユーザーが未入力のままコピー操作をしても、この候補値で
            // 動くようにdraft自体の初期値としても持たせる。
            const draft = manualDraft[c.id] || {
              start: c.new_dispatch_start || (c.dispatch_end_date ? addDays(c.dispatch_end_date, 1) : ''),
              end: c.new_dispatch_end || '',
            }
            // 2026-07-16：右端ボタンの文言を状態表現から行動表現に統一（意思決定ログ⑨）
            const actionLabel = c.status === 'csv_pending' ? '対応方法を確認' : !isManual ? '更新内容を確認' : '更新内容を入力'

            return (
              <Fragment key={c.id}>
                <article className="rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]">
                  <div className="grid gap-4 lg:grid-cols-[minmax(200px,1.6fr)_90px_minmax(160px,0.9fr)_130px_150px_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-semibold leading-6 text-[#1F2937]">{c.staff_name || '―'}</p>
                        {c.status === 'not_renewing' && (
                          <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: '#E8EDF5', color: '#6B7280' }}>更新しない</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-medium text-[#8B98B1]">
                        {c.employee_number}
                        {metaParts.length > 0 && <span className="ml-1.5">・{metaParts.join('・')}</span>}
                      </p>
                    </div>

                    <div>{daysBadge(days)}</div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">雇用/派遣期間_至</p>
                      <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{periodLabel}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">書類種別</p>
                      <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{formatDocumentType(c.document_type)}</p>
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

                    <div className="flex flex-col items-start gap-1.5 lg:items-end">
                      <button
                        onClick={() => toggleExpand(c)}
                        className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#EEF4FF] px-5 text-sm font-semibold text-[#2F5FD0] transition hover:-translate-y-0.5 hover:bg-[#DFEAFE]"
                      >
                        {expandedId === c.id ? '閉じる' : actionLabel}
                      </button>
                      {/* 2026-07-16：スタッフ・クライアント意向トグル廃止に伴い、「更新しない」の
                          確定操作は意向の不一致を待たず常時操作可能にする（意思決定ログ⑧）。 */}
                      {c.status !== 'not_renewing' && (
                        <button
                          onClick={() => { setNotRenewingReasonId(c.id); setNotRenewingReasonText('') }}
                          className="text-[11px] font-semibold underline text-[#8B98B1] hover:text-[#6B7280]"
                        >
                          更新しないで確定する
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 2026-07-17追加（チャットC・⑤）：仕分けトグル（未定/一括申請/個別申請）。
                      「更新しない」で確定済みの行には出さない（対象外のため）。純粋なブックキーピング
                      フラグで、切り替え自体に副作用は無い（伊藤さん確定・2026-07-16）。 */}
                  {c.status !== 'not_renewing' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#8B98B1]">対応方針</span>
                      <Segmented
                        value={c.triage_mode}
                        onChange={v => setTriageMode(c.id, v as RenewalCandidate['triage_mode'])}
                        disabled={!canFinalize}
                        options={[
                          { value: 'undecided', label: TRIAGE_LABEL.undecided },
                          {
                            value: 'bulk',
                            label: TRIAGE_LABEL.bulk,
                            disabled: !periodReady(c),
                            disabledReason: '新しい雇用期間・派遣期間が確定してから選べます',
                          },
                          { value: 'individual', label: TRIAGE_LABEL.individual },
                        ]}
                      />
                      {/* 2026-07-17追加（チャットD・⑤個別申請）：「個別申請」に仕分けた行にのみ、
                          専用の「個別に申請する」ボタンを表示する。押すと初めて/apply（原契約
                          プリフィル・最終確認直行）に遷移する。一括申請と違い、この画面内では
                          内容確認・編集を完結させず/apply側に任せる（意思決定ログ2026-07-16参照）。
                          SSCは閲覧のみのため表示しない。 */}
                      {c.triage_mode === 'individual' && canFinalize && (
                        <button
                          onClick={() => router.push(`/apply?renewal=${c.id}`)}
                          className="rounded-2xl px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
                          style={{ background: '#5A3EC8' }}
                        >
                          個別に申請する →
                        </button>
                      )}
                    </div>
                  )}

                  {c.status === 'not_renewing' && (
                    <div className="mt-4 rounded-2xl bg-[#F3F5F8] px-4 py-3">
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 mr-2" style={{ background: '#E8EDF5', color: '#6B7280' }}>更新しないで確定</span>
                      <span className="text-xs text-[#6B7280]">理由：{c.no_renewal_reason || '―'}</span>
                    </div>
                  )}

                  {notRenewingReasonId === c.id && (
                    <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3">
                      <div className="text-xs mb-2" style={{ color: '#B91C1C' }}>更新しない理由を入力してください。</div>
                      <div className="flex gap-2">
                        <input
                          value={notRenewingReasonText}
                          onChange={e => setNotRenewingReasonText(e.target.value)}
                          placeholder="例：クライアントの案件終了のため"
                          className="flex-1 text-xs rounded-lg border border-[#E8EDF5] bg-white px-2 py-1.5"
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
                          className="flex-1 text-xs rounded-lg border border-[#E8EDF5] bg-white px-2 py-1.5"
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
                      {/* 2026-07-17追加（チャットB・⑥）：雇用期間・派遣期間・指揮命令者等の限られた
                          項目だけでなく、契約の全項目（就業場所住所・業務内容・給与など）を
                          STEP8形式で確認できる読み取り専用画面への導線 */}
                      <button
                        onClick={() => setConfirmModalCandidate(c)}
                        className="mb-3 self-start rounded-2xl border border-[#D0DAF0] bg-white px-4 py-1.5 text-xs font-semibold text-[#2F5FD0]"
                      >契約内容をすべて確認</button>

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
                          // 2026-07-15修正（伊藤さんご指摘）：自（開始日）だけが変わらないことは
                          // なく、自と至は必ずセットで変わるため、至だけでなく自もあわせて
                          // 「自◯◯ 〜 至◯◯」の形式で1項目にまとめて表示する。
                          const formatPeriod = (start: string | null, end: string | null) =>
                            (!start && !end) ? '―' : `自${start || '―'} 〜 至${end || '―'}`
                          const diffRows = [
                            {
                              label: '雇用期間',
                              before: formatPeriod(c.employ_start_date, c.employ_end_date),
                              after: formatPeriod(c.new_employ_start, c.new_employ_end),
                              changed: (c.employ_start_date || null) !== (c.new_employ_start || null) || (c.employ_end_date || null) !== (c.new_employ_end || null),
                            },
                            {
                              label: '派遣期間',
                              before: formatPeriod(c.dispatch_start_date, c.dispatch_end_date),
                              after: formatPeriod(c.new_dispatch_start, c.new_dispatch_end),
                              changed: (c.dispatch_start_date || null) !== (c.new_dispatch_start || null) || (c.dispatch_end_date || null) !== (c.new_dispatch_end || null),
                            },
                            {
                              label: '就業場所',
                              before: c.work_location_name || '―',
                              after: c.new_work_location_name || '―',
                              changed: (c.work_location_name || null) !== (c.new_work_location_name || null),
                            },
                          ].filter(r => r.changed)

                          // 2026-07-16追加（チャットB・④）：雇用期間・派遣期間・就業場所以外に、
                          // 指揮命令者・派遣先責任者・苦情処理申出先（部署/役職/氏名/TEL、計12項目）
                          // で変わった項目があれば別枠で検知する。CSV自動反映でも派遣先の担当者が
                          // 変わることは普通にあり得るため（伊藤さんご指摘）、変更があった項目だけを
                          // 「詳細を確認」ボタンの先に表示する。
                          const contactDiffRows: { group: string; field: string; before: string; after: string }[] = []
                          if (c.previous_contact_fields && c.new_contact_fields) {
                            (['cmd', 'resp', 'comp'] as const).forEach(g => {
                              (['dept', 'role', 'name', 'tel'] as const).forEach(f => {
                                const before = c.previous_contact_fields?.[g]?.[f] || null
                                const after = c.new_contact_fields?.[g]?.[f] || null
                                if ((before || null) !== (after || null)) {
                                  contactDiffRows.push({
                                    group: CONTACT_GROUP_LABELS[g],
                                    field: CONTACT_FIELD_LABELS[f],
                                    before: before || '―',
                                    after: after || '―',
                                  })
                                }
                              })
                            })
                          }

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
                                        <td className="py-1 pr-3 align-top">{r.label}</td>
                                        <td className="py-1 pr-3 text-[#8B98B1] line-through align-top">{r.before}</td>
                                        <td className="py-1 font-semibold align-top" style={{ color: '#E74C3C' }}>{r.after}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {contactDiffRows.length > 0 && (
                                <div className="rounded-2xl bg-[#FFF8F1] px-4 py-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold" style={{ color: '#B45309' }}>
                                      指揮命令者・派遣先責任者・苦情処理申出先にも変更点があります（{contactDiffRows.length}項目）
                                    </div>
                                    <button
                                      onClick={() => setContactDetailId(contactDetailId === c.id ? null : c.id)}
                                      className="shrink-0 rounded-full border border-[#E8EDF5] bg-white px-3 py-1 text-[11px] font-semibold text-[#2F5FD0]"
                                    >{contactDetailId === c.id ? '閉じる' : '詳細を確認'}</button>
                                  </div>
                                  {contactDetailId === c.id && (
                                    <table className="mt-2 text-xs w-full">
                                      <tbody>
                                        <tr className="text-[#6B7280]"><td className="py-1 pr-3 w-1/5">項目</td><td className="py-1 pr-3 w-2/5">前回</td><td className="py-1 w-2/5">今回</td></tr>
                                        {contactDiffRows.map((r, i) => (
                                          <tr key={i}>
                                            <td className="py-1 pr-3 align-top">{r.group}・{r.field}</td>
                                            <td className="py-1 pr-3 text-[#8B98B1] line-through align-top">{r.before}</td>
                                            <td className="py-1 font-semibold align-top" style={{ color: '#E74C3C' }}>{r.after}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
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

                          {/* 2026-07-16追加（チャットB・⑦）：誤って前回と同じ期間のまま申請してしまう
                              ケースへの安全チェック。あくまで警告のみで、入力や申請自体は止めない
                              （過去に誤った内容で署名済みの契約を訂正するケースもあり得るため。
                              伊藤さんご指摘・2026-07-16）。 */}
                          {draft.start && draft.end && c.dispatch_start_date && c.dispatch_end_date
                            && draft.start === c.dispatch_start_date && draft.end === c.dispatch_end_date && (
                            <div className="rounded-2xl px-4 py-2.5" style={{ background: '#FDECEC' }}>
                              <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>
                                入力された派遣期間が前回と全く同じです。誤って同じ期間のまま入力していないかご確認ください。
                              </p>
                              <p className="mt-0.5 text-[11px]" style={{ color: '#B91C1C' }}>
                                （前回契約の内容を訂正するための申請である場合は、そのまま進めて問題ありません）
                              </p>
                            </div>
                          )}

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

      {/* 2026-07-17追加（チャットC・⑤）：仕分け状況の集計と一括申請の実行ボタンを常に見える
          位置に固定表示する（伊藤さんご指摘：行数が多い場合いちいちスクロールするのは面倒なため）。
          件数は「実行前の状態」＝triage_modeの内訳を表す。SSCは閲覧のみ（canFinalize=false）
          のため実行不可。 */}
      {candidates.length > 0 && (() => {
        const active = candidates.filter(c => c.status !== 'not_renewing')
        const bulkTargets = active.filter(c => c.triage_mode === 'bulk')
        const bulkCount = bulkTargets.length
        const individualCount = active.filter(c => c.triage_mode === 'individual').length
        const undecidedCount = active.filter(c => c.triage_mode === 'undecided').length
        const canExecute = canFinalize && bulkCount > 0
        return (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E8EDF5] bg-white px-5 py-4 shadow-[0_15px_40px_rgba(15,23,42,.12)]">
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#6B7280]">
              <span>一括申請 <span style={{ color: '#2F5FD0' }}>{bulkCount}件</span></span>
              <span>個別申請 <span style={{ color: '#5A3EC8' }}>{individualCount}件</span></span>
              <span>未対応 <span style={{ color: '#8B98B1' }}>{undecidedCount}件</span></span>
            </div>
            <button
              onClick={() => setShowBulkApplyConfirm(true)}
              disabled={!canExecute}
              title={!canFinalize ? '閲覧のみのため実行できません' : bulkCount === 0 ? '一括申請に仕分けた案件がありません' : undefined}
              className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#244CB3] disabled:cursor-not-allowed disabled:bg-[#EEF4FF] disabled:text-[#2F5FD0] disabled:opacity-40 disabled:hover:translate-y-0"
            >
              一括申請を実行（{bulkCount}件）
            </button>

            {showBulkApplyConfirm && canExecute && !bulkApplying && bulkApplyResult === null && (
              <div className="w-full rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
                <p className="text-sm font-semibold text-[#1F2937]">
                  「一括申請」に仕分けた{bulkCount}件を、確定済みの新しい雇用期間・派遣期間で申請しますか
                </p>
                <p className="mt-2 text-xs font-medium leading-6 text-[#6B7280]">
                  各対象者について、新規の契約申請（申請中ステータス）が自動で作成されます。作成後は通常の申請と同じくSSC・管理部の承認が必要です。<br />
                  内容に誤りがないか、対象者ごとに「契約内容をすべて確認」で今一度ご確認ください。
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => handleExecuteBulkApply(bulkTargets)}
                    className="inline-flex h-[48px] flex-1 items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#244CB3]"
                  >
                    {bulkCount}件を一括申請する
                  </button>
                  <button
                    onClick={() => setShowBulkApplyConfirm(false)}
                    className="inline-flex h-[48px] items-center justify-center rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {confirmModalCandidate && (
        <RenewalContractConfirmModal
          candidate={confirmModalCandidate}
          onClose={() => setConfirmModalCandidate(null)}
        />
      )}

      {(bulkApplying || bulkApplyResult !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,41,55,.52)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,.18)]">
            {bulkApplying ? (
              <>
                <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-[#DDE8FF] border-t-[#2F5FD0]" />
                <p className="text-lg font-semibold text-[#1F2937]">一括申請を処理しています</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
                  完了までしばらくお待ちください。画面を閉じずにお待ちください。
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF8EE] text-[#4CAF50]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="text-lg font-semibold text-[#1F2937]">
                  一括申請が完了しました（{bulkApplyResult?.successCount ?? 0}件）
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
                  作成した申請は、通常の申請と同じくSSC・管理部の承認待ち一覧に表示されます。
                </p>
                {bulkApplyResult && bulkApplyResult.failed.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3 text-left">
                    <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>
                      {bulkApplyResult.failed.length}件は作成に失敗しました。
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {bulkApplyResult.failed.map((f, i) => (
                        <li key={i} className="text-xs" style={{ color: '#B91C1C' }}>
                          {f.staffName || '―'}（{f.employeeNumber}）：{f.reason}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px]" style={{ color: '#B91C1C' }}>
                      失敗した案件は「一括申請」のまま残っています。再実行するか、個別申請に切り替えてください。
                    </p>
                  </div>
                )}
                <button
                  onClick={handleBulkApplyDoneOk}
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
