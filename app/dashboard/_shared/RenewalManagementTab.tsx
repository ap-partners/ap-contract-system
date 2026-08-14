// ===== 更新期限管理タブ（共通コンポーネント） =====
// 管理部ダッシュボード（全部門・社内案件はis_internal_approverのみRLS経由で閲覧）・
// 担当営業ダッシュボード（自部門のみ・社内案件は常にRLSで非表示）・SSCダッシュボード
// （全部門・閲覧のみ・社内案件は常にRLSで非表示）で共有する。
// 2026-07-31：情報設計を全面見直し（docs/SYSTEM_DESIGN.md 10章 2026-07-31
// 「更新期限管理タブの情報設計見直し ― 業務フロー整理と再設計方針確定」参照）。
// 「ボタンが多くて分かりづらい」という指摘に対し、状態タブ5つ（仕分け待ち／CSV自動反映／
// 期間のみ更新／修正更新／CSVインポート待ち）に分け、行1つが常に1つのタブにだけ属する形に
// 整理した。旧実装（残日数カードの下に全員を並べ、行ごとにチェックボックス・セグメント等が
// 同居する形）は撤廃し、契約一覧（PledgeListSection等）と同じ「1行目＝氏名＋操作ボタン、
// 2行目以降＝補足情報のグリッド」のレイアウトに統一した。
'use client'

import { useState, Fragment, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  remainingDays,
  RenewalCandidate,
  RenewalTab,
  addDays,
  ContactFields,
  periodReady,
  isPeriodOrderValid,
  getDocumentPeriodFlags,
  isIndefiniteEmployType,
  formatDateJp,
  formatPeriodJp,
  formatEmployPeriodDisplay,
} from './useRenewalCandidates'
import { clampDateYear } from '@/app/apply/_lib/helpers'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import { SubTabBar, SubTabItem } from './SubTabBar'

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

type Props = {
  candidates: RenewalCandidate[]
  loading: boolean
  updateCandidate: (id: string, patch: Partial<RenewalCandidate>) => Promise<void>
  searchCsvRenewal: (c: RenewalCandidate) => Promise<void>
  requestCsvImport: (c: RenewalCandidate, userId: string, dept: string | null) => Promise<void>
  switchToManualOverride: (id: string, reason: string) => Promise<void>
  copyDispatchToEmploy: (id: string, start: string, end: string) => Promise<void>
  confirmNotRenewing: (id: string, reason: string) => Promise<void>
  setTriageMode: (id: string, mode: RenewalCandidate['triage_mode']) => Promise<void>
  // 2026-07-31追加：更新期限管理タブの5分類を手動で切り替える。
  setRenewalTab: (id: string, tab: RenewalTab) => Promise<void>
  executeBulkApply: (
    targets: RenewalCandidate[],
    submitterUserId: string,
    submitterEmail: string
  ) => Promise<{ successIds: string[]; failed: { employeeNumber: string; staffName: string | null; reason: string }[] }>
  currentUserId: string
  currentUserEmail: string
  currentUserDeptName: string | null
  // SSCは「閲覧のみ」の想定（2026-07-14合意）。実行系操作はこのpropがfalseの場合すべて不可。
  canFinalize?: boolean
}

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

const STATUS_LABEL: Record<string, string> = {
  pending: '確認中',
  csv_pending: 'CSV未反映',
  not_renewing: '更新しない',
}

function formatDocumentType(documentType: string | null): string {
  if (!documentType) return '―'
  return documentType.replace(/\n/g, ' ').trim()
}

// 就業場所ブロックの地図ピンアイコン（既存の手描きinline SVG方式を踏襲。アイコンフォント等の
// 新規依存は追加しない）。
function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#244CB3' }} aria-hidden="true">
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

// 2026-07-31新設：更新期限管理タブの5分類の定義（表示名・色・？アイコンの説明文）。
// 伊藤さんとの確認で確定した内容（docs/SYSTEM_DESIGN.md 10章2026-07-31参照）。
// 2026-07-31追加（伊藤さんレビュー2回目・3回目）：
// ・「修正更新」は「期間のみ更新」と対で意味が伝わるよう「期間以外も修正する」に改名。
// ・「CSVインポート待ち」は、選ぶと即座に管理部へインポート依頼が送信される（受動的に待つのではない）
//   ことが伝わるよう「CSVインポートを依頼する」に改名。
// ・helpColorは？バッジの文字色（白丸バッジ自体は固定・文字色だけをタブの色を濃くした同系色にする）。
const TAB_DEFS: { key: RenewalTab; label: string; color: string; helpColor: string; helpText: string }[] = [
  {
    key: 'unassigned',
    label: '仕分け待ち',
    color: '#C2410C',
    helpColor: '#9A3412',
    helpText: 'まだ「期間のみ更新」「期間以外も修正する」「CSVインポートを依頼する」のどれで\n進めるか決まっていない人です。\n一覧でチェックして振り分けてください。',
  },
  {
    key: 'csv_auto',
    label: 'CSV自動反映',
    color: '#244CB3',
    helpColor: '#1E3A8A',
    helpText: '次の契約の期間が、CSVデータから自動で見つかっています。\n内容を確認して、そのまま一括で更新できます。',
  },
  {
    key: 'period_only',
    label: '期間のみ更新',
    color: '#1F7A45',
    helpColor: '#14532D',
    helpText: '次の契約の期間を自分で入力し、\nまとめて更新する人です。',
  },
  {
    key: 'edit',
    label: '期間以外も修正する',
    color: '#5A3EC8',
    helpColor: '#3B2884',
    helpText: '期間だけでなく、他の内容も直して更新したい人です。\n個別に申請画面を開いて修正します。',
  },
  {
    key: 'import_wait',
    label: 'CSVインポートを依頼する',
    color: '#5F5E5A',
    helpColor: '#3A3937',
    helpText: '選ぶと同時に管理部へCSVインポートを依頼します。\n取り込みが終わると自動で「CSV自動反映」に移動します。',
  },
]
const TAB_LABEL: Record<RenewalTab, string> = Object.fromEntries(TAB_DEFS.map(t => [t.key, t.label])) as Record<RenewalTab, string>

function UsageHelpPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[18px] border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.05)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-[#2F5FD0]">この一覧の使い方</span>
        <span className="text-xs font-semibold text-[#8B98B1]">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-[#E8EDF5] px-5 py-4 text-xs leading-relaxed text-[#4B5563]">
          <p className="text-[#1F2937]">
            この一覧には、契約の期限（雇用期間・派遣期間の終了日）が近づいてきたスタッフが自動で表示されます。<br />
            上のタブごとに「今どういう状態の人か」が分かれています。<br />
            タブ名の横の？を押すと、そのタブの意味を確認できます。
          </p>
          <div>
            <p className="mb-1 font-semibold text-[#1F2937]">①まず「仕分け待ち」タブを確認する</p>
            <p className="leading-relaxed">
              新しく出てきた対象は全員ここに入ります。<br />
              「期間のみ更新」「期間以外も修正する」「CSVインポートを依頼する」のどれで進めるかを選び、<br />
              チェックを入れて「振り分ける」ボタンを押してください。
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-[#1F2937]">②各タブで内容を確認・入力する</p>
            <p className="leading-relaxed">
              「CSV自動反映」は内容を確認するだけ、「期間のみ更新」は次の期間を入力、<br />
              「期間以外も修正する」は個別に申請画面を開いて内容を直します。<br />
              「CSVインポートを依頼する」は取り込みの結果が来るまで待つだけです。
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-[#1F2937]">③まとめて実行する</p>
            <p className="leading-relaxed">
              「CSV自動反映」「期間のみ更新」はチェックを入れた分をまとめて一括更新できます。<br />
              「期間以外も修正する」は1件ずつ「更新申請する」から申請します。
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-[#1F2937]">④分類を間違えた・契約を更新しない場合</p>
            <p className="leading-relaxed">
              各行の「他のタブへ移動」でいつでも振り分け直せます。<br />
              契約自体を更新しないと決まった場合は「更新しない」を押し、理由を入力してください。<br />
              （管理部へ通知メールが届きます）
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// 他のタブへ移動するための小さなドロップダウン（全タブ共通）
function MoveToOtherTabMenu({
  candidateId, currentTab, open, onToggle, onMove,
}: {
  candidateId: string
  currentTab: RenewalTab
  open: boolean
  onToggle: () => void
  onMove: (tab: RenewalTab) => void
}) {
  // 2026-08-03修正：伊藤さんの再指摘で、items-center化後もまだ「他のタブへ移動」と「更新しない」に
  // 1〜2px程度の縦ズレが残っていた。実機で計測した結果、原因はflexboxの仕様上「flexコンテナの
  // 直接の子要素はblock化される」のに対し、この`<button>`だけ間に`<div className="relative">`
  // （ドロップダウン位置決め用）を挟んでいたため直接の子ではなく、button自身はinline-blockの
  // ままレイアウトされ、微妙な行送り分だけ「更新しない」（直接の子でblock化されている）とズレて
  // いたことが判明。ラッパーdiv自体を`inline-flex items-center`にし、中のbuttonをこのdivの
  // flexアイテムとしてblock化させることで、両者の箱のサイズ計算方法を完全に一致させ解消する。
  return (
    <div className="relative inline-flex items-center">
      {/* L-19対応（2026-08-14）：見た目の大きさは変えず、py-2 px-2 + 打ち消しマージンでタップ領域だけ
          44px相当に拡大（実効タップ領域が約16pxしかなく誤タップ・操作困難だった問題への対応）。 */}
      <button
        onClick={onToggle}
        className="-m-2 p-2 text-[11px] font-semibold underline text-[#8B98B1] hover:text-[#6B7280]"
      >
        他のタブへ移動
      </button>
      {open && (
        // 2026-08-03修正（伊藤さん指摘）：従来は「〜する」で終わる項目名だけ助詞を「に」に変え
        // （それ以外は「へ」）、リストの中で1項目だけ語尾が違って見え統一感がなかった。
        // 助詞を使わず「→ タブ名」という矢印表記に統一し、文法上の使い分け自体を無くした。
        // あわせて折り返し防止のため`whitespace-nowrap`を付け、最長の項目名でも収まるよう
        // ドロップダウン幅を`w-44`→`w-60`に拡大。
        <div className="absolute right-0 top-full z-20 mt-1.5 w-60 rounded-xl border border-[#E8EDF5] bg-white p-1.5 shadow-[0_10px_30px_rgba(15,23,42,.12)]">
          {TAB_DEFS.filter(t => t.key !== currentTab).map(t => (
            <button
              key={t.key}
              onClick={() => onMove(t.key)}
              className="block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#1F2937] hover:bg-[#F3F5F8]"
            >
              → {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RenewalManagementTab({
  candidates, loading, updateCandidate,
  searchCsvRenewal, requestCsvImport, switchToManualOverride,
  copyDispatchToEmploy, confirmNotRenewing, setTriageMode, setRenewalTab, executeBulkApply,
  currentUserId, currentUserEmail, currentUserDeptName, canFinalize = true,
}: Props) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<RenewalTab>('unassigned')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideReasonId, setOverrideReasonId] = useState<string | null>(null)
  const [overrideReasonText, setOverrideReasonText] = useState('')
  const [manualDraft, setManualDraft] = useState<Record<string, { start: string; end: string }>>({})
  const [notRenewingReasonId, setNotRenewingReasonId] = useState<string | null>(null)
  const [notRenewingReasonText, setNotRenewingReasonText] = useState('')
  const [recheckingId, setRecheckingId] = useState<string | null>(null)
  const [contactDetailId, setContactDetailId] = useState<string | null>(null)
  const [confirmModalCandidate, setConfirmModalCandidate] = useState<RenewalCandidate | null>(null)
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null)
  // 仕分け待ちタブ：行ごとに選んだ振り分け先（未選択の行は「更新」実行時に対象外）
  const [unassignedChoice, setUnassignedChoice] = useState<Record<string, 'period_only' | 'edit' | 'import_wait'>>({})
  const [triaging, setTriaging] = useState(false)

  const [showBulkApplyConfirm, setShowBulkApplyConfirm] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkApplyResult, setBulkApplyResult] = useState<{ successCount: number; failed: { employeeNumber: string; staffName: string | null; reason: string }[] } | null>(null)

  const kpiBuckets = [
    { key: 't7', label: '7日以内（要対応）', color: '#E74C3C' },
    { key: 't14', label: '8〜14日', color: '#C2410C' },
    { key: 't20', label: '15〜20日', color: '#F59E42' },
    { key: 't30', label: '21〜30日', color: '#B45309' },
    { key: 't45', label: '31〜45日', color: '#1B3A8C' },
  ]
  const kpiCounts: Record<string, number> = { t7: 0, t14: 0, t20: 0, t30: 0, t45: 0 }
  for (const c of candidates) {
    if (c.status === 'not_renewing' || c.status === 'applied') continue
    const t = daysTier(remainingDays(c)).key
    const bucket = t === 'overdue' ? 't7' : t
    if (bucket in kpiCounts) kpiCounts[bucket]++
  }

  // タブ件数（更新しない・申請済みは対応不要のため件数バッジからは除外。行自体は残す）
  const countByTab: Record<RenewalTab, number> = { unassigned: 0, csv_auto: 0, period_only: 0, edit: 0, import_wait: 0 }
  for (const c of candidates) {
    if (c.status === 'not_renewing' || c.status === 'applied') continue
    countByTab[c.renewal_tab]++
  }
  const tabItems: SubTabItem<RenewalTab>[] = TAB_DEFS.map(t => ({
    key: t.key, label: t.label, count: countByTab[t.key], color: t.color, helpColor: t.helpColor, helpText: t.helpText,
  }))

  const tabCandidates = candidates.filter(c => c.renewal_tab === activeTab)

  const { result: filtered, toolbar } = useContractListToolbar<RenewalCandidate>(tabCandidates, {
    sortOptions: [
      { key: 'days_asc', label: '残日数が近い順', compare: (a, b) => (remainingDays(a) ?? 9999) - (remainingDays(b) ?? 9999) },
      { key: 'days_desc', label: '残日数が遠い順', compare: (a, b) => (remainingDays(b) ?? -9999) - (remainingDays(a) ?? -9999) },
      { key: 'empno', label: '社員番号順', compare: (a, b) => a.employee_number.localeCompare(b.employee_number) },
    ],
    getSearchText: c => `${c.staff_name || ''} ${c.employee_number} ${c.work_location_name || ''}`,
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: activeTab,
  })

  const toggleExpand = async (c: RenewalCandidate) => {
    const opening = expandedId !== c.id
    setExpandedId(opening ? c.id : null)
    if (opening && c.data_source === 'csv' && !c.new_csv_raw_data_id && c.status !== 'csv_pending') {
      await searchCsvRenewal(c)
    }
  }

  const handleRecheck = async (c: RenewalCandidate) => {
    setRecheckingId(c.id)
    await searchCsvRenewal(c)
    setRecheckingId(null)
  }

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

  // 2026-08-03修正（伊藤さん指摘）：「CSVインポートを依頼する」タブに入る＝管理部へ実際の
  // インポート依頼を送信する、という業務アクションそのものであり、単なる仕分け直し（箱の
  // 移し替え）とは性質が違う。伊藤さんの整理により、この「依頼する」という具体的な処理は
  // "CSVインポートを依頼する"という文脈固有の処理として一本化すべきで、汎用的な箱の移動処理
  // （setRenewalTab）に混ぜ込むべきではない、と確定。既存の`requestCsvImport()`が元々
  // 「requestsテーブルへ依頼を保存→成功したらrenewal_tab='import_wait'へ移動」まで
  // 一体で行う設計だったため、これを「CSVインポートを依頼するタブへ入る」ための唯一の
  // 入り口として、呼び出し元（振り分けるボタン・他のタブへ移動ドロップダウンの両方）を
  // 必ずここを通す形に統一する（従来は「他のタブへ移動」からimport_waitを選んだ場合だけ
  // `setRenewalTab()`を直接呼んでおり、実際には依頼が送信されないまま画面上だけタブが
  // 変わってしまうバグがあった）。
  // 2026-08-03修正（伊藤さん指摘：「振り分けるボタンを押した際も確認メッセージ必要じゃない？
  // 誤った内容の入力やクリックを想定して」）：以前はCSVインポートを依頼する対象が含まれる
  // 場合のみ確認ダイアログを出していたが、複数件をラジオボタンで選んでから最後に1回だけ
  // 実行する「振り分ける」ボタンは、選択漏れ・選択し忘れたままの誤クリックの影響範囲が
  // 1件ずつの「他のタブへ移動」より大きいため、内容に関わらず必ず内訳（何件がどこへ）付きの
  // 確認を挟む形に変更する。単純な仕分け直し（1件ずつの「他のタブへ移動」）は従来通り
  // 確認なしのまま（伊藤さんとの2026-08-03合意は「振り分けるボタン」に限った見直し）。
  const handleTriageExecute = async () => {
    const entries = Object.entries(unassignedChoice).filter(([id]) => tabCandidates.some(c => c.id === id))
    if (entries.length === 0 || triaging) return
    const countsByChoice: Record<'period_only' | 'edit' | 'import_wait', number> = { period_only: 0, edit: 0, import_wait: 0 }
    for (const [, choice] of entries) countsByChoice[choice]++
    const breakdownLines = (['period_only', 'edit', 'import_wait'] as const)
      .filter(k => countsByChoice[k] > 0)
      .map(k => `・${TAB_LABEL[k]}：${countsByChoice[k]}件`)
      .join('\n')
    const importWaitCount = countsByChoice.import_wait
    const ok = await confirmDialog({
      title: '振り分けを実行',
      message: `選択した${entries.length}件を振り分けます。\n${breakdownLines}${importWaitCount > 0 ? `\n\n「${TAB_LABEL.import_wait}」の${importWaitCount}件は、実行すると同時に管理部へ実際のインポート依頼が送信されます。` : ''}\n\nよろしいですか？`,
      confirmLabel: '実行する',
    })
    if (!ok) return
    setTriaging(true)
    for (const [id, choice] of entries) {
      const c = tabCandidates.find(x => x.id === id)
      if (!c) continue
      if (choice === 'import_wait') {
        await requestCsvImport(c, currentUserId, currentUserDeptName)
      } else {
        await setRenewalTab(id, choice)
      }
    }
    setUnassignedChoice({})
    setTriaging(false)
  }

  if (loading) {
    return <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#6B7280]">読み込み中です…</div>
  }

  // 「他のタブへ移動」ドロップダウンから移動先を選んだ時の共通処理。
  // 2026-08-03修正：移動先が「CSVインポートを依頼する」の場合は、どのタブから移動する場合でも
  // 必ず`requestCsvImport()`（確認ダイアログ→依頼の実送信→タブ移動、を一体で行う）を通す。
  // これにより「他のタブへ移動」経由でも確実に依頼が送信される（従来はここだけ`setRenewalTab()`
  // を直接呼んでおり、タブは変わるのに依頼が送信されないバグがあった）。
  // 2026-08-05追加（伊藤さん指示：「全部の他のタブへ移動に確認を必須にする」）：それ以外の
  // 移動先も、内容に関わらず必ず確認ダイアログを挟むよう変更（従来は確認なしで即時移動していた）。
  // onMoveOverrideがtrueを返した場合（＝CSV自動反映タブから期間のみ更新への移動。既存の
  // 理由入力ボックス＋確定/キャンセルで別途保護されているため、ここでの二重確認は行わない）は
  // そちらに処理を譲る。falseを返した場合（＝onMoveOverrideが無い、または期間のみ更新以外の
  // 移動）は必ずこの関数側で確認する。これにより、従来onMoveOverride経由でimport_waitへの
  // 移動が`setRenewalTab()`直呼びになり依頼が送信されなかった不具合（CSV自動反映タブのみ発生。
  // 8/3の修正時に見落とされていた）も、この一本化で自動的に解消される。
  const handleMoveToTab = async (c: RenewalCandidate, tab: RenewalTab, opts?: { onMoveOverride?: (tab: RenewalTab) => boolean }) => {
    if (tab === 'import_wait') {
      const ok = await confirmDialog({
        title: 'CSVインポートを依頼',
        message: `${c.staff_name || '対象スタッフ'}様の次契約について、CSVインポートを依頼します。選ぶと同時に管理部へ実際の依頼が送信されます。よろしいですか？`,
        confirmLabel: '依頼する',
      })
      if (!ok) return
      await requestCsvImport(c, currentUserId, currentUserDeptName)
      return
    }
    if (opts?.onMoveOverride && opts.onMoveOverride(tab)) return
    const ok = await confirmDialog({
      title: 'タブを移動しますか？',
      message: `${c.staff_name || '対象スタッフ'}様を「${TAB_LABEL[tab]}」へ移動します。よろしいですか？`,
      confirmLabel: '移動する',
    })
    if (!ok) return
    await setRenewalTab(c.id, tab)
  }

  // 2026-07-31追加：CSV自動反映タブから「期間のみ更新」へ移動する場合のみ、派遣先変更等の
  // 手動切替であることの理由入力を挟む（旧「派遣先変更のため手入力に切替」ボタンの役割を
  // 「他のタブへ移動」に統合したもの。onMoveOverrideを渡さない呼び出し元は従来通り即時移動）。
  const renderCommonFooter = (c: RenewalCandidate, opts?: { onMoveOverride?: (tab: RenewalTab) => boolean }) => (
    <div className="flex shrink-0 items-center gap-3">
      {canFinalize && (
        <MoveToOtherTabMenu
          candidateId={c.id}
          currentTab={activeTab}
          open={moveMenuId === c.id}
          onToggle={() => setMoveMenuId(moveMenuId === c.id ? null : c.id)}
          onMove={async tab => {
            await handleMoveToTab(c, tab, opts)
            setMoveMenuId(null)
          }}
        />
      )}
      {c.status !== 'not_renewing' && (
        // L-19対応（2026-08-14）：「他のタブへ移動」ボタンと同じ理由でタップ領域を拡大。
        <button
          onClick={() => { setNotRenewingReasonId(c.id); setNotRenewingReasonText('') }}
          className="-m-2 p-2 text-[11px] font-semibold underline text-[#8B98B1] hover:text-[#6B7280]"
        >
          更新しない
        </button>
      )}
    </div>
  )

  const renderReasonBoxes = (c: RenewalCandidate) => (
    <>
      {c.status === 'not_renewing' && (
        <div className="mt-4 rounded-2xl bg-[#F3F5F8] px-4 py-3">
          <span className="text-xs font-semibold rounded-full px-2.5 py-1 mr-2" style={{ background: '#E8EDF5', color: '#6B7280' }}>更新しない</span>
          <span className="text-xs text-[#6B7280]">理由：{c.no_renewal_reason || '―'}</span>
        </div>
      )}
      {notRenewingReasonId === c.id && (
        <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3">
          <div className="text-xs mb-2 leading-relaxed" style={{ color: '#B91C1C' }}>
            更新しない理由を入力してください。<br />
            確定すると管理部へ通知メールが送信されます。
          </div>
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
            >更新しない</button>
            <button onClick={() => setNotRenewingReasonId(null)} className="rounded-2xl border border-[#E8EDF5] text-xs font-semibold px-4 py-1.5 whitespace-nowrap">キャンセル</button>
          </div>
        </div>
      )}
    </>
  )

  // 2026-08-03改修（ブロック1＝ヘッダー）：伊藤さんの実機レビュー指摘（雇用期間が「－」表示になる／
  // 「他のタブへ移動」と「更新しない」の縦位置がズレている）を受けた3ブロック化の一部。
  // 残日数バッジを氏名の「上」に独立配置し緊急度を最初に視界に入れるようにし、よく使う操作である
  // 「一括申請/一括更新に含める」チェック（checkboxSlot）はバッジのすぐ右に配置して目立たせる。
  // 「他のタブへ移動」「更新しない」（cornerSlot）は右上の独立した行にまとめる。ただし位置は
  // 目立たせても見た目（文字の大きさ・色）は従来通りの控えめなテキストのまま維持する
  // （契約一覧の「詳細を見る」ボタンと同じ右上の位置に濃い色のボタンを置くと、担当者が主操作だと
  // 誤認して誤タップする恐れがあるため。「更新しない」は押すと管理部へ通知メールが送信される
  // 操作でもあり、位置と視覚的重要度をあえて分離している。伊藤さん確認済み・2026-08-03）。
  // 2026-08-04追加：伊藤さんの実機レビュー指摘「更新用のCSVが既に見つかっているなら、氏名付近に
  // 目立つバッジを付けられないか」に対応。従来は「CSV未反映：次の契約のCSVがまだ見つかっていません。」
  // という見つからない場合の注意書きのみで、見つかっている場合の表示が無かった。data_source==='csv'
  // かつnew_csv_raw_data_idが設定済み（＝次契約のCSVが実際に見つかっている状態）の場合にのみ、
  // 緑の丸バッジ「CSV反映あり」を氏名の右隣（既存の「社内」バッジと同じ位置・同じ形）に表示する。
  // renderRowHeadは5タブすべてで共用のため、この1箇所の修正で全タブに反映される。
  // 2026-08-06：伊藤さんの実機レビュー指摘「もっとフォントサイズを大きくしたい」を受け、複数サイズ案
  // （17px＝氏名と同一／14px／12px）をモックアップで提示し伊藤さんが12pxを選択。「社内」バッジは
  // 現状維持（CSV反映ありバッジのみサイズ変更）と確認済み。
  const renderRowHead = (c: RenewalCandidate, cornerSlot: ReactNode, checkboxSlot?: ReactNode) => {
    const days = remainingDays(c)
    const metaParts = [c.current_dept_name, c.current_contract_type].filter(Boolean)
    const hasCsvMatched = c.data_source === 'csv' && Boolean(c.new_csv_raw_data_id)
    return (
      <div>
        {/* 2026-08-03修正：左の残日数バッジ（丸ピル・上下余白あり）と右の「他のタブへ移動」
            「更新しない」（プレーンテキストで高さが低い）を`items-start`で上端揃えにしていたため、
            高さの差でバッジより右側のリンクが浮いて見える不具合があった（伊藤さん指摘）。
            `items-center`にして両者の縦中心を揃える。 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {daysBadge(days)}
            {checkboxSlot}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {cornerSlot}
          </div>
        </div>
        <div className="mt-2.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-[17px] font-semibold leading-6 text-[#1F2937]">{c.staff_name || '―'}</p>
            {c.work_place === '社内' && (
              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: '#F1EFE8', color: '#5F5E5A' }}>社内</span>
            )}
            {hasCsvMatched && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: '#E7F7EE', color: '#1E9E5A' }}>
                <span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: '#1E9E5A' }} />
                CSV反映あり
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-[#8B98B1]">
            {c.employee_number}
            {metaParts.length > 0 && <span className="ml-1.5">・{metaParts.join('・')}</span>}
          </p>
        </div>
      </div>
    )
  }

  // 2026-07-31全面改修（伊藤さんレビュー）：就業場所名は薄いグレーで目立たなかったため
  // 専用ブロックに独立させ住所も追加表示。雇用期間・派遣期間も「至」だけでなく自〜至の範囲を
  // 分けて表示し、これが「現在（前回契約）」の情報であることが伝わるようラベルに明記する。
  // 書類種別（document_type＝雇用契約書／就業条件明示書／雇用契約書 兼 就業条件明示書）に応じて
  // 該当する期間だけを出し分ける（兼用は両方、雇用契約書のみは雇用期間だけ、就業条件明示書のみは
  // 派遣期間だけ）。
  // 2026-08-03改修（ブロック2・3）：①就業場所ブロック（青背景）の右端に「内容を確認」ボタンを
  // 統合配置できるよう`confirmSlot`引数を追加（従来はグリッドの下に別行のテキストリンクとして
  // 独立していたものを、契約一覧の情報密度に寄せて集約）。②書類種別を契約一覧と同じ色付きチップ
  // 表示に変更（プレーンテキストのままだと書類種別の違いが一覧上でぱっと見分けにくかったため）。
  // ③雇用期間（現在）の表示を`formatEmployPeriodDisplay()`に置き換え、正社員・無期契約で
  // 「－」表示になっていた不具合を解消（伊藤さん指摘・2026-08-03）。
  const renderSecondaryGrid = (c: RenewalCandidate, confirmSlot?: ReactNode) => {
    // 2026-08-03：periodReady()・renderPeriodOnlyRowと判定基準を統一するため
    // getDocumentPeriodFlags()を共用（document_type欠落時のみ旧来のincludes判定にフォールバック）。
    const docFlags = getDocumentPeriodFlags(c.document_type)
    const docType = formatDocumentType(c.document_type)
    const showEmploy = docFlags.resolved ? docFlags.needsEmploy : docType.includes('雇用契約書')
    const showDispatch = docFlags.resolved ? docFlags.needsDispatch : docType.includes('就業条件明示書')
    return (
      <div className="mt-3 border-t border-[#E8EDF5] pt-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F7FBFF] px-3 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <MapPinIcon />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-5 text-[#1F2937]">{c.work_location_name || '就業先不明'}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#6B7280]">{c.work_location_address || '住所は未登録です'}</p>
            </div>
          </div>
          {confirmSlot && <div className="shrink-0">{confirmSlot}</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-[#6B7280]">書類種別</p>
            <span className="mt-0.5 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: '#EAF1FF', color: '#2F5FD0' }}>
              {formatDocumentType(c.document_type)}
            </span>
          </div>
          {showEmploy && (
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-[#6B7280]">雇用期間（現在）</p>
              <p className="text-xs font-medium leading-5 text-[#1F2937]">{formatEmployPeriodDisplay(c)}</p>
            </div>
          )}
          {showDispatch && (
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-[#6B7280]">派遣期間（現在）</p>
              <p className="text-xs font-medium leading-5 text-[#1F2937]">
                {formatPeriodJp(c.dispatch_start_date, c.dispatch_end_date)}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 2026-07-31追加：「契約内容をすべて確認」（前回契約のSTEP項目を全項目表示する読み取り専用
  // ポップアップ）を開くリンク。従来はCSV自動反映タブ（内容を確認 展開後）・修正更新タブの
  // 行動線にのみ存在していたが、他のタブでも同じ内容を確認したいという要望に応え全タブ共通化。
  // 2026-08-03改修：テキストリンクだと押せる操作だと気づかれにくいとの指摘を受け、既存の
  // 枠付きピルボタン様式（renderCsvDiff内の同名ボタンと同じ見た目）に統一し、ブロック2
  // （就業場所ブロック）の右端に配置する`confirmSlot`として渡す形に変更。
  const renderConfirmLink = (c: RenewalCandidate) => (
    <button
      onClick={() => setConfirmModalCandidate(c)}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D0DAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F5FD0]"
    >
      内容を確認
    </button>
  )

  // ===== タブ別の中身 =====

  const renderUnassignedRow = (c: RenewalCandidate) => {
    const choice = unassignedChoice[c.id]
    return (
      <article key={c.id} className="rounded-[18px] border border-[#E8EDF5] bg-white p-5">
        {renderRowHead(c, renderCommonFooter(c))}
        {renderSecondaryGrid(c, renderConfirmLink(c))}
        {c.data_source === 'csv' && c.status === 'csv_pending' && (
          <p className="mt-2 text-[11px] font-medium leading-relaxed" style={{ color: '#B45309' }}>
            {STATUS_LABEL.csv_pending}：次の契約のCSVがまだ見つかっていません。<br />
            「CSVインポートを依頼する」を選ぶと、選んだ直後に管理部へ取り込みを依頼します。
          </p>
        )}
        {c.status !== 'not_renewing' && canFinalize && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#E8EDF5] pt-3">
            <span className="mr-1 text-xs font-semibold text-[#6B7280]">振り分け先：</span>
            <label className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: choice === 'period_only' ? '#1F7A45' : '#E9F5EC', color: choice === 'period_only' ? '#fff' : '#1F7A45' }}>
              <input type="radio" name={`triage-${c.id}`} className="hidden" checked={choice === 'period_only'}
                onChange={() => setUnassignedChoice(prev => ({ ...prev, [c.id]: 'period_only' }))} />
              期間のみ更新
            </label>
            <label className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: choice === 'edit' ? '#5A3EC8' : '#F3ECFF', color: choice === 'edit' ? '#fff' : '#5A3EC8' }}>
              <input type="radio" name={`triage-${c.id}`} className="hidden" checked={choice === 'edit'}
                onChange={() => setUnassignedChoice(prev => ({ ...prev, [c.id]: 'edit' }))} />
              期間以外も修正する
            </label>
            {c.data_source === 'csv' && (
              <label className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: choice === 'import_wait' ? '#5F5E5A' : '#F1EFE8', color: choice === 'import_wait' ? '#fff' : '#5F5E5A' }}>
                <input type="radio" name={`triage-${c.id}`} className="hidden" checked={choice === 'import_wait'}
                  onChange={() => setUnassignedChoice(prev => ({ ...prev, [c.id]: 'import_wait' }))} />
                CSVインポートを依頼する
              </label>
            )}
            {choice && (
              <button onClick={() => setUnassignedChoice(prev => { const n = { ...prev }; delete n[c.id]; return n })} className="text-[11px] text-[#8B98B1] underline">選択解除</button>
            )}
          </div>
        )}
        {renderReasonBoxes(c)}
      </article>
    )
  }

  const renderCsvAutoRow = (c: RenewalCandidate) => {
    const ready = periodReady(c)
    // 2026-07-31変更（伊藤さんレビュー：「派遣先変更のため手入力に切替」は独立ボタンとして
    // 分かりづらく「他のタブへ移動」で代替可能、との指摘）：専用ボタンは廃止し、「他のタブへ移動」で
    // 「期間のみ更新」を選んだ場合だけ理由入力を挟む形に統合する（監査ログ用のmanual_override_reason
    // は維持）。
    // 2026-08-05修正：それ以外の移動先は従来`setRenewalTab()`を直接呼んで確認なしで即時移動して
    // いたが、これだと「CSVインポートを依頼する」を選んだ場合も依頼が送信されないまま（8/3に
    // handleMoveToTab側で直したのと同じ不具合がこの関数だけ残っていた）タブだけ動いてしまう。
    // 「期間のみ更新」以外はfalseを返してhandleMoveToTab側の処理（import_waitなら実際の依頼送信、
    // それ以外は確認ダイアログ＋移動）に一本化する。
    const handleMoveOverride = (tab: RenewalTab): boolean => {
      if (tab === 'period_only') { setOverrideReasonId(c.id); setOverrideReasonText(''); return true }
      return false
    }
    const checkboxSlot = c.status !== 'not_renewing' && (
      <label className={`flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap ${ready ? 'text-[#1F2937]' : 'text-[#8B98B1]'}`}>
        <input type="checkbox" checked={c.triage_mode === 'bulk'} disabled={!canFinalize || !ready}
          onChange={e => setTriageMode(c.id, e.target.checked ? 'bulk' : 'undecided')} className="h-4 w-4 rounded" />
        一括申請に含める
      </label>
    )
    return (
      <article key={c.id} className="rounded-[18px] border border-[#E8EDF5] bg-white p-5">
        {renderRowHead(c, renderCommonFooter(c, { onMoveOverride: handleMoveOverride }), checkboxSlot)}
        {renderSecondaryGrid(c, (
          <button
            onClick={() => toggleExpand(c)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D0DAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F5FD0]"
          >
            {expandedId === c.id ? '内容を閉じる' : '内容を確認'}
          </button>
        ))}
        {expandedId === c.id && renderCsvDiff(c)}
        {overrideReasonId === c.id && (
          <div className="mt-3 rounded-2xl bg-[#FFF8F1] px-4 py-3">
            <div className="text-xs text-[#8B98B1] mb-2 leading-relaxed">
              派遣先クライアントの変更理由を入力してください。<br />
              （「期間のみ更新」タブへ切り替わります）
            </div>
            <div className="flex gap-2">
              <input value={overrideReasonText} onChange={e => setOverrideReasonText(e.target.value)} placeholder="例：派遣先が◯◯から××に変更" className="flex-1 text-xs rounded-lg border border-[#E8EDF5] bg-white px-2 py-1.5" />
              <button
                onClick={async () => { if (!overrideReasonText.trim()) return; await switchToManualOverride(c.id, overrideReasonText.trim()); setOverrideReasonId(null) }}
                className="rounded-2xl bg-[#2F5FD0] text-white text-xs font-semibold px-4 py-1.5 whitespace-nowrap"
              >切替確定</button>
              <button onClick={() => setOverrideReasonId(null)} className="rounded-2xl border border-[#E8EDF5] text-xs font-semibold px-4 py-1.5 whitespace-nowrap">キャンセル</button>
            </div>
          </div>
        )}
        {renderReasonBoxes(c)}
      </article>
    )
  }

  const renderCsvDiff = (c: RenewalCandidate) => {
    // 2026-08-03修正：①雇用期間の「原契約」欄は生の`employ_start_date`/`employ_end_date`を
    // そのまま`formatPeriod()`に渡していたため、正社員・無期契約（この2項目を持たず
    // `contract_start_date`のみ持つ）で常に「－」表示になっていた不具合を修正
    // （一覧の「雇用期間（現在）」と同じ`formatEmployPeriodDisplay()`を使い表示ルールを統一）。
    // ②日付書式もこのパネルだけ生のハイフン表記（`2026-05-01`）のままだったため、
    // タブ内の他の日付表示と同じ`formatPeriodJp()`（年月日表記）に統一。
    const formatPeriod = (start: string | null, end: string | null) => formatPeriodJp(start, end)
    // 2026-08-04修正（②差異表示が書類種別を無視するバグ）：従来は書類種別を見ずに雇用期間・
    // 派遣期間・指揮命令者等の差異を無条件で計算・表示しており、雇用契約書のみの契約でも
    // 無関係な「派遣期間」の差異行が出てしまう不具合があった。一覧本体（renderSecondaryGrid・
    // periodReady）と同じgetDocumentPeriodFlags()の基準でガードする。
    const docFlags = getDocumentPeriodFlags(c.document_type)
    const showEmploy = !docFlags.resolved || docFlags.needsEmploy
    const showDispatch = !docFlags.resolved || docFlags.needsDispatch
    // 2026-08-04追加（①正社員の雇用期間バグ修正の関連対応）：正社員・無期契約は雇用期間が
    // 日付レンジを持たないため、差異表示も「契約条件適用開始日」の単一日付で行う。
    const isIndefinite = isIndefiniteEmployType(c.current_contract_type)
    const employDiffRow = !showEmploy ? null : isIndefinite
      ? {
          label: '契約条件適用開始日',
          before: c.contract_start_date ? `${formatDateJp(c.contract_start_date)} 〜` : '―',
          after: (c.new_contract_start_date || c.contract_start_date) ? `${formatDateJp(c.new_contract_start_date || c.contract_start_date)} 〜` : '―',
          changed: Boolean(c.new_contract_start_date) && (c.new_contract_start_date || null) !== (c.contract_start_date || null),
        }
      : {
          label: '雇用期間',
          before: formatEmployPeriodDisplay(c),
          after: formatPeriod(c.new_employ_start, c.new_employ_end),
          changed: (c.employ_start_date || null) !== (c.new_employ_start || null) || (c.employ_end_date || null) !== (c.new_employ_end || null),
        }
    const dispatchDiffRow = !showDispatch ? null : {
      label: '派遣期間', before: formatPeriod(c.dispatch_start_date, c.dispatch_end_date), after: formatPeriod(c.new_dispatch_start, c.new_dispatch_end), changed: (c.dispatch_start_date || null) !== (c.new_dispatch_start || null) || (c.dispatch_end_date || null) !== (c.new_dispatch_end || null),
    }
    const diffRows = [
      employDiffRow,
      dispatchDiffRow,
      { label: '就業場所', before: c.work_location_name || '―', after: c.new_work_location_name || '―', changed: (c.work_location_name || null) !== (c.new_work_location_name || null) },
    ].filter((r): r is { label: string; before: string; after: string; changed: boolean } => r !== null && r.changed)

    // 2026-08-04修正（②）：指揮命令者・派遣先責任者・苦情処理申出先は派遣の側面にのみ関係する
    // 項目のため、雇用契約書のみの契約では計算自体を行わない。
    const contactDiffRows: { group: string; field: string; before: string; after: string }[] = []
    if (showDispatch && c.previous_contact_fields && c.new_contact_fields) {
      (['cmd', 'resp', 'comp'] as const).forEach(g => {
        (['dept', 'role', 'name', 'tel'] as const).forEach(f => {
          const before = c.previous_contact_fields?.[g]?.[f] || null
          const after = c.new_contact_fields?.[g]?.[f] || null
          if ((before || null) !== (after || null)) {
            contactDiffRows.push({ group: CONTACT_GROUP_LABELS[g], field: CONTACT_FIELD_LABELS[f], before: before || '―', after: after || '―' })
          }
        })
      })
    }

    return (
      <div className="mt-3 rounded-2xl bg-[#F7FBFF] px-4 py-4">
        <div className="text-[11px] text-[#8B98B1]">CSVから自動取得した最新内容との差異</div>
        {diffRows.length === 0 ? (
          <div className="mt-1 text-xs text-[#6B7280]">原契約から変更点はありません。</div>
        ) : (
          <table className="mt-1 text-xs w-full">
            <tbody>
              {/* 2026-08-03修正：取り消し線は見づらいとの指摘で削除。見出しも一覧の「（現在）」表記と
                  揃うよう「前回」→「原契約」に統一（「前回」という独自の言い回しが1箇所だけ残っており
                  表記ルールがズレていた）。 */}
              <tr className="text-[#6B7280]"><td className="py-1 pr-3 w-1/5">項目</td><td className="py-1 pr-3 w-2/5">原契約</td><td className="py-1 w-2/5">今回</td></tr>
              {diffRows.map(r => (
                <tr key={r.label}>
                  <td className="py-1 pr-3 align-top">{r.label}</td>
                  <td className="py-1 pr-3 text-[#8B98B1] align-top">{r.before}</td>
                  <td className="py-1 font-semibold align-top" style={{ color: '#E74C3C' }}>{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {contactDiffRows.length > 0 && (
          <div className="mt-3 rounded-2xl bg-[#FFF8F1] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold" style={{ color: '#B45309' }}>指揮命令者・派遣先責任者・苦情処理申出先にも変更点があります（{contactDiffRows.length}項目）</div>
              <button onClick={() => setContactDetailId(contactDetailId === c.id ? null : c.id)} className="shrink-0 rounded-full border border-[#E8EDF5] bg-white px-3 py-1 text-[11px] font-semibold text-[#2F5FD0]">{contactDetailId === c.id ? '閉じる' : '詳細を確認'}</button>
            </div>
            {contactDetailId === c.id && (
              <table className="mt-2 text-xs w-full">
                <tbody>
                  <tr className="text-[#6B7280]"><td className="py-1 pr-3 w-1/5">項目</td><td className="py-1 pr-3 w-2/5">原契約</td><td className="py-1 w-2/5">今回</td></tr>
                  {contactDiffRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-3 align-top">{r.group}・{r.field}</td>
                      <td className="py-1 pr-3 text-[#8B98B1] align-top">{r.before}</td>
                      <td className="py-1 font-semibold align-top" style={{ color: '#E74C3C' }}>{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {/* 2026-08-03修正：「契約内容をすべて確認」ボタンは従来パネル冒頭（左上）にあったが、
            トリガーの「内容を確認」ボタンは就業場所ブロック右端にあり、開いた直後にパネル左上へ
            視線を移す動線になっておらず気づきにくいとの指摘（伊藤さん）。差異の内容を読み終えた
            後の「次のアクション」として自然な位置＝パネル最下部に移動。 */}
        <div className="mt-4 border-t border-[#E8EDF5] pt-3">
          <button onClick={() => setConfirmModalCandidate(c)} className="rounded-2xl border border-[#D0DAF0] bg-white px-4 py-1.5 text-xs font-semibold text-[#2F5FD0]">契約内容をすべて確認</button>
        </div>
      </div>
    )
  }

  const renderPeriodOnlyRow = (c: RenewalCandidate) => {
    // 2026-08-03修正：従来は`dispatch_end_date`/`employ_end_date`（前回契約フィールドの
    // 有無）で「派遣期間欄／雇用期間欄のどちらを出すか」を判定していたが、雇用契約書のみの
    // 契約でも前回契約にCSV連携時の派遣期間の残骸が残っているケースがあり、本来出ないはずの
    // 派遣期間欄が表示され「兼用のため自動で揃えています」という誤った文言も出てしまう不具合が
    // あった（関谷綺菜様・104747で発覚）。書類種別（document_type）を正として判定する。
    const docFlags = getDocumentPeriodFlags(c.document_type)
    const hasDispatch = docFlags.resolved ? docFlags.needsDispatch : !!c.dispatch_end_date
    const hasEmploy = docFlags.resolved ? docFlags.needsEmploy : !!c.employ_end_date
    // 2026-08-04追加（①正社員の雇用期間バグ修正）：正社員・無期契約は雇用期間が日付レンジを
    // 持たず「契約条件適用開始日」の単一日付のみを持つ（app/apply/_components/StepPeriod.tsxと
    // 同じ考え方）。この場合、雇用期間欄は日付レンジの入力欄ではなく契約条件適用開始日の
    // 編集欄として表示する（未編集なら前回値をそのまま引き継いで実行可能）。
    const isIndefinite = isIndefiniteEmployType(c.current_contract_type)
    const draft = manualDraft[c.id] || {
      start: c.new_dispatch_start || (c.dispatch_end_date ? addDays(c.dispatch_end_date, 1) : ''),
      end: c.new_dispatch_end || '',
    }
    const ready = periodReady(c)
    // 2026-08-03追加：終了日が開始日より前になっている場合の警告表示。periodReady()側で
    // 既に「一括更新に含める」チェックを無効化しているが、なぜチェックできないのかが
    // 画面上で分からないと伊藤さんの指摘（誤った日付入力を想定したチェック）に応えきれない
    // ため、該当ブロックの下に理由を明示する。
    const dispatchOrderInvalid = hasDispatch && !isPeriodOrderValid(draft.start, draft.end)
    const employOnlyOrderInvalid = !hasDispatch && !isIndefinite && !isPeriodOrderValid(c.new_employ_start, c.new_employ_end)
    const checkboxSlot = c.status !== 'not_renewing' && (
      <label className={`flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap ${ready ? 'text-[#1F2937]' : 'text-[#8B98B1]'}`}>
        <input type="checkbox" checked={c.triage_mode === 'bulk'} disabled={!canFinalize || !ready}
          onChange={e => setTriageMode(c.id, e.target.checked ? 'bulk' : 'undecided')} className="h-4 w-4 rounded" />
        一括更新に含める
      </label>
    )
    return (
      <article key={c.id} className="rounded-[18px] border border-[#E8EDF5] bg-white p-5">
        {renderRowHead(c, renderCommonFooter(c), checkboxSlot)}
        {renderSecondaryGrid(c, renderConfirmLink(c))}
        <div className="mt-3 flex flex-col gap-3 border-t border-[#E8EDF5] pt-3">
          {hasDispatch ? (
            <>
              <div className="rounded-2xl border border-[#E8EDF5] p-3.5">
                <p className="mb-2 text-xs font-semibold text-[#1F2937]">派遣期間</p>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <div className="text-[11px] text-[#6B7280] mb-1">派遣期間の開始日</div>
                    <input type="date" value={draft.start} onChange={e => {
                      const start = clampDateYear(e.target.value)
                      setManualDraft(prev => ({ ...prev, [c.id]: { start, end: prev[c.id]?.end || draft.end } }))
                      // M-03対応（2026-08-12）：以前はここでローカルの下書きstateにしか書いておらず、
                      // 就業条件明示書のみ／兼用×正社員・無期契約の組み合わせでは派遣期間を保存する
                      // 経路（コピー系ボタン）が存在しなかったため、入力しても一括更新に永久に
                      // 含められない不具合があった。入力するたびにDBへも直接保存する。
                      updateCandidate(c.id, { new_dispatch_start: start })
                    }}
                      className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-[#6B7280] mb-1">派遣期間の終了日</div>
                    <input type="date" value={draft.end} onChange={e => {
                      const end = clampDateYear(e.target.value)
                      setManualDraft(prev => ({ ...prev, [c.id]: { start: prev[c.id]?.start || draft.start, end } }))
                      updateCandidate(c.id, { new_dispatch_end: end })
                    }}
                      className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                  </div>
                  {hasEmploy && (
                    isIndefinite ? (
                      <button onClick={() => draft.start && updateCandidate(c.id, { new_contract_start_date: draft.start })}
                        disabled={!draft.start}
                        className="rounded-2xl border border-[#E8EDF5] px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-40" style={{ background: '#EAF1FF', color: '#244CB3' }}>
                        契約条件適用開始日へコピー ↓
                      </button>
                    ) : (
                      <button onClick={() => draft.start && draft.end && copyDispatchToEmploy(c.id, draft.start, draft.end)}
                        className="rounded-2xl border border-[#E8EDF5] px-3 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ background: '#EAF1FF', color: '#244CB3' }}>
                        雇用期間へコピー ↓
                      </button>
                    )
                  )}
                </div>
                {dispatchOrderInvalid && (
                  <p className="mt-2 text-xs font-semibold" style={{ color: '#C0392B' }}>終了日は開始日以降の日付にしてください。</p>
                )}
              </div>
              {hasEmploy && (
                isIndefinite ? (
                  <div className="rounded-2xl border border-[#E8EDF5] p-3.5">
                    <p className="mb-2 text-xs font-semibold text-[#1F2937]">契約条件適用開始日（正社員・無期契約のため雇用期間は期間の定めなしです）</p>
                    <div className="max-w-xs">
                      <div className="text-[11px] text-[#6B7280] mb-1">契約条件適用開始日</div>
                      <input type="date" value={c.new_contract_start_date || c.contract_start_date || ''}
                        onChange={e => updateCandidate(c.id, { new_contract_start_date: clampDateYear(e.target.value) })}
                        className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                    </div>
                    <p className="mt-2 text-xs text-[#6B7280]">変更が無ければそのまま実行できます。給与改定等で条件が変わった場合のみ修正してください。</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#E8EDF5] p-3.5">
                    <p className="mb-2 text-xs font-semibold text-[#1F2937]">雇用期間（派遣期間をコピーした内容。兼用のため自動で揃えています）</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-[#6B7280] mb-1">雇用期間の開始日</div>
                        <input readOnly value={c.new_employ_start || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                      </div>
                      <div>
                        <div className="text-[11px] text-[#6B7280] mb-1">雇用期間の終了日</div>
                        <input readOnly value={c.new_employ_end || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          ) : (
            isIndefinite ? (
              <div className="rounded-2xl border border-[#E8EDF5] p-3.5">
                <p className="mb-2 text-xs font-semibold text-[#1F2937]">契約条件適用開始日（正社員・無期契約のため雇用期間は期間の定めなしです）</p>
                <div className="max-w-xs">
                  <div className="text-[11px] text-[#6B7280] mb-1">契約条件適用開始日</div>
                  <input type="date" value={c.new_contract_start_date || c.contract_start_date || ''}
                    onChange={e => updateCandidate(c.id, { new_contract_start_date: clampDateYear(e.target.value) })}
                    className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                </div>
                <p className="mt-2 text-xs text-[#6B7280]">変更が無ければそのまま実行できます。</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#E8EDF5] p-3.5">
                <p className="mb-2 text-xs font-semibold text-[#1F2937]">雇用期間</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] text-[#6B7280] mb-1">雇用期間の開始日</div>
                    <input type="date" value={c.new_employ_start || ''} onChange={e => updateCandidate(c.id, { new_employ_start: clampDateYear(e.target.value) })}
                      className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-[#6B7280] mb-1">雇用期間の終了日</div>
                    <input type="date" value={c.new_employ_end || ''} onChange={e => updateCandidate(c.id, { new_employ_end: clampDateYear(e.target.value) })}
                      className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" />
                  </div>
                </div>
                {employOnlyOrderInvalid && (
                  <p className="mt-2 text-xs font-semibold" style={{ color: '#C0392B' }}>終了日は開始日以降の日付にしてください。</p>
                )}
              </div>
            )
          )}
        </div>
        {renderReasonBoxes(c)}
      </article>
    )
  }

  const renderEditRow = (c: RenewalCandidate) => (
    <article key={c.id} className="rounded-[18px] border border-[#E8EDF5] bg-white p-5">
      {renderRowHead(c, renderCommonFooter(c))}
      {renderSecondaryGrid(c, renderConfirmLink(c))}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E8EDF5] pt-3">
        {c.triage_mode === 'individual' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#F3ECFF', color: '#5A3EC8' }}>個別申請 進行中</span>
            {canFinalize && (
              <>
                <button onClick={() => router.push(`/apply?renewal=${c.id}`)} className="text-xs font-semibold underline" style={{ color: '#5A3EC8' }}>申請画面を開く</button>
                <button onClick={() => setTriageMode(c.id, 'undecided')} className="text-xs font-semibold underline text-[#8B98B1]">取り消す</button>
              </>
            )}
          </div>
        ) : canFinalize && c.status !== 'not_renewing' ? (
          <button
            onClick={async () => { await setTriageMode(c.id, 'individual'); router.push(`/apply?renewal=${c.id}`) }}
            className="rounded-2xl px-4 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
            style={{ background: '#5A3EC8' }}
          >
            更新申請する →
          </button>
        ) : null}
      </div>
      {renderReasonBoxes(c)}
    </article>
  )

  const renderImportWaitRow = (c: RenewalCandidate) => (
    <article key={c.id} className="rounded-[18px] border border-[#E8EDF5] bg-white p-5">
      {renderRowHead(c, renderCommonFooter(c))}
      {renderSecondaryGrid(c, renderConfirmLink(c))}
      {/* 2026-08-03修正（伊藤さん指摘）：「期間以外も修正するに切替」「期間のみ更新に切替」の
          2ボタンは、同じ行の右上にある「他のタブへ移動」ドロップダウンと機能が完全に重複していた
          （同じsetRenewalTab()を別の2通りの操作で呼べる状態で、保守も分かりにくくなっていた）。
          重複ボタンを廃止し「他のタブへ移動」に一本化。「CSVを再検索」はタブ移動ではなく
          別機能（CSV再検索）のため維持。 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#E8EDF5] pt-3">
        <span className="text-xs text-[#8B98B1]">CSVインポートを依頼済みです。管理部が取り込みを確認しています。</span>
        {canFinalize && (
          <button onClick={() => handleRecheck(c)} disabled={recheckingId === c.id}
            className="rounded-2xl border border-[#D0DAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50">
            {recheckingId === c.id ? '再検索中…' : 'CSVを再検索'}
          </button>
        )}
      </div>
      {renderReasonBoxes(c)}
    </article>
  )

  const rowRenderer: Record<RenewalTab, (c: RenewalCandidate) => ReactNode> = {
    unassigned: renderUnassignedRow,
    csv_auto: renderCsvAutoRow,
    period_only: renderPeriodOnlyRow,
    edit: renderEditRow,
    import_wait: renderImportWaitRow,
  }

  const bulkTabActive = activeTab === 'csv_auto' || activeTab === 'period_only'
  const bulkTargets = bulkTabActive ? tabCandidates.filter(c => c.status !== 'not_renewing' && c.triage_mode === 'bulk' && periodReady(c)) : []

  return (
    <div className="flex flex-col gap-5">
      <UsageHelpPanel open={helpOpen} onToggle={() => setHelpOpen(v => !v)} />

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

      <SubTabBar items={tabItems} activeKey={activeTab} onChange={setActiveTab} />

      {tabCandidates.length > 0 && (
        <section className="rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <div className="[&_button]:rounded-[14px] [&_button]:font-semibold [&_input]:rounded-[14px] [&_input]:border-[#E8EDF5] [&_input]:transition [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[14px] [&_select]:border-[#E8EDF5]">
            {toolbar}
          </div>
        </section>
      )}

      {tabCandidates.length === 0 ? (
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <p className="text-sm font-semibold text-[#1F2937]">このタブに該当する対象者はいません。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-12 text-center shadow-[0_10px_30px_rgba(15,23,42,.05)]">
          <p className="text-sm font-semibold text-[#1F2937]">条件に一致する対象者が見つかりませんでした</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(c => <Fragment key={c.id}>{rowRenderer[activeTab](c)}</Fragment>)}
        </div>
      )}

      {/* 仕分け待ちタブ：振り分け実行バー */}
      {activeTab === 'unassigned' && Object.keys(unassignedChoice).length > 0 && canFinalize && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E8EDF5] bg-white px-5 py-4 shadow-[0_15px_40px_rgba(15,23,42,.12)]">
          <span className="text-xs font-semibold text-[#6B7280]">{Object.keys(unassignedChoice).length}件を振り分けます</span>
          <button onClick={handleTriageExecute} disabled={triaging}
            className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#C2410C] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50">
            {triaging ? '振り分け中…' : '振り分ける'}
          </button>
        </div>
      )}

      {/* CSV自動反映／期間のみ更新タブ：一括実行バー */}
      {bulkTabActive && tabCandidates.length > 0 && (() => {
        const canExecute = canFinalize && bulkTargets.length > 0
        return (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E8EDF5] bg-white px-5 py-4 shadow-[0_15px_40px_rgba(15,23,42,.12)]">
            <span className="text-xs font-semibold text-[#6B7280]">チェック済み <span style={{ color: TAB_DEFS.find(t => t.key === activeTab)?.color }}>{bulkTargets.length}件</span></span>
            <button
              onClick={() => setShowBulkApplyConfirm(true)}
              disabled={!canExecute}
              title={!canFinalize ? '閲覧のみのため実行できません' : bulkTargets.length === 0 ? 'チェックした案件がありません' : undefined}
              className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: canExecute ? TAB_DEFS.find(t => t.key === activeTab)?.color : '#B0B7C3' }}
            >
              {TAB_LABEL[activeTab]}を実行（{bulkTargets.length}件）
            </button>

            {showBulkApplyConfirm && canExecute && !bulkApplying && bulkApplyResult === null && (
              <div className="w-full rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
                <p className="text-sm font-semibold text-[#1F2937]">「{TAB_LABEL[activeTab]}」の{bulkTargets.length}件を、確定済みの新しい期間で申請しますか</p>
                <p className="mt-2 text-xs font-medium leading-6 text-[#6B7280]">
                  各対象者について、新規の契約申請（申請中ステータス）が自動で作成されます。<br />
                  作成後は通常の申請と同じくSSC・管理部の承認が必要です。<br />
                  内容に誤りがないか、対象者ごとに「契約内容をすべて確認」で今一度ご確認ください。
                </p>
                <div className="mt-4 max-h-48 overflow-y-auto rounded-2xl border border-[#E8EDF5] bg-white">
                  <ul className="divide-y divide-[#E8EDF5]">
                    {bulkTargets.map(t => {
                      // 2026-08-03修正：ここも`dispatch_end_date`の有無ではなく書類種別で判定する
                      // （他の箇所と同じ理由。雇用契約書のみの契約で残骸のdispatch_end_dateにより
                      // 誤って「雇〜／派〜」の2本立て表示になっていた）。
                      const tDocFlags = getDocumentPeriodFlags(t.document_type)
                      const showDispatchLabel = tDocFlags.resolved ? tDocFlags.needsDispatch : !!t.dispatch_end_date
                      const sameNewDate = t.new_employ_end && t.new_dispatch_end && t.new_employ_end === t.new_dispatch_end
                      // L-04対応（2026-08-14）：このプレビューだけハイフン生値のまま表示されていたため、
                      // タブ内の他の日付表示と揃うようformatDateJpを通す。
                      const newPeriodLabel = showDispatchLabel
                        ? (sameNewDate ? `〜${formatDateJp(t.new_employ_end)}` : `雇〜${formatDateJp(t.new_employ_end)} / 派〜${formatDateJp(t.new_dispatch_end)}`)
                        : `〜${formatDateJp(t.new_employ_end)}`
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                          <span className="font-semibold text-[#1F2937]">{t.staff_name || '―'}<span className="ml-1.5 font-normal text-[#8B98B1]">{t.employee_number}</span></span>
                          <span className="shrink-0 font-semibold" style={{ color: '#2F5FD0' }}>新期限 {newPeriodLabel}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => handleExecuteBulkApply(bulkTargets)} className="inline-flex h-[48px] flex-1 items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#244CB3]">
                    {bulkTargets.length}件を実行する
                  </button>
                  <button onClick={() => setShowBulkApplyConfirm(false)} className="inline-flex h-[48px] items-center justify-center rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]">
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {confirmModalCandidate && (
        <RenewalContractConfirmModal candidate={confirmModalCandidate} onClose={() => setConfirmModalCandidate(null)} />
      )}

      {(bulkApplying || bulkApplyResult !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,41,55,.52)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,.18)]">
            {bulkApplying ? (
              <>
                <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-[#DDE8FF] border-t-[#2F5FD0]" />
                <p className="text-lg font-semibold text-[#1F2937]">実行しています</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
                  完了までしばらくお待ちください。<br />
                  画面を閉じずにお待ちください。
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF8EE] text-[#4CAF50]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="text-lg font-semibold text-[#1F2937]">完了しました（{bulkApplyResult?.successCount ?? 0}件）</p>
                <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">作成した申請は、通常の申請と同じくSSC・管理部の承認待ち一覧に表示されます。</p>
                {bulkApplyResult && bulkApplyResult.failed.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-[#FDECEC] px-4 py-3 text-left">
                    <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>{bulkApplyResult.failed.length}件は作成に失敗しました。</p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {bulkApplyResult.failed.map((f, i) => (
                        <li key={i} className="text-xs" style={{ color: '#B91C1C' }}>{f.staffName || '―'}（{f.employeeNumber}）：{f.reason}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] leading-relaxed" style={{ color: '#B91C1C' }}>
                      失敗した案件はそのままタブに残っています。<br />
                      再実行するか、期間以外も修正するに切り替えてください。
                    </p>
                  </div>
                )}
                <button onClick={handleBulkApplyDoneOk} className="mt-7 inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:bg-[#244CB3]">OK</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
