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
  ContractStatusBadge,
  ConfirmedBadge,
  getDeadlineAlert,
  getEmployPeriodLabel,
} from '../_shared/contractDisplay'
import { useContractListToolbar, buildDateSortOptions } from '../_shared/useContractListToolbar'

// 2026-07-14追加：バッジ・日付フォーマット・警告判定等はSSC・管理部ダッシュボードと重複していた
// ため共通部品（../_shared/contractDisplay）に切り出した。担当営業固有の created_by_dept_no・
// sign_requested_at はここで拡張する。
type Contract = ContractForDisplay & {
  created_by_dept_no: number | null
  sign_requested_at: string | null
}

type MyRequest = {
  id: string
  request_type: 'staff_register' | 'csv_import'
  staff_name: string | null
  staff_code: string | null
  system_type: string | null
  dispatch_start_date: string | null
  staff_register_status: string | null
  csv_import_status: string | null
  staff_register_cancel_reason: string | null
  csv_import_cancel_reason: string | null
  requested_by_name: string | null
  requested_by_dept: string | null
  requested_at: string
}

const SIGN_DEADLINE_DAYS = 7 // 署名期日＝通知から7日（初期値。将来アラート日数マスタで変更可能にする予定）

const CLOSING_PATTERN_LABEL: Record<string, string> = {
  auto: '指定しない',
  face: '対面でその場説明',
  print: '印刷して説明後にリンク送付',
}

// formatDateはDateオブジェクトを直接受け取る担当営業固有の実装（署名期日バッジの計算で使う）ため
// 共通部品には切り出さず、そのままここに残す（共通部品のformatDateはiso文字列を受け取る別物）。
const formatDate = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

// 署名期日バッジ（通常／期日間近／期日超過の3段階）
const SignDeadlineBadge = ({ signRequestedAt }: { signRequestedAt: string | null }) => {
  if (!signRequestedAt) return null
  const notified = new Date(signRequestedAt)
  const deadline = new Date(notified.getTime() + SIGN_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadlineDay = new Date(deadline); deadlineDay.setHours(0, 0, 0, 0)
  const remain = Math.floor((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = remain < 0
  const urgent = !overdue && remain <= 2

  let tone = { bg: '#EEF2FA', color: '#1B3A8C', label: `期日まで${remain}日（${formatDate(deadline)}）` }
  if (overdue) tone = { bg: '#FEE2E2', color: '#B91C1C', label: `期日超過${Math.abs(remain)}日（${formatDate(deadline)}）` }
  else if (urgent) tone = { bg: '#FFF7ED', color: '#C2410C', label: `期日まで${remain}日（${formatDate(deadline)}）` }

  return (
    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded whitespace-nowrap" style={{ background: tone.bg, color: tone.color }}>
      {tone.label}
    </span>
  )
}

type FilterKey = 'pending' | 'explain' | 'rejected' | 'waiting' | 'completed' | 'other'

export default function SalesDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [deptLookupError, setDeptLookupError] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending')
  const [confirmingExplainId, setConfirmingExplainId] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [myRequestsLoading, setMyRequestsLoading] = useState(true)
  const [includeCompletedRequests, setIncludeCompletedRequests] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)

      // ログインユーザーのメールアドレスから所属部門NO・部門名を取得
      const email = data.user.email
      const { data: staffRow, error: staffError } = await supabase
        .from('staff')
        .select('dept_no, department_master(dept_name)')
        .eq('email', email)
        .limit(1)
        .maybeSingle()

      if (staffError || !staffRow || staffRow.dept_no === null) {
        setDeptLookupError('ログインユーザーの所属部門が特定できませんでした。管理部にご確認ください。')
        setLoading(false)
        setMyRequestsLoading(false)
        return
      }

      const deptName = (staffRow as any)?.department_master?.dept_name || null

      // 契約一覧と依頼一覧は互いに依存しないため並列で取得する
      await Promise.all([
        loadContracts(staffRow.dept_no),
        loadMyRequests(deptName),
      ])
      setLoading(false)
    }
    init()
  }, [router])

  // 自分の部門全体が送った依頼（スタッフマスタ登録・CSVインポート）の状況を取得
  const loadMyRequests = async (deptName: string | null) => {
    setMyRequestsLoading(true)
    if (!deptName) { setMyRequests([]); setMyRequestsLoading(false); return }
    const { data: rows, error } = await supabase
      .from('requests')
      .select('id, request_type, staff_name, staff_code, system_type, dispatch_start_date, staff_register_status, csv_import_status, staff_register_cancel_reason, csv_import_cancel_reason, requested_by_name, requested_by_dept, requested_at')
      .eq('requested_by_dept', deptName)
      .order('requested_at', { ascending: false })
    if (error) { console.error('requests取得エラー:', error); setMyRequestsLoading(false); return }
    setMyRequests((rows || []) as MyRequest[])
    setMyRequestsLoading(false)
  }

  const loadContracts = async (deptNo: number) => {
    const { data: rows, error } = await supabase
      .from('contracts')
      .select('id, pattern, contract_type, document_type, work_place, status, created_by, created_by_dept_no, created_at, rejection_reason, sign_requested_at, signed_at, input_data')
      .eq('created_by_dept_no', deptNo)
      .order('created_at', { ascending: false })

    if (error) { console.error('contracts取得エラー:', error); return }
    setContracts((rows || []) as Contract[])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 「要説明」：SSC承認済み かつ 締結パターンが対面／印刷（担当営業のアクション待ち）
  const isExplainNeeded = (c: Contract) => {
    const cp = c.input_data?.fields?.closingPattern
    return c.status === 'SSC承認済み' && (cp === 'face' || cp === 'print')
  }

  const explainList = contracts.filter(isExplainNeeded)
  const pendingList = contracts.filter(c => ['申請中', 'SSC承認済み'].includes(c.status) && !isExplainNeeded(c))
  const rejectedList = contracts.filter(c => c.status === '差し戻し中')
  const waitingList = contracts.filter(c => c.status === '署名待ち')
  const completedList = contracts.filter(c => ['署名済み', '完了'].includes(c.status))

  // 「依頼状況」：デフォルトでは完了したタスクを持つだけの行は表示しない
  // （未対応・取消済みのタスクが1つでもあれば表示する）
  const hasVisibleTask = (r: MyRequest, includeCompleted: boolean) => {
    const srVisible = !!r.staff_register_status && (r.staff_register_status !== 'completed' || includeCompleted)
    const csvVisible = !!r.csv_import_status && r.csv_import_status !== 'not_required' && (r.csv_import_status !== 'completed' || includeCompleted)
    return srVisible || csvVisible
  }
  const visibleMyRequests = myRequests.filter(r => hasVisibleTask(r, includeCompletedRequests))

  const filterCards: { key: FilterKey; label: string; count: number | null; color: string }[] = [
    { key: 'pending',   label: '進行中',     count: pendingList.length,       color: '#1B3A8C' },
    { key: 'explain',   label: '要説明',     count: explainList.length,       color: '#0E7490' },
    { key: 'rejected',  label: '差し戻し',   count: rejectedList.length,      color: '#DC2626' },
    { key: 'waiting',   label: '署名待ち',   count: waitingList.length,       color: '#92400E' },
    { key: 'completed', label: '完了',       count: completedList.length,     color: '#0D9488' },
    { key: 'other',     label: '依頼状況',   count: visibleMyRequests.length, color: '#5A6A8A' },
  ]

  // 2026-07-14追加：案件が蓄積すると目当ての案件を探しにくい、というSSCダッシュボードでの
  // 指摘を受け、担当営業側の一覧にも同じ共通部品（絞り込み・並び替え・検索）を適用した
  // （docs/SYSTEM_DESIGN.md 10章2026-07-14参照）。以前は「進行中」「完了」タブにのみ、
  // 簡易なステータス別ピルボタン（subFilter）があったが、共通部品に置き換えた。
  const baseListForFilter: Record<FilterKey, Contract[]> = {
    pending: pendingList,
    explain: explainList,
    rejected: rejectedList,
    waiting: waitingList,
    completed: completedList,
    other: [],
  }
  const baseCurrentList = baseListForFilter[activeFilter]
  const currentLabel = filterCards.find(c => c.key === activeFilter)?.label || ''

  const statusOptionsForFilter: Record<FilterKey, { value: string; label: string }[]> = {
    pending: [
      { value: '申請中', label: '申請中' },
      { value: 'SSC承認済み', label: 'SSC承認済み' },
    ],
    explain: [],
    rejected: [],
    waiting: [],
    completed: [
      { value: '署名済み', label: '署名済み' },
      { value: '完了', label: '完了' },
    ],
    other: [],
  }

  const { result: currentList, toolbar: listToolbar } = useContractListToolbar(baseCurrentList, {
    statusOptions: statusOptionsForFilter[activeFilter],
    sortOptions: buildDateSortOptions<Contract>(),
    getSearchText: c => {
      const staff = c.input_data?.staff || {}
      const f = c.input_data?.fields || {}
      return [staff.name, staff.employee_number, f.workLocationName].filter(Boolean).join(' ')
    },
    searchPlaceholder: '氏名・社員番号・就業先で検索',
    resetKey: activeFilter,
  })

  // 「説明完了」ボタン処理：ステータスを署名待ちに進め、通知日時を記録する
  // ステータス更新・sign_requested_atの記録・従業員への署名依頼メール送信は
  // /api/contracts/[id]/notify-sign-request（trigger=explain）にまとめて行わせる
  // （2026-07-08フェーズ5・9-1章タスク8対応）。
  const handleExplainDone = async (contractId: string) => {
    if (explainLoading) return
    setExplainLoading(true)
    const res = await fetch(`/api/contracts/${contractId}/notify-sign-request?trigger=explain`, { method: 'POST' })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('更新に失敗しました：' + (result.error || '不明なエラー'))
      setExplainLoading(false)
      return
    }
    const now = new Date().toISOString()
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, status: '署名待ち' as ContractStatus, sign_requested_at: now } : c))
    setConfirmingExplainId(null)
    setExplainLoading(false)
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
      <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
    </div>
  )

  // カード（一覧内の1件表示）
  const ContractCard = ({ contract }: { contract: Contract }) => {
    const staff = contract.input_data?.staff || {}
    const f = contract.input_data?.fields || {}
    const deadline = getDeadlineAlert(contract)
    const isWaitingSign = contract.status === '署名待ち'
    const isConfirmed = contract.status === '署名済み' || contract.status === '完了'
    const isExplain = isExplainNeeded(contract)
    const leftBorderColor = deadline.type === 'overdue' ? '#DC2626' : deadline.type === 'urgent' ? '#F97316' : 'transparent'

    return (
      <div key={contract.id}
        className="bg-white rounded-xl overflow-hidden transition-all hover:shadow-md"
        style={{
          border: '0.5px solid #D0DAF0',
          borderLeft: deadline.type ? `4px solid ${leftBorderColor}` : '0.5px solid #D0DAF0',
        }}>
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>{staff.department || '―'}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <ContractTypeBadge contractType={f.contractType || contract.contract_type} workPlace={f.workPlace || contract.work_place} />
                <span className="text-xs" style={{ color: '#5A6A8A' }}>{staff.employee_number || '―'}</span>
                <span className="text-base font-bold" style={{ color: '#1A2340' }}>{staff.name || '―'}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {/* 2026-07-13追加：帳票種別バッジ（SSCダッシュボードと同じgetDocumentLabelを表示）。
                  以前はgetDocumentLabel関数自体はあったが実際の画面に出しておらず、担当営業が
                  一覧だけでは書類の種類（雇用契約書／明示書／兼用）を判断できなかった
                  （伊藤さん指摘・2026-07-13）。 */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                  {getDocumentLabel(contract.document_type, contract.pattern)}
                </span>
                <ContractStatusBadge status={contract.status} overrideLabel={isExplain ? '説明対応が必要' : undefined} />
              </div>
              {isWaitingSign && <SignDeadlineBadge signRequestedAt={contract.sign_requested_at} />}
              {isConfirmed && <ConfirmedBadge signedAt={contract.signed_at} />}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-3" style={{ background: '#F5F7FC' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm flex-shrink-0" style={{ color: '#1B3A8C' }}>📍</span>
              <span className="text-sm" style={{ color: '#1A2340', wordBreak: 'break-all' }}>
                {f.workLocationName || '―'}
              </span>
            </div>
            {!isWaitingSign && deadline.type && (
              <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                style={{
                  background: deadline.type === 'overdue' ? '#FEE2E2' : '#FFF7ED',
                  color: deadline.type === 'overdue' ? '#B91C1C' : '#C2410C',
                }}>
                {deadline.type === 'overdue' ? '🔴' : '⚠'} {deadline.label}
              </span>
            )}
          </div>

          <div className="flex items-start gap-6 flex-wrap">
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>申請日時</p>
              <p className="text-xs" style={{ color: '#1A2340' }}>{formatDateTime(contract.created_at)}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>雇用期間</p>
              <p className="text-xs" style={{ color: '#1A2340' }}>{getEmployPeriodLabel(contract)}</p>
            </div>
            {/* 2026-07-13追加：派遣期間（パターンB・Cのみ、SSCダッシュボードと同じ表示条件）。
                明示書（パターンB）は雇用期間欄に情報が無く、この派遣期間が実質的な契約期間の
                目安になるため、一覧に無いと「いつまでの契約か」が全く分からない状態だった
                （伊藤さん指摘・2026-07-13）。 */}
            {(contract.pattern === 'B' || contract.pattern === 'C') && f.dispatchStart && f.dispatchEnd && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>派遣期間</p>
                <p className="text-xs" style={{ color: '#1A2340' }}>{f.dispatchStart} 〜 {f.dispatchEnd}</p>
              </div>
            )}
            {isExplain && f.closingPattern && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: '#5A6A8A' }}>締結パターン</p>
                <p className="text-xs" style={{ color: '#1A2340' }}>{CLOSING_PATTERN_LABEL[f.closingPattern] || f.closingPattern}</p>
              </div>
            )}
          </div>

          {contract.status === '差し戻し中' && contract.rejection_reason && (
            <div className="mt-3 rounded-lg px-3 py-2 border-l-4" style={{ background: '#FEF2F2', borderColor: '#B91C1C' }}>
              <p className="text-xs font-medium mb-0.5" style={{ color: '#B91C1C' }}>差し戻し理由</p>
              <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>{contract.rejection_reason}</p>
            </div>
          )}

          {isExplain && contract.status === 'SSC承認済み' && (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: '#ECFEFF' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#0E7490' }}>
                {contract.work_place === '社内'
                  ? 'ℹ️ 承認済みです。従業員への説明が完了したら「説明完了」を押してください。押すと従業員が署名待ちの状態になります。'
                  : 'ℹ️ SSC承認済みです。従業員への説明が完了したら「説明完了」を押してください。押すと従業員が署名待ちの状態になります。'}
              </p>
            </div>
          )}

          {/* 説明完了の確認 */}
          {isExplain && confirmingExplainId === contract.id && (
            <div className="mt-3 rounded-lg p-3 border-2" style={{ background: '#ECFEFF', borderColor: '#0E7490' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#0E7490' }}>従業員への説明は完了しましたか？</p>
              <p className="text-xs mb-3" style={{ color: '#1A2340' }}>押すと、従業員が署名待ちの状態に切り替わります。</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExplainDone(contract.id)}
                  disabled={explainLoading}
                  className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: '#0E7490' }}>
                  {explainLoading ? '処理中...' : '✅ 説明完了'}
                </button>
                <button
                  onClick={() => setConfirmingExplainId(null)}
                  className="px-3 py-2 rounded-lg text-xs border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
          {/* 確認ボタン（2026-07-02改訂：左揃えピル形に統一。複数アクションがある場合は主アクションを塗りつぶし、詳細を見るは輪郭線に） */}
          <div className="flex items-center gap-2 mt-3.5 flex-wrap">
            <button
              className="flex items-center gap-1.5 rounded-full transition-all"
              style={(isExplain || contract.status === '差し戻し中')
                ? { background: 'white', border: '1px solid #1B3A8C', padding: '6px 15px', cursor: 'pointer' }
                : { background: '#1B3A8C', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
              onClick={() => router.push(`/dashboard/sales/contracts/${contract.id}`)}>
              <span className="text-xs font-medium" style={{ color: (isExplain || contract.status === '差し戻し中') ? '#1B3A8C' : 'white' }}>詳細を見る</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={(isExplain || contract.status === '差し戻し中') ? '#1B3A8C' : 'white'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
            {isExplain && confirmingExplainId !== contract.id && (
              <button
                className="flex items-center gap-1.5 rounded-full transition-all"
                style={{ background: '#0E7490', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
                onClick={() => setConfirmingExplainId(contract.id)}>
                <span className="text-xs font-medium text-white">✅ 説明完了</span>
              </button>
            )}
            {contract.status === '差し戻し中' && (
              <button
                className="flex items-center gap-1.5 rounded-full transition-all"
                style={{ background: '#B91C1C', border: 'none', padding: '7px 16px', cursor: 'pointer' }}
                onClick={() => router.push(`/apply?edit=${contract.id}`)}>
                <span className="text-xs font-medium text-white">↩ 再申請する</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      {/* ヘッダー */}
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>担当営業ダッシュボード</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {/* 新規発行申請ボタン（2026-07-02改訂：ヘッダー内・ログアウトの左に移動、アイコンを書類＋プラスに変更） */}
            <button onClick={() => router.push('/apply')}
              className="flex items-center gap-1.5 rounded-lg font-medium transition-all whitespace-nowrap"
              style={{ background: '#1B3A8C', color: 'white', border: 'none', padding: '9px 16px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
              </svg>
              <span className="text-xs">新規発行申請</span>
            </button>
            <button onClick={handleLogout}
              className="text-sm px-4 py-2 rounded-lg border transition-all whitespace-nowrap"
              style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* 部門特定エラー */}
        {deptLookupError && (
          <div className="rounded-xl p-5 mb-6 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>{deptLookupError}</p>
          </div>
        )}

        {/* フィルタータブバー（2026-07-02改訂：5枚カードからタブバー形式に変更） */}
        <div className="flex items-end gap-6 border-b mb-0" style={{ borderColor: '#E5E9F2' }}>
          {filterCards.map(card => {
            const isActive = activeFilter === card.key
            const isDisabled = card.count === null
            const icon = card.key === 'pending'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? card.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="13" y2="14" /></svg>
              : card.key === 'explain'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? card.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              : card.key === 'rejected'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? card.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              : card.key === 'waiting'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? card.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              : card.key === 'completed'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? card.color : '#5A6A8A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><polyline points="8 12.5 10.8 15 16 9" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA5BD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
            return (
              <button
                key={card.key}
                onClick={() => { if (isDisabled) return; setActiveFilter(card.key) }}
                disabled={isDisabled}
                className="flex items-center gap-2 pb-3 relative transition-all"
                style={{ background: 'none', border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: isDisabled ? 0.55 : 1 }}>
                {icon}
                <span className="text-sm font-medium" style={{ color: isActive ? card.color : (isDisabled ? '#9AA5BD' : '#1A2340') }}>{card.label}</span>
                {card.count === null ? (
                  <span className="text-xs" style={{ color: '#9AA5BD' }}>準備中</span>
                ) : (
                  <span className="text-xs font-bold rounded-full"
                    style={{
                      color: isActive ? 'white' : '#5A6A8A',
                      background: isActive ? card.color : '#EEF0F5',
                      padding: '2px 8px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: 1.4,
                    }}>{card.count}</span>
                )}
                {isActive && (
                  <div className="absolute" style={{ left: 0, right: 0, bottom: '-1px', height: '2.5px', background: card.color, borderRadius: '2px 2px 0 0' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* 絞り込み・並び替え・検索（2026-07-14追加：以前のサブフィルターピルを共通部品に置き換え） */}
        {activeFilter !== 'other' && (
          <div className="mt-4">
            {listToolbar}
          </div>
        )}

        <div className="mb-2" style={{ marginTop: activeFilter === 'pending' ? 0 : '1rem' }} />

        {loading ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            {activeFilter === 'other' ? (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold" style={{ color: '#1A2340' }}>{currentLabel}（{visibleMyRequests.length}件）</h2>
                <label className="flex items-center gap-1.5 text-xs" style={{ color: '#5A6A8A' }}>
                  <input type="checkbox" checked={includeCompletedRequests}
                    onChange={e => setIncludeCompletedRequests(e.target.checked)} />
                  完了したものも表示する
                </label>
              </div>
            ) : (
              <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>{currentLabel}（{currentList.length}件）</h2>
            )}

            {activeFilter === 'other' ? (
              myRequestsLoading ? (
                <p className="text-sm py-6" style={{ color: '#5A6A8A' }}>読み込み中...</p>
              ) : visibleMyRequests.length === 0 ? (
                <p className="text-sm py-6" style={{ color: '#5A6A8A' }}>該当する依頼はありません。</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {visibleMyRequests.map(r => <MyRequestCard key={r.id} r={r} includeCompleted={includeCompletedRequests} />)}
                </div>
              )
            ) : currentList.length === 0 ? (
              <p className="text-sm py-6" style={{ color: '#5A6A8A' }}>該当する書類はありません。</p>
            ) : (
              <div className="flex flex-col gap-3">
                {currentList.map(c => <ContractCard key={c.id} contract={c} />)}
              </div>
            )}

            {activeFilter === 'other' && (
              <div className="border-t mt-4 pt-3 text-center" style={{ borderColor: '#EEF0F5' }}>
                <span className="text-xs" style={{ color: '#9AA5BD' }}>更新回答機能は準備中です。</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function MyRequestCard({ r, includeCompleted }: { r: MyRequest; includeCompleted: boolean }) {
  const badge = (status: string) => {
    const isDone = status === 'completed'
    const isCancelled = status === 'cancelled'
    const label = isDone ? '完了' : isCancelled ? '要確認：取消済み' : status === 'in_progress' ? '対応中' : '未対応'
    const color = isDone ? '#0D9488' : isCancelled ? '#EA580C' : '#DC2626'
    return <span className="text-white text-[10px] px-2 py-0.5 rounded-full" style={{ background: color }}>{label}</span>
  }
  const taskVisible = (status: string | null) => !!status && status !== 'not_required' && (status !== 'completed' || includeCompleted)

  const showStaffRegister = taskVisible(r.staff_register_status)
  const showCsvImport = taskVisible(r.csv_import_status)
  const hasCancelled = r.staff_register_status === 'cancelled' || r.csv_import_status === 'cancelled'

  return (
    <div className="rounded-lg border p-4"
      style={{
        borderColor: hasCancelled ? '#FDBA74' : '#D0DAF0',
        background: hasCancelled ? '#FFF7ED' : 'white',
      }}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-semibold" style={{ color: '#1A2340' }}>
          {r.staff_name || '―'}（社員番号：{r.staff_code || '―'}）
        </p>
        <p className="text-xs text-right" style={{ color: '#5A6A8A' }}>
          {r.requested_by_name && <>依頼者：{r.requested_by_name}{r.requested_by_dept ? `（${r.requested_by_dept}）` : ''}<br /></>}
          依頼日：{formatDateTime(r.requested_at)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {showStaffRegister && (
          <div className="rounded-md border px-3 py-2"
            style={{ background: 'white', borderColor: r.staff_register_status === 'cancelled' ? '#FDBA74' : '#D0DAF0' }}>
            <div className="flex items-center gap-2">
              {badge(r.staff_register_status as string)}
              <span className="text-xs" style={{ color: '#1A2340' }}>スタッフマスタ登録</span>
            </div>
            {r.staff_register_status === 'cancelled' && r.staff_register_cancel_reason && (
              <p className="text-[11px] mt-1.5" style={{ color: '#9A3412' }}>取消理由：{r.staff_register_cancel_reason}</p>
            )}
          </div>
        )}
        {showCsvImport && (
          <div className="rounded-md border px-3 py-2"
            style={{ background: 'white', borderColor: r.csv_import_status === 'cancelled' ? '#FDBA74' : '#D0DAF0' }}>
            <div className="flex items-center gap-2">
              {badge(r.csv_import_status as string)}
              <span className="text-xs" style={{ color: '#1A2340' }}>
                CSVインポート{r.system_type ? `（${r.system_type}${r.dispatch_start_date ? '・派遣開始日 ' + formatDate(new Date(r.dispatch_start_date)) : ''}）` : ''}
              </span>
            </div>
            {r.csv_import_status === 'cancelled' && r.csv_import_cancel_reason && (
              <p className="text-[11px] mt-1.5" style={{ color: '#9A3412' }}>取消理由：{r.csv_import_cancel_reason}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
