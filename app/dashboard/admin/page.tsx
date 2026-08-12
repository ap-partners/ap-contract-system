'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useSessionCollisionGuard } from '@/lib/useSessionCollisionGuard'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ContractForDisplay,
  formatDateTime,
  formatDate,
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
// 2026-08-05：日付表記統一によりハイフン生値表示（2026-05-01）を廃止し漢字表記へ
import { formatPeriodJp } from '@/lib/dateFormat'
import { WITHDRAWN_APPLICATION_DELETE_CONFIRM } from '@/lib/confirmMessages'
import { useDeptNameMap, getApplicantLabel } from '../_shared/useDeptNameMap'
import { useContractListToolbar, buildDateSortOptions } from '../_shared/useContractListToolbar'
import { useApprovedAccumulator, APPROVED_WINDOW_DAYS, CONTRACT_COLUMNS } from '../_shared/useApprovedAccumulator'
import RenewalManagementTab from '../_shared/RenewalManagementTab'
import { useRenewalCandidates } from '../_shared/useRenewalCandidates'
import ContractMonitoringSection from '../_shared/ContractMonitoringSection'
import { useContractMonitoring } from '../_shared/useContractMonitoring'
import WageRevisionSection from '../_shared/WageRevisionSection'
import { useWageRevisionCandidates } from '../_shared/useWageRevisionCandidates'
import MasterManagementTab from '../_shared/MasterManagementTab'
import AccountManagementTab from '../_shared/AccountManagementTab'
import FaqManagementTab from '../_shared/FaqManagementTab'
import ChatbotWidget from '../_shared/ChatbotWidget'
import { useDebouncedSearch, escapeForPostgrestFilter } from '../_shared/useDebouncedSearch'
import { STAFF_EXPRESS_COLUMNS } from '@/lib/staffExpressColumns'
import { CSV_SAMPLE_FILES, CSV_REQUIRED_COLUMNS_LABEL } from '@/lib/csvSystemColumns'
import { clampDateYear } from '@/app/apply/_lib/helpers'
import LoggedInUserChip from '../_shared/LoggedInUserChip'
import { useLoggedInUser } from '../_shared/useLoggedInUser'
import NewDocumentMenu from '../_shared/NewDocumentMenu'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'
import ProtectedRowsDownloadButton from '@/app/_shared/ui/ProtectedRowsDownloadButton'
import PledgeListSection from '../_shared/PledgeListSection'
import { SubTabBar } from '../_shared/SubTabBar'

type RequestRow = {
  id: string
  request_type: 'staff_register' | 'csv_import'
  staff_name: string | null
  staff_code: string | null
  staff_id: string | null
  staff_dept: string | null
  staff_hire_date: string | null
  client_name: string | null
  system_type: string | null
  dispatch_start_date: string | null
  staff_register_status: string | null
  csv_import_status: string | null
  staff_register_cancel_reason: string | null
  csv_import_cancel_reason: string | null
  requested_by: string | null
  requested_by_name: string | null
  requested_by_dept: string | null
  requested_at: string
  displayDept?: string | null
}

type TabType = 'overview' | 'requests' | 'contracts' | 'internal' | 'csvImport' | 'renewal' | 'master' | 'pledges' | 'accounts' | 'faq'
// 2026-07-29：タブ数増加（10個）による横長化の解消として、ナビゲーションを
// 「サマリー／承認業務／データ登録／運用管理」の4グループの2階層タブに再編。
// 各タブが実際にどのグループに属するかを1箇所で管理する対応表（伊藤さん承認済みの案A）。
type TabGroupKey = 'overview' | 'approval' | 'data' | 'ops'
const TAB_GROUP: Record<TabType, TabGroupKey> = {
  overview: 'overview',
  requests: 'data',
  contracts: 'approval',
  internal: 'approval',
  csvImport: 'data',
  renewal: 'approval',
  pledges: 'approval',
  master: 'data',
  accounts: 'ops',
  faq: 'ops',
}
const TAB_GROUP_LABEL: Record<TabGroupKey, { label: string; icon: IconName }> = {
  overview: { label: 'サマリー', icon: 'grid' },
  approval: { label: '承認業務', icon: 'check' },
  data: { label: 'データ登録', icon: 'upload' },
  ops: { label: '運用管理', icon: 'user' },
}
// 2026-07-29：更新期限管理タブ内のサブタブ（期限間近の更新候補／契約状況モニタリング）。
// 従来は同一タブ内に2つの一覧が縦に積み上がって表示され、下側（契約状況モニタリング）が
// スクロールしないと見えない・見落としやすいという伊藤さんの指摘を受けて分割した。
// 初期表示は「期限間近の更新候補」（伊藤さんが推奨案として選択・確定）。
type RenewalSubTab = 'candidates' | 'monitoring' | 'wageRevision'
type Contract = ContractForDisplay
type ContractSubTab = '承認待ち' | '差し戻し中' | '承認済み' | '取り下げ'
type IconName = 'file' | 'list' | 'shield' | 'upload' | 'alert' | 'clock' | 'search' | 'refresh' | 'check' | 'arrow' | 'logout' | 'map' | 'user' | 'building' | 'plus' | 'grid'

const SYSTEM_LOGO_FILE: Record<string, string> = {
  'e-staffing': '/logos/e-staffing.png',
  HRstation: '/logos/hrstation.png',
  winworks: '/logos/winworks.png',
  Staffia: '/logos/staffia.png',
  StaffExpress: '/logos/staffexpress.png',
}
// システムごとのブランドカラー（各社ロゴの主要色に合わせたアクセント）。
// システム選択カードの枠線・選択時の背景色・チェックマークの配色に使用（2026-07-17）。
const SYSTEM_ACCENT: Record<string, { border: string; bg: string; ring: string }> = {
  'e-staffing': { border: '#F59E42', bg: '#FFF3E6', ring: '#F59E42' },
  HRstation: { border: '#6CAF2E', bg: '#F0F9E8', ring: '#6CAF2E' },
  winworks: { border: '#9B2247', bg: '#FBEAEF', ring: '#9B2247' },
  Staffia: { border: '#374151', bg: '#F3F4F6', ring: '#374151' },
  StaffExpress: { border: '#2F5FD0', bg: '#EAF1FF', ring: '#2F5FD0' },
}
const PAGE_SIZE = 50
// 依頼一覧（「すべて／完了済みのみ／取消済みのみ」表示時）の既定絞り込み日数。
// 「未対応のみ」表示は対応漏れ発見のため常に全期間対象（2026-07-14）
const REQUEST_WINDOW_DAYS = 45
const cardBase = 'rounded-[18px] border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]'
const primaryButton = 'inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]'
const secondaryButton = 'inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-[#E8EDF5] bg-white px-6 text-sm font-semibold text-[#1F2937] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0]'
const accentButton = 'inline-flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#F59E42] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(245,158,66,.2)] transition hover:-translate-y-0.5 hover:bg-[#E88525] hover:shadow-[0_15px_34px_rgba(245,158,66,.28)] disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:shadow-none disabled:hover:translate-y-0'
// 2026-07-24追加：ヘッダー専用ボタンスタイル。SSCダッシュボードのヘッダー（h-12・px-4）に
// 3ダッシュボードとも統一するための専用定数（本文中の他のprimaryButton等はh-[52px]のまま変更しない）。
// 2026-07-24同日：headerPrimaryButton/headerAccentButtonは新規発行ボタン統合（NewDocumentMenu）に
// より不要になったため削除。headerSecondaryButton（ログアウトボタン）のみ引き続き使用。
const headerSecondaryButton = 'flex h-12 items-center gap-2 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] shadow-[0_10px_30px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:text-[#2F5FD0] hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]'

const Icon = ({ name, className = '' }: { name: IconName; className?: string }) => {
  const paths: Record<IconName, ReactNode> = {
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    list: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m17 8-5-5-5 5" />
        <path d="M12 3v12" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
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
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        <path d="M9 7h1" />
        <path d="M14 7h1" />
        <path d="M9 11h1" />
        <path d="M14 11h1" />
        <path d="M9 15h1" />
        <path d="M14 15h1" />
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
    grid: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const Pill = ({ children, tone = 'gray' }: { children: ReactNode; tone?: 'blue' | 'orange' | 'red' | 'green' | 'gray' | 'purple' }) => {
  const tones = {
    blue: 'bg-[#EAF1FF] text-[#2F5FD0]',
    orange: 'bg-[#FFF3E8] text-[#F59E42]',
    red: 'bg-[#FDECEC] text-[#E74C3C]',
    green: 'bg-[#EAF8EE] text-[#4CAF50]',
    gray: 'bg-[#F3F5F8] text-[#6B7280]',
    purple: 'bg-[#F3ECFF] text-[#7C3AED]',
  }
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

// ドラッグ&ドロップ対応のファイル選択欄（2026-07-17：CSVインポート画面のリデザインで導入）。
// クリックでの選択と、ファイルをドラッグしてドロップする操作の両方に対応。
function FileDropzone({
  label,
  file,
  onChange,
  accept,
}: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  accept: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[#1F2937]">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onChange(f)
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${dragOver ? 'border-[#2F5FD0] bg-[#EAF1FF]' : 'border-[#C7D2FE] bg-[#F8F9FF] hover:border-[#2F5FD0]'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={e => onChange(e.target.files?.[0] || null)}
          className="hidden"
        />
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#2F5FD0] shadow-[0_2px_6px_rgba(47,95,208,.15)]">
          <Icon name="file" className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[#4B5563]">ここにファイルをドラッグ、またはクリックして選択</p>
        {file && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#EAF1FF] px-3 py-1 text-xs font-semibold text-[#2F5FD0]">
            <Icon name="file" className="h-3.5 w-3.5" />
            {file.name}
          </p>
        )}
      </div>
    </div>
  )
}

// システム選択→ファイル選択→結果確認、の進行状況を示すステッパー（2026-07-17導入）
function ImportStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: 'システム選択' },
    { n: 2, label: 'ファイル選択' },
    { n: 3, label: '結果確認' },
  ]
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.n} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                s.n < step ? 'bg-[#2F5FD0] text-white' : s.n === step ? 'bg-[#2F5FD0] text-white' : 'bg-[#F3F4F6] text-[#9CA3AF]'
              }`}
            >
              {s.n < step ? <Icon name="check" className="h-3.5 w-3.5" /> : s.n}
            </div>
            <p className={`text-xs font-semibold whitespace-nowrap ${s.n <= step ? 'text-[#1F2937]' : 'text-[#9CA3AF]'}`}>{s.label}</p>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 h-0.5 flex-1 ${s.n < step ? 'bg-[#2F5FD0]' : 'bg-[#E8EDF5]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// インポート履歴のタイムライン表示（2026-07-17導入）。成功=緑チェック、エラーあり=赤い！のドット。
// エラーがある場合はクリックでエラー詳細（error_detail列）を開閉できる。
function ImportHistoryTimeline({
  items,
}: {
  items: { id: string; title: string; datetime: string; pills: ReactNode; hasError: boolean; errorDetail: string | null; extra?: ReactNode }[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="relative mt-4 pl-1">
      <div className="absolute bottom-1.5 left-[15px] top-1.5 w-0.5 bg-[#E8EDF5]" />
      <div className="flex flex-col gap-3">
        {items.map(item => (
          <div key={item.id} className="relative flex gap-3">
            <div
              className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white ${
                item.hasError ? 'bg-[#E74C3C]' : 'bg-[#4CAF50]'
              }`}
            >
              <Icon name={item.hasError ? 'alert' : 'check'} className="h-3.5 w-3.5" />
            </div>
            <div
              className={`flex-1 rounded-2xl border p-4 ${
                item.hasError ? 'border-[#FDD9D9] bg-[#FEF6F6]' : 'border-[#E8EDF5] bg-white'
              }`}
            >
              <p className="text-sm font-semibold text-[#1F2937]">
                {item.title} <span className="ml-1.5 text-xs font-medium text-[#9CA3AF]">{item.datetime}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.pills}
                {item.hasError && item.errorDetail && (
                  <button
                    onClick={() => setOpenId(o => (o === item.id ? null : item.id))}
                    className="text-xs font-semibold text-[#E74C3C] underline underline-offset-2"
                  >
                    エラー内容を{openId === item.id ? '閉じる' : '見る'}
                  </button>
                )}
              </div>
              {item.hasError && openId === item.id && item.errorDetail && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white border border-[#FDD9D9] p-3 text-xs leading-5 text-[#9F1239]">
                  {item.errorDetail}
                </pre>
              )}
              {item.extra && <div className="mt-2">{item.extra}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function isPending(r: RequestRow) {
  return r.staff_register_status === 'pending' || r.csv_import_status === 'pending'
}

function hasCancelled(r: RequestRow) {
  return r.staff_register_status === 'cancelled' || r.csv_import_status === 'cancelled'
}

export default function AdminDashboard() {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
  const confirmDialog = useConfirm()
  const [user, setUser] = useState<any>(null)
  // B-11対応（2026-08-12）：is_internal_approver・is_account_adminは、以前はSupabase Authの
  // user_metadata（ログイン時点のJWTのスナップショット）から読んでいたため、アカウント管理で
  // 権限を後から付与・剥奪しても対象者が再ログインするまで画面表示が実際の権限とズレたままに
  // なっていた。staff_rolesを毎回サーバーへ問い合わせるuseLoggedInUserに統一する
  // （RLS側は元々staff_rolesを直接見ており常に正しかったため、データが見えてしまう・
  // 書き換えられてしまうという意味での欠陥ではなく、UI表示精度の是正）。
  const loggedInUser = useLoggedInUser(user?.id)
  // 総合レビュー（QA監査2026-07-22）指摘C1対応：別タブで別アカウントにログインされ
  // 認証情報が裏で切り替わったことを検知したら、安全のため強制ログアウトする
  useSessionCollisionGuard(user?.id)
  // 2026-07-28追加：申請者表示「部門名 氏名」用の部門名マップ
  const deptNameByNo = useDeptNameMap()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [renewalSubTab, setRenewalSubTab] = useState<RenewalSubTab>('candidates')
  // 2026-07-29：グループタブ（承認業務／データ登録／運用管理）を再度開いたとき、
  // 前回そのグループ内で最後に見ていたタブへ自動で戻すための記憶（伊藤さんとの合意事項）。
  const [lastTabInGroup, setLastTabInGroup] = useState<Partial<Record<TabGroupKey, TabType>>>({})
  useEffect(() => {
    setLastTabInGroup(prev => ({ ...prev, [TAB_GROUP[activeTab]]: activeTab }))
  }, [activeTab])

  const [requests, setRequests] = useState<RequestRow[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [reqError, setReqError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // 総合レビュー指摘19対応：タブバッジ・サマリーカードの「未対応」件数は、絞り込み・検索・
  // 期間指定の影響を一切受けない独立した件数であるべき（そうでないと、他のタブや検索条件を
  // 見ている間だけ「未対応0件」等の誤表示になる）。requests（絞り込み後の一覧用state）とは
  // 別に、常に全期間・全条件のpending件数だけを数える専用state・取得処理を持つ。
  const [pendingTotalCountAll, setPendingTotalCountAll] = useState(0)

  // 総合レビュー指摘32・33対応（2026-07-22）：デバウンス＋PostgRESTエスケープを
  // 担当営業「依頼状況」タブと共通のフックに切り出した（app/dashboard/_shared/useDebouncedSearch.ts）。
  const { searchText, setSearchText, debouncedSearchText } = useDebouncedSearch()
  const [deptFilter, setDeptFilter] = useState('')
  const [requesterFilter, setRequesterFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'staff_register' | 'csv_import'>('')
  const [systemFilter, setSystemFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed' | 'cancelled'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 依頼管理タブの「絞り込み」リセットボタン用（ビルドエラー修正・2026-07-15：
  // JSX側から参照されていたが未定義だった）
  const resetFilters = () => {
    setSearchText('')
    setDeptFilter('')
    setRequesterFilter('')
    setTypeFilter('')
    setSystemFilter('')
    setStatusFilter('pending')
    setDateFrom('')
    setDateTo('')
  }

  const [flowContracts, setFlowContracts] = useState<Contract[]>([])
  // 取り下げ済み申請の削除（2026-07-27追加）：status='取り下げ'の行のみDELETE可能なようRLSで制限済み。
  const [deletingWithdrawnId, setDeletingWithdrawnId] = useState<string | null>(null)
  const {
    approvedContracts, approvedTotalCount, approvedHasMore, approvedLoadingMore,
    approvedSearchMode, approvedSearching, approvedSearchNotice,
    fetchApprovedRecent, loadMoreApproved, runApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.neq('work_place', '社内'))
  const [contractsLoading, setContractsLoading] = useState(true)
  const [contractsError, setContractsError] = useState('')
  const [contractsSubTab, setContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkApproveDone, setBulkApproveDone] = useState<number | null>(null)
  // 二重承認ガード（総合レビュー指摘12）：一括承認完了時に「他の人が先に処理済みだった」件数
  const [bulkApproveSkipped, setBulkApproveSkipped] = useState(0)
  // 総合レビュー指摘24対応：署名依頼メール送信の失敗を隠さず件数で伝える
  const [bulkApproveNotifyFailed, setBulkApproveNotifyFailed] = useState(0)

  const {
    candidates: renewalCandidates, loading: renewalLoading,
    syncCandidates, fetchCandidates, updateCandidate,
    searchCsvRenewal, requestCsvImport, switchToManualOverride,
    copyDispatchToEmploy, confirmNotRenewing, setTriageMode, setRenewalTab, executeBulkApply,
  } = useRenewalCandidates()

  // 契約状況モニタリング（フェーズ1・2026-07-23実装。管理部専用）
  const {
    rows: monitoringRows, loading: monitoringLoading, fetchMonitoring,
    requestFollowUp: requestMonitoringFollowUp, updateActionStatus: updateMonitoringActionStatus,
  } = useContractMonitoring()

  // 最低賃金改定対応（2026-07-29実装。3ダッシュボード共通）
  const {
    rows: wageRevisionRows, loading: wageRevisionLoading, error: wageRevisionError,
    fetchCandidates: fetchWageRevisionCandidates,
  } = useWageRevisionCandidates()

  // ===== CSVインポートタブ（2026-07-15実装。2026-07-17：StaffExpress（スタッフ/部門マスタ）追加） =====
  const [csvImportSystem, setCsvImportSystem] = useState<'e-staffing' | 'HRstation' | 'winworks' | 'Staffia' | 'StaffExpress'>('e-staffing')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvFile103, setCsvFile103] = useState<File | null>(null)
  const [csvFile104, setCsvFile104] = useState<File | null>(null)
  const [staffExpressFileDept, setStaffExpressFileDept] = useState<File | null>(null)
  const [staffExpressFileStaff, setStaffExpressFileStaff] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvUploadError, setCsvUploadError] = useState('')
  const [csvUploadResult, setCsvUploadResult] = useState<any>(null)
  const [csvHistory, setCsvHistory] = useState<any[]>([])
  const [csvHistoryLoading, setCsvHistoryLoading] = useState(true)
  const [staffExpressColumnsOpen, setStaffExpressColumnsOpen] = useState(false)
  const [csvSystemColumnsOpen, setCsvSystemColumnsOpen] = useState(false)

  const fetchCsvHistory = useCallback(async () => {
    setCsvHistoryLoading(true)
    const { data } = await supabase
      .from('csv_imports')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(20)
    setCsvHistory(data || [])
    setCsvHistoryLoading(false)
  }, [])

  // StaffExpress（スタッフ/部門マスタ）の取込履歴は別テーブル（master_imports）のため個別に取得
  const [masterImportHistory, setMasterImportHistory] = useState<any[]>([])
  const [masterImportHistoryLoading, setMasterImportHistoryLoading] = useState(true)
  const fetchMasterImportHistory = useCallback(async () => {
    setMasterImportHistoryLoading(true)
    const { data } = await supabase
      .from('master_imports')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(20)
    setMasterImportHistory(data || [])
    setMasterImportHistoryLoading(false)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchCsvHistory()
    fetchMasterImportHistory()
  }, [user, fetchCsvHistory, fetchMasterImportHistory])

  const resetCsvUploadForm = () => {
    setCsvFile(null); setCsvFile103(null); setCsvFile104(null)
    setStaffExpressFileDept(null); setStaffExpressFileStaff(null)
  }

  const handleCsvUpload = async () => {
    setCsvUploadError('')
    setCsvUploadResult(null)
    if (csvImportSystem === 'Staffia' && (!csvFile103 || !csvFile104)) {
      setCsvUploadError('Staffiaは「契約詳細（KEF00103）」「スタッフ個人・派遣期間（KEF00104）」の両方のファイルを選択してください。')
      return
    }
    if (csvImportSystem === 'StaffExpress' && !staffExpressFileDept && !staffExpressFileStaff) {
      setCsvUploadError('部門マスタ・スタッフマスタのうち、少なくとも一方のファイルを選択してください。')
      return
    }
    if (csvImportSystem !== 'Staffia' && csvImportSystem !== 'StaffExpress' && !csvFile) {
      setCsvUploadError('ファイルを選択してください。')
      return
    }
    setCsvUploading(true)
    try {
      const formData = new FormData()
      formData.append('system', csvImportSystem)
      if (csvImportSystem === 'Staffia') {
        formData.append('file103', csvFile103 as File)
        formData.append('file104', csvFile104 as File)
      } else if (csvImportSystem === 'StaffExpress') {
        if (staffExpressFileDept) formData.append('fileDept', staffExpressFileDept)
        if (staffExpressFileStaff) formData.append('fileStaff', staffExpressFileStaff)
      } else {
        formData.append('file', csvFile as File)
      }
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/admin/csv-import', { method: 'POST', headers: authHeader, body: formData })
      const json = await res.json()
      if (!res.ok) {
        setCsvUploadError(json?.error || 'アップロードに失敗しました。')
      } else {
        setCsvUploadResult(json)
        resetCsvUploadForm()
        if (csvImportSystem === 'StaffExpress') await fetchMasterImportHistory()
        else await fetchCsvHistory()
      }
    } catch (e: any) {
      setCsvUploadError('通信エラーが発生しました：' + (e?.message || ''))
    } finally {
      setCsvUploading(false)
    }
  }

  const [internalFlowContracts, setInternalFlowContracts] = useState<Contract[]>([])
  const {
    approvedContracts: internalApprovedContracts, approvedTotalCount: internalApprovedTotalCount,
    approvedHasMore: internalApprovedHasMore, approvedLoadingMore: internalApprovedLoadingMore,
    approvedSearchMode: internalApprovedSearchMode, approvedSearching: internalApprovedSearching,
    approvedSearchNotice: internalApprovedSearchNotice, fetchApprovedRecent: fetchInternalApprovedRecent,
    loadMoreApproved: loadMoreInternalApproved, runApprovedSearch: runInternalApprovedSearch,
  } = useApprovedAccumulator<Contract>(q => q.eq('work_place', '社内'))
  const [internalContractsLoading, setInternalContractsLoading] = useState(true)
  const [internalContractsError, setInternalContractsError] = useState('')
  const [internalContractsSubTab, setInternalContractsSubTab] = useState<ContractSubTab>('承認待ち')
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set())
  const [internalShowBulkApproveConfirm, setInternalShowBulkApproveConfirm] = useState(false)
  const [internalBulkApproving, setInternalBulkApproving] = useState(false)
  const [internalBulkApproveDone, setInternalBulkApproveDone] = useState<number | null>(null)
  const [internalBulkApproveSkipped, setInternalBulkApproveSkipped] = useState(0)
  const [internalBulkApproveNotifyFailed, setInternalBulkApproveNotifyFailed] = useState(0)

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '管理部') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  // 契約状況モニタリング フェーズ2（2026-07-23）：「対応依頼」メールの依頼者名表示用に、
  // ログイン中の管理部ユーザーの氏名をstaffテーブルから解決しておく。
  const [adminStaffName, setAdminStaffName] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    // B-09対応（2026-08-06）：staff.email検索はC-03によりほぼ機能しないため、staff_rolesを
    // uid（user.id）で引く形に統一する。
    (async () => {
      const { data } = await supabase.from('staff_roles').select('name').eq('id', user.id).maybeSingle()
      setAdminStaffName(data?.name || null)
    })()
  }, [user])

  // 更新期限管理：管理部は全部門横断のためdeptNo=null（絞り込みなし）
  useEffect(() => {
    if (!user) return
    (async () => { await syncCandidates(); await fetchCandidates(null) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // 2026-07-29：更新期限管理タブのサブタブ化に伴い、契約状況モニタリングのデータ取得元だった
  // ContractMonitoringSectionのマウント時useEffectが、サブタブを開くまで発火しなくなった
  // （従来は常時マウントされていたため問題なかった）。そのままだとサブタブピルの件数バッジが
  // 実際に開くまで0件のまま表示されてしまうため、更新期限候補と同様ページ読み込み時に
  // 先読みするよう変更（サブタブを開いた際にContractMonitoringSection側でもう一度呼ばれるが、
  // 読み取りのみで実害がないため許容する）。
  useEffect(() => {
    if (!user) return
    fetchMonitoring()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // 2026-07-29：最低賃金改定対応サブタブも同じ理由（サブタブピルの件数バッジが開くまで0件のまま
  // 表示されてしまう）で、ページ読み込み時に先読みする。
  useEffect(() => {
    if (!user) return
    fetchWageRevisionCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!user) return
    const loadContracts = async () => {
      setContractsLoading(true)
      setContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACT_COLUMNS)
        .neq('work_place', '社内')
        .in('status', ['申請中', '差し戻し中', '取り下げ'])
        .order('created_at', { ascending: false })
      if (error) { setContractsError('契約一覧の取得に失敗しました: ' + error.message); setContractsLoading(false); return }
      setFlowContracts((data || []) as Contract[])
      await fetchApprovedRecent()
      setContractsLoading(false)
    }
    loadContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0 || bulkApproving) return
    setBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(selectedIds)
    // 二重承認ガード（総合レビュー指摘12）：SSCと管理部が同時に同じ案件を承認すると二重更新・
    // notify-sign-requestの二重送信（メール2通）が起きうるため、「まだ申請中の案件だけ」を
    // 条件につけ、実際に更新できた分だけを対象にする。
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
      // 2026-07-30追加（タスク⑥）：CSV反映項目が修正された案件があれば管理部へ通知する
      // （対象外の契約はAPI側でno-opになる。失敗しても承認フロー・件数表示はブロックしない）
      await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/contracts/${id}/notify-csv-modified`, { method: 'POST', headers: notifyAuthHeader }).catch(() => {})
        )
      )
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

  useEffect(() => {
    if (!user) return
    // B-11対応：loggedInUserがstaff_rolesの取得中はまだ権限が確定していないため、
    // 確定するまで待つ（安全側＝取得できるまでは「無い」ものとして扱い、確定後に表示する）。
    if (loggedInUser.loading) return
    if (!loggedInUser.isInternalApprover) { setInternalContractsLoading(false); return }
    const loadInternalContracts = async () => {
      setInternalContractsLoading(true)
      setInternalContractsError('')
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACT_COLUMNS)
        .eq('work_place', '社内')
        .in('status', ['申請中', '差し戻し中', '取り下げ'])
        .order('created_at', { ascending: false })
      if (error) { setInternalContractsError('社内案件の取得に失敗しました: ' + error.message); setInternalContractsLoading(false); return }
      setInternalFlowContracts((data || []) as Contract[])
      await fetchInternalApprovedRecent()
      setInternalContractsLoading(false)
    }
    loadInternalContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loggedInUser.loading, loggedInUser.isInternalApprover])

  const toggleSelectInternal = (id: string) => {
    setInternalSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkApproveInternal = async () => {
    if (internalSelectedIds.size === 0 || internalBulkApproving) return
    setInternalBulkApproving(true)
    const now = new Date().toISOString()
    const ids = Array.from(internalSelectedIds)
    // 二重承認ガード（総合レビュー指摘12。社内承認タブ側）
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({ status: 'SSC承認済み', approved_by: user.id, approved_at: now, updated_at: now })
      .in('id', ids)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      showError('一括承認に失敗しました: ' + error.message)
      setInternalBulkApproving(false)
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
      // 2026-07-30追加（タスク⑥）：CSV反映項目が修正された案件があれば管理部へ通知する
      // （対象外の契約はAPI側でno-opになる。失敗しても承認フロー・件数表示はブロックしない）
      await Promise.all(
        approvedIds.map(id =>
          fetch(`/api/contracts/${id}/notify-csv-modified`, { method: 'POST', headers: notifyAuthHeader }).catch(() => {})
        )
      )
    }
    setInternalFlowContracts(prev => prev.filter(c => !ids.includes(c.id)))
    await fetchInternalApprovedRecent()
    setInternalBulkApproving(false)
    setInternalBulkApproveSkipped(skipped)
    setInternalBulkApproveNotifyFailed(notifyFailedCount)
    setInternalBulkApproveDone(approvedIds.length)
  }

  const handleBulkApproveInternalDoneOk = () => {
    setInternalSelectedIds(new Set())
    setInternalShowBulkApproveConfirm(false)
    setInternalBulkApproveDone(null)
    setInternalBulkApproveSkipped(0)
    setInternalBulkApproveNotifyFailed(0)
  }

  useEffect(() => {
    if (!user) return
    const loadRequests = async () => {
      setReqLoading(true)
      setReqError('')
      try {
        let query = supabase.from('requests').select('*').order('requested_at', { ascending: false })

        if (debouncedSearchText) {
          const escaped = escapeForPostgrestFilter(debouncedSearchText)
          query = query.or(`staff_name.ilike.%${escaped}%,staff_code.ilike.%${escaped}%`)
        }
        if (systemFilter) query = query.eq('system_type', systemFilter)
        if (requesterFilter) query = query.ilike('requested_by_name', `%${requesterFilter}%`)
        if (dateFrom) query = query.gte('requested_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = query.lte('requested_at', `${dateTo}T23:59:59`)
        // 依頼日を明示的に指定していない場合、未対応(pending)だけを見ている時は
        // （対応漏れの発見のため）全期間を対象にするが、それ以外（すべて／完了済みのみ／取消済みのみ）
        // は蓄積し続けて意味が薄れていくため、既定で直近REQUEST_WINDOW_DAYS日に絞る
        // （伊藤さん指摘・2026-07-14：contracts側で先に対応した設計を依頼側にも適用）
        if (!dateFrom && !dateTo && statusFilter !== 'pending') {
          const windowStart = new Date()
          windowStart.setDate(windowStart.getDate() - REQUEST_WINDOW_DAYS)
          query = query.gte('requested_at', windowStart.toISOString())
        }
        // 総合レビュー指摘20対応：「未対応のみは常に全期間対象」という上のコメント通りの
        // 動作にするため、pending表示時（かつ期間未指定）はlimitを付けない。以前は新しい順
        // 500件で一律に切っていたため、総依頼数が500件を超えると古い未対応依頼が
        // 一覧から恒久的に見えなくなっていた（対応漏れの発見という目的に反する不具合だった）。
        // それ以外（すべて／完了済み／取消済み）は直近の窓で既に絞られているため500件で十分。
        if (!(statusFilter === 'pending' && !dateFrom && !dateTo)) {
          query = query.limit(500)
        }

        const { data, error } = await query
        if (error) { setReqError('依頼一覧の取得に失敗しました: ' + error.message); setReqLoading(false); return }

        let rows = (data || []) as RequestRow[]

        if (typeFilter === 'staff_register') rows = rows.filter(r => !!r.staff_register_status)
        if (typeFilter === 'csv_import') rows = rows.filter(r => !!r.csv_import_status && r.csv_import_status !== 'not_required')

        const staffIds = Array.from(new Set(rows.filter(r => r.request_type === 'csv_import' && r.staff_id).map(r => r.staff_id as string)))
        let deptByStaffId: Record<string, string | null> = {}
        if (staffIds.length > 0) {
          const { data: staffRows } = await supabase
            .from('staff')
            .select('id, department_master(dept_name)')
            .in('id', staffIds)
          for (const s of (staffRows || []) as any[]) {
            deptByStaffId[s.id] = s.department_master?.dept_name || null
          }
        }
        rows = rows.map(r => ({
          ...r,
          displayDept: r.request_type === 'staff_register' ? r.staff_dept : (r.staff_id ? deptByStaffId[r.staff_id] || null : null),
        }))

        if (deptFilter) rows = rows.filter(r => r.displayDept && r.displayDept.includes(deptFilter))

        if (statusFilter === 'pending') rows = rows.filter(r => isPending(r))
        if (statusFilter === 'completed') rows = rows.filter(r => !isPending(r) && !hasCancelled(r))
        if (statusFilter === 'cancelled') rows = rows.filter(r => hasCancelled(r))

        setRequests(rows)
        setVisibleCount(PAGE_SIZE)
      } finally {
        setReqLoading(false)
      }
    }
    loadRequests()
  }, [user, debouncedSearchText, deptFilter, requesterFilter, typeFilter, systemFilter, statusFilter, dateFrom, dateTo])

  // 総合レビュー指摘19対応：タブバッジ・サマリーカード用の「未対応」件数は、上の一覧取得とは
  // 独立して、絞り込み・検索・期間指定の影響を一切受けない全期間・全件のクエリで数える。
  const fetchPendingTotalCountAll = useCallback(async () => {
    const { count } = await supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .or('staff_register_status.eq.pending,csv_import_status.eq.pending')
    setPendingTotalCountAll(count ?? 0)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchPendingTotalCountAll()
  }, [user, fetchPendingTotalCountAll])

  const visibleRequests = requests.slice(0, visibleCount)

  // 2026-07-31変更：取消・完了とも依頼元（担当営業）への通知メールを新設したため、
  // メール送信が必要なサーバー側API（/api/requests/[id]/resolve）経由に統一した
  // （従来はここで直接supabase.update()していたが、メール送信にはservice roleが必要なため）。
  const handleResolveTask = async (
    requestId: string,
    statusField: 'staff_register_status' | 'csv_import_status',
    reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason',
    action: 'complete' | 'cancel',
    reason?: string
  ) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/resolve`, {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusField, action, reason }),
      })
      const json = await res.json()
      if (!res.ok) {
        showError((action === 'complete' ? '完了処理' : '取消') + 'に失敗しました: ' + (json?.error || ''))
        return false
      }
      if (json?.notifyError) {
        showError('処理は完了しましたが、依頼元への通知メール送信に失敗しました: ' + json.notifyError)
      }
      const newStatus = action === 'complete' ? 'completed' : 'cancelled'
      setRequests(prev => prev.map(r => r.id === requestId
        ? { ...r, [statusField]: newStatus, ...(action === 'cancel' ? { [reasonField]: reason } : {}) }
        : r))
      // 完了・取消により「未対応」から外れるため、独立集計のバッジ件数も更新する
      fetchPendingTotalCountAll()
      return true
    } catch (e: any) {
      showError((action === 'complete' ? '完了処理' : '取消') + '中に問題が発生しました。')
      return false
    }
  }
  const handleCancelTask = (
    requestId: string,
    statusField: 'staff_register_status' | 'csv_import_status',
    reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason',
    reason: string
  ) => handleResolveTask(requestId, statusField, reasonField, 'cancel', reason)
  const handleCompleteTask = (
    requestId: string,
    statusField: 'staff_register_status' | 'csv_import_status',
    reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason'
  ) => handleResolveTask(requestId, statusField, reasonField, 'complete')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filteredContracts = contractsSubTab === '承認済み'
    ? approvedContracts
    : flowContracts.filter(c => {
        if (contractsSubTab === '承認待ち') return c.status === '申請中'
        if (contractsSubTab === '差し戻し中') return c.status === '差し戻し中'
        if (contractsSubTab === '取り下げ') return c.status === '取り下げ'
        return false
      })
  const contractsPendingCount = flowContracts.filter(c => c.status === '申請中').length
  const contractsRejectedCount = flowContracts.filter(c => c.status === '差し戻し中').length
  const contractsWithdrawnCount = flowContracts.filter(c => c.status === '取り下げ').length
  const contractsApprovedCount = approvedTotalCount

  const {
    result: visibleContracts, toolbar: contractsToolbar,
    statusFilter: contractsStatusFilter, searchText: contractsSearchText, sortKey: contractsSortKey,
  } = useContractListToolbar(filteredContracts, {
    statusOptions: contractsSubTab === '承認済み'
      ? [
          { value: 'SSC承認済み', label: 'SSC承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
        ]
      : [],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: contractsSubTab,
  })

  // 絞り込み・検索・並び替えを変えると、画面から消えた案件のチェックが選択状態のまま残ってしまい、
  // 見えていない案件まで一括承認に巻き込まれる恐れがあった（総合レビュー指摘11・2026-07-15対応）。
  // RenewalManagementTab.tsxと同じ考え方で、条件を変えたタイミングで選択を必ずクリアする。
  useEffect(() => {
    setSelectedIds(new Set())
    setShowBulkApproveConfirm(false)
    setBulkApproveDone(null)
  }, [contractsStatusFilter, contractsSearchText, contractsSortKey])

  const bulkTargets = visibleContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAll = () => {
    if (selectedIds.size === bulkTargets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bulkTargets.map(c => c.id)))
    }
  }

  const filteredInternalContracts = internalContractsSubTab === '承認済み'
    ? internalApprovedContracts
    : internalFlowContracts.filter(c => {
        if (internalContractsSubTab === '承認待ち') return c.status === '申請中'
        if (internalContractsSubTab === '差し戻し中') return c.status === '差し戻し中'
        if (internalContractsSubTab === '取り下げ') return c.status === '取り下げ'
        return false
      })
  const internalPendingCount = internalFlowContracts.filter(c => c.status === '申請中').length
  const internalRejectedCount = internalFlowContracts.filter(c => c.status === '差し戻し中').length
  const internalWithdrawnCount = internalFlowContracts.filter(c => c.status === '取り下げ').length
  const internalApprovedCount = internalApprovedTotalCount

  // アルバイト誓約書タブの承認待ち件数バッジ（2026-07-23追加）
  const [pledgesPendingCount, setPledgesPendingCount] = useState(0)
  useEffect(() => {
    const loadPledgesPendingCount = async () => {
      const { count } = await supabase.from('pledges').select('id', { count: 'exact', head: true }).eq('status', '申請中')
      setPledgesPendingCount(count || 0)
    }
    loadPledgesPendingCount()
  }, [])

  // 2026-07-28追加：チャットボット「FAQ管理」タブの未回答件数バッジ
  const [faqUnansweredCount, setFaqUnansweredCount] = useState(0)
  useEffect(() => {
    const loadFaqUnansweredCount = async () => {
      const { count } = await supabase.from('faq_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'unanswered')
      setFaqUnansweredCount(count || 0)
    }
    loadFaqUnansweredCount()
  }, [])

  const {
    result: visibleInternalContracts, toolbar: internalToolbar,
    statusFilter: internalStatusFilter, searchText: internalSearchText, sortKey: internalSortKey,
  } = useContractListToolbar(filteredInternalContracts, {
    statusOptions: internalContractsSubTab === '承認済み'
      ? [
          // 総合レビュー指摘21対応：社内承認タブはカード側が「承認済み」表示（isInternal=true）
          // なので、絞り込みピルも合わせる（値自体は変更せず、実際のstatus文字列のまま絞り込む）。
          { value: 'SSC承認済み', label: '承認済み' },
          { value: '署名待ち', label: '署名待ち' },
          { value: '署名済み', label: '署名済み' },
        ]
      : [],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: internalContractsSubTab,
  })

  // 絞り込み・検索・並び替えを変えると選択状態が残ってしまう問題への対応（指摘11。社内承認タブ側）。
  useEffect(() => {
    setInternalSelectedIds(new Set())
    setInternalShowBulkApproveConfirm(false)
    setInternalBulkApproveDone(null)
  }, [internalStatusFilter, internalSearchText, internalSortKey])

  const internalBulkTargets = visibleInternalContracts.filter(c => !hasWarning(c) && !hasAutoCheckWarning(c))
  const toggleSelectAllInternal = () => {
    if (internalSelectedIds.size === internalBulkTargets.length) {
      setInternalSelectedIds(new Set())
    } else {
      setInternalSelectedIds(new Set(internalBulkTargets.map(c => c.id)))
    }
  }

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD]">
      <p className="text-sm font-medium text-[#6B7280]">読み込み中</p>
    </div>
  )

  // B-11対応（2026-08-12）：user_metadata（ログイン時点のJWTスナップショット）ではなく、
  // 上部のuseLoggedInUserが毎回staff_rolesから取り直す値を使う（loading中は安全側でfalse扱い）。
  const isInternalApprover = !loggedInUser.loading && loggedInUser.isInternalApprover
  const isAccountAdmin = !loggedInUser.loading && loggedInUser.isAccountAdmin

  // 2026-07-29：タブ横長化対策として「承認業務／データ登録／運用管理」の3グループ＋独立の
  // 「サマリー」の計4グループへ再編（伊藤さんと合意した案A）。各グループの中身は従来のタブをそのまま
  // 移動しただけで、タブ自体の機能・遷移先（activeTab）は一切変更していない。
  // 更新期限管理タブだけは、期限間近の更新候補／契約状況モニタリングの内訳を見せるため
  // 単一のバッジではなく2つの件数バッジを個別に表示する（下のnav内、renewalの特別分岐を参照）。
  const monitoringPendingCount = monitoringRows.filter(r => r.topSeverity !== 1 && r.actionStatus !== '解消').length
  const approvalTabs: { key: TabType; label: string; icon: IconName; count?: number }[] = [
    { key: 'contracts', label: '契約一覧', icon: 'list' },
    ...(isInternalApprover ? [{ key: 'internal' as TabType, label: '社内承認', icon: 'shield' as IconName, count: internalPendingCount }] : []),
    { key: 'pledges', label: 'アルバイト誓約書', icon: 'file', count: pledgesPendingCount },
    { key: 'renewal', label: '更新期限管理', icon: 'clock' },
  ]
  const dataTabs: { key: TabType; label: string; icon: IconName; count?: number }[] = [
    { key: 'requests', label: '依頼管理', icon: 'file', count: pendingTotalCountAll },
    { key: 'csvImport', label: 'CSVインポート', icon: 'upload' },
    { key: 'master', label: 'マスタ管理', icon: 'building' },
  ]
  const opsTabs: { key: TabType; label: string; icon: IconName; count?: number }[] = [
    ...(isAccountAdmin ? [{ key: 'accounts' as TabType, label: 'アカウント管理', icon: 'user' as IconName }] : []),
    { key: 'faq', label: 'FAQ管理', icon: 'file', count: faqUnansweredCount },
  ]
  const groupTabs: Record<TabGroupKey, { key: TabType; label: string; icon: IconName; count?: number }[]> = {
    overview: [{ key: 'overview', label: 'サマリー', icon: 'grid' }],
    approval: approvalTabs,
    data: dataTabs,
    ops: opsTabs,
  }
  // グループ単位の合計件数（「注意を引く」目的のみ。内訳は各グループを開いた先で確認する設計）
  const groupBadge: Record<TabGroupKey, number> = {
    overview: 0,
    approval: internalPendingCount + pledgesPendingCount + renewalCandidates.length + monitoringPendingCount,
    data: pendingTotalCountAll,
    ops: faqUnansweredCount,
  }
  const groupOrder: TabGroupKey[] = ['overview', 'approval', 'data', 'ops']
  const activeGroup = TAB_GROUP[activeTab]
  const currentGroupTabs = groupTabs[activeGroup]
  const openGroup = (g: TabGroupKey) => {
    setActiveTab(lastTabInGroup[g] ?? groupTabs[g][0].key)
  }

  // サマリータブ用：ドメイン横断で「今どこに未対応があるか」を一目で見せるカード（2026-07-14新設）。
  // 実データのある3枚（依頼・契約・社内承認）はクリックで該当タブへ切り替わる。
  // 「CSV差異」枠は、CSVインポート画面の上書き保護＋自動マッチ通知のみで対応する方針に簡略化されたため
  // 2026-07-17に撤去（画面はプレースホルダーのみで実体が無かったため。裏側のcsv_diff_logsテーブル自体は
  // 将来の再検討に備えて残置。詳細はdocs/SYSTEM_DESIGN.md 10章2026-07-17参照）。
  // overviewPlaceholders（準備中カードの枠）は今後また未実装機能が出た際に再利用できるよう構造だけ残す。
  const overviewCards: { key: TabType; label: string; value: number; icon: IconName }[] = [
    { key: 'requests', label: '依頼 未対応', value: pendingTotalCountAll, icon: 'file' },
    { key: 'contracts', label: '契約 承認待ち', value: contractsPendingCount, icon: 'list' },
    ...(isInternalApprover ? [{ key: 'internal' as TabType, label: '社内承認待ち', value: internalPendingCount, icon: 'shield' as IconName }] : []),
    { key: 'renewal', label: '更新期限 対象', value: renewalCandidates.length, icon: 'clock' },
  ]
  const overviewPlaceholders: { label: string; icon: IconName }[] = []

  const requestSummary = [
    { label: '総依頼件数', value: requests.length, color: '#2F5FD0', tone: 'blue' as const, icon: 'file' as const },
    // 総合レビュー指摘19対応：ここだけ絞り込みと無関係な全社の未対応件数（タブバッジと同じ値）にする。
    // 他のカード（総依頼件数・対応中・完了・取消済み）は「今表示している一覧の内訳」のままでよいが、
    // 「未対応」は対応漏れの発見という目的上、常に全体件数でないと意味が薄れるため。
    { label: '未対応', value: pendingTotalCountAll, color: '#E74C3C', tone: 'red' as const, icon: 'alert' as const },
    { label: '対応中', value: requests.filter(r => r.staff_register_status === 'in_progress' || r.csv_import_status === 'in_progress').length, color: '#F59E42', tone: 'orange' as const, icon: 'refresh' as const },
    { label: '完了', value: requests.filter(r => !isPending(r) && !hasCancelled(r)).length, color: '#4CAF50', tone: 'green' as const, icon: 'check' as const },
    { label: '取消済み', value: requests.filter(hasCancelled).length, color: '#6B7280', tone: 'gray' as const, icon: 'refresh' as const },
  ]

  const contractSummary = [
    { label: '承認待ち', value: contractsPendingCount, color: '#2F5FD0', icon: 'file' as const },
    { label: '差し戻し中', value: contractsRejectedCount, color: '#E74C3C', icon: 'refresh' as const },
    { label: '承認済み・署名状況', value: contractsApprovedCount, color: '#4CAF50', icon: 'check' as const },
  ]

  const internalSummary = [
    { label: '承認待ち', value: internalPendingCount, color: '#2F5FD0', icon: 'file' as const },
    { label: '差し戻し中', value: internalRejectedCount, color: '#F59E42', icon: 'refresh' as const },
    { label: '承認済み・署名状況', value: internalApprovedCount, color: '#4CAF50', icon: 'check' as const },
  ]

  // 取り下げ済み申請の削除（2026-07-27追加）：契約一覧・社内承認どちらの一覧からも呼べるよう、
  // 更新先のsetterを引数で受け取る共通実装。status='取り下げ'の行のみDELETE可能なようRLSで制限済み。
  const handleDeleteWithdrawn = async (contractId: string, setter: Dispatch<SetStateAction<Contract[]>>) => {
    const ok = await confirmDialog(WITHDRAWN_APPLICATION_DELETE_CONFIRM)
    if (!ok) return
    setDeletingWithdrawnId(contractId)
    const { error } = await supabase.from('contracts').delete().eq('id', contractId).eq('status', '取り下げ')
    setDeletingWithdrawnId(null)
    if (error) { showError('削除に失敗しました: ' + error.message); return }
    setter(prev => prev.filter(c => c.id !== contractId))
    showSuccess('削除しました。')
  }

  const ContractCard = ({
    contract,
    subTab,
    selectedIdsSet,
    toggle,
    clearConfirm,
    isInternal = false,
    onDelete,
  }: {
    contract: Contract
    subTab: ContractSubTab
    selectedIdsSet: Set<string>
    toggle: (id: string) => void
    clearConfirm: () => void
    isInternal?: boolean
    onDelete?: (id: string) => void
  }) => {
    const staff = contract.input_data?.staff || {}
    const f = contract.input_data?.fields || {}
    const deadline = getDeadlineAlert(contract)
    const warning = hasWarning(contract)
    const autoWarning = hasAutoCheckWarning(contract)
    const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
    const hasAnyWarning = warning || autoWarning
    const isSelected = selectedIdsSet.has(contract.id)
    const canBulkSelect = subTab === '承認待ち' && !hasAnyWarning
    const showWarningIcon = subTab === '承認待ち' && hasAnyWarning
    // 自動チェック警告の重要度で色を出し分ける（red＝赤、それ以外（yellow）＝青）。
    // SSCダッシュボードと同じ考え方（2026-07-14修正）で、管理部側にも合わせる。
    const autoWarningTone: 'red' | 'blue' = contract.warning_level === 'red' ? 'red' : 'blue'

    return (
      <article className={`${cardBase} p-5`}>
        {/* 1行目：氏名と操作ボタンは画面幅に関わらず必ずこの1行に収まる（総合レビュー追加指摘・
            2026-07-29対応：固定ピクセル幅の横並びグリッドだと画面が狭いと操作ボタンごと見切れて
            しまっていたため、氏名＋ボタンだけは常に見える構造に変更） */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex shrink-0 items-center pt-1">
              {canBulkSelect && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => { toggle(contract.id); clearConfirm() }}
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
                {deadline.type && <Pill tone={deadline.type === 'overdue' ? 'red' : 'orange'}>{deadline.label}</Pill>}
                {/* 総合レビュー指摘F対応（2026-07-16）：🔴（赤）の絵文字なのに地色がオレンジで
                    危険度の直感が働かないという指摘。SSC一覧と同じくtoneをredに統一 */}
                {warning && <Pill tone="red">🔴 個別確認が必要（一括承認対象外）</Pill>}
                {autoWarning && <Pill tone={autoWarningTone}>{contract.warning_level === 'red' ? '🔴' : '🟡'} 自動チェック要確認（一括承認対象外）</Pill>}
              </div>
              <p className="break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{staff.name || '-'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#6B7280]">
                <span className="break-words">{staff.department || '-'}</span>
                <span className="h-3 w-px bg-[#E8EDF5]" />
                <span>{staff.employee_number || '-'}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button className={primaryButton} onClick={() => router.push(`/dashboard/ssc/contracts/${contract.id}`)}>
              {subTab === '承認待ち' ? '内容を確認する' : '詳細を見る'}
              <Icon name="arrow" className="h-4 w-4" />
            </button>
            {subTab === '取り下げ' && onDelete && (
              <button
                className="inline-flex h-[52px] shrink-0 items-center justify-center whitespace-nowrap rounded-2xl border border-[#FCA5A5] bg-white px-4 text-sm font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2] disabled:opacity-50"
                disabled={deletingWithdrawnId === contract.id}
                onClick={() => onDelete(contract.id)}
              >
                {deletingWithdrawnId === contract.id ? '削除中…' : '削除'}
              </button>
            )}
          </div>
        </div>

        {/* 2行目以降：補足情報は画面幅に応じて自動で折り返す */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#E8EDF5] pt-4 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-[#6B7280]">就業先</p>
            <div className="flex items-start gap-2">
              <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#2F5FD0]" />
              <p className="min-w-0 truncate text-sm font-medium leading-6 text-[#1F2937]" title={f.workLocationName || '-'}>{f.workLocationName || '-'}</p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-[#6B7280]">ステータス</p>
            <div className="flex flex-wrap gap-2">
              <WorkPlaceBadge workPlace={f.workPlace || contract.work_place} />
              <Pill tone="blue">{getDocumentLabel(contract.document_type, contract.pattern)}</Pill>
              <ContractStatusBadge status={contract.status} isInternal={isInternal} />
              {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-[#6B7280]">雇用期間</p>
            <p className="break-words text-xs font-medium leading-5 text-[#1F2937]">{getEmployPeriodLabel(contract)}</p>
            {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
              <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B7280]">派遣期間 {formatPeriodJp(f.dispatchStart, f.dispatchEnd)}</p>
            )}
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-[#6B7280]">申請日時</p>
            <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(contract.created_at)}</p>
            <p className="mt-1 break-words text-xs font-medium text-[#6B7280]">申請者 {getApplicantLabel(contract.created_by_name, contract.created_by_dept_no, deptNameByNo)}</p>
          </div>
        </div>

        {contract.status === '差し戻し中' && contract.rejection_reason && (
          <div className="mt-4 rounded-2xl border border-[#FFE2C7] bg-[#FFF8F1] p-4">
            <p className="text-xs font-semibold text-[#F59E42]">差し戻し理由</p>
            <p className="mt-2 break-words text-sm font-medium leading-6 text-[#1F2937]">{contract.rejection_reason}</p>
          </div>
        )}

        {contract.status === '取り下げ' && (
          <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
            <p className="text-xs font-semibold text-[#6B7280]">取り下げ理由{contract.withdrawn_at ? `（${formatDateTime(contract.withdrawn_at)}）` : ''}</p>
            <p className="mt-2 break-words text-sm font-medium leading-6 text-[#1F2937]">{contract.withdrawn_reason || '（理由の入力なし）'}</p>
          </div>
        )}
      </article>
    )
  }

  const SubTabs = ({
    value,
    setValue,
    counts,
    clear,
  }: {
    value: ContractSubTab
    setValue: (v: ContractSubTab) => void
    counts: { pending: number; rejected: number; approved: number; withdrawn: number }
    clear: () => void
  }) => {
    const items = [
      { key: '承認待ち' as ContractSubTab, label: '承認待ち', count: counts.pending },
      { key: '差し戻し中' as ContractSubTab, label: '差し戻し', count: counts.rejected },
      { key: '承認済み' as ContractSubTab, label: '承認済み・署名状況', count: counts.approved },
      { key: '取り下げ' as ContractSubTab, label: '取り下げ', count: counts.withdrawn },
    ]

    return (
      <SubTabBar items={items} activeKey={value} onChange={v => { setValue(v); clear() }} />
    )
  }

  const BulkPanel = ({
    visible,
    selectedSize,
    targetsSize,
    checked,
    onSelectAll,
    onOpenConfirm,
    showConfirm,
    onApprove,
    onCancel,
    approving = false,
  }: {
    visible: boolean
    selectedSize: number
    targetsSize: number
    checked: boolean
    onSelectAll: () => void
    onOpenConfirm: () => void
    showConfirm: boolean
    onApprove: () => void
    onCancel: () => void
    approving?: boolean
  }) => {
    if (!visible) return null

    return (
      <section className="mt-5">
        <div className="flex flex-col gap-4 rounded-[18px] border border-[#E8EDF5] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,.05)] sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#1F2937]">
            <input
              type="checkbox"
              checked={checked && targetsSize > 0}
              onChange={onSelectAll}
              className="h-5 w-5 rounded border-[#E8EDF5] accent-[#2F5FD0]"
            />
            警告のない案件をすべて選択
          </label>
          <button onClick={onOpenConfirm} disabled={selectedSize === 0} className={accentButton}>
            <Icon name="check" className="h-5 w-5" />
            一括承認する（{selectedSize}件選択中）
          </button>
        </div>

        {showConfirm && selectedSize > 0 && (
          <div className="mt-4 rounded-[18px] border border-[#BFE7CF] bg-[#F0FBF4] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <p className="text-base font-semibold text-[#1F2937]">選択中の{selectedSize}件を一括承認しますか</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
              承認すると、各申請の内容変更はできません。内容に誤りがないか今一度ご確認ください。<br />
              承認後、対象スタッフへ署名・確認依頼が自動送信されます。<br />
              （雇用契約書は署名、就業条件明示書は内容確認の依頼になります。<br />
              　対面・印刷パターンの案件は担当営業のダッシュボードに表示されます）
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={onApprove} disabled={approving} className={`${primaryButton} flex-1 disabled:cursor-not-allowed disabled:opacity-60`}>
                選択中の{selectedSize}件を一括承認する
              </button>
              <button onClick={onCancel} className={secondaryButton}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="h-screen overflow-auto bg-[#F8FAFD] text-[#1F2937]">
      <header className="relative z-30 border-b border-[#E8EDF5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-w-max max-w-[1600px] items-center justify-between px-6 py-5 lg:px-8">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="APパートナーズ" width={64} height={38} className="h-auto w-[64px]" />
              <div>
                <p className="text-sm font-semibold text-[#1F2937]">APパートナーズ</p>
                <p className="text-xs font-medium text-[#6B7280]">管理部ダッシュボード</p>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-[#E8EDF5] md:block" />
            <div className="hidden md:block">
              <h1 className="text-2xl font-semibold tracking-normal text-[#1F2937]">契約書管理システム</h1>
              <p className="mt-1 text-sm font-medium text-[#6B7280]">全社の申請状況を管理し、承認やマスタ管理を行えます</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NewDocumentMenu />
            <div className="h-8 w-px bg-[#E8EDF5]" />
            <ChatbotWidget />
            <LoggedInUserChip userId={user?.id} />
            <button onClick={handleLogout} className={headerSecondaryButton}>
              <Icon name="logout" className="h-4 w-4" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        {/* 2026-07-29：タブ横長化対策の2階層ナビゲーション。1階層目＝グループの大きい角丸ピル、
            2階層目＝地色の帯の中に置いた従来の下線タブ。伊藤さんとモックアップで合意した「階層が
            下がるほど視覚的な重みを落とす」設計（案A）。1階層目のバッジは各グループ合計の注意喚起用で、
            内訳は2階層目を開いてから確認する設計にしている。 */}
        <nav className="mb-6">
          <div className="flex flex-wrap gap-2">
            {groupOrder.map(g => {
              const active = activeGroup === g
              const meta = TAB_GROUP_LABEL[g]
              const badge = groupBadge[g]
              return (
                <button
                  key={g}
                  onClick={() => openGroup(g)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-[#2F5FD0] text-white' : 'border border-[#E8EDF5] bg-white text-[#1F2937] hover:border-[#2F5FD0] hover:text-[#2F5FD0]'}`}
                >
                  <Icon name={meta.icon} className="h-[18px] w-[18px]" />
                  {meta.label}
                  {!!badge && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-white/25 text-white' : 'bg-[#E74C3C] text-white'}`}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {currentGroupTabs.length > 1 && (
            <div className="rounded-b-xl border border-t-0 border-[#E8EDF5] bg-[#F8FAFD] px-4 pt-3">
              <div className="flex flex-nowrap gap-8">
                {currentGroupTabs.map(tab => {
                  const active = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1 pb-3 text-sm font-semibold transition ${active ? 'text-[#2F5FD0]' : 'text-[#1F2937] hover:text-[#2F5FD0]'}`}
                    >
                      <Icon name={tab.icon} className="h-5 w-5" />
                      {tab.label}
                      {tab.key === 'renewal' ? (
                        <span className="flex items-center gap-1">
                          <span className="rounded-full bg-[#EAF1FF] px-2 py-0.5 text-xs font-semibold text-[#2F5FD0]">{renewalCandidates.length}</span>
                          <span className="rounded-full bg-[#FFF3E8] px-2 py-0.5 text-xs font-semibold text-[#F59E42]">{monitoringPendingCount}</span>
                        </span>
                      ) : (
                        !!tab.count && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-[#2F5FD0] text-white' : 'bg-[#E74C3C] text-white'}`}>
                            {tab.count}
                          </span>
                        )
                      )}
                      <span className={`absolute bottom-[-1px] left-0 h-0.5 rounded-full bg-[#2F5FD0] transition-all duration-300 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-6">
              <p className="mb-4 text-sm font-semibold text-[#1F2937]">対応が必要な件数</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {overviewCards.map(card => (
                  <button
                    key={card.key}
                    onClick={() => {
                      setActiveTab(card.key)
                      // 「更新期限 対象」カードの件数は期限間近の更新候補の件数のため、
                      // 遷移先も必ずそのサブタブに揃える（モニタリングを見ていた状態が残っていても上書き）。
                      if (card.key === 'renewal') setRenewalSubTab('candidates')
                    }}
                    className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-[#2F5FD0] hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name={card.icon} className="h-4 w-4 text-[#6B7280]" />
                      <p className="text-sm font-semibold text-[#1F2937]">{card.label}</p>
                    </div>
                    <div className="mt-5 flex items-end gap-1">
                      <span className="text-4xl font-semibold tracking-normal text-[#2F5FD0]">{card.value}</span>
                      <span className="pb-1 text-sm font-semibold text-[#2F5FD0]">件</span>
                    </div>
                  </button>
                ))}
                {overviewPlaceholders.map(item => (
                  <div key={item.label} className="rounded-[18px] border border-[#E8EDF5] bg-white/60 p-5 opacity-60">
                    <div className="flex items-center gap-2">
                      <Icon name={item.icon} className="h-4 w-4 text-[#6B7280]" />
                      <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                    </div>
                    <p className="mt-5 text-base font-semibold text-[#6B7280]">準備中</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-6">
              <div className="grid gap-4 md:grid-cols-[1.2fr_repeat(4,1fr)]">
                {requestSummary.map((item, index) => (
                  <div key={item.label} className={`${index === 0 ? 'md:col-span-1' : ''} rounded-[18px] border border-[#E8EDF5] bg-white/86 p-5 backdrop-blur`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                        <div className="mt-5 flex items-end gap-1">
                          <span className="text-4xl font-semibold tracking-normal" style={{ color: item.color }}>{item.value}</span>
                          <span className="pb-1 text-sm font-semibold" style={{ color: item.color }}>件</span>
                        </div>
                      </div>
                      <Icon name={item.icon} className="h-6 w-6 text-[#6B7280]" />
                    </div>
                    <div className="mt-5 h-1 w-full rounded-full" style={{ background: item.color }} />
                    {index === 0 && <p className="mt-3 text-sm font-medium text-[#6B7280]">対応が必要な依頼があります</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className={`${cardBase} p-5`}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                <button onClick={resetFilters} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#2F5FD0] transition hover:border-[#2F5FD0]">
                  <Icon name="refresh" className="h-4 w-4" />
                  リセット
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.4fr_.9fr_.9fr_.7fr_.7fr]">
                <input value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="社員番号または氏名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <input value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                  placeholder="部門名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <input value={requesterFilter} onChange={e => setRequesterFilter(e.target.value)}
                  placeholder="申請者名で検索"
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]" />
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as any); setSystemFilter('') }}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                  <option value="">依頼種別：すべて</option>
                  <option value="staff_register">スタッフマスタ登録</option>
                  <option value="csv_import">CSVインポート</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                  <option value="pending">ステータス：未対応のみ</option>
                  <option value="all">すべて</option>
                  <option value="completed">完了済みのみ</option>
                  <option value="cancelled">取消済みのみ</option>
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {typeFilter === 'csv_import' && (
                  <select value={systemFilter} onChange={e => setSystemFilter(e.target.value)}
                    className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-semibold text-[#1F2937] outline-none transition focus:border-[#2F5FD0]">
                    <option value="">CSVシステム：すべて</option>
                    {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <span className="text-sm font-semibold text-[#6B7280]">依頼日</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(clampDateYear(e.target.value))}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition focus:border-[#2F5FD0]" />
                <span className="text-sm font-semibold text-[#6B7280]">〜</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(clampDateYear(e.target.value))}
                  className="h-12 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition focus:border-[#2F5FD0]" />
              </div>

              {statusFilter !== 'pending' && !dateFrom && !dateTo && (
                <p className="mt-3 text-xs font-medium text-[#6B7280]">
                  表示は直近{REQUEST_WINDOW_DAYS}日分です。それより前を見るには、上の「依頼日」で期間を指定してください。
                </p>
              )}
            </section>

            {reqError && <p className="text-sm font-semibold text-[#E74C3C]">{reqError}</p>}
            {reqLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}

            {!reqLoading && !reqError && visibleRequests.length === 0 && (
              <section className={`${cardBase} p-12 text-center`}>
                <p className="text-sm font-semibold text-[#1F2937]">該当する依頼はありません。</p>
              </section>
            )}

            <div className="grid gap-3">
              {visibleRequests.map(r => (
                <RequestCard key={r.id} r={r}
                  onCancel={(statusField, reasonField, reason) => handleCancelTask(r.id, statusField, reasonField, reason)}
                  onComplete={(statusField, reasonField) => handleCompleteTask(r.id, statusField, reasonField)} />
              ))}
            </div>

            {visibleCount < requests.length && (
              <div className="text-center">
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} className={secondaryButton}>
                  もっと見る（次の{Math.min(PAGE_SIZE, requests.length - visibleCount)}件を表示）
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="space-y-6">
            <HeroSummary title="契約一覧" description="社外案件の契約状況を確認し、承認・差し戻し・署名状況を管理できます。" items={contractSummary} />
            <SubTabs value={contractsSubTab} setValue={setContractsSubTab} counts={{ pending: contractsPendingCount, rejected: contractsRejectedCount, approved: contractsApprovedCount, withdrawn: contractsWithdrawnCount }} clear={() => { setSelectedIds(new Set()); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }} />
            <BulkPanel
              visible={contractsSubTab === '承認待ち' && bulkTargets.length > 0}
              selectedSize={selectedIds.size}
              targetsSize={bulkTargets.length}
              checked={selectedIds.size === bulkTargets.length}
              onSelectAll={() => { toggleSelectAll(); setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
              onOpenConfirm={() => setShowBulkApproveConfirm(true)}
              showConfirm={showBulkApproveConfirm && !bulkApproving && bulkApproveDone === null}
              onApprove={handleBulkApprove}
              onCancel={() => setShowBulkApproveConfirm(false)}
              approving={bulkApproving}
            />
            {contractsError && <p className="text-sm font-semibold text-[#E74C3C]">{contractsError}</p>}
            {contractsLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}
            {!contractsLoading && !contractsError && filteredContracts.length > 0 && (
              <section className={`${cardBase} p-5 [&_button]:rounded-[16px] [&_button]:font-semibold [&_input]:rounded-[16px] [&_input]:border-[#E8EDF5] [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[16px] [&_select]:border-[#E8EDF5]`}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                {contractsToolbar}
                {contractsSubTab === '承認済み' && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!approvedSearchMode ? (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                        <button onClick={() => runApprovedSearch(contractsSearchText)} disabled={!contractsSearchText.trim() || approvedSearching}
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
            {!contractsLoading && !contractsError && filteredContracts.length === 0 && <EmptyState text="該当する契約はありません" />}
            {!contractsLoading && !contractsError && filteredContracts.length > 0 && visibleContracts.length === 0 && <EmptyState text="条件に一致する契約が見つかりませんでした" />}
            <div className="grid gap-3">
              {visibleContracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  subTab={contractsSubTab}
                  selectedIdsSet={selectedIds}
                  toggle={toggleSelect}
                  clearConfirm={() => { setShowBulkApproveConfirm(false); setBulkApproveDone(null) }}
                  onDelete={(id) => handleDeleteWithdrawn(id, setFlowContracts)}
                />
              ))}
            </div>
            {contractsSubTab === '承認済み' && approvedHasMore && !approvedSearchMode && (
              <div className="flex justify-center">
                <button onClick={loadMoreApproved} disabled={approvedLoadingMore}
                  className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
                  {approvedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'internal' && isInternalApprover && (
          <div className="space-y-6">
            <section className={`${cardBase} p-6`}>
              <div className="rounded-[18px] border border-[#D7E5FF] bg-[#F5F9FF] p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2F5FD0] text-white">
                    <Icon name="shield" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold leading-7 text-[#1F2937]">
                    社内案件（APパートナーズ自社スタッフの雇用契約書）のみを表示します。SSCを通さず、社内承認者がここで直接承認・差し戻しを行います。
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <HeroSummary title="社内承認" description="社内案件の承認状況と署名状況を確認できます。" items={internalSummary} compact />
              </div>
            </section>
            <SubTabs value={internalContractsSubTab} setValue={setInternalContractsSubTab} counts={{ pending: internalPendingCount, rejected: internalRejectedCount, approved: internalApprovedCount, withdrawn: internalWithdrawnCount }} clear={() => { setInternalSelectedIds(new Set()); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }} />
            <BulkPanel
              visible={internalContractsSubTab === '承認待ち' && internalBulkTargets.length > 0}
              selectedSize={internalSelectedIds.size}
              targetsSize={internalBulkTargets.length}
              checked={internalSelectedIds.size === internalBulkTargets.length}
              onSelectAll={() => { toggleSelectAllInternal(); setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
              onOpenConfirm={() => setInternalShowBulkApproveConfirm(true)}
              showConfirm={internalShowBulkApproveConfirm && !internalBulkApproving && internalBulkApproveDone === null}
              onApprove={handleBulkApproveInternal}
              onCancel={() => setInternalShowBulkApproveConfirm(false)}
              approving={internalBulkApproving}
            />
            {internalContractsError && <p className="text-sm font-semibold text-[#E74C3C]">{internalContractsError}</p>}
            {internalContractsLoading && <p className="py-8 text-sm font-medium text-[#6B7280]">読み込み中</p>}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && (
              <section className={`${cardBase} p-5 [&_button]:rounded-[16px] [&_button]:font-semibold [&_input]:rounded-[16px] [&_input]:border-[#E8EDF5] [&_input:focus]:border-[#2F5FD0] [&_select]:rounded-[16px] [&_select]:border-[#E8EDF5]`}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon name="search" className="h-5 w-5 text-[#1F2937]" />
                  <h2 className="text-base font-semibold text-[#1F2937]">絞り込み</h2>
                </div>
                {internalToolbar}
                {internalContractsSubTab === '承認済み' && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!internalApprovedSearchMode ? (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">表示は直近{APPROVED_WINDOW_DAYS}日分です。それより前は検索してください。</p>
                        <button onClick={() => runInternalApprovedSearch(internalSearchText)} disabled={!internalSearchText.trim() || internalApprovedSearching}
                          className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0] disabled:opacity-50">
                          {internalApprovedSearching ? '検索中…' : '全期間で検索'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-[#6B7280]">全期間検索の結果です{internalApprovedSearchNotice ? '（' + internalApprovedSearchNotice + '）' : ''}</p>
                        <button onClick={fetchInternalApprovedRecent} className="rounded-[14px] border border-[#D0DAF0] bg-white px-4 py-2 text-xs font-semibold text-[#2F5FD0]">
                          直近{APPROVED_WINDOW_DAYS}日の表示に戻す
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length === 0 && <EmptyState text="該当する社内案件はありません" />}
            {!internalContractsLoading && !internalContractsError && filteredInternalContracts.length > 0 && visibleInternalContracts.length === 0 && <EmptyState text="条件に一致する社内案件が見つかりませんでした" />}
            <div className="grid gap-3">
              {visibleInternalContracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  subTab={internalContractsSubTab}
                  selectedIdsSet={internalSelectedIds}
                  toggle={toggleSelectInternal}
                  clearConfirm={() => { setInternalShowBulkApproveConfirm(false); setInternalBulkApproveDone(null) }}
                  isInternal
                  onDelete={(id) => handleDeleteWithdrawn(id, setInternalFlowContracts)}
                />
              ))}
            </div>
            {internalContractsSubTab === '承認済み' && internalApprovedHasMore && !internalApprovedSearchMode && (
              <div className="flex justify-center">
                <button onClick={loadMoreInternalApproved} disabled={internalApprovedLoadingMore}
                  className="rounded-2xl border border-[#D0DAF0] bg-white px-6 py-3 text-sm font-semibold text-[#2F5FD0] disabled:opacity-50">
                  {internalApprovedLoadingMore ? '読み込み中…' : 'さらに読み込む'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'csvImport' && (
          <div className="space-y-6">
            <section className={`${cardBase} p-6 md:p-8`}>
              <p className="text-lg font-semibold text-[#1F2937]">CSVインポート</p>
              {/* 総合レビュー指摘4対応（2026-07-27）：句点区切りのみの1段落に業務ルールが詰め込まれ
                  読み飛ばされやすいとの指摘のため、要点を箇条書きに分解する */}
              <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
                4システム（e-staffing・HRstation・winworks・Staffia）のCSVファイルを取り込みます。
              </p>
              <ul className="mt-2 space-y-1.5 text-sm font-medium leading-6 text-[#6B7280] list-disc pl-5">
                <li>Staffiaのみ「契約詳細（KEF00103）」「スタッフ個人・派遣期間（KEF00104）」の2ファイルが必要です。</li>
                <li>同じ内容のCSVは上書きOKですが、申請中もしくはそれ以降のステータスの契約から参照されている行は保護され、上書きされません。</li>
                <li>StaffExpress（スタッフマスタ・部門マスタ）のみExcelファイル（.xlsx）で、こちらは保護の対象外（アップロードした内容で常に全件上書き）です。</li>
              </ul>

              <div className="mt-6">
                <ImportStepper
                  step={
                    csvUploadResult
                      ? 3
                      : (csvImportSystem === 'Staffia'
                          ? !!(csvFile103 || csvFile104)
                          : csvImportSystem === 'StaffExpress'
                          ? !!(staffExpressFileDept || staffExpressFileStaff)
                          : !!csvFile)
                      ? 2
                      : 1
                  }
                />
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-[#1F2937]">システムを選択</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {(['e-staffing', 'HRstation', 'winworks', 'Staffia', 'StaffExpress'] as const).map(sys => {
                    const active = csvImportSystem === sys
                    const accent = SYSTEM_ACCENT[sys]
                    return (
                      <button
                        key={sys}
                        onClick={() => { setCsvImportSystem(sys); resetCsvUploadForm(); setCsvUploadError(''); setCsvUploadResult(null) }}
                        style={active ? { borderColor: accent.border, backgroundColor: accent.bg } : { borderColor: '#E8EDF5' }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = accent.border }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#E8EDF5' }}
                        className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 bg-white px-3 py-4 transition ${active ? 'shadow-[0_4px_12px_rgba(0,0,0,0.1)]' : ''}`}
                      >
                        {active && (
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white"
                            style={{ backgroundColor: accent.ring }}
                          >
                            <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
                              <path d="M4 10l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        )}
                        <span className="relative flex h-11 w-full items-center justify-center rounded-lg bg-[#F7F9FC]">
                          <Image src={SYSTEM_LOGO_FILE[sys]} alt={sys} fill className="object-contain p-1" />
                        </span>
                        <span className="text-xs font-semibold text-[#1F2937]">{sys}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {csvImportSystem === 'Staffia' ? (
                  <>
                    <FileDropzone label="契約詳細（KEF00103）" file={csvFile103} onChange={setCsvFile103} accept=".csv" />
                    <FileDropzone label="スタッフ個人・派遣期間（KEF00104）" file={csvFile104} onChange={setCsvFile104} accept=".csv" />
                  </>
                ) : csvImportSystem === 'StaffExpress' ? (
                  <>
                    <FileDropzone label="スタッフマスタ.xlsx（任意）" file={staffExpressFileStaff} onChange={setStaffExpressFileStaff} accept=".xlsx" />
                    <FileDropzone label="部門マスタ.xlsx（任意）" file={staffExpressFileDept} onChange={setStaffExpressFileDept} accept=".xlsx" />
                    <p className="md:col-span-2 text-xs font-medium leading-5 text-[#6B7280]">
                      少なくとも一方のファイルを選択してください。両方選択した場合は、ファイル名やアップロード順に関わらず、常に部門マスタ→スタッフマスタの順で自動的に処理されます
                      （スタッフの所属部門は部門マスタを参照するため）。
                    </p>
                  </>
                ) : (
                  <FileDropzone label="CSVファイル" file={csvFile} onChange={setCsvFile} accept=".csv" />
                )}
              </div>

              {csvImportSystem === 'StaffExpress' && (
                <div className="mt-4 rounded-2xl border border-[#E8EDF5] bg-white">
                  <button
                    onClick={() => setStaffExpressColumnsOpen(o => !o)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#1F2937]"
                  >
                    <span>列の並び順・取込項目一覧（{staffExpressColumnsOpen ? '閉じる' : '開く'}）</span>
                    <span className="text-[#2F5FD0]">{staffExpressColumnsOpen ? '▲' : '▼'}</span>
                  </button>
                  {staffExpressColumnsOpen && (
                    <div className="border-t border-[#E8EDF5] p-4">
                      <p className="mb-3 text-xs font-semibold leading-5 text-[#E74C3C]">
                        ⚠️項目の順番が違うと正しく取り込まれません。StaffExpressのエクスポート設定は必ずこの順番にしてください。
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#E8EDF5] text-left font-semibold text-[#6B7280]">
                              <th className="px-2 py-1">#</th>
                              <th className="px-2 py-1">StaffExpress列名</th>
                              <th className="px-2 py-1">取込先</th>
                              <th className="px-2 py-1">備考</th>
                            </tr>
                          </thead>
                          <tbody>
                            {STAFF_EXPRESS_COLUMNS.map(c => (
                              <tr key={c.no} className="border-b border-[#F1F4F9]">
                                <td className="px-2 py-1 text-[#1F2937]">{c.no}</td>
                                <td className="px-2 py-1 font-medium text-[#1F2937]">{c.label}</td>
                                <td className="px-2 py-1 text-[#6B7280]">{c.target}</td>
                                <td className="px-2 py-1 text-[#6B7280]">{c.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2026-07-29改訂：当初は「列名・用途・必須/任意」の一覧表で案内していたが、伊藤さんから
                  「必須・任意の意味が分からない」「結局どんな形式のファイルをダウンロードすればいいのか
                  分かるようにしてほしい」との指摘を受け、方式を変更。あわせて、そもそも各システムの
                  エクスポート画面に出力項目を選ぶ仕組みは無い（伊藤さん確認済み）ことが判明したため、
                  「列を選び間違える」前提の説明自体を撤去した。代わりに、実物ファイルのヘッダー行を
                  そのまま使い内容をダミー値に置き換えた「サンプルCSV」をダウンロードできるようにし、
                  管理部が実際にダウンロードしたファイルと目視で見比べて確認できるようにする方式に変更
                  （詳細はlib/csvSystemColumns.ts参照）。 */}
              {csvImportSystem !== 'StaffExpress' && (
                <div className="mt-4 rounded-2xl border border-[#E8EDF5] bg-white">
                  <button
                    onClick={() => setCsvSystemColumnsOpen(o => !o)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#1F2937]"
                  >
                    <span>正しい形式か確認する（サンプルファイル）（{csvSystemColumnsOpen ? '閉じる' : '開く'}）</span>
                    <span className="text-[#2F5FD0]">{csvSystemColumnsOpen ? '▲' : '▼'}</span>
                  </button>
                  {csvSystemColumnsOpen && (
                    <div className="border-t border-[#E8EDF5] p-4">
                      <p className="mb-3 text-xs font-medium leading-5 text-[#6B7280]">
                        {csvImportSystem}から、契約データの一覧をダウンロード（エクスポート）してください。
                        以下のサンプルファイル（中身はすべてダミーの内容です）をダウンロードし、
                        <span className="font-semibold text-[#1F2937]">実際にダウンロードしたファイルと見比べて、同じような構成になっているかご確認ください。</span>
                        列の並び順が多少違っても問題ありません（列名で自動的に読み取ります）。
                      </p>
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {CSV_SAMPLE_FILES[csvImportSystem as 'e-staffing' | 'HRstation' | 'winworks' | 'Staffia'].map(f => (
                          <a
                            key={f.href}
                            href={f.href}
                            download
                            className="inline-flex items-center gap-2 rounded-xl border border-[#D7E5FF] bg-[#F5F9FF] px-4 py-2 text-xs font-semibold text-[#2F5FD0] transition hover:bg-[#EAF1FF]"
                          >
                            📄 {f.fileLabel} をダウンロード
                          </a>
                        ))}
                      </div>
                      <p className="text-xs font-medium leading-5 text-[#6B7280]">
                        <span className="font-semibold text-[#E74C3C]">
                          {CSV_REQUIRED_COLUMNS_LABEL[csvImportSystem as 'e-staffing' | 'HRstation' | 'winworks' | 'Staffia']}の列だけは、必ず含まれている必要があります。
                        </span>
                        この列が無いデータは読み込まれずスキップされます。それ以外の項目は、入っていなくても取り込みエラーにはなりません。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {csvUploadError && (
                <div className="mt-4 rounded-2xl border border-[#FDE0E0] bg-[#FDECEC] p-4">
                  <p className="text-sm font-medium leading-6 text-[#E74C3C]">{csvUploadError}</p>
                </div>
              )}

              <div className="mt-6">
                <button onClick={handleCsvUpload} disabled={csvUploading} className={`${primaryButton} disabled:cursor-not-allowed disabled:opacity-60`}>
                  {csvUploading ? 'アップロード中…' : (
                    <>
                      <Icon name="upload" className="h-5 w-5" />
                      アップロードする
                    </>
                  )}
                </button>
              </div>

              {csvUploadResult && csvImportSystem === 'StaffExpress' && (
                <div className="mt-6 rounded-2xl border border-[#BFE7CF] bg-[#F0FBF4] p-5">
                  <p className="text-sm font-semibold text-[#1F2937]">アップロードが完了しました</p>
                  {csvUploadResult.staffExpressResult?.staff && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-[#1F2937]">スタッフマスタ</p>
                      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <ResultStat label="新規" value={csvUploadResult.staffExpressResult.staff.newCount ?? 0} />
                        <ResultStat label="更新" value={csvUploadResult.staffExpressResult.staff.updatedCount ?? 0} />
                        <ResultStat label="スキップ（対象外）" value={csvUploadResult.staffExpressResult.staff.skippedCount ?? 0} />
                        <ResultStat label="エラー" value={csvUploadResult.staffExpressResult.staff.errorCount ?? 0} />
                      </div>
                      {/* C-08対応（2026-08-06）：社員番号の再利用（退職者番号を別人へ再割当）を検知した場合の表示。
                          自動的に旧データを退避して新規登録した件数（reassignedCount）と、氏名が一致せず
                          現役スタッフのため自動処理せず保留にした件数（needsReviewCount）を分けて表示する。 */}
                      {(csvUploadResult.staffExpressResult.staff.reassignedCount ?? 0) > 0 && (
                        <p className="mt-3 text-xs font-medium leading-5 text-[#2F5FD0]">
                          このうち{csvUploadResult.staffExpressResult.staff.reassignedCount}件は、氏名が一致しない社員番号の再利用（退職者の番号を新入社員へ再割当）と判断し、
                          旧データを退避したうえで新規スタッフとして登録しました。旧データ（前任者の契約・誓約書等の履歴）は削除されず、新入社員のマイページには一切表示されません。
                        </p>
                      )}
                      {(csvUploadResult.staffExpressResult.staff.needsReviewCount ?? 0) > 0 && (
                        <div className="mt-3 rounded-xl border border-[#FBE3B0] bg-[#FFF8EC] p-4">
                          <p className="text-xs font-semibold text-[#8A5A00]">
                            要確認：{csvUploadResult.staffExpressResult.staff.needsReviewCount}件は自動反映されていません
                          </p>
                          <p className="mt-1 text-xs font-medium leading-5 text-[#8A5A00]">
                            同じ社員番号で氏名が一致しないのに、既存データが退職済みではありませんでした（在籍中の社員の氏名が急に変わったように見える状態）。
                            誤ったCSVデータの可能性があるため自動更新せず保留にしています。内容をご確認のうえ、正しいデータで再アップロードしてください。
                          </p>
                          <ul className="mt-2 space-y-1 text-xs font-medium leading-5 text-[#8A5A00]">
                            {csvUploadResult.staffExpressResult.staff.needsReviewDetails?.map((d: any, i: number) => (
                              <li key={i}>社員番号 {d.employeeNumber}：登録済みの氏名「{d.oldName}」→ 今回のCSVの氏名「{d.newName}」</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {csvUploadResult.staffExpressResult?.department && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-[#1F2937]">部門マスタ</p>
                      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <ResultStat label="新規" value={csvUploadResult.staffExpressResult.department.newCount ?? 0} />
                        <ResultStat label="更新" value={csvUploadResult.staffExpressResult.department.updatedCount ?? 0} />
                        <ResultStat label="スキップ" value={csvUploadResult.staffExpressResult.department.skippedCount ?? 0} />
                        <ResultStat label="エラー" value={csvUploadResult.staffExpressResult.department.errorCount ?? 0} />
                      </div>
                    </div>
                  )}
                  {typeof csvUploadResult.staffRegisterAutoMatch?.matchedCount === 'number' && csvUploadResult.staffRegisterAutoMatch.matchedCount > 0 && (
                    <p className="mt-4 text-sm font-medium leading-6 text-[#4CAF50]">
                      スタッフ登録依頼の自動マッチが{csvUploadResult.staffRegisterAutoMatch.matchedCount}件成立し、依頼元へ通知メールを送信しました。
                    </p>
                  )}
                  {typeof csvUploadResult.winworksCrewCodeAutoMatch?.matchedCount === 'number' && csvUploadResult.winworksCrewCodeAutoMatch.matchedCount > 0 && (
                    <p className="mt-4 text-sm font-medium leading-6 text-[#4CAF50]">
                      SBクルーコード反映により、winworksのCSVインポート依頼の自動マッチが{csvUploadResult.winworksCrewCodeAutoMatch.matchedCount}件成立し、依頼元へ通知メールを送信しました。
                    </p>
                  )}
                </div>
              )}

              {csvUploadResult && csvImportSystem !== 'StaffExpress' && (
                <div className="mt-6 rounded-2xl border border-[#BFE7CF] bg-[#F0FBF4] p-5">
                  <p className="text-sm font-semibold text-[#1F2937]">アップロードが完了しました</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <ResultStat label="新規" value={csvUploadResult.counts?.new ?? 0} />
                    <ResultStat label="更新" value={csvUploadResult.counts?.updated ?? 0} />
                    <ResultStat label="保護によりスキップ" value={csvUploadResult.counts?.protectedSkipped ?? 0} />
                    <ResultStat label="キー不明でスキップ" value={csvUploadResult.counts?.skippedNoKey ?? 0} />
                  </div>
                  {/* 2026-07-29デモ指摘②：保護によりスキップされた行が1件以上あれば詳細ダウンロードボタンを表示 */}
                  {(csvUploadResult.counts?.protectedSkipped ?? 0) > 0 && csvUploadResult.importId && (
                    <div className="mt-3">
                      <ProtectedRowsDownloadButton importId={csvUploadResult.importId} count={csvUploadResult.counts.protectedSkipped} />
                    </div>
                  )}
                  {typeof csvUploadResult.autoMatch?.matchedCount === 'number' && csvUploadResult.autoMatch.matchedCount > 0 && (
                    <p className="mt-4 text-sm font-medium leading-6 text-[#4CAF50]">
                      依頼の自動マッチが{csvUploadResult.autoMatch.matchedCount}件成立し、依頼元へ通知メールを送信しました。
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className={`${cardBase} p-6 md:p-8`}>
              <p className="text-sm font-semibold text-[#1F2937]">インポート履歴（直近20件）</p>
              {csvHistoryLoading ? (
                <p className="mt-4 text-sm font-medium text-[#6B7280]">読み込み中…</p>
              ) : csvHistory.length === 0 ? (
                <p className="mt-4 text-sm font-medium text-[#6B7280]">まだインポート履歴はありません</p>
              ) : (
                <ImportHistoryTimeline
                  items={csvHistory.map(h => ({
                    id: h.id,
                    title: h.system_type,
                    datetime: formatDateTime(h.uploaded_at),
                    hasError: (h.error_rows ?? 0) > 0,
                    errorDetail: h.error_detail ?? null,
                    pills: (
                      <>
                        <Pill tone="blue">新規 {h.new_rows ?? 0}</Pill>
                        <Pill tone="green">更新 {h.updated_rows ?? 0}</Pill>
                        <Pill tone="orange">保護 {h.pending_rows ?? 0}</Pill>
                        {(h.error_rows ?? 0) > 0 && <Pill tone="red">エラー {h.error_rows}</Pill>}
                      </>
                    ),
                    // 2026-07-29デモ指摘②：保護によりスキップされた行が1件以上あれば詳細ダウンロードボタンを表示
                    extra: (h.pending_rows ?? 0) > 0
                      ? <ProtectedRowsDownloadButton importId={h.id} count={h.pending_rows ?? 0} />
                      : undefined,
                  }))}
                />
              )}
            </section>

            <section className={`${cardBase} p-6 md:p-8`}>
              <p className="text-sm font-semibold text-[#1F2937]">StaffExpress（スタッフ/部門マスタ）取込履歴（直近20件）</p>
              {masterImportHistoryLoading ? (
                <p className="mt-4 text-sm font-medium text-[#6B7280]">読み込み中…</p>
              ) : masterImportHistory.length === 0 ? (
                <p className="mt-4 text-sm font-medium text-[#6B7280]">まだ取込履歴はありません</p>
              ) : (
                <ImportHistoryTimeline
                  items={masterImportHistory.map(h => ({
                    id: h.id,
                    title: h.master_type === 'department' ? '部門マスタ' : 'スタッフマスタ',
                    datetime: formatDateTime(h.uploaded_at),
                    hasError: (h.error_rows ?? 0) > 0,
                    errorDetail: h.error_detail ?? null,
                    pills: (
                      <>
                        <Pill tone="blue">新規 {h.new_rows ?? 0}</Pill>
                        <Pill tone="green">更新 {h.updated_rows ?? 0}</Pill>
                        <Pill tone="orange">スキップ {h.skipped_rows ?? 0}</Pill>
                        {(h.reassigned_rows ?? 0) > 0 && <Pill tone="blue">再割当 {h.reassigned_rows}</Pill>}
                        {(h.needs_review_rows ?? 0) > 0 && <Pill tone="orange">要確認 {h.needs_review_rows}</Pill>}
                        {(h.error_rows ?? 0) > 0 && <Pill tone="red">エラー {h.error_rows}</Pill>}
                      </>
                    ),
                  }))}
                />
              )}
            </section>
          </div>
        )}
        {activeTab === 'renewal' && user && (
          <div className="space-y-5">
            {/* 2026-07-29：契約状況モニタリングと期限間近の更新候補が縦積みで見落とされやすいという
                伊藤さんの指摘を受け、契約一覧タブと同じSubTabBarでサブタブ切替方式に変更。
                件数は「重大」等のラベルは付けず、他のサブタブと同じプレーンな整数のみを表示する
                （SubTabBar.tsxの表示規約に合わせる。契約状況モニタリング側は台帳なし・解消済みを
                除いた要対応件数の合計＝ContractMonitoringSection内部のcounts[2]+[3]+[4]と同じ考え方）。 */}
            <SubTabBar
              items={[
                { key: 'candidates' as RenewalSubTab, label: '期限間近の更新候補', count: renewalCandidates.length },
                {
                  key: 'monitoring' as RenewalSubTab,
                  label: '契約状況モニタリング',
                  count: monitoringRows.filter(r => r.topSeverity !== 1 && r.actionStatus !== '解消').length,
                },
                { key: 'wageRevision' as RenewalSubTab, label: '最低賃金改定対応', count: wageRevisionRows.length },
              ]}
              activeKey={renewalSubTab}
              onChange={setRenewalSubTab}
            />
            {renewalSubTab === 'monitoring' && (
              <ContractMonitoringSection
                rows={monitoringRows}
                loading={monitoringLoading}
                onRefresh={fetchMonitoring}
                currentUserName={adminStaffName}
                requestFollowUp={requestMonitoringFollowUp}
                updateActionStatus={updateMonitoringActionStatus}
              />
            )}
            {renewalSubTab === 'wageRevision' && (
              <WageRevisionSection
                rows={wageRevisionRows}
                loading={wageRevisionLoading}
                error={wageRevisionError}
                onRefresh={fetchWageRevisionCandidates}
              />
            )}
            {renewalSubTab === 'candidates' && (
              <>
                <h3 className="text-sm font-bold text-[#1B2233] mb-3">期限間近の更新候補（現場）</h3>
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
                  setRenewalTab={setRenewalTab}
                  executeBulkApply={executeBulkApply}
                  currentUserId={user.id}
                  currentUserEmail={user.email}
                  currentUserDeptName="管理部"
                />
              </>
            )}
          </div>
        )}
        {activeTab === 'master' && <MasterManagementTab />}
        {activeTab === 'accounts' && isAccountAdmin && <AccountManagementTab />}
        {activeTab === 'faq' && <FaqManagementTab />}
        {activeTab === 'pledges' && (
          <div className="mt-5 rounded-[18px] border border-[#E8EDF5] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
            <PledgeListSection canApprove />
          </div>
        )}
      </main>

      {(bulkApproving || bulkApproveDone !== null) && (
        <BulkOverlay
          loading={bulkApproving}
          doneCount={bulkApproveDone}
          skippedCount={bulkApproveSkipped}
          notifyFailedCount={bulkApproveNotifyFailed}
          onOk={handleBulkApproveDoneOk}
        />
      )}

      {(internalBulkApproving || internalBulkApproveDone !== null) && (
        <BulkOverlay
          loading={internalBulkApproving}
          doneCount={internalBulkApproveDone}
          skippedCount={internalBulkApproveSkipped}
          notifyFailedCount={internalBulkApproveNotifyFailed}
          onOk={handleBulkApproveInternalDoneOk}
        />
      )}
    </div>
  )
}

function HeroSummary({
  title,
  description,
  items,
  compact = false,
}: {
  title: string
  description: string
  items: { label: string; value: number; color: string; icon: IconName }[]
  compact?: boolean
}) {
  return (
    <section className={`${compact ? '' : 'overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] md:p-8'}`}>
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.6fr] lg:items-center">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
            <Icon name={items[0]?.icon || 'file'} className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">本日の状況</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#2F5FD0] md:text-5xl">{title}</h2>
            <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">{description}</p>
          </div>
        </div>
        <div className={`grid gap-4 ${items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-3 xl:grid-cols-6'}`}>
          {items.map(item => (
            <div key={item.label} className="rounded-[18px] border border-[#E8EDF5] bg-white/86 p-6 shadow-[0_10px_30px_rgba(15,23,42,.05)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                <Icon name={item.icon} className="h-6 w-6 text-[#6B7280]" />
              </div>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-normal" style={{ color: item.color }}>{item.value}</span>
                <span className="pb-1 text-base font-semibold" style={{ color: item.color }}>件</span>
              </div>
              <div className="mt-6 h-1 w-full rounded-full" style={{ background: item.color }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <section className={`${cardBase} p-12 text-center`}>
      <Icon name="search" className="mx-auto h-10 w-10 text-[#6B7280]" />
      <p className="mt-4 text-sm font-semibold text-[#1F2937]">{text}</p>
    </section>
  )
}

function PlaceholderTab({ title, description, icon }: { title: string; description: string; icon: IconName }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#E8EDF5] bg-[radial-gradient(circle_at_20%_15%,rgba(47,95,208,.14),transparent_32%),linear-gradient(135deg,#F7FBFF_0%,#EEF5FF_48%,#FFFFFF_100%)] p-8 shadow-[0_10px_30px_rgba(15,23,42,.05)]">
      <div className="flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#DDE8FF] text-[#2F5FD0]">
          <Icon name={icon} className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#2F5FD0]">{title}</h2>
          <p className="mt-4 text-sm font-medium leading-6 text-[#1F2937]">{description}</p>
        </div>
      </div>
    </section>
  )
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E8EDF5] bg-white p-4">
      <p className="text-xs font-semibold text-[#6B7280]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#1F2937]">{value}<span className="ml-1 text-sm font-semibold text-[#6B7280]">件</span></p>
    </div>
  )
}

function BulkOverlay({ loading, doneCount, skippedCount = 0, notifyFailedCount = 0, onOk }: { loading: boolean; doneCount: number | null; skippedCount?: number; notifyFailedCount?: number; onOk: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,41,55,.52)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,.18)]">
        {loading ? (
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
            <p className="text-lg font-semibold text-[#1F2937]">一括承認が完了しました（{doneCount}件）</p>
            <p className="mt-3 text-sm font-medium leading-6 text-[#6B7280]">
              対象スタッフへ署名の確認依頼を送信しました。
            </p>
            {skippedCount > 0 && (
              <p className="mt-3 text-sm font-medium leading-6 text-[#F59E42]">
                {skippedCount}件は、選択後に他の人が先に承認・差し戻し済みだったため、
                <br />対象から除外しました。
              </p>
            )}
            {notifyFailedCount > 0 && (
              <p className="mt-3 text-sm font-medium leading-6 text-[#E74C3C]">
                {notifyFailedCount}件は承認は完了しましたが、送信依頼メールの送信に失敗しました。
                <br />該当の契約は「SSC承認済み」のまま止まっています。管理部にご連絡ください。
              </p>
            )}
            <button onClick={onOk} className="mt-7 inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#2F5FD0] px-6 text-sm font-semibold text-white transition hover:bg-[#244CB3]">
              OK
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RequestCard({ r, onCancel, onComplete }: {
  r: RequestRow
  onCancel: (statusField: 'staff_register_status' | 'csv_import_status', reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason', reason: string) => Promise<boolean>
  onComplete: (statusField: 'staff_register_status' | 'csv_import_status', reasonField: 'staff_register_cancel_reason' | 'csv_import_cancel_reason') => Promise<boolean>
}) {
  return (
    <article className={`${cardBase} p-5`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.15fr)_minmax(180px,.8fr)_minmax(220px,1fr)_minmax(180px,.8fr)_1.35fr] lg:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6B7280]">{r.displayDept || '-'}</p>
          <p className="mt-1 break-words text-[22px] font-semibold leading-7 text-[#1F2937]">{r.staff_name || '-'}</p>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">社員番号</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{r.staff_code || '-'}</p>
          {r.staff_hire_date && <p className="mt-1 text-xs font-medium text-[#6B7280]">入社日 {formatDate(r.staff_hire_date)}</p>}
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">就業先</p>
          <div className="flex items-start gap-2">
            <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#2F5FD0]" />
            <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{r.client_name || '-'}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-[#6B7280]">依頼日時</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">{formatDateTime(r.requested_at)}</p>
          <p className="mb-1 mt-3 text-xs font-semibold text-[#6B7280]">申請者</p>
          <p className="break-words text-sm font-medium leading-6 text-[#1F2937]">
            {r.requested_by_dept && <span className="text-[#6B7280]">{r.requested_by_dept}　</span>}
            {r.requested_by_name || '-'}
          </p>
        </div>

        <div className="grid gap-3">
          {r.staff_register_status && (
            <StatusRow
              label="スタッフマスタ登録"
              status={r.staff_register_status}
              cancelReason={r.staff_register_cancel_reason}
              onCancel={reason => onCancel('staff_register_status', 'staff_register_cancel_reason', reason)}
              onComplete={() => onComplete('staff_register_status', 'staff_register_cancel_reason')}
            />
          )}
          {r.csv_import_status && r.csv_import_status !== 'not_required' && (
            <StatusRow
              label={`CSVインポート${r.system_type ? `（${r.system_type}${r.dispatch_start_date ? '・派遣開始日 ' + formatDate(r.dispatch_start_date) : ''}）` : ''}`}
              status={r.csv_import_status}
              cancelReason={r.csv_import_cancel_reason}
              onCancel={reason => onCancel('csv_import_status', 'csv_import_cancel_reason', reason)}
              onComplete={() => onComplete('csv_import_status', 'csv_import_cancel_reason')}
            />
          )}
        </div>
      </div>
    </article>
  )
}

function StatusRow({ label, status, cancelReason, onCancel, onComplete }: {
  label: string
  status: string
  cancelReason: string | null
  onCancel: (reason: string) => Promise<boolean>
  onComplete: () => Promise<boolean>
}) {
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [completing, setCompleting] = useState(false)
  // 2026-07-22追加（alert/confirm置き換えPhase4・①必須項目チェック扱い）：取消理由未入力時のalert()を
  // インライン警告バナー(ValidationBanner)に置き換えるためのローカルstate。
  const [reasonError, setReasonError] = useState<string | null>(null)
  const confirmDialog = useConfirm()

  const isDone = status === 'completed'
  const isCancelled = status === 'cancelled'
  const badgeLabel = isDone ? '完了' : isCancelled ? '取消済み' : status === 'in_progress' ? '対応中' : '未対応'
  const tone = isDone ? 'green' : isCancelled ? 'gray' : status === 'in_progress' ? 'orange' : 'red'
  const rowTone = isDone ? 'border-[#BFE7CF] bg-[#F0FBF4]' : isCancelled ? 'border-[#E8EDF5] bg-[#F8FAFD]' : 'border-[#F7C7C1] bg-[#FDECEC]'

  const submitCancel = async () => {
    if (!reasonText.trim()) { setReasonError('取消理由を入力してください'); return }
    setReasonError(null)
    setSubmitting(true)
    const ok = await onCancel(reasonText.trim())
    setSubmitting(false)
    if (ok) setShowCancelForm(false)
  }

  // 2026-07-31新設：手動完了操作自体がこれまで存在しなかったため新規追加。
  // 依頼元へ完了通知メールが飛ぶ（自動マッチ完了時と同じ内容）ため、確認モーダルを挟む。
  const handleCompleteClick = async () => {
    const ok = await confirmDialog({
      title: 'この依頼を完了にしますか？',
      message: '完了にすると、依頼元（担当営業）へ完了通知メールが送信されます。',
      confirmLabel: '完了にする',
    })
    if (!ok) return
    setCompleting(true)
    await onComplete()
    setCompleting(false)
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${rowTone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone={tone as any}>{badgeLabel}</Pill>
          <span className="break-words text-sm font-semibold text-[#1F2937]">{label}</span>
        </div>
        {status === 'pending' && !showCancelForm && (
          <div className="flex shrink-0 gap-2">
            <button onClick={handleCompleteClick} disabled={completing}
              className="rounded-xl border border-[#BFE7CF] bg-white px-3 py-2 text-xs font-semibold text-[#2E9B5A] transition hover:border-[#2E9B5A] hover:bg-[#F0FBF4] disabled:opacity-60">
              {completing ? '処理中...' : '完了にする'}
            </button>
            <button onClick={() => setShowCancelForm(true)}
              className="rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-xs font-semibold text-[#6B7280] transition hover:border-[#F59E42] hover:text-[#F59E42]">
              取消
            </button>
          </div>
        )}
      </div>

      {isCancelled && cancelReason && (
        <p className="mt-2 break-words text-xs font-medium leading-5 text-[#6B7280]">取消理由：{cancelReason}</p>
      )}

      {showCancelForm && (
        <div className="mt-3 grid gap-3">
          <input
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="取消理由を入力"
            className="h-11 rounded-2xl border border-[#E8EDF5] bg-white px-4 text-sm font-medium text-[#1F2937] outline-none transition placeholder:text-[#8B98B1] focus:border-[#2F5FD0]"
          />
          <ValidationBanner message={reasonError} />
          <div className="flex flex-wrap gap-2">
            <button onClick={submitCancel} disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#F59E42] px-4 text-xs font-semibold text-white transition hover:bg-[#E88525] disabled:opacity-60">
              {submitting ? '送信中...' : 'この理由で取消する'}
            </button>
            <button onClick={() => { setShowCancelForm(false); setReasonText(''); setReasonError(null) }} disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E8EDF5] bg-white px-4 text-xs font-semibold text-[#6B7280] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
