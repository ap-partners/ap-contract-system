// ===== ダッシュボード共通：契約カード表示ヘルパー =====
// 2026-07-14追加。従来、担当営業・SSC・管理部の3ダッシュボード（app/dashboard/sales/page.tsx・
// app/dashboard/ssc/page.tsx・app/dashboard/admin/page.tsx）にほぼ同一の実装が個別にコピーされて
// いた（バッジ・日付フォーマット・警告判定・期日アラート等）。過去に「社内案件でもSSC表記が出る」
// バグが3ファイルに同じ根本原因が重複していたために起きた（docs/SYSTEM_DESIGN.md 10章
// 2026-07-13参照）のと同じ構造の不具合を防ぐため、共通化した（伊藤さんの了承・2026-07-14決定）。
// 各ダッシュボードはこのファイルの関数・コンポーネントを import して使う。

export type ContractStatus = '申請中' | 'SSC承認済み' | '差し戻し中' | '署名待ち' | '署名済み' | '完了' | '取り下げ'
export type WarningLevel = 'none' | 'yellow' | 'red'

export type ContractForDisplay = {
  id: string
  pattern: string
  contract_type: string
  document_type: string
  work_place: string
  status: ContractStatus
  created_by: string
  created_by_name?: string | null
  created_at: string
  rejection_reason: string | null
  signed_at: string | null
  warning_confirmations?: { type: string; confirmed_at: string }[]
  warning_level?: WarningLevel
  input_data: {
    staff?: {
      name?: string
      employee_number?: string
      department?: string
    }
    fields?: {
      contractType?: string
      workPlace?: string
      workLocationName?: string
      employStart?: string
      employEnd?: string
      contractStartDate?: string
      dispatchStart?: string
      dispatchEnd?: string
      period?: string
      closingPattern?: string
    }
  }
}

// 日時を「YYYY/MM/DD HH:mm」形式に変換
export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 日付のみ「YYYY/MM/DD」形式に変換
export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '―'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 帳票種別の省略表示
export const getDocumentLabel = (documentType: string, pattern: string) => {
  if (pattern === 'C') return '雇用契約書＋明示書'
  if (pattern === 'B') return '明示書'
  return '雇用契約書'
}

// 雇用形態バッジ
export const ContractTypeBadge = ({ contractType, workPlace }: { contractType: string; workPlace: string }) => {
  const isInternal = workPlace === '社内'
  if (isInternal) {
    const map: Record<string, { bg: string; color: string }> = {
      '正社員':   { bg: '#EEF2FA', color: '#1B3A8C' },
      '有期契約': { bg: '#EEF2FA', color: '#1B3A8C' },
      '無期契約': { bg: '#EEF2FA', color: '#1B3A8C' },
    }
    const c = map[contractType] || { bg: '#EEF2FA', color: '#1B3A8C' }
    return <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: c.bg, color: c.color }}>{contractType || '―'}</span>
  }
  const map: Record<string, { bg: string; color: string }> = {
    '正社員':   { bg: '#ECFDF5', color: '#15803D' },
    '有期契約': { bg: '#ECFDF5', color: '#15803D' },
    '無期契約': { bg: '#ECFDF5', color: '#15803D' },
    'アルバイト': { bg: '#FFF7ED', color: '#C2410C' },
  }
  const c = map[contractType] || { bg: '#F3F4F6', color: '#6B7280' }
  return <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: c.bg, color: c.color }}>{contractType || '―'}</span>
}

// 就業場所区分バッジ
export const WorkPlaceBadge = ({ workPlace }: { workPlace: string }) => {
  const isInternal = workPlace === '社内'
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded"
      style={{ background: isInternal ? '#EEF2FA' : '#ECFDF5', color: isInternal ? '#1B3A8C' : '#15803D' }}>
      {workPlace || '現場'}
    </span>
  )
}

// ステータスバッジ（塗りつぶし）。isInternal=trueの場合「SSC承認済み」を「承認済み」と表示する
// （2026-07-13決定：内部値`SSC承認済み`自体は変更せず、社内案件の表示ラベルのみ出し分ける）。
// overrideLabelを渡すと、ステータスに関わらずそのラベルで表示する（担当営業ダッシュボードの
// 「要説明」案件で「説明対応が必要」と表示する用途など。2026-07-14追加）。
export const ContractStatusBadge = ({ status, isInternal, overrideLabel }: { status: ContractStatus; isInternal?: boolean; overrideLabel?: string }) => {
  const map: Record<string, { bg: string; label: string }> = {
    '申請中':     { bg: '#1D4ED8', label: '申請中' },
    'SSC承認済み': { bg: '#065F46', label: isInternal ? '承認済み' : 'SSC承認済み' },
    '差し戻し中': { bg: '#B91C1C', label: '差し戻し中' },
    '署名待ち':   { bg: '#92400E', label: '署名待ち' },
    '署名済み':   { bg: '#3730A3', label: '署名済み' },
    '完了':       { bg: '#374151', label: '完了' },
    '取り下げ':   { bg: '#9CA3AF', label: '取り下げ' },
  }
  const s = map[status] || { bg: '#9CA3AF', label: status }
  return (
    <span className="text-xs font-medium px-2.5 py-0.5 rounded whitespace-nowrap" style={{ background: s.bg, color: 'white' }}>
      {overrideLabel || s.label}
    </span>
  )
}

// 確認済みバッジ（署名済み／完了の案件に、いつ従業員が確認・署名したかを表示）
export const ConfirmedBadge = ({ signedAt }: { signedAt: string | null }) => {
  if (!signedAt) return null
  return (
    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded whitespace-nowrap" style={{ background: '#D1FAE5', color: '#065F46' }}>
      ✓ 確認済み：{formatDateTime(signedAt)}
    </span>
  )
}

// 期日アラートの判定（雇用開始日ベース）
export const getDeadlineAlert = (contract: ContractForDisplay): { type: 'overdue' | 'urgent' | null; label: string } => {
  const f = contract.input_data?.fields
  if (!f) return { type: null, label: '' }

  const startDate = f.employStart || f.contractStartDate || f.dispatchStart
  if (!startDate) return { type: null, label: '' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { type: 'overdue', label: '開始日超過' }
  if (diffDays <= 3) return { type: 'urgent', label: `開始まで${diffDays}日` }
  return { type: null, label: '' }
}

// 警告ありかどうかの判定（担当営業がSTEP8で確認・申告した警告）
export const hasWarning = (contract: ContractForDisplay): boolean => {
  return !!contract.warning_confirmations && contract.warning_confirmations.length > 0
}

// 自動チェックの警告ありかどうかの判定
export const hasAutoCheckWarning = (contract: ContractForDisplay): boolean => {
  return !!contract.warning_level && contract.warning_level !== 'none'
}

// 雇用期間の表示文字列
export const getEmployPeriodLabel = (contract: ContractForDisplay): string => {
  const f = contract.input_data?.fields
  if (!f) return '―'
  const contractType = f.contractType || ''
  const isSeishain = contractType === '正社員'
  const isMusei = contractType === '無期契約' || f.period === '無期'
  if (isSeishain || isMusei) {
    return f.contractStartDate ? `${f.contractStartDate} 〜 期間の定めなし` : '―'
  }
  if (f.employStart && f.employEnd) return `${f.employStart} 〜 ${f.employEnd}`
  return '―'
}
