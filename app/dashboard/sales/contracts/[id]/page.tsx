'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'

// ===== 型定義 =====

type DiffPart = { type: 'same' | 'removed' | 'added'; text: string }

type ContractDetail = {
  id: string
  staff_id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: string
  closing_pattern: string | null
  created_by_dept_no: number | null
  sign_requested_at: string | null
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
  rejection_reason: string | null
  rejected_by: string | null
  rejected_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string
  created_at: string
}

const SIGN_DEADLINE_DAYS = 7 // 署名期日＝通知から7日（初期値。将来アラート日数マスタで変更可能にする予定）

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
const formatDate = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

const CLOSING_PATTERNS = [
  { id: 'auto',  label: '指定しない',           desc: 'SSC承認が完了すると、システムが従業員へ確認用URLを自動送信します。' },
  { id: 'face',  label: '対面でその場説明',      desc: '担当営業が端末画面を見せながら説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。' },
  { id: 'print', label: '印刷して説明後にリンク送付', desc: '担当営業が印刷した資料を用いて説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。' },
]

const TRANSPORT_TYPES = [
  { id: 'default',  label: '実費または定期代（デフォルト）', preview: '実費または定期代(デフォルト)\n原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。' },
  { id: 'included', label: '交通費込',                      preview: '交通費込\n基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。' },
  { id: 'gas',      label: 'ガソリン代',                    preview: 'ガソリン代\n私有車通勤：ガソリン代支給　【 12円 / km 】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。' },
  { id: 'pass-gas', label: '定期代＋ガソリン代',             preview: '定期代＋ガソリン代\n定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km 】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③エビデンスの提出確認が取れない交通費は支払い対象外とする。⑤私有車通勤については別途私有車通勤を許可する書面を提出し、規定を遵守すること。' },
]

// ===== 差分表示ロジック（SSC確認画面と同じLCSアルゴリズム） =====

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
        style={{ background: preview ? '#EEF2FA' : 'white', color: '#1A2340', lineHeight: 1.7 }}>
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

// 警告ボックス（読み取り専用・チェックなし）
const WarningBox = ({ type, confirmedAt }: { type: string; confirmedAt: string }) => {
  const messages: Record<string, string> = {
    trial_over6months: '試用期間6ヶ月超の警告が出ていました。上長の了承を得た上で申請しています。',
    no_trial_period:   '正社員で試用期間「無し」の警告が出ていました。上長の了承を得た上で申請しています。',
    salary_over_1000000: '合計支給額が100万円超の警告が出ていました。上長の了承を得た上で申請しています。',
  }
  const message = messages[type] || `警告確認済み（種別：${type}）`
  return (
    <div className="rounded-lg p-4 border-2" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
      <p className="text-sm font-bold mb-1.5" style={{ color: '#DC2626' }}>🔴 確認済みの警告</p>
      <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>{message}</p>
      <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>確認日時：{formatDateTime(confirmedAt)}</p>
    </div>
  )
}

// ===== メインコンポーネント =====

export default function SalesContractDetail() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [user, setUser] = useState<any>(null)
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const init = async () => {
      // 認証チェック
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)

      if (!id) { setNotFound(true); setLoading(false); return }

      // ログインユーザーの所属部門NOを取得
      const { data: staffRow } = await supabase
        .from('staff')
        .select('dept_no')
        .eq('email', data.user.email)
        .limit(1)
        .maybeSingle()

      // 申請データ取得
      const { data: row, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single()

      // 自部門以外の申請は「見つかりません」扱い（自部門の全申請のみ閲覧可という方針のため）
      if (error || !row || !staffRow || row.created_by_dept_no !== staffRow.dept_no) {
        setNotFound(true); setLoading(false); return
      }
      setContract(row as ContractDetail)
      setLoading(false)
    }
    init()
  }, [id, router])

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
      <button onClick={() => router.push('/dashboard/sales')}
        className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: '#1B3A8C' }}>
        一覧に戻る
      </button>
    </div>
  )

  if (!contract) return null

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

  // 試用期間計算（警告表示用）
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

  // ステータスに応じた表示情報
  const statusBanner: Record<string, { bg: string; border: string; color: string; label: string }> = {
    '申請中':      { bg: '#EEF2FA', border: '#D0DAF0', color: '#1B3A8C', label: '📤 申請中（SSCの確認待ちです）' },
    'SSC承認済み':  { bg: '#ECFDF5', border: '#34D399', color: '#065F46', label: `✅ SSC承認済み（${formatDateTime(contract.approved_at)}）` },
    '差し戻し中':  { bg: '#FEF2F2', border: '#F87171', color: '#B91C1C', label: `↩ 差し戻し中（${formatDateTime(contract.rejected_at)}）` },
    '署名待ち':    { bg: '#FFFBEB', border: '#FBBF24', color: '#92400E', label: '✍️ 署名待ち（従業員の署名確認待ちです）' },
    '署名済み':    { bg: '#EEF2FA', border: '#818CF8', color: '#3730A3', label: '📝 署名済み' },
    '完了':        { bg: '#F3F4F6', border: '#D1D5DB', color: '#374151', label: '🎉 完了' },
    '取り下げ':    { bg: '#F3F4F6', border: '#D1D5DB', color: '#6B7280', label: '取り下げ' },
  }
  const banner = statusBanner[contract.status] || { bg: '#EEF2FA', border: '#D0DAF0', color: '#1B3A8C', label: `ステータス：${contract.status}` }

  // 署名期日の計算（署名待ちのみ）
  let signInfo: { notified: string; deadline: string; toneColor: string; toneBg: string; statusLabel: string } | null = null
  if (contract.status === '署名待ち' && contract.sign_requested_at) {
    const notified = new Date(contract.sign_requested_at)
    const deadline = new Date(notified.getTime() + SIGN_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const deadlineDay = new Date(deadline); deadlineDay.setHours(0, 0, 0, 0)
    const remain = Math.floor((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const overdue = remain < 0
    const urgent = !overdue && remain <= 2
    let tone = { bg: '#EEF2FA', color: '#1B3A8C', label: `期日まで残り${remain}日` }
    if (overdue) tone = { bg: '#FEE2E2', color: '#B91C1C', label: `期日を${Math.abs(remain)}日超過しています` }
    else if (urgent) tone = { bg: '#FFF7ED', color: '#C2410C', label: `期日まで残り${remain}日` }
    signInfo = {
      notified: formatDateTime(contract.sign_requested_at),
      deadline: formatDate(deadline),
      toneColor: tone.color,
      toneBg: tone.bg,
      statusLabel: tone.label,
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>申請詳細（担当営業）</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard/sales')}
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

        {/* ステータスバナー */}
        <div className="rounded-xl p-4 mb-6 border" style={{ background: banner.bg, borderColor: banner.border }}>
          <p className="text-sm font-bold" style={{ color: banner.color }}>{banner.label}</p>
          {contract.status === '差し戻し中' && contract.rejection_reason && (
            <p className="text-sm mt-1 leading-relaxed" style={{ color: '#1A2340' }}>差し戻し理由：{contract.rejection_reason}</p>
          )}
          {contract.status === '差し戻し中' && (
            <button
              onClick={() => router.push(`/apply?edit=${contract.id}`)}
              className="mt-3 text-sm px-4 py-2 rounded-lg font-bold text-white transition-all"
              style={{ background: '#B91C1C' }}>
              ↩ 再申請する
            </button>
          )}
        </div>

        {/* 署名待ちの詳細情報（通知日時・署名期日） */}
        {contract.status === '署名待ち' && (
          <div className="bg-white rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
            <div className="px-5 py-3" style={{ background: '#92400E' }}>
              <p className="text-sm font-bold text-white">署名状況</p>
            </div>
            <div className="p-5">
              {signInfo ? (
                <div className="flex items-center gap-8 flex-wrap">
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>従業員へ通知した日時</p>
                    <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{signInfo.notified}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>署名期日</p>
                    <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{signInfo.deadline}</p>
                  </div>
                  <div className="px-3 py-2 rounded-lg" style={{ background: signInfo.toneBg }}>
                    <p className="text-sm font-bold" style={{ color: signInfo.toneColor }}>{signInfo.statusLabel}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#5A6A8A' }}>通知日時の記録がまだありません。</p>
              )}
            </div>
          </div>
        )}

        {/* 署名済みの場合：PDF表示ボタン（準備中） */}
        {contract.status === '署名済み' && (
          <div className="bg-white rounded-xl border shadow-sm mb-6 p-5 flex items-center justify-between" style={{ borderColor: '#D0DAF0' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>署名済み帳票（PDF）</p>
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>この機能は準備中です。スタッフ署名機能の実装後に利用可能になります。</p>
            </div>
            <button disabled
              className="text-sm px-4 py-2 rounded-lg font-medium cursor-not-allowed"
              style={{ background: '#F3F4F6', color: '#9CA3AF' }}>
              PDFを表示（準備中）
            </button>
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
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>所属部門</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>{staffSnap.department || '―'}</div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>書類種別</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>{contract.document_type}</div>
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
              <div className="px-4 py-3 text-xs font-medium" style={{ background: '#EEF2FA', color: '#5A6A8A' }}>入力方法</div>
              <div className="px-4 py-3 text-sm" style={{ color: '#1A2340' }}>
                {csvMode === 'csv' ? `CSVデータから自動入力（${csvSystem}）` : '手動入力'}
              </div>
            </div>
          </div>
        </div>

        {/* 警告確認ボックス */}
        {contract.warning_confirmations && contract.warning_confirmations.length > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>⚠️ 確認済みの警告（上長承認済み）</p>
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
          {f.trialPeriod === '有' && trialCalc?.over6 && (
            <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
              <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
              <div className="px-5 py-3.5">
                <div className="rounded-lg p-3 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#B91C1C' }}>🔴 試用期間6ヶ月超（{trialCalc.months}ヶ月{trialCalc.days > 0 ? `${trialCalc.days}日` : ''}）</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>就業規則第13条の原則を超える試用期間です。上長の了承を得た上で申請しています。</p>
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
            {salaryTotal > 1000000 && (
              <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
                <div className="border-r" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }} />
                <div className="px-5 py-3.5">
                  <div className="rounded-lg p-3 border" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                    <p className="text-xs font-bold mb-1" style={{ color: '#B91C1C' }}>🔴 合計支給額が100万円超（{salaryTotal.toLocaleString()}円）</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>上長の了承を得た上で申請しています。入力誤りがないか念のためご確認ください。</p>
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

      </main>
    </div>
  )
}
