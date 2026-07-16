'use client'

import { useEffect, useState } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'

// ===== 型定義 =====

type DiffPart = { type: 'same' | 'removed' | 'added'; text: string }

// 自動チェックの警告レベル（2026-07-02追加：7-5章の骨格実装）
type WarningLevel = 'none' | 'yellow' | 'red'

type ContractDetail = {
  id: string
  staff_id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: string
  closing_pattern: string | null
  input_data: {
    staff?: { name?: string; employee_number?: string; department?: string; crew_code?: string }
    fields?: Record<string, any>
    csvMeta?: {
      csvMode?: string
      csvSystem?: string
      csvDispatchStart?: string
      csvSnapshot?: Record<string, string>
      masterSnapshot?: Record<string, string>
      mgrCmpSource?: string
    }
  }
  warning_confirmations: { type: string; confirmed_at: string }[]
  warning_level: WarningLevel
  auto_check_results: { type: string; level: 'yellow' | 'red'; message: string }[]
  force_approve_reason: string | null
  rejection_reason: string | null
  rejected_by: string | null
  rejected_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
}

// ===== ユーティリティ =====

const parseAmount = (str: any): number => {
  if (str === null || str === undefined || str === '') return 0
  return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const CLOSING_PATTERNS = [
  { id: 'auto',  label: '指定しない',           desc: '承認が完了すると、システムが従業員へ確認用URLを自動送信します。' },
  { id: 'face',  label: '対面でその場説明',      desc: '担当営業が端末画面を見せながら説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。' },
  { id: 'print', label: '印刷して説明後にリンク送付', desc: '担当営業が印刷した資料を用いて説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。' },
]

const TRANSPORT_TYPES = [
  { id: 'default',  label: '実費または定期代（デフォルト）', preview: '実費または定期代(デフォルト)\n原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。' },
  { id: 'included', label: '交通費込',                      preview: '交通費込\n基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。' },
  { id: 'gas',      label: 'ガソリン代',                    preview: 'ガソリン代\n私有車通勤：ガソリン代支給　【 12円 / km 】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。' },
  { id: 'pass-gas', label: '定期代＋ガソリン代',             preview: '定期代＋ガソリン代\n定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km 】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③エビデンスの提出確認が取れない交通費は支払い対象外とする。⑤私有車通勤については別途私有車通勤を許可する書面を提出し、規定を遵守すること。' },
]

// ===== 差分表示ロジック（apply/page.tsxと同じLCSアルゴリズム） =====

const computeCharDiff = (oldText: string, newText: string): DiffPart[] => {
  const oldArr = Array.from(oldText)
  const newArr = Array.from(newText)
  const m = oldArr.length
  const n = newArr.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldArr[i - 1] === newArr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  const rawParts: { type: 'same' | 'removed' | 'added'; char: string }[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      rawParts.push({ type: 'same', char: oldArr[i - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] > dp[i - 1][j])) {
      rawParts.push({ type: 'added', char: newArr[j - 1] }); j--
    } else {
      rawParts.push({ type: 'removed', char: oldArr[i - 1] }); i--
    }
  }
  rawParts.reverse()
  const parts: DiffPart[] = []
  for (const p of rawParts) {
    const last = parts[parts.length - 1]
    if (last && last.type === p.type) { last.text += p.char } else { parts.push({ type: p.type, text: p.char }) }
  }
  return parts
}

// ===== 表示コンポーネント =====

const DiffText = ({ oldText, newText, multiline, suffix }: { oldText: string; newText: string; multiline?: boolean; suffix?: string }) => {
  if (oldText === newText) {
    return <span className={multiline ? 'whitespace-pre-line' : ''}>{newText}{suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}</span>
  }
  const parts = computeCharDiff(oldText, newText)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-1.5">
        <span className="text-xs font-bold shrink-0 px-1 py-0.5 rounded mt-0.5" style={{ color: '#B91C1C', background: '#FEF2F2' }}>変更前</span>
        <span className={multiline ? 'whitespace-pre-line' : ''}>
          {parts.filter(p => p.type !== 'added').map((p, idx) =>
            p.type === 'removed'
              ? <span key={`old-${idx}`} style={{ color: '#B91C1C', textDecoration: 'line-through', opacity: 0.75 }}>{p.text}</span>
              : <span key={`old-${idx}`}>{p.text}</span>
          )}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <span className="text-xs font-bold shrink-0 px-1 py-0.5 rounded mt-0.5" style={{ color: '#15803D', background: '#ECFDF5' }}>変更後</span>
        <span className={multiline ? 'whitespace-pre-line' : ''}>
          {parts.filter(p => p.type !== 'removed').map((p, idx) =>
            p.type === 'added'
              ? <span key={`new-${idx}`} style={{ color: '#15803D', fontWeight: 600, textDecoration: 'underline' }}>{p.text}</span>
              : <span key={`new-${idx}`}>{p.text}</span>
          )}
          {suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}
        </span>
      </div>
    </div>
  )
}

// 情報行（ラベル＋値）
const FinalRow = ({ label, value, badge, multiline, preview, oldValue, suffix }: {
  label: string; value: string; badge?: React.ReactNode; multiline?: boolean; preview?: boolean; oldValue?: string; suffix?: string
}) => {
  const showDiff = oldValue !== undefined && oldValue !== '' && oldValue !== value
  return (
    <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
      <div className="border-r px-4 py-3.5 flex flex-col items-start gap-1.5" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
        {badge}
      </div>
      <div className={`px-5 py-3.5 text-sm ${multiline ? 'whitespace-pre-line' : (showDiff ? '' : 'flex items-center')}`}
        style={{ background: preview ? '#EEF2FA' : (showDiff ? '#FFFBEB' : 'white'), color: '#1A2340', lineHeight: 1.7 }}>
        {showDiff
          ? <DiffText oldText={oldValue!} newText={value} multiline={multiline} suffix={suffix} />
          : <>{value}{suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}</>}
      </div>
    </div>
  )
}

// セクションヘッダー（折りたたみ可）
const FinalSection = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-3" style={{ borderColor: '#D0DAF0' }}>
      <div className="px-5 py-2.5 flex items-center justify-between cursor-pointer" style={{ background: '#1B3A8C' }}
        onClick={() => setCollapsed(c => !c)}>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-white">{title}</span>
          <span className="text-xs" style={{ color: '#A8C0E8' }}>{sub}</span>
        </div>
        <span className="text-xs transition-transform" style={{ color: 'rgba(255,255,255,0.6)', transform: collapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// グループ内小見出し
const FinalGroupHeader = ({ label }: { label: string }) => (
  <>
    <div style={{ height: '10px', background: '#F5F7FC' }} />
    <div className="px-5 py-2 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
      <p className="text-xs font-medium text-white">▼ {label}</p>
    </div>
  </>
)

// CSVバッジ
const CsvBadge = ({ snapshotValue, currentValue }: { snapshotValue?: string; currentValue?: string }) => {
  if (!snapshotValue && !currentValue) return null
  const modified = snapshotValue !== undefined && snapshotValue !== '' && snapshotValue !== currentValue
  return modified ? (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>CSV反映（修正済み）</span>
  ) : (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: '#ECFDF5', color: '#0D9488', border: '1px solid #A7F3D0' }}>CSV反映</span>
  )
}

// マスタ反映バッジ
const MasterBadge = ({ modified }: { modified?: boolean }) => modified ? (
  <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'white', color: '#D97706', border: '1px solid #D97706' }}>マスタ情報反映（修正済み）</span>
) : (
  <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'white', color: '#1B3A8C', border: '1px solid #1B3A8C' }}>マスタ情報反映</span>
)

// 警告ボックス（SSC向けは読み取り専用・チェックなし）※担当営業の自己申告警告
const WarningBox = ({ type, confirmedAt }: { type: string; confirmedAt: string }) => {
  const messages: Record<string, string> = {
    trial_over6months: '試用期間6ヶ月超の警告が出ていました。担当営業が上長の了承を得た上で申請しています。',
    no_trial_period:   '正社員で試用期間「無し」の警告が出ていました。担当営業が上長の了承を得た上で申請しています。',
    salary_over_1000000: '合計支給額が100万円超の警告が出ていました。担当営業が上長の了承を得た上で申請しています。',
    csv_fields_modified: 'CSV反映項目が個別契約書の情報と異なる内容に修正されています。\n担当営業が管理部への修正依頼が必要なことを確認した上で申請しています。\n管理部への修正依頼が行われているか、あわせてご確認ください。',
  }
  const message = messages[type] || `警告確認済み（種別：${type}）`
  return (
    <div className="rounded-lg p-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
      <p className="text-sm font-bold mb-1.5" style={{ color: '#DC2626' }}>🔴 担当営業が確認した警告</p>
      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>{message}</p>
      <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>確認日時：{formatDateTime(confirmedAt)}</p>
    </div>
  )
}

// 自動チェック警告バナー（2026-07-02追加：7-5章の骨格実装／2026-07-06：判定結果の個別メッセージ表示に対応）
const AutoCheckWarningBanner = ({ level, results }: { level: WarningLevel; results: { type: string; level: 'yellow' | 'red'; message: string }[] }) => {
  if (level === 'none') return null
  const isRed = level === 'red'
  return (
    <div className="rounded-lg p-4 border-2" style={{ background: isRed ? '#FEF2F2' : '#FFFBEB', borderColor: isRed ? '#DC2626' : '#D97706' }}>
      <p className="text-sm font-bold mb-2" style={{ color: isRed ? '#DC2626' : '#D97706' }}>
        {isRed ? '🔴 自動チェックで要確認の警告があります' : '🟡 自動チェックで要確認の警告があります'}
      </p>
      {results.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {results.map((r, idx) => (
            <li key={idx} className="text-sm leading-relaxed rounded-md px-3 py-2" style={{ background: 'white', color: '#1A2340' }}>
              {r.level === 'red' ? '🔴 ' : '🟡 '}{r.message}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
        {isRed
          ? '内容を確認したうえで、問題なければ理由を入力して「強制承認」してください。'
          : '内容を確認したうえで、「承認する」または「差し戻す」を選んでください。'}
      </p>
    </div>
  )
}

// ===== メインコンポーネント =====

export default function SSCContractDetail() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [user, setUser] = useState<any>(null)
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // 承認・差し戻しのUI状態
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [actionDone, setActionDone] = useState<'approved' | 'rejected' | null>(null)

  // 強制承認のUI状態（2026-07-02追加：7-5章の骨格実装。warning_level='red'の時のみ使用）
  const [showForceApproveForm, setShowForceApproveForm] = useState(false)
  const [forceApproveReason, setForceApproveReason] = useState('')
  // 総合レビュー指摘G対応（2026-07-16）：強制承認は取り消し不可の危険操作のため、
  // 理由入力に加えて「取り消し不可であることを理解した」チェックを入れないと実行できないようにする
  const [forceApproveAcknowledged, setForceApproveAcknowledged] = useState(false)

  useEffect(() => {
    const init = async () => {
      // 認証チェック（2026-07-13追記：「SSCが出来ることは管理部もすべて出来る」という伊藤さんの
      // 明確な方針のため、管理部ロールにもこの画面へのフルアクセス（承認・強制承認・差し戻しを含む）
      // を許可する。閲覧専用に制限する案を一度実装したが、伊藤さんから「なぜ制限するのか」と
      // 指摘を受け、承認権限も含めて完全に同等にする方針に修正した）
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== 'SSC' && role !== '管理部') { router.push('/login'); return }
      setUser(data.user)

      if (!id) { setNotFound(true); setLoading(false); return }

      // 申請データ取得
      const { data: row, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !row) { setNotFound(true); setLoading(false); return }
      // 社内案件は原則SSC・管理部の閲覧対象外（一覧画面と同じ制限。URL直打ちでの閲覧を防ぐ）。
      // 存在しない申請と同じ表示にすることで、社内案件が存在すること自体も分からないようにする。
      // 例外（2026-07-13追加・フェーズ3）：管理部の中でも「社内承認者」フラグ
      // （user_metadata.is_internal_approver === true）を持つ人だけは、社内案件も閲覧・承認できる。
      const isInternalApprover = role === '管理部' && data.user.user_metadata?.is_internal_approver === true
      if ((row as any).work_place === '社内' && !isInternalApprover) { setNotFound(true); setLoading(false); return }
      setContract(row as ContractDetail)
      setLoading(false)
    }
    init()
  }, [id, router])

  // 二重承認ガード（総合レビュー指摘12）：SSCと管理部が同じ画面を同時に開いて操作すると、
  // 表示上は「未処理」に見えていても実際は既に処理済み、ということが起こりうる。更新時に
  // 「まだ申請中の案件だけ」という条件を必ずつけ、更新できた行が0件なら「先に他の人が処理済み」
  // として扱い、画面を最新状態に更新し直す。
  const refetchContract = async () => {
    const { data: row } = await supabase.from('contracts').select('*').eq('id', id).single()
    if (row) setContract(row as ContractDetail)
  }

  // 承認処理（warning_level が none / yellow の場合。理由入力は不要）
  const handleApprove = async () => {
    if (!contract || actionLoading) return
    setActionLoading(true)
    setActionError('')
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({
        status: 'SSC承認済み',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
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
      await refetchContract()
      setActionLoading(false)
      return
    }
    // 締結パターンが「指定しない（自動送信）」の場合、ここで署名待ちへの自動遷移＋
    // 従業員への署名依頼メール送信を行う（対面・印刷パターンは担当営業の「説明完了」時に送信）。
    // メール送信に失敗しても承認自体は完了しているので、承認フロー自体は止めない。
    try {
      await fetch(`/api/contracts/${contract.id}/notify-sign-request`, { method: 'POST', headers: await getAuthHeader() })
    } catch {
      // 通知の失敗は承認をブロックしない（ログのみ・UIには表示しない）
    }
    setActionDone('approved')
    setActionLoading(false)
    setShowApproveConfirm(false)
  }

  // 強制承認処理（2026-07-02追加：warning_level='red'の場合のみ。理由入力必須）
  const handleForceApprove = async () => {
    if (!contract || actionLoading) return
    if (!forceApproveReason.trim()) { setActionError('強制承認の理由を入力してください。'); return }
    setActionLoading(true)
    setActionError('')
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({
        status: 'SSC承認済み',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        force_approve_reason: forceApproveReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
      .eq('status', '申請中')
      .select('id')
    if (error) {
      setActionError('強制承認の保存に失敗しました。もう一度お試しください。（' + error.message + '）')
      setActionLoading(false)
      return
    }
    if (!updatedRows || updatedRows.length === 0) {
      setActionError('この申請は、あなたが確認している間に他の人が先に処理していました。最新の状態に更新しました。')
      setShowForceApproveForm(false)
      await refetchContract()
      setActionLoading(false)
      return
    }
    try {
      await fetch(`/api/contracts/${contract.id}/notify-sign-request`, { method: 'POST', headers: await getAuthHeader() })
    } catch {
      // 通知の失敗は承認をブロックしない
    }
    setActionDone('approved')
    setActionLoading(false)
    setShowForceApproveForm(false)
  }

  // 差し戻し処理
  const handleReject = async () => {
    if (!contract || actionLoading) return
    if (!rejectReason.trim()) { setActionError('差し戻し理由を入力してください。'); return }
    setActionLoading(true)
    setActionError('')
    const { data: updatedRows, error } = await supabase
      .from('contracts')
      .update({
        status: '差し戻し中',
        rejection_reason: rejectReason.trim(),
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
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
      await refetchContract()
      setActionLoading(false)
      return
    }
    setActionDone('rejected')
    setActionLoading(false)
    setShowRejectForm(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
      <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中...</p>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F5F7FC' }}>
      <p className="text-lg font-bold" style={{ color: '#1A2340' }}>申請が見つかりませんでした</p>
      <button onClick={() => router.push(user?.user_metadata?.role === '管理部' ? '/dashboard/admin' : '/dashboard/ssc')}
        className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
        一覧に戻る
      </button>
    </div>
  )

  if (!contract) return null

  // 管理部が開いている場合のフラグ（2026-07-13追加：ヘッダー表示・戻り先の出し分けにのみ使用。
  // 承認・差し戻し等の操作権限はSSCと完全に同じで、ここでは制限しない）
  const isAdmin = user?.user_metadata?.role === '管理部'
  const backPath = isAdmin ? '/dashboard/admin' : '/dashboard/ssc'
  // 社内案件を管理部（社内承認者）が開いている場合のフラグ（2026-07-13追加・フェーズ3。表示文言の出し分けのみ）
  const isInternalApproval = isAdmin && contract.work_place === '社内'

  // input_data から各フィールドを取り出す
  const staffSnap = contract.input_data?.staff || {}
  const f = contract.input_data?.fields || {}
  const csvMeta = contract.input_data?.csvMeta || {}
  const csvSnapshot = csvMeta.csvSnapshot || {}
  const masterSnapshot = csvMeta.masterSnapshot || {}
  const mgrCmpSource = csvMeta.mgrCmpSource || 'master'
  const csvMode = csvMeta.csvMode || 'manual'
  const csvSystem = csvMeta.csvSystem || ''

  const pattern = contract.pattern
  const contractType = f.contractType || ''
  const isConflictDateExempt = contractType === '無期契約' || contractType === '正社員'

  // 給与合計
  const salaryTotal = parseAmount(f.basicSalary) + parseAmount(f.skillPay) + parseAmount(f.rolePay)
    + parseAmount(f.salesPay) + parseAmount(f.housingPay) + parseAmount(f.overtimePay)

  // 交通費プレビュー
  const selectedTransport = TRANSPORT_TYPES.find(t => t.id === f.transportType) || TRANSPORT_TYPES[0]

  // 保険プレビュー
  const insuranceParts = []
  if (f.hasSocialInsurance) insuranceParts.push('健康保険・厚生年金')
  if (f.hasEmployInsurance) insuranceParts.push('雇用保険')
  const insurancePreview = insuranceParts.length > 0
    ? `${insuranceParts.join('・')}に加入します。\n控除項目：${insuranceParts.join('・')}保険料`
    : '社会保険・雇用保険ともに加入しません。'

  // 試用期間計算（警告判定用）
  const calcTrialMonths = (start: string, end: string) => {
    if (!start || !end) return null
    const s = new Date(start); const e = new Date(end)
    if (e <= s) return null
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    const dayDiff = e.getDate() - s.getDate()
    if (dayDiff < 0) months--
    const days = dayDiff < 0 ? new Date(e.getFullYear(), e.getMonth(), 0).getDate() + dayDiff : dayDiff
    return { months, days, over6: months > 6 || (months === 6 && days > 0) }
  }
  const trialCalc = calcTrialMonths(f.trialStart || '', f.trialEnd || '')

  const isAlreadyProcessed = contract.status !== '申請中'

  // 自動チェックの警告レベル（2026-07-02追加：中身未実装のため現状は必ず'none'）
  const warningLevel: WarningLevel = contract.warning_level || 'none'
  const isRedWarning = warningLevel === 'red'
  const isYellowWarning = warningLevel === 'yellow'

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>{isInternalApproval ? '契約確認画面（社内承認）' : isAdmin ? '契約確認画面（管理部）' : 'SSC確認画面'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(backPath)}
              className="text-sm px-4 py-2 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
              ← 一覧に戻る
            </button>
            <button onClick={handleLogout}
              className="text-sm px-4 py-2 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* 申請ステータス表示（処理済みの場合） */}
        {isAlreadyProcessed && !actionDone && (
          <div className="rounded-xl p-4 mb-6 border" style={{
            background: contract.status === 'SSC承認済み' ? '#ECFDF5' : contract.status === '差し戻し中' ? '#FEF2F2' : '#EEF2FA',
            borderColor: contract.status === 'SSC承認済み' ? '#34D399' : contract.status === '差し戻し中' ? '#F87171' : '#D0DAF0',
          }}>
            <p className="text-sm font-bold" style={{
              color: contract.status === 'SSC承認済み' ? '#065F46' : contract.status === '差し戻し中' ? '#B91C1C' : '#1B3A8C'
            }}>
              {contract.status === 'SSC承認済み' && `✅ 承認済み（${formatDateTime(contract.approved_at)}）`}
              {contract.status === '差し戻し中' && `↩ 差し戻し済み（${formatDateTime(contract.rejected_at)}）`}
              {contract.status !== 'SSC承認済み' && contract.status !== '差し戻し中' && `ステータス：${contract.status}`}
            </p>
            {contract.status === '差し戻し中' && contract.rejection_reason && (
              <p className="text-sm mt-1 leading-relaxed" style={{ color: '#1A2340' }}>差し戻し理由：{contract.rejection_reason}</p>
            )}
            {/* 強制承認理由の表示（2026-07-02追加：監査・振り返り用） */}
            {contract.status === 'SSC承認済み' && contract.force_approve_reason && (
              <p className="text-sm mt-1 leading-relaxed" style={{ color: '#1A2340' }}>強制承認理由：{contract.force_approve_reason}</p>
            )}
          </div>
        )}

        {/* 申請概要カード */}
        <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-5 py-3" style={{ background: '#1B3A8C' }}>
            <p className="text-sm font-bold text-white">申請概要</p>
          </div>
          <div className="divide-y" style={{ borderColor: '#D0DAF0' }}>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>対象スタッフ</div>
              <div className="px-4 py-3 text-sm font-bold" style={{ color: '#1A2340' }}>
                {staffSnap.name || '―'}　<span className="font-normal text-xs" style={{ color: '#5A6A8A' }}>（社員番号：{staffSnap.employee_number || '―'}）</span>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>書類種別</div>
              <div className="px-4 py-3 text-sm flex items-center gap-3" style={{ color: '#1A2340' }}>
                {contract.document_type}
                {/* 帳票PDFプレビュー（2026-07-07追加。2026-07-08：就業条件明示書・兼用版のPDF生成も
                    実装済みのため、全document_typeで表示するよう対応を拡大。
                    未対応の書類種別があれば/api/contracts/[id]/pdf側が501エラーを返す） */}
                {(contract.document_type === '雇用契約書' || contract.document_type === '就業条件明示書' || contract.document_type === '雇用契約書 兼\n就業条件明示書') && (
                  <button
                    type="button"
                    onClick={async () => {
                      // 総合レビュー指摘1対応（2026-07-15）：PDF取得APIがログイン確認を
                      // 必須にしたため、単なる<a href>ではなく認証ヘッダー付きfetchで取得する。
                      const res = await fetch(`/api/contracts/${contract.id}/pdf`, { headers: await getAuthHeader() })
                      if (!res.ok) { alert('PDFの取得に失敗しました。'); return }
                      const blobUrl = URL.createObjectURL(await res.blob())
                      window.open(blobUrl, '_blank')
                    }}
                    className="text-xs font-medium px-3 py-1 rounded-full border"
                    style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}
                  >
                    📄 帳票PDFプレビュー
                  </button>
                )}
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>パターン / 雇用区分</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>パターン{pattern} / {contractType}</div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>申請日時</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>{formatDateTime(contract.created_at)}</div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>申請者</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#5A6A8A' }}>
                {/* 総合レビュー指摘E対応（2026-07-16）：認証統合後、申請時点の氏名スナップショット
                    （created_by_name）を表示するよう切り替え済み。取得できない古いデータのみID表示にフォールバック */}
                {contract.created_by_name || `申請者ID：${contract.created_by.slice(0, 8)}…`}
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>入力方法</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>
                {csvMode === 'csv' ? `CSVデータから自動入力（${csvSystem}）` : '手動入力'}
              </div>
            </div>
          </div>
        </div>

        {/* 自動チェック警告バナー（2026-07-02追加骨格／2026-07-06中身実装） */}
        {warningLevel !== 'none' && (
          <div className="mb-6">
            <AutoCheckWarningBanner level={warningLevel} results={contract.auto_check_results || []} />
          </div>
        )}

        {/* 警告確認ボックス（warning_confirmationsがある場合＝担当営業の自己申告警告） */}
        {contract.warning_confirmations && contract.warning_confirmations.length > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>⚠️ 担当営業が確認した警告（上長承認済み）</p>
            {contract.warning_confirmations.map((w, idx) => (
              <WarningBox key={idx} type={w.type} confirmedAt={w.confirmed_at} />
            ))}
          </div>
        )}

        {/* ===== STEP1：基本情報 ===== */}
        <FinalSection title="STEP1：基本情報" sub="契約するスタッフと書類の種類">
          <FinalRow label="対象スタッフ" value={staffSnap.name ? `${staffSnap.name}（社員番号：${staffSnap.employee_number}）` : '―'} />
          <FinalRow label="雇用区分" value={contractType || '―'} />
          <FinalRow label="就業場所区分" value={f.workPlace || '―'} />
          <FinalRow label="書類種別" value={f.documentType || '―'} />
        </FinalSection>

        {/* ===== STEP2：就業先情報 ===== */}
        <FinalSection title="STEP2：就業先情報" sub="就業場所・業務内容・労働時間">
          <FinalRow label="入力方法" value={csvMode === 'csv' ? `CSVデータから自動入力（${csvSystem}）` : '手動で入力する'} />
          <FinalRow label="就業場所名" value={f.workLocationName || '―'}
            badge={csvSnapshot.locationName ? <CsvBadge snapshotValue={csvSnapshot.locationName} currentValue={f.workLocationName} /> : undefined}
            oldValue={csvSnapshot.locationName} />
          <FinalRow label="就業場所住所" value={f.workLocationAddress || '―'}
            badge={csvSnapshot.locationAddress ? <CsvBadge snapshotValue={csvSnapshot.locationAddress} currentValue={f.workLocationAddress} /> : undefined}
            oldValue={csvSnapshot.locationAddress} />
          <FinalRow label="就業場所電話番号" value={f.workLocationTel || '―'}
            badge={csvSnapshot.locationTel ? <CsvBadge snapshotValue={csvSnapshot.locationTel} currentValue={f.workLocationTel} /> : undefined}
            oldValue={csvSnapshot.locationTel} />
          <FinalRow label="業務内容" value={f.businessContent || '―'} multiline
            badge={csvSnapshot.business ? <CsvBadge snapshotValue={csvSnapshot.business} currentValue={f.businessContent} /> : undefined}
            oldValue={csvSnapshot.business} />
          <FinalRow label="始業時刻" value={f.startTime || '―'}
            badge={csvSnapshot.startTime ? <CsvBadge snapshotValue={csvSnapshot.startTime} currentValue={f.startTime} /> : undefined}
            oldValue={csvSnapshot.startTime} />
          <FinalRow label="終業時刻" value={f.endTime || '―'}
            badge={csvSnapshot.endTime ? <CsvBadge snapshotValue={csvSnapshot.endTime} currentValue={f.endTime} /> : undefined}
            oldValue={csvSnapshot.endTime}
            suffix={f.isShift ? '※シフト制' : undefined} />
          <FinalRow label="休憩時間"
            value={f.breakTime ? `${parseAmount(f.breakTime)}分` : '―'}
            badge={csvSnapshot.breakTime ? <CsvBadge snapshotValue={`${parseAmount(csvSnapshot.breakTime)}分`} currentValue={f.breakTime ? `${parseAmount(f.breakTime)}分` : ''} /> : undefined}
            oldValue={csvSnapshot.breakTime ? `${parseAmount(csvSnapshot.breakTime)}分` : undefined} />
          <FinalRow label="所定労働時間"
            value={(f.workingHoursH || f.workingHoursM) ? `${parseAmount(f.workingHoursH)}時間${parseAmount(f.workingHoursM)}分` : '―'}
            badge={csvSnapshot.workingHours ? <CsvBadge snapshotValue={`${parseAmount(csvSnapshot.workingHours?.split('-')[0])}時間${parseAmount(csvSnapshot.workingHours?.split('-')[1])}分`} currentValue={(f.workingHoursH || f.workingHoursM) ? `${parseAmount(f.workingHoursH)}時間${parseAmount(f.workingHoursM)}分` : ''} /> : undefined}
            oldValue={csvSnapshot.workingHours ? `${parseAmount(csvSnapshot.workingHours?.split('-')[0])}時間${parseAmount(csvSnapshot.workingHours?.split('-')[1])}分` : undefined} />
          <FinalRow label="所定労働日数" value={f.workDays === 'other' ? (f.workDaysOther || '―') : (f.workDays || '―')} />
          <FinalRow label="業務に伴う責任の程度" value={f.responsibility || '―'}
            badge={csvSnapshot.resp ? <CsvBadge snapshotValue={csvSnapshot.resp} currentValue={f.responsibility} /> : undefined}
            oldValue={csvSnapshot.resp} />
        </FinalSection>

        {/* ===== STEP3：派遣先担当者（パターンB・Cのみ） ===== */}
        {(pattern === 'B' || pattern === 'C') && (
          <FinalSection title="STEP3：派遣先担当者" sub="指揮命令者・派遣先責任者・苦情処理申出先">
            <FinalGroupHeader label="指揮命令者" />
            <FinalRow label="部署" value={f.cmd_dept || '―'} badge={csvSnapshot.cmdDept ? <CsvBadge snapshotValue={csvSnapshot.cmdDept} currentValue={f.cmd_dept} /> : undefined} oldValue={csvSnapshot.cmdDept} />
            <FinalRow label="役職" value={f.cmd_role || '―'} badge={csvSnapshot.cmdRole ? <CsvBadge snapshotValue={csvSnapshot.cmdRole} currentValue={f.cmd_role} /> : undefined} oldValue={csvSnapshot.cmdRole} />
            <FinalRow label="氏名" value={f.cmd_name || '―'} badge={csvSnapshot.cmdName ? <CsvBadge snapshotValue={csvSnapshot.cmdName} currentValue={f.cmd_name} /> : undefined} oldValue={csvSnapshot.cmdName} />
            <FinalRow label="電話番号" value={f.cmd_tel || '―'} badge={csvSnapshot.cmdTel ? <CsvBadge snapshotValue={csvSnapshot.cmdTel} currentValue={f.cmd_tel} /> : undefined} oldValue={csvSnapshot.cmdTel} />

            <FinalGroupHeader label="派遣先責任者" />
            <FinalRow label="部署" value={f.resp_dept || '―'} badge={csvSnapshot.respDept ? <CsvBadge snapshotValue={csvSnapshot.respDept} currentValue={f.resp_dept} /> : undefined} oldValue={csvSnapshot.respDept} />
            <FinalRow label="役職" value={f.resp_role || '―'} badge={csvSnapshot.respRole ? <CsvBadge snapshotValue={csvSnapshot.respRole} currentValue={f.resp_role} /> : undefined} oldValue={csvSnapshot.respRole} />
            <FinalRow label="氏名" value={f.resp_name || '―'} badge={csvSnapshot.respName ? <CsvBadge snapshotValue={csvSnapshot.respName} currentValue={f.resp_name} /> : undefined} oldValue={csvSnapshot.respName} />
            <FinalRow label="電話番号" value={f.resp_tel || '―'} badge={csvSnapshot.respTel ? <CsvBadge snapshotValue={csvSnapshot.respTel} currentValue={f.resp_tel} /> : undefined} oldValue={csvSnapshot.respTel} />

            <FinalGroupHeader label="苦情処理申出先（派遣先）" />
            <FinalRow label="部署" value={f.comp_dept || '―'} badge={csvSnapshot.compDept ? <CsvBadge snapshotValue={csvSnapshot.compDept} currentValue={f.comp_dept} /> : undefined} oldValue={csvSnapshot.compDept} />
            <FinalRow label="役職" value={f.comp_role || '―'} badge={csvSnapshot.compRole ? <CsvBadge snapshotValue={csvSnapshot.compRole} currentValue={f.comp_role} /> : undefined} oldValue={csvSnapshot.compRole} />
            <FinalRow label="氏名" value={f.comp_name || '―'} badge={csvSnapshot.compName ? <CsvBadge snapshotValue={csvSnapshot.compName} currentValue={f.comp_name} /> : undefined} oldValue={csvSnapshot.compName} />
            <FinalRow label="電話番号" value={f.comp_tel || '―'} badge={csvSnapshot.compTel ? <CsvBadge snapshotValue={csvSnapshot.compTel} currentValue={f.comp_tel} /> : undefined} oldValue={csvSnapshot.compTel} />

            <FinalGroupHeader label="追加項目" />
            <FinalRow label="福利厚生施設の利用等" value={f.welfare || '―'} multiline badge={csvSnapshot.welfare ? <CsvBadge snapshotValue={csvSnapshot.welfare} currentValue={f.welfare} /> : undefined} oldValue={csvSnapshot.welfare} />
            <FinalRow label="安全及び衛生" value={f.safetyText || '―'} multiline />
            <FinalRow label="紛争防止措置" value={f.conflictText || '―'} multiline />
          </FinalSection>
        )}

        {/* ===== STEP4：派遣元担当者（パターンB・Cのみ） ===== */}
        {(pattern === 'B' || pattern === 'C') && (
          <FinalSection title="STEP4：派遣元担当者" sub="派遣元責任者・苦情処理申出先（派遣元）">
            <FinalGroupHeader label="派遣元責任者" />
            <FinalRow label="部署" value={f.mgr_dept || '―'} badge={<MasterBadge modified={masterSnapshot.mgr_dept !== undefined && f.mgr_dept !== masterSnapshot.mgr_dept} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_dept : undefined} />
            <FinalRow label="役職" value={f.mgr_role || '―'} badge={<MasterBadge modified={masterSnapshot.mgr_role !== undefined && f.mgr_role !== masterSnapshot.mgr_role} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_role : undefined} />
            <FinalRow label="氏名" value={f.mgr_name || '―'} badge={<MasterBadge modified={masterSnapshot.mgr_name !== undefined && f.mgr_name !== masterSnapshot.mgr_name} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_name : undefined} />
            <FinalRow label="電話番号" value={f.mgr_tel || '―'} badge={<MasterBadge modified={masterSnapshot.mgr_tel !== undefined && f.mgr_tel !== masterSnapshot.mgr_tel} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.mgr_tel : undefined} />

            <FinalGroupHeader label="苦情処理申出先（派遣元）" />
            <FinalRow label="部署" value={f.cmp_dept || '―'} badge={<MasterBadge modified={masterSnapshot.cmp_dept !== undefined && f.cmp_dept !== masterSnapshot.cmp_dept} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_dept : undefined} />
            <FinalRow label="役職" value={f.cmp_role || '―'} badge={<MasterBadge modified={masterSnapshot.cmp_role !== undefined && f.cmp_role !== masterSnapshot.cmp_role} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_role : undefined} />
            <FinalRow label="氏名" value={f.cmp_name || '―'} badge={<MasterBadge modified={masterSnapshot.cmp_name !== undefined && f.cmp_name !== masterSnapshot.cmp_name} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_name : undefined} />
            <FinalRow label="電話番号" value={f.cmp_tel || '―'} badge={<MasterBadge modified={masterSnapshot.cmp_tel !== undefined && f.cmp_tel !== masterSnapshot.cmp_tel} />} oldValue={mgrCmpSource === 'csv' ? masterSnapshot.cmp_tel : undefined} />
          </FinalSection>
        )}

        {/* ===== STEP5：期間・労働条件 ===== */}
        <FinalSection title="STEP5：期間・労働条件" sub="雇用期間・派遣期間・残業の有無">
          {(pattern === 'B' || pattern === 'C') && (
            <>
              <FinalRow label="派遣期間" value={(f.dispatchStart && f.dispatchEnd) ? `${f.dispatchStart} 〜 ${f.dispatchEnd}` : '―'} />
              {!isConflictDateExempt && (
                <FinalRow label="抵触日（事業所単位）" value={f.conflictDate || '―'}
                  badge={csvSnapshot.conflict ? <CsvBadge snapshotValue={csvSnapshot.conflict} currentValue={f.conflictDate} /> : undefined}
                  oldValue={csvSnapshot.conflict} />
              )}
              {!isConflictDateExempt && (
                <FinalRow label="抵触日（組織単位）" value={f.conflictDateOrg || '―'}
                  badge={csvSnapshot.conflictOrg ? <CsvBadge snapshotValue={csvSnapshot.conflictOrg} currentValue={f.conflictDateOrg} /> : undefined}
                  oldValue={csvSnapshot.conflictOrg} />
              )}
              <FinalRow label="組織単位" value={f.organizationUnit || '―'}
                badge={csvSnapshot.org ? <CsvBadge snapshotValue={csvSnapshot.org} currentValue={f.organizationUnit} /> : undefined}
                oldValue={csvSnapshot.org} />
            </>
          )}
          <FinalRow label="雇用期間" value={
            (f.period === '無期' || contractType === '正社員')
              ? (f.contractStartDate ? `${f.contractStartDate} 〜 期間の定めなし` : '―')
              : (f.employStart ? `${f.employStart} 〜 ${f.employEnd || '―'}` : '―')
          } />
          <FinalRow label="試用期間" value={
            f.trialPeriod === '有' ? `有　${f.trialStart || '―'} 〜 ${f.trialEnd || '―'}` : f.trialPeriod === '無' ? '無' : '―'
          } />
          {/* 試用期間6ヶ月超の警告（申請時に確認済みの場合のみ表示） */}
          {f.trialPeriod === '有' && trialCalc?.over6 && (
            <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
              <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
              <div className="px-5 py-3.5">
                <div className="rounded-lg p-3 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#B91C1C' }}>🔴 試用期間6ヶ月超（{trialCalc.months}ヶ月{trialCalc.days > 0 ? `${trialCalc.days}日` : ''}）</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>就業規則第13条の原則を超える試用期間です。担当営業は上長の了承を得た上で申請しています。</p>
                </div>
              </div>
            </div>
          )}
          <FinalRow label="変形労働時間制" value={f.flexTime || '―'}
            badge={csvSnapshot.flexTime ? <CsvBadge snapshotValue={csvSnapshot.flexTime} currentValue={f.flexTime} /> : undefined}
            oldValue={csvSnapshot.flexTime} />
          <FinalRow label="所定労働時間外労働" value={f.overtime || '―'}
            badge={csvSnapshot.overtime ? <CsvBadge snapshotValue={csvSnapshot.overtime} currentValue={f.overtime} /> : undefined}
            oldValue={csvSnapshot.overtime} />
        </FinalSection>

        {/* ===== STEP6：契約条件（パターンA・Cのみ） ===== */}
        {(pattern === 'A' || pattern === 'C') && (
          <FinalSection title="STEP6：契約条件" sub="契約書の締結方法と備考欄">
            <FinalRow label="締結パターン" value={
              (() => {
                const cp = CLOSING_PATTERNS.find(p => p.id === f.closingPattern)
                return cp ? `${cp.label}\n${cp.desc}` : '―'
              })()
            } multiline />
            <FinalRow label="備考欄" value={f.remarksText || f.bonusType
              ? (() => {
                const FIXED_REMARKS_SUFFIX = '上記以外の事項については、当社就業規則及び賃金規定による。手当はクライアント規定により支払うものとする。'
                if (pattern === 'C') {
                  if (contractType === '正社員' && f.bonusType === 'あり') return `賞与【有】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
                  if (contractType === '正社員' && f.bonusType === 'なし') return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
                  return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
                }
                if (contractType === '正社員' && f.bonusType === 'あり') return `賞与【有】、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
                if (contractType === '正社員' && f.bonusType === 'なし') return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
                return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${FIXED_REMARKS_SUFFIX}`
              })()
              : '―'
            } multiline />
          </FinalSection>
        )}

        {/* ===== STEP7：給与・保険（パターンA・Cのみ） ===== */}
        {(pattern === 'A' || pattern === 'C') && (
          <FinalSection title="STEP7：給与・保険" sub="給与の金額と加入する保険">
            <FinalGroupHeader label="賃金" />
            <FinalRow label="給与の種類" value={f.salaryType || '―'} />
            <FinalRow label="基本給" value={f.basicSalary ? `${parseAmount(f.basicSalary).toLocaleString()}円` : '―'} />
            {parseAmount(f.rolePay) > 0 && <FinalRow label="役職手当" value={`${parseAmount(f.rolePay).toLocaleString()}円`} />}
            {parseAmount(f.skillPay) > 0 && <FinalRow label="職能給" value={`${parseAmount(f.skillPay).toLocaleString()}円`} />}
            {parseAmount(f.salesPay) > 0 && <FinalRow label="営業手当" value={`${parseAmount(f.salesPay).toLocaleString()}円`} />}
            {parseAmount(f.overtimePay) > 0 && <FinalRow label="定額残業手当" value={`${parseAmount(f.overtimePay).toLocaleString()}円（${parseAmount(f.overtimeHours)}時間分）`} />}
            {parseAmount(f.housingPay) > 0 && <FinalRow label="住宅手当" value={`${parseAmount(f.housingPay).toLocaleString()}円`} />}
            <FinalRow label="合計支給額" value={`${salaryTotal.toLocaleString()}円`} />
            {/* 給与100万円超の警告（申請時点で確認済みの場合のみ） */}
            {salaryTotal > 1000000 && (
              <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
                <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
                <div className="px-5 py-3.5">
                  <div className="rounded-lg p-3 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                    <p className="text-xs font-bold mb-1" style={{ color: '#B91C1C' }}>🔴 合計支給額が100万円超（{salaryTotal.toLocaleString()}円）</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>担当営業は上長の了承を得た上で申請しています。入力誤りがないか念のためご確認ください。</p>
                  </div>
                </div>
              </div>
            )}

            <FinalGroupHeader label="交通費" />
            <FinalRow label="交通費区分" value={selectedTransport.label} />
            <FinalRow label="帳票プレビュー" value={selectedTransport.preview} multiline preview />

            <FinalGroupHeader label="各種保険" />
            <FinalRow label="労災保険" value="全員加入（自動）" badge={<span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'white', color: '#1B3A8C', border: '1px solid #1B3A8C' }}>マスタ情報反映</span>} />
            <FinalRow label="加入保険" value={
              [f.hasEmployInsurance && '雇用保険に加入する', f.hasSocialInsurance && '健康保険・厚生年金に加入する'].filter(Boolean).join(' / ') || '―'
            } />
            <FinalRow label="帳票プレビュー" value={insurancePreview} preview />
          </FinalSection>
        )}

        {/* ===== 承認・差し戻しエリア ===== */}
        {/* 2026-07-09修正：承認・差し戻し完了後のバナーは、以前は画面最上部に表示していたが、
            承認ボタンは画面最下部にあるため「ボタンを押した直後、下には何も表示されず
            結果を見るには一番上までスクロールし直す必要がある」のは不親切という指摘を受け
            （伊藤さん指摘）、ボタンがあったこのエリア自体に完了バナーを表示する形に変更した。
            以前は{'{'}!actionDone{'}'}でこのエリア自体を非表示にしていたが、常に表示したうえで
            中身をactionDoneの状態で出し分ける方式にする。 */}
        <div className="bg-white rounded-xl border shadow-sm p-6 mt-6" style={{ borderColor: '#D0DAF0' }}>
          {actionDone === 'approved' ? (
            <div className="rounded-xl p-5 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
              <p className="text-base font-bold mb-1" style={{ color: '#065F46' }}>✅ 承認しました</p>
              <p className="text-sm" style={{ color: '#065F46' }}>
                {(f.closingPattern === 'face' || f.closingPattern === 'print')
                  ? '担当営業のダッシュボードに「説明対応が必要」として表示されます。'
                  : contract.document_type === '就業条件明示書'
                  ? 'スタッフへ確認依頼が自動送信されます。'
                  : 'スタッフへ署名依頼が自動送信されます。'}
              </p>
              <button onClick={() => router.push(backPath)}
                className="mt-3 text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
                一覧に戻る
              </button>
            </div>
          ) : actionDone === 'rejected' ? (
            <div className="rounded-xl p-5 border-2" style={{ background: '#FEF2F2', borderColor: '#F87171' }}>
              <p className="text-base font-bold mb-1" style={{ color: '#B91C1C' }}>↩ 差し戻しました</p>
              <p className="text-sm" style={{ color: '#B91C1C' }}>担当営業へ差し戻し理由が通知されます。</p>
              <button onClick={() => router.push(backPath)}
                className="mt-3 text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
                一覧に戻る
              </button>
            </div>
          ) : isAlreadyProcessed ? (
              <p className="text-sm text-center" style={{ color: '#9CA3AF' }}>この申請は処理済みです（ステータス：{contract.status}）</p>
            ) : (
              <>
                <p className="text-sm font-bold mb-4 text-center" style={{ color: '#1A2340' }}>内容をご確認のうえ、どちらかを選んでください。</p>

                {actionError && (
                  <div className="rounded-lg p-3 mb-4 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                    <p className="text-sm" style={{ color: '#B91C1C' }}>{actionError}</p>
                  </div>
                )}

                {/* 差し戻しフォーム（展開式） */}
                {showRejectForm && (
                  <div className="rounded-xl p-4 mb-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#B91C1C' }}>↩ 差し戻し理由を入力してください</p>
                    <textarea
                      className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340', background: '#FFFFFF', minHeight: '100px', lineHeight: '1.6', resize: 'vertical' }}
                      placeholder="例：派遣期間の終了日が抵触日を超えています。再確認をお願いします。"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                    />
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={handleReject}
                        disabled={actionLoading || !rejectReason.trim()}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                        style={{ background: '#DC2626' }}>
                        {actionLoading ? '送信中...' : '差し戻す'}
                      </button>
                      <button
                        onClick={() => { setShowRejectForm(false); setRejectReason(''); setActionError('') }}
                        className="px-4 py-2.5 rounded-lg text-sm border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {/* 強制承認フォーム（展開式・2026-07-02追加：warning_level='red'の場合のみ表示される） */}
                {showForceApproveForm && (
                  <div className="rounded-xl p-4 mb-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#DC2626' }}>🔴 強制承認の理由を入力してください</p>
                    <p className="text-xs mb-2 leading-relaxed" style={{ color: '#1A2340' }}>
                      自動チェックで要確認の警告が出ていますが、内容を確認したうえで承認する場合は、理由を入力してください。
                    </p>
                    <textarea
                      className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340', background: '#FFFFFF', minHeight: '100px', lineHeight: '1.6', resize: 'vertical' }}
                      placeholder="例：クライアント特別対応のため、上長確認済みで金額に問題ないことを確認しました。"
                      value={forceApproveReason}
                      onChange={e => setForceApproveReason(e.target.value)}
                    />
                    {/* 総合レビュー指摘G対応（2026-07-16）：強制承認は取り消し不可の危険操作であることを
                        押す直前に明示し、誤クリックを防ぐ */}
                    <label className="mt-3 flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={forceApproveAcknowledged}
                        onChange={e => setForceApproveAcknowledged(e.target.checked)}
                      />
                      <span className="text-xs font-medium leading-relaxed" style={{ color: '#B91C1C' }}>
                        強制承認は取り消しできません。内容を確認のうえ実行することを理解しました。
                      </span>
                    </label>
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={handleForceApprove}
                        disabled={actionLoading || !forceApproveReason.trim() || !forceApproveAcknowledged}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                        style={{ background: '#DC2626' }}>
                        {actionLoading ? '処理中...' : '強制承認する（取り消し不可）'}
                      </button>
                      <button
                        onClick={() => { setShowForceApproveForm(false); setForceApproveReason(''); setForceApproveAcknowledged(false); setActionError('') }}
                        className="px-4 py-2.5 rounded-lg text-sm border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {/* 承認確認モーダル（warning_level が none / yellow の通常承認のみ） */}
                {showApproveConfirm && (
                  <div className="rounded-xl p-4 mb-4 border-2" style={{ background: '#ECFDF5', borderColor: '#34D399' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#065F46' }}>✅ 本当に承認してよいですか？</p>
                    <p className="text-sm mb-3 leading-relaxed" style={{ color: '#1A2340' }}>
                      承認すると、申請内容の変更はできません。内容に誤りがないか今一度ご確認ください。<br />
                      {(f.closingPattern === 'face' || f.closingPattern === 'print')
                        ? '承認後、担当営業のダッシュボードに「説明対応が必要」として表示されます。'
                        : contract.document_type === '就業条件明示書'
                        ? '承認後、スタッフへ確認依頼が自動送信されます。'
                        : '承認後、スタッフへ署名依頼が自動送信されます。'}
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
                        style={{ background: '#1B3A8C' }}>
                        {actionLoading ? '処理中...' : '承認する'}
                      </button>
                      <button
                        onClick={() => { setShowApproveConfirm(false); setActionError('') }}
                        className="px-4 py-2.5 rounded-lg text-sm border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {/* メインボタン（フォーム展開前のみ表示） */}
                {!showRejectForm && !showApproveConfirm && !showForceApproveForm && (
                  <>
                    {/* 総合レビュー指摘G対応（2026-07-16）：警告ありの案件では通常の「承認する」が
                        出ず「強制承認」しか無い理由が伝わらず戸惑うとの指摘に対応し、説明文を追加。
                        あわせて危険操作（強制承認）だけを赤にし、差し戻しはニュートラルな色に変えて
                        主副の区別をはっきりさせる */}
                    {isRedWarning && (
                      <p className="text-xs font-medium leading-relaxed mb-3 text-center" style={{ color: '#B91C1C' }}>
                        自動チェックで警告があるため、通常承認はできません。内容を確認のうえ、強制承認（理由必須）か差し戻しを選んでください。
                      </p>
                    )}
                  <div className="flex gap-4">
                    <button
                      onClick={() => { setShowRejectForm(true); setActionError('') }}
                      className="flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all"
                      style={isRedWarning
                        ? { color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }
                        : { color: '#DC2626', borderColor: '#DC2626', background: 'white' }}>
                      ↩ 差し戻す
                    </button>
                    {isRedWarning ? (
                      <button
                        onClick={() => { setShowForceApproveForm(true); setActionError('') }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all"
                        style={{ background: '#DC2626' }}>
                        🔴 強制承認する（理由入力必須）
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowApproveConfirm(true); setActionError('') }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all"
                        style={{ background: '#1B3A8C' }}>
                        ✅ 承認する
                      </button>
                    )}
                  </div>
                  </>
                )}
              </>
            )}
        </div>

      </main>
    </div>
  )
}
