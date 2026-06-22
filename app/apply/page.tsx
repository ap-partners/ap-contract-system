'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const getDocumentTypes = (workPlace: string) => {
  if (workPlace === '社内') return [{ value: '雇用契約書', pattern: 'A', step: '6STEP' }]
  return [
    { value: '雇用契約書', pattern: 'A', step: '6STEP' },
    { value: '就業条件明示書', pattern: 'B', step: '6STEP・給与記載なし' },
    { value: '雇用契約書 兼\n就業条件明示書', pattern: 'C', step: '8STEP' },
  ]
}

const getFullDocumentName = (docType: string, contractType: string) => {
  if (!docType || !contractType) return ''
  const cleanDocType = docType.replace('\n', ' ')
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : ''
  return period ? `${cleanDocType}（${period}）` : cleanDocType
}

const getPattern = (docType: string) => {
  const clean = docType.replace('\n', ' ')
  if (clean === '雇用契約書') return 'A'
  if (clean === '就業条件明示書') return 'B'
  if (clean === '雇用契約書 兼 就業条件明示書') return 'C'
  return ''
}

const STEPS_A = ['基本情報', '就業先情報', '期間・労働条件', '契約条件', '給与・保険', '最終確認']
const STEPS_B = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '最終確認']
const STEPS_C = ['基本情報', '就業先情報', '派遣先担当者', '派遣元担当者', '期間・労働条件', '契約条件', '給与・保険', '最終確認']

const STEP_SUB: Record<string, string> = {
  '基本情報': '契約するスタッフと書類の種類を選びます',
  '就業先情報': '就業場所・業務内容・労働時間を入力します',
  '派遣先担当者': '派遣先の担当者情報を入力します',
  '派遣元担当者': '自社の担当者情報を確認・修正します',
  '期間・労働条件': '雇用期間・派遣期間・残業の有無を入力します',
  '契約条件': '契約書の締結方法と備考欄の内容を選びます',
  '給与・保険': '給与の金額と加入する保険を入力します',
  '最終確認': '入力内容を確認して申請します',
}

const STEP_DESC: Record<string, string> = {
  '基本情報': '契約書を発行するスタッフを検索して選択します。次に雇用の種類（有期・無期・正社員）と、発行する書類の種類を選んでください。',
  '就業先情報': 'スタッフが働く場所の情報と、業務内容・労働時間を入力します。派遣管理システム（e-staffing・HRstation・winworks・Staffia）に該当するスタッフがいる場合は「CSVデータから自動入力」を選ぶと、就業先などの個別契約情報が自動で反映されます。該当しない場合は「手動で入力する」を選んでください。',
  '派遣先担当者': '派遣先企業の担当者（指揮命令者・派遣先責任者・苦情処理申出先）の部署・役職・氏名・電話番号を入力します。派遣先に確認してから入力してください。',
  '派遣元担当者': '自社（APパートナーズ）の担当者情報がマスタから自動で入力されています。内容を確認し、異なる場合は修正してください。',
  '期間・労働条件': '派遣期間（開始日・終了日）と雇用契約の期間・試用期間を入力します。また、残業の有無と変形労働時間制の有無を選択してください。',
  '契約条件': 'スタッフへの契約書の説明方法（対面・印刷・自動送信）を選択します。また、賞与・退職手当・昇給に関する備考欄の文言を選んでください。',
  '給与・保険': '基本給や各種手当の金額、交通費の支給方法を入力します。また、雇用保険・健康保険・厚生年金への加入有無を選択してください。',
  '最終確認': 'これまでに入力した内容をすべて確認できます。内容に問題がなければ「申請する」ボタンを押してください。申請後はSSCが内容を確認します。',
}

const DEFAULT_SAFETY = '派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。'
const DEFAULT_CONFLICT = '派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。'

const CLOSING_PATTERNS = [
  {
    id: 'auto',
    label: '指定しない',
    desc: 'SSC承認が完了すると、システムが従業員へ確認用URLを自動送信します。',
    icon: '/icons/pattern-auto.png',
  },
  {
    id: 'face',
    label: '対面でその場説明',
    desc: '担当営業が端末画面を見せながら説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。',
    icon: '/icons/pattern-face.png',
  },
  {
    id: 'print',
    label: '印刷して説明後にリンク送付',
    desc: '担当営業が印刷した資料を用いて説明し、「説明完了」を押すと従業員へ確認用URLが自動送信されます。',
    icon: '/icons/pattern-print.png',
  },
]

const FIXED_REMARKS_SUFFIX = '上記以外の事項については、当社就業規則及び賃金規定による。手当はクライアント規定により支払うものとする。'

// 備考文言の自動決定ロジック（法務確認済み）
const getRemarksText = (pattern: string, contractType: string, bonusType: string): string => {
  const suffix = FIXED_REMARKS_SUFFIX
  if (pattern === 'B') return ''
  const isSeishain = contractType === '正社員'
  const isKeiyaku = contractType === '有期契約' || contractType === '無期契約'

  if (pattern === 'C') {
    if (isKeiyaku) return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'あり') return `賞与【有】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'なし') return `賞与【無】、退職手当【有】(退職手当前払い制度)、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
  }
  if (pattern === 'A') {
    if (isKeiyaku) return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'あり') return `賞与【有】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
    if (isSeishain && bonusType === 'なし') return `賞与【無】、昇給【無】(契約更新時に改定する場合がある。)\n${suffix}`
  }
  return suffix
}

const needsBonusSelection = (pattern: string, contractType: string): boolean => {
  return contractType === '正社員' && (pattern === 'A' || pattern === 'C')
}

// STEP7：交通費区分
const TRANSPORT_TYPES = [
  {
    id: 'default',
    label: '実費または定期代（デフォルト）',
    icon: '/icons/transport-pass.png',
    preview: '実費または定期代(デフォルト)\n原則として定期代支給　①最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③交通費明細書及び定期ICカードの写し（エビデンス）が必要。ICカードは各自で用意。④エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
  {
    id: 'included',
    label: '交通費込',
    icon: '/icons/transport-included.png',
    preview: '交通費込\n基本給に含む。但し、業務交通費については定期区間外のみ実費支給とする。※定期区間とは、自宅～就業場所までの最適経路とする。',
  },
  {
    id: 'gas',
    label: 'ガソリン代',
    icon: '/icons/transport-gas.png',
    preview: 'ガソリン代\n私有車通勤：ガソリン代支給　【 12円 / km 】\n①別途私有車通勤を許可する書面を提出し、規定を遵守すること。②その他上記以外の業務交通費については実費支給とする。③実費支給の場合、エビデンスの提出確認が取れない交通費は、支払い対象外とする。',
  },
  {
    id: 'pass-gas',
    label: '定期代＋ガソリン代',
    icon: '/icons/transport-pass-gas.png',
    preview: '定期代＋ガソリン代\n定期代支給およびガソリン代支給【私有車通勤(最寄り駅まで) 12円 / km 】　①定期代については最寄駅から勤務先までの最安経路での定期代とする。②支払上限は3万円/月とする。③エビデンスの提出確認が取れない交通費は支払い対象外とする。⑤私有車通勤については別途私有車通勤を許可する書面を提出し、規定を遵守すること。',
  },
]

const SALARY_RULES: Record<string, { min: number; max: number }> = {
  '時給': { min: 1000,   max: 9999    },
  '日給': { min: 1000,   max: 79999   },
  '月給': { min: 100000, max: 2999999 },
}

const TOOLTIPS: Record<string, string> = {
  '変形労働時間制': '毎日同じ時間働くのではなく、忙しい日は長く・暇な日は短くなど、期間全体で帳尻を合わせる働き方です。シフト制の職場などで使われます。',
  '所定労働時間外労働': '定められた就業時間を超えて働く「残業」があるかどうかです。「有」の場合は残業代が発生します。',
  '抵触日（事業所単位）': '同じ派遣先の会社（事業所）に派遣できる期限のことです。原則この日を超えると、その会社への派遣ができなくなります。派遣先に確認して入力してください。',
  '抵触日（組織単位）': '同じ派遣先の同じ部署に、同じスタッフを派遣できる期限のことです。事業所単位の抵触日より前の日付になります。派遣先に確認して入力してください。',
  '業務に伴う責任の程度': 'このスタッフが他のスタッフへの指示・管理などリーダー的な役割を担うかどうかです。派遣先との個別契約の内容を確認の上、選択してください。',
}

const inp = "bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 w-full"

const deptInputStyle = {
  borderColor: '#D0DAF0',
  color: '#1A2340',
  wordBreak: 'break-all' as const,
  overflowWrap: 'break-word' as const,
  whiteSpace: 'normal' as const,
  lineHeight: '1.6',
}

const normalizeTel = (v: string) => v
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/ー|－|―/g, '-')
  .replace(/[^0-9-]/g, '')

const validateTel = (v: string) => {
  const digits = v.replace(/-/g, '')
  if (digits.length === 0) return null
  if (!/^\d+$/.test(digits)) return '数字と-のみ入力できます'
  if (digits.length < 10 || digits.length > 11) return '10〜11桁で入力してください'
  if (!/^\d{2,4}-\d{2,4}-\d{4}$/.test(v)) return '例）03-1234-5678 の形式で入力してください'
  return null
}

const calcTrialMonths = (start: string, end: string) => {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (e <= s) return null
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const dayDiff = e.getDate() - s.getDate()
  if (dayDiff < 0) months--
  const days = dayDiff < 0 ? new Date(e.getFullYear(), e.getMonth(), 0).getDate() + dayDiff : dayDiff
  return { months, days, over6: months > 6 || (months === 6 && days > 0) }
}

const toJpDate = (dateStr: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const isPastDate = (dateStr: string) => {
  if (!dateStr) return false
  // dateStr は "YYYY-MM-DD" 形式。ローカル日付として解釈し、UTC起点のズレを防ぐ
  const [y, m, d] = dateStr.split('-').map(Number)
  const inputDate = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return inputDate < today
}

// 全角数字を半角に変換（全角混在の入力ミスを防ぐ）
const toHalfWidthDigits = (str: string) =>
  (str || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))

const parseAmount = (str: string) =>
  parseInt(toHalfWidthDigits(str || '0').replace(/,/g, ''), 10) || 0

const Req = () => (
  <span className="text-xs px-1.5 py-0.5 rounded ml-1 leading-none shrink-0"
    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
)

const AutoBadge = ({ modified }: { modified?: boolean } = {}) => (
  modified ? (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'white', color: '#D97706', border: '1px solid #D97706' }}>マスタ情報反映（修正済み）</span>
  ) : (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'white', color: '#1B3A8C', border: '1px solid #1B3A8C' }}>マスタ情報反映</span>
  )
)

const Tooltip = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1 shrink-0">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer shrink-0"
        style={{ background: '#F97316', color: 'white', fontSize: '10px', fontWeight: 600 }}>
        ?
      </span>
      {show && (
        <span className="absolute left-6 top-0 z-50 rounded-lg px-3 py-2 text-xs shadow-lg w-64"
          style={{ background: '#1A2340', color: 'white', lineHeight: '1.6' }}>
          {text}
        </span>
      )}
    </span>
  )
}

const FormRow = ({ label, required, tooltip, badge, children }: {
  label: string; required?: boolean; tooltip?: string; badge?: React.ReactNode; children: React.ReactNode
}) => (
  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
    <div className="border-r border-b px-4 py-4 flex items-center flex-wrap gap-1"
      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
      <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
      {required && <Req />}
      {tooltip && <Tooltip text={tooltip} />}
      {badge}
    </div>
    <div className="border-b px-5 py-4 flex flex-col gap-3"
      style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
      {children}
    </div>
  </div>
)

const FormRowAuto = ({ label, modified, children }: { label: string; modified?: boolean; children: React.ReactNode }) => (
  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
    <div className="border-r border-b px-4 py-4 flex flex-col items-start gap-1.5"
      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
      <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
      <AutoBadge modified={modified} />
    </div>
    <div className="border-b px-5 py-4 flex items-center"
      style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
      {children}
    </div>
  </div>
)

const SectionHeader = ({ label }: { label: string }) => (
  <>
    <div style={{ height: '12px', background: '#F5F7FC' }} />
    <div className="px-5 py-2.5 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
      <p className="text-sm font-medium text-white">▼ {label}</p>
    </div>
  </>
)

// ===== STEP8：最終確認用コンポーネント =====
const FinalSection = ({ id, title, sub, collapsed, setCollapsed, onEdit, editLabel, children }: {
  id: string; title: string; sub: string
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  onEdit: () => void; editLabel: string; children: React.ReactNode
}) => {
  const isCollapsed = !!collapsed[id]
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-3" style={{ borderColor: '#D0DAF0' }}>
      <div className="px-5 py-2.5 flex items-center justify-between cursor-pointer" style={{ background: '#1B3A8C' }}
        onClick={() => setCollapsed({ ...collapsed, [id]: !isCollapsed })}>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-white">{title}</span>
          <span className="text-xs" style={{ color: '#A8C0E8' }}>{sub}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit() }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#F97316' }}>
            {editLabel}
          </button>
          <span className="text-xs transition-transform" style={{ color: 'rgba(255,255,255,0.6)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
      </div>
      {!isCollapsed && <div>{children}</div>}
    </div>
  )
}

const FinalGroupHeader = ({ label }: { label: string }) => (
  <>
    <div style={{ height: '10px', background: '#F5F7FC' }} />
    <div className="px-5 py-2 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
      <p className="text-xs font-medium text-white">▼ {label}</p>
    </div>
  </>
)

const FinalRow = ({ label, value, badge, multiline, preview, highlight }: {
  label: string; value: string; badge?: React.ReactNode; multiline?: boolean; preview?: boolean; highlight?: string
}) => (
  <div className="grid border-b" style={{ gridTemplateColumns: '260px 1fr', borderColor: '#D0DAF0' }}>
    <div className="border-r px-4 py-3.5 flex flex-col items-start gap-1.5" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
      <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
      {badge}
    </div>
    <div className={`px-5 py-3.5 text-sm ${multiline ? 'whitespace-pre-line' : 'flex items-center'}`}
      style={{ background: preview ? '#EEF2FA' : 'white', color: '#1A2340', lineHeight: 1.7, borderRadius: preview ? '8px' : 0, margin: preview ? '6px 12px' : 0 }}>
      {value}
      {highlight && <p className="text-sm font-bold mt-2" style={{ color: '#0D9488' }}>{highlight}</p>}
    </div>
  </div>
)

const ModeToggle = ({ mode, onChange }: { mode: 'default' | 'new'; onChange: (m: 'default' | 'new') => void }) => (
  <div className="flex gap-2">
    {(['default', 'new'] as const).map(m => (
      <button key={m} onClick={e => { e.preventDefault(); onChange(m) }}
        className="text-xs px-3 py-1.5 rounded-lg border transition-all"
        style={{
          background: mode === m ? '#1B3A8C' : 'white',
          color: mode === m ? 'white' : '#5A6A8A',
          borderColor: mode === m ? '#1B3A8C' : '#D0DAF0',
        }}>
        {m === 'default' ? 'デフォルトを使用' : '新規作成'}
      </button>
    ))}
  </div>
)

const NoBreakTextarea = ({ value, onChange, placeholder, minHeight = '60px', bg = 'white' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: string; bg?: string
}) => (
  <textarea
    className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none"
    style={{ borderColor: '#D0DAF0', color: '#1A2340', background: bg, minHeight, lineHeight: '1.6', resize: 'vertical' }}
    value={value}
    onChange={e => onChange(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
    placeholder={placeholder}
  />
)

const TelInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [touched, setTouched] = useState(false)
  const error = touched ? validateTel(value) : null
  return (
    <div className="max-w-xs">
      <input type="tel" inputMode="numeric" className={inp}
        style={{ borderColor: error ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
        value={value}
        onChange={e => onChange(normalizeTel(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder="例）03-1234-5678" />
      {error && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  )
}

const RadioGroup = ({ name, value, onChange }: {
  name: string; value: string; onChange: (v: string) => void
}) => (
  <div className="flex gap-4">
    {['無', '有'].map(v => (
      <label key={v} className="flex items-center gap-2 cursor-pointer">
        <input type="radio" checked={value === v} onChange={() => onChange(v)}
          className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
        <span className="text-sm" style={{ color: '#1A2340' }}>{v}</span>
      </label>
    ))}
  </div>
)

const CriticalWarning = ({ message, checked, onCheck }: {
  message: string; checked: boolean; onCheck: (v: boolean) => void
}) => (
  <div className="rounded-lg p-4 border-2 mt-3" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
    <p className="text-sm font-bold mb-2" style={{ color: '#DC2626' }}>🔴 最重要警告</p>
    <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#1A2340' }}>{message}</p>
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)}
        className="w-4 h-4" style={{ accentColor: '#DC2626' }} />
      <span className="text-sm font-medium" style={{ color: '#DC2626' }}>
        上記の警告内容について、上長の了承を得ています。
      </span>
    </label>
  </div>
)

function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [localQuery, setLocalQuery] = useState('')
  const [localSearching, setLocalSearching] = useState(false)
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    setLocalSearching(true)
    await onSearch(localQuery)
    setLocalSearching(false)
  }
  return (
    <div className="max-w-md">
      <div className="flex gap-2">
        <input type="text" value={localQuery}
          onChange={e => setLocalQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleClick(e as any) }}
          className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
          placeholder="社員番号または氏名で検索（例：100001）" autoComplete="off" />
        <button onClick={handleClick} disabled={localSearching}
          className="text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap shrink-0"
          style={{ background: localSearching ? '#A8C0E8' : '#1B3A8C' }}>
          {localSearching ? '検索中...' : '検索'}
        </button>
      </div>
      <p className="text-xs mt-1.5" style={{ color: '#5A6A8A' }}>氏名はスペースなしでも検索できます</p>
    </div>
  )
}

export default function ApplyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [contractType, setContractType] = useState('')
  const [workPlace, setWorkPlace] = useState('現場')
  const [documentType, setDocumentType] = useState('')

  const pattern = getPattern(documentType)
  const period = contractType === '有期契約' ? '有期' : contractType === '無期契約' ? '無期' : ''
  // 抵触日が不要な雇用区分（無期雇用派遣・正社員は「該当しない」扱い）
  const isConflictDateExempt = contractType === '無期契約' || contractType === '正社員'
  const fullDocumentName = getFullDocumentName(documentType, contractType)
  const steps = pattern === 'A' ? STEPS_A : pattern === 'B' ? STEPS_B : pattern === 'C' ? STEPS_C : STEPS_A

  // STEP2
  const [showStepDesc, setShowStepDesc] = useState(false)
  const [csvMode, setCsvMode] = useState<'csv' | 'manual'>('manual')
  const [csvSystem, setCsvSystem] = useState('e-staffing')
  const [csvDispatchStart, setCsvDispatchStart] = useState('')
  const [csvSearched, setCsvSearched] = useState(false)
  const [csvResults, setCsvResults] = useState<any[]>([])
  const [csvNoResults, setCsvNoResults] = useState(false)
  const [csvSelectedId, setCsvSelectedId] = useState<number | null>(null)
  const [csvRequestSent, setCsvRequestSent] = useState(false)
  const [csvRequestFormOpen, setCsvRequestFormOpen] = useState(false)
  const [csvRequestLocationName, setCsvRequestLocationName] = useState('')
  const [workLocationName, setWorkLocationName] = useState('')
  const [workLocationAddress, setWorkLocationAddress] = useState('')
  const [workLocationTel, setWorkLocationTel] = useState('')
  const [businessContent, setBusinessContent] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isShift, setIsShift] = useState(false)
  const [breakTime, setBreakTime] = useState('')
  const [workingHoursH, setWorkingHoursH] = useState('')
  const [workingHoursM, setWorkingHoursM] = useState('')
  const [workDays, setWorkDays] = useState('')
  const [workDaysOther, setWorkDaysOther] = useState('')
  const [organizationUnit, setOrganizationUnit] = useState('')
  const [conflictDate, setConflictDate] = useState('')
  const [responsibility, setResponsibility] = useState('')
  // CSV反映バッジ管理
  const [csvBadges, setCsvBadges] = useState<Record<string, 'none' | 'reflected' | 'modified'>>({})

  // STEP3
  const [cmd_dept, setCmdDept] = useState('')
  const [cmd_role, setCmdRole] = useState('')
  const [cmd_name, setCmdName] = useState('')
  const [cmd_tel, setCmdTel] = useState('')
  const [resp_dept, setRespDept] = useState('')
  const [resp_role, setRespRole] = useState('')
  const [resp_name, setRespName] = useState('')
  const [resp_tel, setRespTel] = useState('')
  const [comp_dept, setCompDept] = useState('')
  const [comp_role, setCompRole] = useState('')
  const [comp_name, setCompName] = useState('')
  const [comp_tel, setCompTel] = useState('')
  const [welfare, setWelfare] = useState('')
  const [safetyMode, setSafetyMode] = useState<'default' | 'new'>('default')
  const [safetyText, setSafetyText] = useState(DEFAULT_SAFETY)
  const [conflictMode, setConflictMode] = useState<'default' | 'new'>('default')
  const [conflictText, setConflictText] = useState(DEFAULT_CONFLICT)

  // STEP4
  const [mgr_dept, setMgrDept] = useState('')
  const [mgr_role, setMgrRole] = useState('')
  const [mgr_name, setMgrName] = useState('')
  const [mgr_tel, setMgrTel] = useState('')
  const [cmp_dept, setCmpDept] = useState('')
  const [cmp_role, setCmpRole] = useState('')
  const [cmp_name, setCmpName] = useState('')
  const [cmp_tel, setCmpTel] = useState('')
  // マスタ取得時の初期値スナップショット（修正済みバッジ判定用）
  const [masterSnapshot, setMasterSnapshot] = useState<Record<string, string>>({})

  // STEP5
  const [dispatchStart, setDispatchStart] = useState('')
  const [dispatchEnd, setDispatchEnd] = useState('')
  const [conflictDateOrg, setConflictDateOrg] = useState('')
  const [employStart, setEmployStart] = useState('')
  const [employEnd, setEmployEnd] = useState('')
  const [contractStartDate, setContractStartDate] = useState('')
  const [trialPeriod, setTrialPeriod] = useState('')
  const [trialStart, setTrialStart] = useState('')
  const [trialEnd, setTrialEnd] = useState('')
  const [trialWarningChecked, setTrialWarningChecked] = useState(false)
  const [noTrialWarningChecked, setNoTrialWarningChecked] = useState(false)
  const [flexTime, setFlexTime] = useState('')
  const [overtime, setOvertime] = useState('')

  // STEP6
  const [closingPattern, setClosingPattern] = useState('auto')
  const [bonusType, setBonusType] = useState<'あり' | 'なし' | ''>('')

  // STEP8：最終確認
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [isRejected, setIsRejected] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('業務内容の記載が個別契約書の内容と一致していません。STEP2の業務内容をご確認の上、修正してください。')
  const [rejectedAt, setRejectedAt] = useState('2026年06月18日 14:32')
  const [rejectedBy, setRejectedBy] = useState('SSC 高橋')
  const [submitClickCount, setSubmitClickCount] = useState(0)

  // STEP1：スタッフ登録依頼フォーム
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [reqEmployeeNumber, setReqEmployeeNumber] = useState('')
  const [reqName, setReqName] = useState('')
  const [reqDept, setReqDept] = useState('')
  const [reqHireDate, setReqHireDate] = useState('')
  const [reqWorkLocation, setReqWorkLocation] = useState('')
  const [reqWithCsv, setReqWithCsv] = useState(false)
  const [reqCsvSystem, setReqCsvSystem] = useState('')
  const [reqDispatchStart, setReqDispatchStart] = useState('')
  const [reqSubmitted, setReqSubmitted] = useState(false)

  // STEP7
  const [salaryType, setSalaryType] = useState('時給')
  const [basicSalary, setBasicSalary] = useState('')
  const [skillPay, setSkillPay] = useState('0')
  const [rolePay, setRolePay] = useState('0')
  const [salesPay, setSalesPay] = useState('0')
  const [housingPay, setHousingPay] = useState('0')
  const [overtimePay, setOvertimePay] = useState('0')
  const [overtimeHours, setOvertimeHours] = useState('0')
  const [transportType, setTransportType] = useState('default')
  const [hasEmployInsurance, setHasEmployInsurance] = useState(true)
  const [hasSocialInsurance, setHasSocialInsurance] = useState(true)
  const [salaryWarningChecked, setSalaryWarningChecked] = useState(false)

  const trialCalc = calcTrialMonths(trialStart, trialEnd)

  // STEP5バリデーション派生値
  const employStartError = (() => {
    if (!employStart) return null
    if (pattern === 'C' && dispatchStart && employStart < dispatchStart)
      return '雇用期間の開始日は派遣期間の開始日以降にしてください'
    return null
  })()

  // PENDING②反映：パターンC・有期は終了日が派遣終了日と同じ日付のみOK
  const employEndError = (() => {
    if (!employEnd) return null
    if (pattern === 'C' && period === '有期' && dispatchEnd && employEnd !== dispatchEnd)
      return '雇用期間の終了日は派遣期間の終了日と同じ日付にしてください'
    if (employStart && employEnd < employStart)
      return '終了日は開始日以降の日付にしてください'
    return null
  })()

  const trialStartError = (() => {
    if (!trialStart || period !== '有期') return null
    if (employStart && trialStart !== employStart)
      return '試用期間の開始日は雇用期間の開始日と同じ日付にしてください'
    return null
  })()

  const trialEndError = (() => {
    if (!trialEnd || period !== '有期') return null
    if (employEnd && trialEnd > employEnd)
      return '試用期間の終了日は雇用期間の終了日以前にしてください'
    if (trialStart && trialEnd <= trialStart)
      return '終了日は開始日より後の日付にしてください'
    return null
  })()

  // STEP7：基本給バリデーション（赤・止める）
  const basicSalaryError = (() => {
    if (!basicSalary) return null
    const val = parseAmount(basicSalary)
    const rule = SALARY_RULES[salaryType]
    if (!rule) return null
    if (val < rule.min || val > rule.max) return '桁数をご確認ください'
    return null
  })()

  // STEP7：定額残業手当の時間数バリデーション（赤・止める）
  const overtimeHoursError = (() => {
    const pay = parseAmount(overtimePay)
    const hours = parseAmount(overtimeHours)
    if (pay < 1) return null
    if (hours === 0) return '時間数を入力してください'
    if (hours < 5 || hours > 60) return '時間数は5以上60以下で入力してください'
    return null
  })()

  // STEP7：合計金額
  // 各種手当の合計（0円除外）
  const allowancesTotal =
    parseAmount(skillPay) +
    parseAmount(rolePay) +
    parseAmount(salesPay) +
    parseAmount(housingPay) +
    parseAmount(overtimePay)

  // 合計支給額（時給の場合は月額換算：時給×160時間＋各種手当）
  const salaryTotal = (() => {
    const basic = parseAmount(basicSalary)
    if (salaryType === '時給') return basic * 160 + allowancesTotal
    return basic + allowancesTotal
  })()

  // 時給の場合の月額換算内訳
  const hourlyMonthlyBreakdown = (() => {
    if (salaryType !== '時給') return null
    const basic = parseAmount(basicSalary)
    if (!basic) return null
    const lines = [`基本給：${basic.toLocaleString()}円 × 160時間 = ${(basic * 160).toLocaleString()}円`]
    if (parseAmount(rolePay) > 0) lines.push(`役職手当：${parseAmount(rolePay).toLocaleString()}円`)
    if (parseAmount(skillPay) > 0) lines.push(`職能給：${parseAmount(skillPay).toLocaleString()}円`)
    if (parseAmount(salesPay) > 0) lines.push(`営業手当：${parseAmount(salesPay).toLocaleString()}円`)
    if (parseAmount(overtimePay) > 0) lines.push(`定額残業手当：${parseAmount(overtimePay).toLocaleString()}円（${parseAmount(overtimeHours)}時間分）`)
    if (parseAmount(housingPay) > 0) lines.push(`住宅手当：${parseAmount(housingPay).toLocaleString()}円`)
    return lines
  })()


  // STEP7：保険帳票プレビュー
  const insurancePreview = (() => {
    const parts = ['労災保険']
    if (hasSocialInsurance) { parts.push('健康保険'); parts.push('厚生年金') }
    if (hasEmployInsurance) parts.push('雇用保険')
    return parts.join(' / ')
  })()

  // STEP7：賃金支払時の控除
  const deductionText = (() => {
    if (hasEmployInsurance && hasSocialInsurance) return '社会保険料（雇用保険、健康保険、厚生年金）・源泉所得税'
    if (!hasEmployInsurance && hasSocialInsurance) return '社会保険料（健康保険、厚生年金）・源泉所得税'
    if (hasEmployInsurance && !hasSocialInsurance) return '社会保険料（雇用保険）・源泉所得税'
    return '源泉所得税'
  })()

  const selectedTransport = TRANSPORT_TYPES.find(t => t.id === transportType) || TRANSPORT_TYPES[0]

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      if (data.user.user_metadata?.role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  useEffect(() => {
    const loadCompanyMaster = async () => {
      const { data } = await supabase.from('company_master').select('key, value')
      if (!data) return
      const m: Record<string, string> = {}
      data.forEach((row: any) => { m[row.key] = row.value })
      const mgrDeptVal = m['dispatch_manager_dept'] || ''
      const mgrRoleVal = m['dispatch_manager_role'] || ''
      const mgrNameVal = m['dispatch_manager_name'] || ''
      const mgrTelVal = m['dispatch_manager_tel'] || ''
      const cmpDeptVal = m['complaint_dept'] || ''
      const cmpRoleVal = m['complaint_role'] || ''
      const cmpNameVal = m['complaint_name'] || ''
      const cmpTelVal = m['complaint_tel'] || ''
      setMgrDept(mgrDeptVal)
      setMgrRole(mgrRoleVal)
      setMgrName(mgrNameVal)
      setMgrTel(mgrTelVal)
      setCmpDept(cmpDeptVal)
      setCmpRole(cmpRoleVal)
      setCmpName(cmpNameVal)
      setCmpTel(cmpTelVal)
      // マスタ情報反映（修正済み）バッジ判定用の初期値スナップショット
      setMasterSnapshot({
        mgr_dept: mgrDeptVal, mgr_role: mgrRoleVal, mgr_name: mgrNameVal, mgr_tel: mgrTelVal,
        cmp_dept: cmpDeptVal, cmp_role: cmpRoleVal, cmp_name: cmpNameVal, cmp_tel: cmpTelVal,
      })
    }
    loadCompanyMaster()
  }, [])

  // STEP2：所定労働時間の整合性チェック（シフト制以外・黄色警告）
  const workingHoursWarn = (() => {
    if (isShift) return null
    if (!startTime || !endTime || !breakTime || !workingHoursH) return null
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const totalMin = (eh * 60 + em) - (sh * 60 + sm)
    if (totalMin <= 0) return null
    const breakMin = parseAmount(breakTime)
    const actualMin = totalMin - breakMin
    const inputMin = parseAmount(workingHoursH) * 60 + parseAmount(workingHoursM)
    if (actualMin !== inputMin) {
      const h = Math.floor(actualMin / 60)
      const m = actualMin % 60
      return `始業・終業・休憩時間から計算した実働時間は${h}時間${m > 0 ? m + '分' : ''}です。所定労働時間をご確認ください。`
    }
    return null
  })()

  // STEP2：CSVバッジのヘルパー
  const setCsvBadge = (key: string, state: 'reflected' | 'modified') => {
    setCsvBadges(prev => ({ ...prev, [key]: state }))
  }
  const CsvBadge = ({ name }: { name: string }) => {
    const state = csvBadges[name]
    if (!state || state === 'none') return null
    if (state === 'reflected') return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#ECFDF5', color: '#0D9488', border: '1px solid #A7F3D0' }}>CSV反映</span>
    )
    return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>CSV反映（修正済み）</span>
    )
  }

  useEffect(() => {
    if (workPlace === '社内' && documentType !== '雇用契約書' && documentType !== '') {
      setDocumentType('雇用契約書')
    }
  }, [workPlace])

  // 書類種別を変更したら、STEP2以降の入力内容をリセットする（前のパターンのデータが残らないように）
  const prevDocumentTypeRef = useRef(documentType)
  useEffect(() => {
    if (prevDocumentTypeRef.current && prevDocumentTypeRef.current !== documentType) {
      // STEP2：就業先情報
      setCsvMode('manual'); setCsvSystem('e-staffing'); setCsvDispatchStart('')
      setCsvSearched(false); setCsvResults([]); setCsvNoResults(false); setCsvSelectedId(null)
      setWorkLocationName(''); setWorkLocationAddress(''); setWorkLocationTel('')
      setBusinessContent(''); setStartTime(''); setEndTime(''); setIsShift(false)
      setBreakTime(''); setWorkingHoursH(''); setWorkingHoursM('')
      setWorkDays(''); setWorkDaysOther('')
      setOrganizationUnit(''); setConflictDate(''); setResponsibility('')
      setCsvBadges({})
      // STEP3：派遣先担当者
      setCmdDept(''); setCmdRole(''); setCmdName(''); setCmdTel('')
      setRespDept(''); setRespRole(''); setRespName(''); setRespTel('')
      setCompDept(''); setCompRole(''); setCompName(''); setCompTel('')
      setWelfare(''); setSafetyMode('default'); setSafetyText(DEFAULT_SAFETY)
      setConflictMode('default'); setConflictText(DEFAULT_CONFLICT)
      // STEP5：期間・労働条件
      setDispatchStart(''); setDispatchEnd(''); setConflictDateOrg('')
      setEmployStart(''); setEmployEnd(''); setContractStartDate('')
      setTrialPeriod(''); setTrialStart(''); setTrialEnd('')
      setTrialWarningChecked(false); setNoTrialWarningChecked(false)
      setFlexTime(''); setOvertime('')
      // STEP6：契約条件
      setClosingPattern('auto'); setBonusType('')
      // STEP7：給与・保険
      setSalaryType('時給'); setBasicSalary('')
      setSkillPay('0'); setRolePay('0'); setSalesPay('0'); setHousingPay('0')
      setOvertimePay('0'); setOvertimeHours('0')
      setTransportType('default')
      setHasEmployInsurance(true); setHasSocialInsurance(true)
      setSalaryWarningChecked(false)
      // STEP8：最終確認
      setCollapsedSections({})
    }
    prevDocumentTypeRef.current = documentType
  }, [documentType])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setSearched(false); return }
    const normalized = query.replace(/[\s　]+/g, '')
    const { data } = await supabase.from('staff').select('*')
      .or(`employee_number.ilike.%${query}%,name.ilike.%${normalized}%`).limit(10)
    setSearchResults(data || [])
    setSearched(true)
    // 新たに検索したら依頼フォームをリセット
    setShowRequestForm(false)
    setReqSubmitted(false)
    setReqEmployeeNumber('')
    setReqName('')
    setReqDept('')
    setReqHireDate('')
    setReqWorkLocation('')
    setReqWithCsv(false)
    setReqCsvSystem('')
    setReqDispatchStart('')
  }, [])

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleCancel = () => {
    if (!confirm('入力中の申請を中断します。入力した内容は保存されません。よろしいですか？')) return
    router.push('/dashboard/sales')
  }

  const handleNext = () => { setCurrentStep(s => s + 1); window.scrollTo(0, 0) }
  const handleBack = () => { setCurrentStep(s => s - 1); window.scrollTo(0, 0) }
  const getStepLabel = (step: number) => steps[step - 1] || ''

  const getStepType = (step: number) => {
    if (step === 1) return 'basic'
    if (step === 2) return 'workInfo'
    if (step === 3 && (pattern === 'B' || pattern === 'C')) return 'dispatchContact'
    if (step === 3 && pattern === 'A') return 'period'
    if (step === 4 && (pattern === 'B' || pattern === 'C')) return 'sourceContact'
    if (step === 5 && (pattern === 'B' || pattern === 'C')) return 'period'
    if (step === 4 && pattern === 'A') return 'contractCondition'
    if (step === 5 && pattern === 'A') return 'salary'
    if (step === 6 && pattern === 'C') return 'contractCondition'
    if (step === 7 && pattern === 'C') return 'salary'
    if (step === steps.length) return 'finalCheck'
    return 'tbd'
  }

  const stepType = getStepType(currentStep)
  if (!user) return <div className="p-8" style={{ color: '#5A6A8A' }}>読み込み中...</div>

  const fixedText = (text: string) => (
    <p className="text-sm rounded-lg px-3 py-2 inline-block border"
      style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>{text}</p>
  )

  const validateStep2 = () => {
    if (csvRequestSent) return 'CSVインポート依頼を送信済みです。インポート完了後に再度申請してください'
    if (!workLocationName) return '就業場所名を入力してください'
    if (!workLocationAddress) return '就業場所住所を入力してください'
    if (!businessContent) return '業務内容を入力してください'
    if (!startTime) return '始業時刻を入力してください'
    if (!endTime) return '終業時刻を入力してください'
    if (!breakTime) return '休憩時間を入力してください'
    if (!workingHoursH) return '所定労働時間を入力してください'
    if (!workDays) return '所定労働日数を選択してください'
    if (workDays === 'other' && !workDaysOther) return '所定労働日数（その他）を入力してください'
    if (pattern === 'B' || pattern === 'C') {
      if (!organizationUnit) return '組織単位を入力してください'
      if (!isConflictDateExempt && !conflictDate) return '抵触日（事業所単位）を入力してください'
      if (!isConflictDateExempt && isPastDate(conflictDate)) return '抵触日（事業所単位）が過去の日付になっています'
      if (!responsibility) return '業務に伴う責任の程度を選択してください'
    }
    return null
  }

  const validatePeriod = () => {
    if (pattern === 'B' || pattern === 'C') {
      if (!dispatchStart || !dispatchEnd) return '派遣期間を入力してください'
      if (!isConflictDateExempt && !conflictDateOrg) return '抵触日（組織単位）を入力してください'
      if (!isConflictDateExempt && isPastDate(conflictDateOrg)) return '抵触日（組織単位）が過去の日付になっています'
    }
    if (pattern === 'A' || pattern === 'C') {
      if (period === '有期') {
        if (!employStart || !employEnd) return '雇用期間を入力してください'
        if (employStartError) return employStartError
        if (employEndError) return employEndError
      }
      if (period === '無期' && !contractStartDate) return '契約条件適用開始日を入力してください'
      if (!trialPeriod) return '試用期間を選択してください'
      if (trialPeriod === '有') {
        if (!trialStart || !trialEnd) return '試用期間の開始日・終了日を入力してください'
        if (trialStartError) return trialStartError
        if (trialEndError) return trialEndError
        if (trialCalc?.over6 && !trialWarningChecked) return '試用期間6ヶ月超の警告について、上長の了承確認が必要です'
      }
      if (contractType === '正社員' && trialPeriod === '無' && !noTrialWarningChecked) {
        return '正社員・試用期間なしの警告について、上長の了承確認が必要です'
      }
    }
    if (!flexTime) return '変形労働時間制を選択してください'
    if (!overtime) return '所定労働時間外労働を選択してください'
    return null
  }

  // STEP1：依頼フォームバリデーション
  const validateRequestForm = () => {
    if (!reqEmployeeNumber) return '社員番号を入力してください'
    if (!/^\d{6}$/.test(reqEmployeeNumber)) return '社員番号は半角数字6桁で入力してください'
    if (!reqName) return 'スタッフ氏名を入力してください'
    if (!reqDept) return '部門名を入力してください'
    if (!reqHireDate) return '入社日を入力してください'
    if (!reqWorkLocation) return '就業場所名を入力してください'
    if (reqWithCsv) {
      if (!reqCsvSystem) return '使用システムを選択してください'
      if (!reqDispatchStart) return '派遣開始日を入力してください'
    }
    return null
  }

  const handleSubmitRequest = async () => {
    const err = validateRequestForm()
    if (err) { alert(err); return }
    // TODO: Supabaseのrequestsテーブルに登録
    setReqSubmitted(true)
  }

  const validateSalary = () => {
    if (!salaryType) return '給与の種類を選択してください'
    if (!basicSalary) return '基本給を入力してください'
    if (basicSalaryError) return basicSalaryError
    if (overtimeHoursError) return overtimeHoursError
    if (salaryTotal > 1000000 && !salaryWarningChecked) return '合計支給額が100万円超の警告について、上長の了承確認が必要です'
    return null
  }

  const trialPreview = trialStart && trialEnd && trialCalc
    ? `試用期間： 有\n試用期間：${toJpDate(trialStart)}〜${toJpDate(trialEnd)}まで　（試用期間延長の場合は、その2週間前までに通知します）\n試用期間満了後の本採用は次のいずれかにより判断します。\n①試用期間満了時の業務量　②従事している業務の進捗状況　③能力、勤務成績、勤務態度　④健康状態、⑤職務への適正性その他就業規則上の規定基準\n試用期間開始日より14日経過後の本採用拒否の場合は、少なくとも本採用拒否退職の30日前に通知します。`
    : ''

  const remarksText = getRemarksText(pattern, contractType, bonusType)

  const NavButtons = ({ onNext }: { onNext: () => void }) => (
    <div className="border-t px-5 py-4 flex justify-between" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
      <button onClick={e => { e.preventDefault(); handleBack() }}
        className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all"
        style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
      <button onClick={e => { e.preventDefault(); onNext() }}
        className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
        style={{ background: '#1B3A8C' }}>次へ進む →</button>
    </div>
  )

  // STEP7：給与入力セル
  const SalaryCell = ({ label, id, value, onChange, isRequired = false }: {
    label: string; id: string; value: string; onChange: (v: string) => void; isRequired?: boolean
  }) => (
    <div className="flex flex-col gap-1.5 p-3 border-r border-b last:border-r-0"
      style={{ borderColor: '#D0DAF0' }}>
      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 w-28"
          style={{
            borderColor: (id === 'basic' && basicSalaryError) ? '#DC2626' : '#D0DAF0',
            color: '#1A2340',
          }}
          placeholder="0"
        />
        <span className="text-sm shrink-0" style={{ color: '#5A6A8A' }}>円</span>
      </div>
      {id === 'basic' && basicSalaryError && (
        <p className="text-xs" style={{ color: '#DC2626' }}>{basicSalaryError}</p>
      )}
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>新規発行申請</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleCancel}
              className="text-sm px-4 py-2 rounded-lg border font-medium transition-all"
              style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
              ← この申請をやめる
            </button>
            <button onClick={handleLogout} className="text-sm" style={{ color: '#5A6A8A' }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        <div className="flex items-center overflow-x-auto pb-2 mb-6">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: currentStep === i + 1 ? '#1B3A8C' : currentStep > i + 1 ? '#0D9488' : '#D0DAF0',
                    color: currentStep >= i + 1 ? 'white' : '#5A6A8A'
                  }}>
                  {currentStep > i + 1 ? '✓' : i + 1}
                </div>
                <span className="text-xs whitespace-nowrap hidden sm:block"
                  style={{ color: currentStep === i + 1 ? '#1A2340' : '#5A6A8A', fontWeight: currentStep === i + 1 ? 600 : 400 }}>
                  {step}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-5 h-px mx-1.5 shrink-0"
                  style={{ background: currentStep > i + 1 ? '#0D9488' : '#D0DAF0' }} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: '#D0DAF0' }}>
          <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#1B3A8C' }}>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white text-sm font-medium">STEP{currentStep}：{getStepLabel(currentStep)}</span>
              <span className="text-xs" style={{ color: '#A8C0E8' }}>{STEP_SUB[getStepLabel(currentStep)] || ''}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs" style={{ color: '#A8C0E8' }}>{currentStep} / {steps.length}</span>
              <button
                onClick={e => { e.preventDefault(); setShowStepDesc(v => !v) }}
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                style={{ background: '#F97316', color: 'white', border: 'none' }}
                title="このSTEPの説明を見る">?</button>
            </div>
          </div>
          {showStepDesc && (
            <div className="px-5 py-4 border-b" style={{ background: 'white', borderColor: '#D0DAF0' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
                {STEP_DESC[getStepLabel(currentStep)] || ''}
              </p>
            </div>
          )}

          {/* ===== STEP1 ===== */}
          {stepType === 'basic' && (
            <>
              <FormRow label="対象スタッフ" required>
                {selectedStaff ? (
                  <div className="flex items-center gap-3 rounded-lg px-4 py-3 max-w-md border"
                    style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                      style={{ background: '#1B3A8C', color: 'white' }}>
                      {selectedStaff.name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{selectedStaff.name}</p>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>
                        {selectedStaff.department && `${selectedStaff.department}　`}社員番号：{selectedStaff.employee_number}
                      </p>
                    </div>
                    <button onClick={e => { e.preventDefault(); setSelectedStaff(null); setSearched(false); setSearchResults([]) }}
                      className="ml-auto text-xs rounded-md px-2 py-1 border bg-white shrink-0"
                      style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>変更</button>
                  </div>
                ) : (
                  <div className="max-w-md">
                    <SearchInput onSearch={handleSearch} />
                    {searched && searchResults.length === 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-red-400 mb-2">該当するスタッフが見つかりませんでした</p>
                        {!showRequestForm && !reqSubmitted && (
                          <button
                            onClick={e => { e.preventDefault(); setShowRequestForm(true) }}
                            className="text-xs px-3 py-2 rounded-lg border font-medium"
                            style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA' }}>
                            管理部へスタッフマスタ登録を依頼する
                          </button>
                        )}
                        {reqSubmitted && (
                          <div className="rounded-lg p-4 border mt-2" style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
                            <p className="text-sm font-medium mb-1" style={{ color: '#0D9488' }}>✓ 依頼を送信しました</p>
                            <p className="text-xs leading-relaxed" style={{ color: '#1A2340' }}>
                              管理部へスタッフマスタ登録依頼を送信しました。<br />
                              登録が完了するとメール通知が届きますので、その後に再度申請してください。
                            </p>
                          </div>
                        )}
                        {showRequestForm && !reqSubmitted && (
                          <div className="mt-3 rounded-lg border overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
                            <div className="px-4 py-3 border-b" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                              <p className="text-sm font-medium" style={{ color: '#1B3A8C' }}>管理部へスタッフマスタ登録を依頼</p>
                              <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>以下の情報を入力して送信してください</p>
                            </div>
                            <div className="bg-white p-4 flex flex-col gap-3">
                              {/* 社員番号 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  社員番号
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" inputMode="numeric" maxLength={6}
                                  value={reqEmployeeNumber}
                                  onChange={e => setReqEmployeeNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）100001（半角数字6桁）" />
                                {reqEmployeeNumber && !/^\d{6}$/.test(reqEmployeeNumber) && (
                                  <p className="text-xs" style={{ color: '#DC2626' }}>半角数字6桁で入力してください</p>
                                )}
                              </div>
                              {/* スタッフ氏名 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  スタッフ氏名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={reqName}
                                  onChange={e => setReqName(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）山田 太郎" />
                              </div>
                              {/* 部門名 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  部門名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={reqDept}
                                  onChange={e => setReqDept(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-xs"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）関西支社" />
                              </div>
                              {/* 入社日 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  入社日
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="date" value={reqHireDate}
                                  onChange={e => setReqHireDate(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none w-40"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                              </div>
                              {/* 就業場所名 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                  就業場所名
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                </label>
                                <input
                                  type="text" value={reqWorkLocation}
                                  onChange={e => setReqWorkLocation(e.target.value)}
                                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none max-w-sm"
                                  style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                                  placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                              </div>
                              {/* CSVインポート同時依頼 */}
                              <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox" checked={reqWithCsv}
                                    onChange={e => { setReqWithCsv(e.target.checked); setReqCsvSystem(''); setReqDispatchStart('') }}
                                    className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                                  <span className="text-xs font-medium" style={{ color: '#1A2340' }}>CSVインポートも同時に依頼する</span>
                                </label>
                                {reqWithCsv && (
                                  <div className="pl-6 flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                        使用システム
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                      </label>
                                      <div className="flex gap-2 flex-wrap">
                                        {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => (
                                          <button key={s}
                                            onClick={e => { e.preventDefault(); setReqCsvSystem(s) }}
                                            className="px-3 py-1.5 border rounded-lg text-xs transition-colors"
                                            style={{
                                              borderColor: reqCsvSystem === s ? '#1B3A8C' : '#D0DAF0',
                                              background: reqCsvSystem === s ? '#EEF2FA' : 'white',
                                              color: reqCsvSystem === s ? '#1B3A8C' : '#1A2340',
                                              fontWeight: reqCsvSystem === s ? 600 : 400,
                                            }}>{s}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium flex items-center gap-1" style={{ color: '#1A2340' }}>
                                        派遣開始日
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
                                      </label>
                                      <input
                                        type="date" value={reqDispatchStart}
                                        onChange={e => setReqDispatchStart(e.target.value)}
                                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none w-40"
                                        style={{ borderColor: '#D0DAF0', color: '#1A2340' }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* ボタン */}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={e => { e.preventDefault(); handleSubmitRequest() }}
                                  className="text-white px-4 py-2 rounded-lg text-xs font-medium"
                                  style={{ background: '#1B3A8C' }}>
                                  依頼を送信する
                                </button>
                                <button
                                  onClick={e => { e.preventDefault(); setShowRequestForm(false) }}
                                  className="px-4 py-2 rounded-lg text-xs border"
                                  style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {searched && searchResults.length === 10 && (
                      <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>候補が多すぎます。もう少し詳しく入力して再検索してください。</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="border rounded-lg mt-1.5 overflow-hidden bg-white shadow-sm" style={{ borderColor: '#D0DAF0' }}>
                        {searchResults.map(s => (
                          <button key={s.id}
                            onClick={e => { e.preventDefault(); setSelectedStaff(s); setSearchResults([]) }}
                            className="w-full text-left px-4 py-2.5 border-b last:border-0 flex items-center gap-3 hover:bg-blue-50 transition-colors"
                            style={{ borderColor: '#D0DAF0' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                              style={{ background: '#EEF2FA', color: '#1B3A8C' }}>
                              {s.name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{s.name}</p>
                              {s.department && <p className="text-xs" style={{ color: '#5A6A8A' }}>{s.department}</p>}
                            </div>
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>{s.employee_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </FormRow>

              <FormRow label="雇用区分" required>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex border rounded-lg overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                    {['有期契約', '無期契約', '正社員'].map(v => (
                      <button key={v} onClick={e => { e.preventDefault(); setContractType(v) }}
                        className="px-4 py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap"
                        style={{
                          borderColor: '#D0DAF0',
                          background: contractType === v ? '#1B3A8C' : 'white',
                          color: contractType === v ? 'white' : '#1A2340',
                          fontWeight: contractType === v ? 600 : 400
                        }}>{v}</button>
                    ))}
                  </div>
                  <div className="w-px h-7 shrink-0" style={{ background: '#D0DAF0' }} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm shrink-0" style={{ color: '#5A6A8A' }}>勤務地</span>
                    <select value={workPlace} onChange={e => setWorkPlace(e.target.value)}
                      className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}>
                      <option value="現場">現場</option>
                      <option value="社内">社内</option>
                    </select>
                  </div>
                </div>
              </FormRow>

              <FormRow label="帳票種別" required>
                <div className="grid grid-cols-3 gap-2 max-w-2xl">
                  {getDocumentTypes(workPlace).map(d => (
                    <button key={d.value} onClick={e => { e.preventDefault(); setDocumentType(d.value) }}
                      className="text-left p-3 rounded-lg border transition-all"
                      style={{
                        borderColor: documentType === d.value ? '#1B3A8C' : '#D0DAF0',
                        background: documentType === d.value ? '#EEF2FA' : 'white',
                      }}>
                      <p className="text-xs font-medium leading-snug whitespace-pre-line"
                        style={{ color: documentType === d.value ? '#1B3A8C' : '#1A2340' }}>{d.value}</p>
                      <p className="text-xs mt-1" style={{ color: documentType === d.value ? '#4A7FD4' : '#5A6A8A' }}>{d.step}</p>
                    </button>
                  ))}
                  {workPlace === '社内' && ['就業条件明示書', '雇用契約書 兼\n就業条件明示書'].map(d => (
                    <div key={d} className="p-3 border rounded-lg opacity-40 cursor-not-allowed"
                      style={{ borderColor: '#D0DAF0', background: '#F5F7FC' }}>
                      <p className="text-xs leading-snug whitespace-pre-line" style={{ color: '#5A6A8A' }}>{d}</p>
                      <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>社内は選択不可</p>
                    </div>
                  ))}
                </div>
                {documentType && contractType && (
                  <div className="max-w-2xl rounded-lg px-4 py-3 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <p className="text-xs mb-1" style={{ color: '#5A6A8A' }}>✓ 発行する帳票</p>
                    <p className="text-sm font-medium" style={{ color: '#1A2340' }}>{fullDocumentName}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>
                      {pattern === 'A' ? '雇用契約書のみ・6STEP で申請できます' :
                       pattern === 'B' ? '就業条件明示書のみ・給与入力なし・6STEP で申請できます' :
                       '全項目入力・8STEP で申請できます'}
                    </p>
                  </div>
                )}
              </FormRow>

              <div className="border-t px-5 py-4 flex justify-end" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                <button onClick={e => {
                  e.preventDefault()
                  if (!selectedStaff || !documentType || !contractType) { alert('すべての項目を選択してください'); return }
                  handleNext()
                }} className="text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#1B3A8C' }}>次へ進む →</button>
              </div>
            </>
          )}

          {/* ===== STEP2 ===== */}
          {stepType === 'workInfo' && (
            <>
              {/* CSV依頼完了画面 */}
              {csvRequestSent ? (
                <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
                  <p className="text-4xl">📨</p>
                  <p className="text-base font-bold" style={{ color: '#1A2340' }}>管理部へCSVインポート依頼を送信しました</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                    インポートが完了するとメール通知が届きます。<br />
                    お手数ですが、その後に再度申請してください。<br /><br />
                    急ぎで雇用契約書のみの発行へ切り替えたい場合は、<br />
                    前のSTEPへ戻りお手続きをお願いします。
                  </p>
                  <button onClick={e => { e.preventDefault(); setCsvRequestSent(false) }}
                    className="text-sm px-5 py-2.5 rounded-lg border"
                    style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
                    ← 前のSTEPへ戻る
                  </button>
                </div>
              ) : (
                <>
                  {/* 契約情報の入力方法 */}
                  <div style={{ height: '12px', background: '#F5F7FC' }} />
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-start gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>契約情報の入力方法を選んでください</span>
                      <Req />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-3"
                      style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      {/* 選択カード */}
                      <div className="grid grid-cols-2 gap-3" style={{ maxWidth: '520px' }}>
                        {[
                          { mode: 'csv' as const, icon: '/icons/step2-csv.png', label: 'CSVデータから自動入力', desc: '派遣管理システムのデータから自動で反映します' },
                          { mode: 'manual' as const, icon: '/icons/step2-manual.png', label: '手動で入力する', desc: '派遣管理システムを使わず直接入力します' },
                        ].map(({ mode, icon, label, desc }) => (
                          <button key={mode}
                            onClick={e => { e.preventDefault(); setCsvMode(mode); setCsvSearched(false); setCsvResults([]); setCsvNoResults(false) }}
                            className="flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all"
                            style={{
                              borderColor: csvMode === mode ? '#1B3A8C' : '#D0DAF0',
                              borderWidth: csvMode === mode ? '1.5px' : '1px',
                              background: csvMode === mode ? '#EEF2FA' : 'white',
                            }}>
                            <img src={icon} alt={label} style={{ width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0 }} />
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold" style={{ color: '#1B3A8C' }}>{label}</span>
                              <span className="text-xs leading-relaxed" style={{ color: '#5A6A8A' }}>{desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* CSV検索エリア */}
                      {csvMode === 'csv' && (
                        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                          <div className="flex gap-3 flex-wrap items-end">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>使用システム</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {['e-staffing', 'HRstation', 'winworks', 'Staffia'].map(s => (
                                  <button key={s}
                                    onClick={e => { e.preventDefault(); setCsvSystem(s) }}
                                    className="px-3 py-1.5 border rounded-lg text-xs transition-colors"
                                    style={{
                                      borderColor: csvSystem === s ? '#1B3A8C' : '#D0DAF0',
                                      background: csvSystem === s ? '#EEF2FA' : 'white',
                                      color: csvSystem === s ? '#1B3A8C' : '#1A2340',
                                      fontWeight: csvSystem === s ? 600 : 400,
                                    }}>{s}</button>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>派遣開始日</span>
                              <input type="date" className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                                style={{ borderColor: '#D0DAF0', color: '#1A2340', width: '150px' }}
                                value={csvDispatchStart} onChange={e => setCsvDispatchStart(e.target.value)} />
                            </div>
                            <button
                              disabled={!csvDispatchStart}
                              onClick={async e => {
                                e.preventDefault()
                                if (!csvDispatchStart) return
                                // TODO: Supabaseからcsvシステム・派遣開始日・スタッフ社員番号で検索
                                // ダミーデータで動作確認
                                setCsvSearched(true)
                                setCsvNoResults(false)
                                setCsvResults([
                                  { id: 0, name: 'ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店', address: '東京都福生市本町36番地1', tel: '042-539-3711', start: '2026/07/01', end: '2026/09/30' },
                                  { id: 1, name: 'ソフトバンク（SB） 量販 ケーズデンキ青梅店', address: '東京都青梅市新町3-5-1', tel: '', start: '2026/07/01', end: '2026/09/30' },
                                ])
                              }}
                              className="text-white text-xs px-4 py-1.5 rounded-lg transition-opacity"
                              style={{ background: '#1B3A8C', height: '32px', whiteSpace: 'nowrap', opacity: csvDispatchStart ? 1 : 0.4, cursor: csvDispatchStart ? 'pointer' : 'not-allowed' }}>
                              検索
                            </button>
                          </div>

                          {!csvSearched && (
                            <p className="text-xs" style={{ color: '#5A6A8A' }}>使用システムと派遣開始日を入力して検索してください。</p>
                          )}

                          {/* ヒットあり */}
                          {csvSearched && csvResults.length > 0 && !csvNoResults && (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs" style={{ color: '#5A6A8A' }}>{csvResults.length}件見つかりました。該当する就業先を選択してください。</p>
                              <div className="rounded-lg border overflow-hidden bg-white" style={{ borderColor: '#D0DAF0' }}>
                                {csvResults.map((r, idx) => (
                                  <button key={idx}
                                    onClick={e => {
                                      e.preventDefault()
                                      setCsvSelectedId(idx)
                                      setWorkLocationName(r.name)
                                      setWorkLocationAddress(r.address)
                                      setWorkLocationTel(r.tel)
                                      // 値が実際に入った項目にのみバッジをセット
                                      const newBadges: Record<string, 'none' | 'reflected' | 'modified'> = {}
                                      if (r.name) newBadges['locationName'] = 'reflected'
                                      if (r.address) newBadges['locationAddress'] = 'reflected'
                                      if (r.tel) newBadges['locationTel'] = 'reflected'
                                      if (r.business) newBadges['business'] = 'reflected'
                                      if (r.startTime || r.endTime) newBadges['time'] = 'reflected'
                                      if (r.breakTime) newBadges['breakTime'] = 'reflected'
                                      if (r.workingHoursH) newBadges['workingHours'] = 'reflected'
                                      if (r.org) newBadges['org'] = 'reflected'
                                      if (r.conflictDate) newBadges['conflict'] = 'reflected'
                                      if (r.responsibility) newBadges['resp'] = 'reflected'
                                      setCsvBadges(newBadges)
                                    }}
                                    className="w-full text-left px-3.5 py-3 border-b last:border-0 transition-colors"
                                    style={{
                                      borderColor: '#D0DAF0',
                                      background: csvSelectedId === idx ? '#EEF2FA' : 'white',
                                      borderLeft: csvSelectedId === idx ? '3px solid #1B3A8C' : 'none',
                                    }}>
                                    <div className="flex justify-between items-start gap-2 mb-1">
                                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>{r.name}</span>
                                      <span className="text-xs font-medium shrink-0" style={{ color: '#1B3A8C' }}>{r.start} 〜 {r.end}</span>
                                    </div>
                                    <p className="text-xs" style={{ color: '#5A6A8A' }}>{r.address}</p>
                                    {r.tel && <p className="text-xs mt-0.5" style={{ color: '#5A6A8A' }}>TEL：{r.tel}</p>}
                                  </button>
                                ))}
                              </div>
                              {/* 一覧下部：対象データが違う場合の依頼ボタン */}
                              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border"
                                style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                                <span className="text-xs" style={{ color: '#5A6A8A' }}>該当する就業先が一覧にありませんか？</span>
                                <button
                                  onClick={e => { e.preventDefault(); setCsvRequestSent(true) }}
                                  className="text-xs px-3 py-1.5 rounded-lg border"
                                  style={{ color: '#DC2626', borderColor: '#FECACA', background: 'white', whiteSpace: 'nowrap' }}>
                                  管理部へCSVインポートを依頼する
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ヒットなし */}
                          {csvSearched && (csvNoResults || csvResults.length === 0) && (
                            <div className="rounded-lg border p-3 flex flex-col gap-2"
                              style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                              <p className="text-xs" style={{ color: '#DC2626' }}>対象スタッフの就業先データが見つかりませんでした。</p>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={e => { e.preventDefault(); setCsvRequestSent(true) }}
                                  className="text-xs px-3 py-1.5 rounded-lg text-white"
                                  style={{ background: '#DC2626' }}>
                                  管理部へCSVインポートを依頼する
                                </button>
                                <button
                                  onClick={e => { e.preventDefault(); setCsvMode('manual') }}
                                  className="text-xs px-3 py-1.5 rounded-lg border"
                                  style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: 'white' }}>
                                  手動で入力する
                                </button>
                              </div>
                            </div>
                          )}

                          {/* CSVインポート依頼フォーム */}
              {csvRequestFormOpen && !csvRequestSent && (
                <div className="mt-2 rounded-xl border p-4 flex flex-col gap-3" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                  <p className="text-sm font-medium" style={{ color: '#1A2340' }}>管理部へCSVインポートを依頼する</p>
                  <p className="text-xs" style={{ color: '#5A6A8A' }}>以下の情報を入力して送信してください。</p>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium" style={{ color: '#1A2340' }}>就業場所名 <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span></span>
                    <input type="text" className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340', maxWidth: '480px' }}
                      value={csvRequestLocationName}
                      onChange={e => setCsvRequestLocationName(e.target.value)}
                      placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={e => { e.preventDefault(); if (!csvRequestLocationName) { alert('就業場所名を入力してください'); return } setCsvRequestSent(true); setCsvRequestFormOpen(false) }}
                      className="text-xs px-4 py-2 rounded-lg text-white"
                      style={{ background: '#EA6C00' }}>依頼を送信する</button>
                    <button
                      onClick={e => { e.preventDefault(); setCsvRequestFormOpen(false) }}
                      className="text-xs px-4 py-2 rounded-lg border"
                      style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>キャンセル</button>
                  </div>
                </div>
              )}

              {/* 自動反映済み通知 */}
                          {csvSelectedId !== null && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                              style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: '#0D9488' }}>
                              ✅ CSVデータから契約情報を自動反映しました。内容を確認し、必要であれば修正してください。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 就業先情報 */}
                  <SectionHeader label="就業先情報" />
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>就業場所名</span>
                      <Req />
                      <CsvBadge name="locationName" />
                    </div>
                    <div className="border-b px-5 py-4" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                        value={workLocationName}
                        onChange={e => { setWorkLocationName(e.target.value); if (csvBadges['locationName'] === 'reflected') setCsvBadge('locationName', 'modified') }}
                        placeholder="例）ソフトバンク（SB） 量販 コジマ×ビックカメラ福生店" />
                    </div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>就業場所住所</span>
                      <Req />
                      <CsvBadge name="locationAddress" />
                    </div>
                    <div className="border-b px-5 py-4" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                        value={workLocationAddress}
                        onChange={e => { setWorkLocationAddress(e.target.value); if (csvBadges['locationAddress'] === 'reflected') setCsvBadge('locationAddress', 'modified') }}
                        placeholder="例）東京都福生市本町36番地1" />
                    </div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>就業場所電話番号</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#F5F7FC', color: '#5A6A8A', border: '1px solid #D0DAF0' }}>任意</span>
                      <CsvBadge name="locationTel" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-1.5" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <input className={`${inp}`} style={{ borderColor: '#D0DAF0', color: '#1A2340', maxWidth: '200px' }}
                        value={workLocationTel} type="tel"
                        onChange={e => { setWorkLocationTel(e.target.value); if (csvBadges['locationTel'] === 'reflected') setCsvBadge('locationTel', 'modified') }}
                        placeholder="例）042-539-3711" />
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>未入力の場合、帳票の「TEL:」以降は表示されません</p>
                    </div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>業務内容</span>
                      <Req />
                      <CsvBadge name="business" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-1.5" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <textarea
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                        style={{ borderColor: '#D0DAF0', color: '#1A2340', maxWidth: '480px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
                        value={businessContent}
                        onChange={e => { setBusinessContent(e.target.value); if (csvBadges['business'] === 'reflected') setCsvBadge('business', 'modified') }}
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                        placeholder="例）携帯電話販売促進業務" />
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>Enterキーでの改行はできません</p>
                    </div>
                  </div>

                  {/* 始業・終業時刻 */}
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>始業・終業時刻</span>
                      <Req />
                      <CsvBadge name="time" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-2" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <div className="flex items-center gap-2 flex-nowrap">
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>始業</span>
                        <input type="time" className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 shrink-0"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340', width: '130px' }}
                          value={startTime}
                          onChange={e => { setStartTime(e.target.value); if (csvBadges['time'] === 'reflected') setCsvBadge('time', 'modified') }} />
                        <span className="text-sm shrink-0" style={{ color: '#5A6A8A' }}>〜</span>
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>終業</span>
                        <input type="time" className="bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 shrink-0"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340', width: '130px' }}
                          value={endTime}
                          onChange={e => { setEndTime(e.target.value); if (csvBadges['time'] === 'reflected') setCsvBadge('time', 'modified') }} />
                        <button
                          onClick={e => { e.preventDefault(); setIsShift(!isShift) }}
                          className="px-3 py-1.5 border rounded-lg text-xs transition-colors shrink-0"
                          style={{
                            borderColor: isShift ? '#1B3A8C' : '#D0DAF0',
                            background: isShift ? '#EEF2FA' : 'white',
                            color: isShift ? '#1B3A8C' : '#1A2340',
                            fontWeight: isShift ? 600 : 400,
                          }}>シフト制</button>
                      </div>
                    </div>
                  </div>

                  {/* 休憩時間 */}
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>休憩時間</span>
                      <Req />
                      <CsvBadge name="breakTime" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-1.5" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <div className="flex items-center gap-2">
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={breakTime}
                          onChange={e => { setBreakTime(e.target.value); if (csvBadges['breakTime'] === 'reflected') setCsvBadge('breakTime', 'modified') }}
                          placeholder="60" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>分</span>
                      </div>
                      <p className="text-xs" style={{ color: '#5A6A8A' }}>例）60、75、90</p>
                    </div>
                  </div>

                  {/* 所定労働時間 */}
                  <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                    <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                      <span className="text-sm font-medium" style={{ color: '#1A2340' }}>所定労働時間</span>
                      <Req />
                      <CsvBadge name="workingHours" />
                    </div>
                    <div className="border-b px-5 py-4 flex flex-col gap-2" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                      <div className="flex items-center gap-2">
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={workingHoursH}
                          onChange={e => { setWorkingHoursH(e.target.value); if (csvBadges['workingHours'] === 'reflected') setCsvBadge('workingHours', 'modified') }}
                          placeholder="8" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>時間</span>
                        <input type="text" className="border rounded-lg px-3 py-2 text-sm text-right focus:outline-none w-20"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={workingHoursM}
                          onChange={e => { setWorkingHoursM(e.target.value); if (csvBadges['workingHours'] === 'reflected') setCsvBadge('workingHours', 'modified') }}
                          placeholder="00" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>分</span>
                      </div>
                      {workingHoursWarn && (
                        <div className="flex items-start gap-2 rounded-lg px-4 py-3 text-xs"
                          style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                          ⚠️ {workingHoursWarn}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 所定労働日数 */}
                  <FormRow label="所定労働日数" required>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: '週5日（月〜金）', label: '週5日（月〜金）' },
                        { value: '週4日', label: '週4日' },
                        { value: '週3日', label: '週3日' },
                        { value: 'other', label: 'その他' },
                      ].map(({ value, label }) => (
                        <button key={value}
                          onClick={e => { e.preventDefault(); setWorkDays(value) }}
                          className="px-4 py-2 border rounded-lg text-sm transition-colors"
                          style={{
                            borderColor: workDays === value ? '#1B3A8C' : '#D0DAF0',
                            background: workDays === value ? '#EEF2FA' : 'white',
                            color: workDays === value ? '#1B3A8C' : '#1A2340',
                            fontWeight: workDays === value ? 600 : 400,
                          }}>{label}</button>
                      ))}
                    </div>
                    {workDays === 'other' && (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="text" className={`${inp}`}
                          style={{ borderColor: '#D0DAF0', color: '#1A2340', maxWidth: '280px' }}
                          value={workDaysOther} onChange={e => setWorkDaysOther(e.target.value)}
                          placeholder="例）18日、カレンダー暦通り" />
                        <p className="text-xs" style={{ color: '#5A6A8A' }}>帳票にそのまま表示されます</p>
                      </div>
                    )}
                  </FormRow>

                  {/* 就業条件明示書の追加項目 */}
                  {(pattern === 'B' || pattern === 'C') && (
                    <>
                      <SectionHeader label="就業条件明示書の追加項目" />
                      <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                        <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                          style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                          <span className="text-sm font-medium" style={{ color: '#1A2340' }}>組織単位</span>
                          <Req />
                          <CsvBadge name="org" />
                        </div>
                        <div className="border-b px-5 py-4" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                          <input className={`${inp} max-w-lg`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                            value={organizationUnit}
                            onChange={e => { setOrganizationUnit(e.target.value); if (csvBadges['org'] === 'reflected') setCsvBadge('org', 'modified') }}
                            placeholder="例）第一営業部" />
                        </div>
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                        <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                          style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                          <span className="text-sm font-medium" style={{ color: '#1A2340' }}>抵触日（事業所単位）</span>
                          <Req />
                          <Tooltip text={TOOLTIPS['抵触日（事業所単位）']} />
                          <CsvBadge name="conflict" />
                        </div>
                        <div className="border-b px-5 py-4" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                          {isConflictDateExempt ? fixedText('無期雇用派遣のため該当しない（自動）') : (
                            <div>
                              <input type="date" className={`${inp} max-w-xs`}
                                style={{ borderColor: isPastDate(conflictDate) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                                value={conflictDate}
                                onChange={e => { setConflictDate(e.target.value); if (csvBadges['conflict'] === 'reflected') setCsvBadge('conflict', 'modified') }} />
                              {isPastDate(conflictDate) && (
                                <p className="text-xs mt-1" style={{ color: '#DC2626' }}>過去の日付は入力できません</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                        <div className="border-r border-b px-4 py-4 flex flex-wrap items-center gap-1"
                          style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                          <span className="text-sm font-medium" style={{ color: '#1A2340' }}>業務に伴う責任の程度</span>
                          <Req />
                          <Tooltip text={TOOLTIPS['業務に伴う責任の程度']} />
                          <CsvBadge name="resp" />
                        </div>
                        <div className="border-b px-5 py-4" style={{ background: '#FFFFFF', borderColor: '#D0DAF0' }}>
                          <RadioGroup name="responsibility" value={responsibility}
                            onChange={v => { setResponsibility(v); if (csvBadges['resp'] === 'reflected') setCsvBadge('resp', 'modified') }} />
                        </div>
                      </div>
                    </>
                  )}
                  <NavButtons onNext={() => {
                    const err = validateStep2()
                    if (err) { alert(err); return }
                    handleNext()
                  }} />
                </>
              )}
            </>
          )}

          {/* ===== STEP3：派遣先担当者 ===== */}
          {stepType === 'dispatchContact' && (
            <>
              <SectionHeader label="指揮命令者" />
              <FormRow label="部署名" required badge={<CsvBadge name="cmdDept" />}>
                <input className={inp} style={deptInputStyle} value={cmd_dept} onChange={e => { setCmdDept(e.target.value); if (csvBadges['cmdDept'] === 'reflected') setCsvBadge('cmdDept', 'modified') }}
                  placeholder="例）東日本ｴﾘｱ営業本部 関東営業統括部 第3営業部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="cmdRole" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={cmd_role} onChange={e => { setCmdRole(e.target.value); if (csvBadges['cmdRole'] === 'reflected') setCsvBadge('cmdRole', 'modified') }} placeholder="例）課長" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="cmdName" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={cmd_name} onChange={e => { setCmdName(e.target.value); if (csvBadges['cmdName'] === 'reflected') setCsvBadge('cmdName', 'modified') }} placeholder="例）山田 太郎" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="cmdTel" />}>
                <TelInput value={cmd_tel} onChange={v => { setCmdTel(v); if (csvBadges['cmdTel'] === 'reflected') setCsvBadge('cmdTel', 'modified') }} />
              </FormRow>

              <SectionHeader label="派遣先責任者" />
              <FormRow label="部署名" required badge={<CsvBadge name="respDept" />}>
                <input className={inp} style={deptInputStyle} value={resp_dept} onChange={e => { setRespDept(e.target.value); if (csvBadges['respDept'] === 'reflected') setCsvBadge('respDept', 'modified') }} placeholder="例）人事部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="respRole" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={resp_role} onChange={e => { setRespRole(e.target.value); if (csvBadges['respRole'] === 'reflected') setCsvBadge('respRole', 'modified') }} placeholder="例）部長" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="respName" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={resp_name} onChange={e => { setRespName(e.target.value); if (csvBadges['respName'] === 'reflected') setCsvBadge('respName', 'modified') }} placeholder="例）鈴木 花子" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="respTel" />}>
                <TelInput value={resp_tel} onChange={v => { setRespTel(v); if (csvBadges['respTel'] === 'reflected') setCsvBadge('respTel', 'modified') }} />
              </FormRow>

              <SectionHeader label="苦情処理申出先（派遣先）" />
              <FormRow label="部署名" required badge={<CsvBadge name="compDept" />}>
                <input className={inp} style={deptInputStyle} value={comp_dept} onChange={e => { setCompDept(e.target.value); if (csvBadges['compDept'] === 'reflected') setCsvBadge('compDept', 'modified') }} placeholder="例）総務部" />
              </FormRow>
              <FormRow label="役職" required badge={<CsvBadge name="compRole" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={comp_role} onChange={e => { setCompRole(e.target.value); if (csvBadges['compRole'] === 'reflected') setCsvBadge('compRole', 'modified') }} placeholder="例）担当者" />
              </FormRow>
              <FormRow label="氏名" required badge={<CsvBadge name="compName" />}>
                <input className={`${inp} max-w-xs`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                  value={comp_name} onChange={e => { setCompName(e.target.value); if (csvBadges['compName'] === 'reflected') setCsvBadge('compName', 'modified') }} placeholder="例）田中 次郎" />
              </FormRow>
              <FormRow label="電話番号" required badge={<CsvBadge name="compTel" />}>
                <TelInput value={comp_tel} onChange={v => { setCompTel(v); if (csvBadges['compTel'] === 'reflected') setCsvBadge('compTel', 'modified') }} />
              </FormRow>

              <SectionHeader label="追加項目" />
              <FormRow label="福利厚生施設の利用等" required badge={<CsvBadge name="welfare" />}>
                <NoBreakTextarea value={welfare} onChange={v => { setWelfare(v); if (csvBadges['welfare'] === 'reflected') setCsvBadge('welfare', 'modified') }} placeholder="例）社員食堂・更衣室の利用可" minHeight="60px" />
              </FormRow>
              <FormRow label="安全及び衛生" required badge={<CsvBadge name="safety" />}>
                <ModeToggle mode={safetyMode} onChange={m => { setSafetyMode(m); setSafetyText(m === 'default' ? DEFAULT_SAFETY : '') }} />
                <NoBreakTextarea value={safetyText} onChange={v => { setSafetyText(v); if (csvBadges['safety'] === 'reflected') setCsvBadge('safety', 'modified') }}
                  placeholder="安全及び衛生に関する内容を入力してください" minHeight="80px"
                  bg={safetyMode === 'default' ? '#F5F7FC' : 'white'} />
                <p className="text-xs" style={{ color: '#5A6A8A' }}>
                  {safetyMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
                </p>
              </FormRow>
              <FormRow label="紛争防止措置" required badge={<CsvBadge name="conflict2" />}>
                <ModeToggle mode={conflictMode} onChange={m => { setConflictMode(m); setConflictText(m === 'default' ? DEFAULT_CONFLICT : '') }} />
                <NoBreakTextarea value={conflictText} onChange={v => { setConflictText(v); if (csvBadges['conflict2'] === 'reflected') setCsvBadge('conflict2', 'modified') }}
                  placeholder="紛争防止措置に関する内容を入力してください" minHeight="80px"
                  bg={conflictMode === 'default' ? '#F5F7FC' : 'white'} />
                <p className="text-xs" style={{ color: '#5A6A8A' }}>
                  {conflictMode === 'default' ? '※デフォルト文言を表示しています。必要に応じて編集してください。' : '※自由に入力してください。'}
                </p>
              </FormRow>

              <NavButtons onNext={() => {
                if (!cmd_dept || !cmd_role || !cmd_name || !cmd_tel) { alert('指揮命令者の全項目を入力してください'); return }
                if (!resp_dept || !resp_role || !resp_name || !resp_tel) { alert('派遣先責任者の全項目を入力してください'); return }
                if (!comp_dept || !comp_role || !comp_name || !comp_tel) { alert('苦情処理申出先（派遣先）の全項目を入力してください'); return }
                if (!welfare) { alert('福利厚生施設の利用等を入力してください'); return }
                if (!safetyText) { alert('安全及び衛生を入力してください'); return }
                if (!conflictText) { alert('紛争防止措置を入力してください'); return }
                if (validateTel(cmd_tel) || validateTel(resp_tel) || validateTel(comp_tel)) { alert('電話番号の形式が正しくありません'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP4：派遣元担当者 ===== */}
          {stepType === 'sourceContact' && (
            <>
              <div className="px-5 py-3 border-b text-sm" style={{ background: '#EEF2FA', borderColor: '#D0DAF0', color: '#5A6A8A' }}>
                ℹ️ 以下は自社マスタから自動入力されています。内容を確認し、必要であれば修正してください。
              </div>
              <SectionHeader label="派遣元責任者" />
              <FormRowAuto label="部署名" modified={masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={mgr_dept} onChange={e => setMgrDept(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="役職" modified={masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={mgr_role} onChange={e => setMgrRole(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="氏名" modified={masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={mgr_name} onChange={e => setMgrName(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="電話番号" modified={masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel}>
                <TelInput value={mgr_tel} onChange={setMgrTel} />
              </FormRowAuto>
              <SectionHeader label="苦情処理申出先（派遣元）" />
              <FormRowAuto label="部署名" modified={masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={cmp_dept} onChange={e => setCmpDept(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="役職" modified={masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={cmp_role} onChange={e => setCmpRole(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="氏名" modified={masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name}>
                <input className={inp} style={{ borderColor: '#D0DAF0', color: '#1A2340' }} value={cmp_name} onChange={e => setCmpName(e.target.value)} />
              </FormRowAuto>
              <FormRowAuto label="電話番号" modified={masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel}>
                <TelInput value={cmp_tel} onChange={setCmpTel} />
              </FormRowAuto>
              <NavButtons onNext={() => {
                if (!mgr_dept || !mgr_role || !mgr_name || !mgr_tel) { alert('派遣元責任者の全項目を入力してください'); return }
                if (!cmp_dept || !cmp_role || !cmp_name || !cmp_tel) { alert('苦情処理申出先（派遣元）の全項目を入力してください'); return }
                if (validateTel(mgr_tel) || validateTel(cmp_tel)) { alert('電話番号の形式が正しくありません'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP5（A=STEP3 / B・C=STEP5）：期間・労働条件 ===== */}
          {stepType === 'period' && (
            <>
              {(pattern === 'B' || pattern === 'C') && (
                <>
                  <SectionHeader label="派遣期間" />
                  <FormRow label="派遣期間" required>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                        <input type="date" className={`${inp} w-40`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={dispatchStart} onChange={e => setDispatchStart(e.target.value)} />
                      </div>
                      <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                        <input type="date" className={`${inp} w-40`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                          value={dispatchEnd} onChange={e => setDispatchEnd(e.target.value)} />
                      </div>
                    </div>
                  </FormRow>
                  <FormRow label="抵触日（組織単位）" required tooltip={TOOLTIPS['抵触日（組織単位）']}>
                    {isConflictDateExempt ? fixedText('無期雇用派遣のため該当しない（自動）') : (
                      <div>
                        <input type="date" className={`${inp} max-w-xs`}
                          style={{ borderColor: isPastDate(conflictDateOrg) ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          value={conflictDateOrg} onChange={e => setConflictDateOrg(e.target.value)} />
                        {isPastDate(conflictDateOrg) && (
                          <p className="text-xs mt-1" style={{ color: '#DC2626' }}>過去の日付は入力できません</p>
                        )}
                      </div>
                    )}
                  </FormRow>
                </>
              )}

              {(pattern === 'A' || pattern === 'C') && (
                <>
                  <SectionHeader label="雇用期間" />
                  <FormRow label="雇用期間" required>
                    {(period === '無期' || contractType === '正社員') ? (
                      <div className="flex flex-col gap-2">
                        {fixedText('期間の定めなし（自動）')}
                        <div className="flex items-center gap-3">
                          <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>契約条件適用開始日</span>
                          <input type="date" className={`${inp} w-40`} style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                            value={contractStartDate} onChange={e => setContractStartDate(e.target.value)} />
                        </div>
                        <p className="text-xs" style={{ color: '#5A6A8A' }}>※無期契約のため雇用期間は固定文言になります</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                            <input type="date" className={`${inp} w-40`}
                              style={{ borderColor: employStartError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                              value={employStart} onChange={e => setEmployStart(e.target.value)} />
                          </div>
                          <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                            <input type="date" className={`${inp} w-40`}
                              style={{ borderColor: employEndError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                              value={employEnd} onChange={e => setEmployEnd(e.target.value)} />
                          </div>
                        </div>
                        {employStartError && <p className="text-xs" style={{ color: '#DC2626' }}>{employStartError}</p>}
                        {employEndError && <p className="text-xs" style={{ color: '#DC2626' }}>{employEndError}</p>}
                      </div>
                    )}
                  </FormRow>
                  <FormRow label="試用期間" required>
                    <RadioGroup name="trial" value={trialPeriod} onChange={v => {
                      setTrialPeriod(v)
                      setTrialWarningChecked(false)
                      setNoTrialWarningChecked(false)
                    }} />
                    {trialPeriod === '有' && (
                      <div className="flex flex-col gap-3 mt-1">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>自</span>
                              <input type="date" className={`${inp} w-40`}
                                style={{ borderColor: trialStartError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                                value={trialStart} onChange={e => setTrialStart(e.target.value)} />
                            </div>
                            <span className="text-sm" style={{ color: '#5A6A8A' }}>〜</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs shrink-0" style={{ color: '#5A6A8A' }}>至</span>
                              <input type="date" className={`${inp} w-40`}
                                style={{ borderColor: trialEndError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                                value={trialEnd} onChange={e => setTrialEnd(e.target.value)} />
                            </div>
                          </div>
                          {trialStartError && <p className="text-xs" style={{ color: '#DC2626' }}>{trialStartError}</p>}
                          {trialEndError && <p className="text-xs" style={{ color: '#DC2626' }}>{trialEndError}</p>}
                        </div>
                        {trialPreview && (
                          <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                            <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー</p>
                            <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>{trialPreview}</p>
                          </div>
                        )}
                        {trialCalc?.over6 && (
                          <CriticalWarning
                            message={`就業規則第13条では試用期間は原則6ヶ月以内と定められています。\n入力された試用期間（${trialCalc.months}ヶ月${trialCalc.days > 0 ? trialCalc.days + '日' : ''}）は6ヶ月を超えています。\n延長が必要な場合は就業規則第13条第2項に基づき、本人への2週間前通知が必要です。\n本当にこのまま申請してよろしいですか？`}
                            checked={trialWarningChecked}
                            onCheck={setTrialWarningChecked}
                          />
                        )}
                      </div>
                    )}
                    {trialPeriod === '無' && contractType === '正社員' && (
                      <CriticalWarning
                        message={`正社員の雇用では原則として試用期間（6ヶ月）が設けられます（就業規則第13条）。\n試用期間「無し」で申請する場合は、会社が適当と認めた特別なケースに限られます。\n本当にこのまま申請してよろしいですか？`}
                        checked={noTrialWarningChecked}
                        onCheck={setNoTrialWarningChecked}
                      />
                    )}
                  </FormRow>
                </>
              )}

              <SectionHeader label="労働条件" />
              <FormRow label="変形労働時間制" required tooltip={TOOLTIPS['変形労働時間制']}>
                <RadioGroup name="flextime" value={flexTime} onChange={setFlexTime} />
              </FormRow>
              <FormRow label="所定労働時間外労働" required tooltip={TOOLTIPS['所定労働時間外労働']}>
                <RadioGroup name="overtime" value={overtime} onChange={setOvertime} />
              </FormRow>

              <NavButtons onNext={() => {
                const err = validatePeriod()
                if (err) { alert(err); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP6（A=STEP4 / C=STEP6）：契約条件 ===== */}
          {stepType === 'contractCondition' && (
            <>
              <SectionHeader label="締結パターン" />
              <FormRow label="締結パターン" required>
                <div className="grid grid-cols-3 gap-3">
                  {CLOSING_PATTERNS.map(p => (
                    <button key={p.id}
                      onClick={e => { e.preventDefault(); setClosingPattern(p.id) }}
                      className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all text-center"
                      style={{
                        borderColor: closingPattern === p.id ? '#1B3A8C' : '#D0DAF0',
                        background: closingPattern === p.id ? '#EEF2FA' : 'white',
                      }}>
                      <img src={p.icon} alt={p.label} className="w-20 h-20 object-contain" />
                      <p className="text-xs font-bold" style={{ color: '#1B3A8C' }}>{p.label}</p>
                      <p className="text-xs leading-snug" style={{ color: '#5A6A8A' }}>{p.desc}</p>
                    </button>
                  ))}
                </div>
              </FormRow>

              <SectionHeader label="備考文言" />

              {needsBonusSelection(pattern, contractType) ? (
                <FormRow label="賞与" required>
                  <div className="flex gap-3">
                    {(['あり', 'なし'] as const).map(v => (
                      <button key={v}
                        onClick={e => { e.preventDefault(); setBonusType(v) }}
                        className="flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all"
                        style={{
                          borderColor: bonusType === v ? '#1B3A8C' : '#D0DAF0',
                          background: bonusType === v ? '#EEF2FA' : 'white',
                          color: bonusType === v ? '#1B3A8C' : '#5A6A8A',
                        }}>
                        賞与{v}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
                    賞与（ボーナス）が契約上支給される場合は「賞与あり」。決算賞与のみで契約書上に記載が不要な場合は「賞与なし」を選んでください。
                  </p>
                </FormRow>
              ) : (
                <FormRow label="賞与">
                  <p className="text-xs rounded-lg px-3 py-2 inline-block border"
                    style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    自動確定（選択不要）
                  </p>
                </FormRow>
              )}

              {pattern !== 'B' && (
                <FormRow label="備考欄プレビュー">
                  <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（自動生成）</p>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>
                      {remarksText}
                    </p>
                  </div>
                </FormRow>
              )}

              <NavButtons onNext={() => {
                if (!closingPattern) { alert('締結パターンを選択してください'); return }
                if (needsBonusSelection(pattern, contractType) && !bonusType) { alert('賞与の有無を選択してください'); return }
                handleNext()
              }} />
            </>
          )}

          {/* ===== STEP7（A=STEP5 / C=STEP7）：給与・保険 ===== */}
          {stepType === 'salary' && (
            <>
              <SectionHeader label="賃金" />

              {/* 給与の種類 */}
              <FormRow label="給与の種類" required>
                <div className="flex border rounded-lg overflow-hidden bg-white w-fit" style={{ borderColor: '#D0DAF0' }}>
                  {['時給', '日給', '月給'].map(v => (
                    <button key={v}
                      onClick={e => { e.preventDefault(); setSalaryType(v) }}
                      className="px-6 py-2 text-sm border-r last:border-0 transition-colors whitespace-nowrap"
                      style={{
                        borderColor: '#D0DAF0',
                        background: salaryType === v ? '#1B3A8C' : 'white',
                        color: salaryType === v ? 'white' : '#1A2340',
                        fontWeight: salaryType === v ? 600 : 400,
                      }}>{v}</button>
                  ))}
                </div>
              </FormRow>

              {/* 基本給・各種手当 */}
              <FormRow label="基本給・各種手当" required>
                {/* 2列グリッド */}
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#D0DAF0' }}>
                  <div className="grid grid-cols-2">
                    {/* 基本給 */}
                    <div className="p-3 border-r border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>基本給</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={basicSalary} onChange={e => setBasicSalary(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: basicSalaryError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
                          placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                      {basicSalaryError && <p className="text-xs" style={{ color: '#DC2626' }}>{basicSalaryError}</p>}
                    </div>
                    {/* 役職手当 */}
                    <div className="p-3 border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>役職手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={rolePay} onChange={e => setRolePay(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                    </div>
                    {/* 職能給 */}
                    <div className="p-3 border-r border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>職能給</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={skillPay} onChange={e => setSkillPay(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                    </div>
                    {/* 営業手当 */}
                    <div className="p-3 border-b flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>営業手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={salesPay} onChange={e => setSalesPay(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                    </div>
                    {/* 定額残業手当 */}
                    <div className="p-3 border-r flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>定額残業手当</span>
                      <div className="flex items-center gap-1.5 flex-nowrap">
                        <input type="text" value={overtimePay} onChange={e => setOvertimePay(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                        <span className="text-xs" style={{ color: '#D0DAF0' }}>/</span>
                        <input type="text" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-16"
                          style={{ borderColor: overtimeHoursError ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>時間分</span>
                      </div>
                      {overtimeHoursError && <p className="text-xs" style={{ color: '#DC2626' }}>{overtimeHoursError}</p>}
                    </div>
                    {/* 住宅手当 */}
                    <div className="p-3 flex flex-col gap-1.5" style={{ borderColor: '#D0DAF0' }}>
                      <span className="text-xs font-bold" style={{ color: '#5A6A8A' }}>住宅手当</span>
                      <div className="flex items-center gap-1.5">
                        <input type="text" value={housingPay} onChange={e => setHousingPay(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none w-28"
                          style={{ borderColor: '#D0DAF0', color: '#1A2340' }} placeholder="0" />
                        <span className="text-sm" style={{ color: '#5A6A8A' }}>円</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 合計金額 */}
                {/* 時給の場合：月額換算内訳を表示 */}
                {hourlyMonthlyBreakdown && (
                  <div className="rounded-lg px-4 py-3 border flex flex-col gap-1"
                    style={{ background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    {hourlyMonthlyBreakdown.map((line, i) => (
                      <p key={i} className="text-xs" style={{ color: '#1A2340' }}>{line}</p>
                    ))}
                    <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>
                      ※月所定労働日数20日・1日8時間（160時間）での計算例です。実際の支給額は勤務実績により異なります。
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg px-4 py-3 border"
                  style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <span className="text-xs font-medium" style={{ color: '#5A6A8A' }}>
                    {salaryType === '時給' ? '月額換算例（基本給×160時間＋各種手当）' : '合計支給額（基本給＋各種手当）'}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold" style={{ color: '#1B3A8C' }}>
                      {salaryTotal.toLocaleString()}
                    </span>
                    <span className="text-xs" style={{ color: '#5A6A8A' }}>円</span>
                  </div>
                </div>

                {/* 🔴 最重要警告：合計100万円超 */}
                {salaryTotal > 1000000 && (
                  <CriticalWarning
                    message={`合計支給額が1,000,000円を超えています。\n入力内容に誤りがないか、今一度ご確認ください。\n本当にこのまま申請してよろしいですか？`}
                    checked={salaryWarningChecked}
                    onCheck={setSalaryWarningChecked}
                  />
                )}
              </FormRow>

              {/* 割増賃金率 */}
              <FormRow label="割増賃金率">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                  style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  法定の割合に基づく。
                </p>
              </FormRow>

              <SectionHeader label="交通費" />

              {/* 交通費区分 */}
              <FormRow label="交通費区分" required>
                <div className="grid grid-cols-2 gap-2.5">
                  {TRANSPORT_TYPES.map(t => (
                    <button key={t.id}
                      onClick={e => { e.preventDefault(); setTransportType(t.id) }}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all text-center"
                      style={{
                        borderColor: transportType === t.id ? '#1B3A8C' : '#D0DAF0',
                        background: transportType === t.id ? '#EEF2FA' : 'white',
                      }}>
                      <img src={t.icon} alt={t.label} className="w-14 h-14 object-contain" />
                      <p className="text-xs font-bold leading-snug" style={{ color: '#1B3A8C' }}>{t.label}</p>
                    </button>
                  ))}
                </div>
                {/* 帳票プレビュー */}
                <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー（修正不可）</p>
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#1A2340' }}>
                    {selectedTransport.preview}
                  </p>
                </div>
              </FormRow>

              <SectionHeader label="各種保険" />

              {/* 労災保険（自動） */}
              <FormRow label="労災保険">
                <div className="flex items-center justify-between">
                  <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                    style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                    全員加入（自動）
                  </p>
                  <AutoBadge />
                </div>
              </FormRow>

              {/* 加入保険 */}
              <FormRow label="加入保険" required>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={hasEmployInsurance}
                      onChange={e => setHasEmployInsurance(e.target.checked)}
                      className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                    <span className="text-sm" style={{ color: '#1A2340' }}>雇用保険に加入する</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={hasSocialInsurance}
                      onChange={e => setHasSocialInsurance(e.target.checked)}
                      className="w-4 h-4" style={{ accentColor: '#1B3A8C' }} />
                    <span className="text-sm" style={{ color: '#1A2340' }}>健康保険・厚生年金に加入する（必ずセット）</span>
                  </label>
                </div>
                <div className="rounded-lg p-4 border" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#1B3A8C' }}>📄 帳票プレビュー</p>
                  <p className="text-xs" style={{ color: '#1A2340' }}>{insurancePreview}</p>
                </div>
              </FormRow>

              {/* 賃金支払時の控除 */}
              <FormRow label="賃金支払時の控除">
                <p className="text-sm rounded-lg px-3 py-2 inline-block border"
                  style={{ color: '#5A6A8A', background: '#F5F7FC', borderColor: '#D0DAF0' }}>
                  {deductionText}
                </p>
              </FormRow>

              <NavButtons onNext={() => {
                const err = validateSalary()
                if (err) { alert(err); return }
                handleNext()
              }} />
            </>
          )}

          {stepType === 'finalCheck' && (
            <>
              {/* 差し戻しバナー（カード外・上部・独立表示） */}
              {isRejected && (
                <div className="rounded-lg p-4 mb-4 border" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
                  <p className="text-sm font-bold flex items-center gap-1.5 mb-1.5" style={{ color: '#DC2626' }}>⚠️ この申請は差し戻されました</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>{rejectionReason}</p>
                  <p className="text-xs mt-2" style={{ color: '#5A6A8A' }}>差し戻し日時：{rejectedAt}　差し戻し担当：{rejectedBy}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 mb-3">
                <button onClick={() => setCollapsedSections({})}
                  className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>すべて展開</button>
                <button onClick={() => setCollapsedSections({
                  s1: true, s2: true, s3: true, s4: true, s5: true, s6: true, s7: true,
                })}
                  className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>すべて折りたたむ</button>
              </div>

              {/* ===== STEP1：基本情報 ===== */}
              <FinalSection id="s1" title="STEP1：基本情報" sub="契約するスタッフと書類の種類を選びます"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(1)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                <FinalRow label="対象スタッフ" value={selectedStaff ? `${selectedStaff.name}（社員番号：${selectedStaff.employee_number}）` : '―'} />
                <FinalRow label="雇用区分" value={contractType || '―'} />
                <FinalRow label="就業場所区分" value={workPlace || '―'} />
                <FinalRow label="書類種別" value={documentType || '―'} />
              </FinalSection>

              {/* ===== STEP2：就業先情報 ===== */}
              <FinalSection id="s2" title="STEP2：就業先情報" sub="就業場所・業務内容・労働時間を入力します"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(2)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                <FinalRow label="入力方法" value={csvMode === 'csv' ? `CSVデータから自動入力（${csvSystem}）` : '手動で入力する'} />
                <FinalRow label="就業場所名" value={workLocationName || '―'} badge={<CsvBadge name="locationName" />} />
                <FinalRow label="就業場所住所" value={workLocationAddress || '―'} badge={<CsvBadge name="locationAddress" />} />
                <FinalRow label="就業場所電話番号" value={workLocationTel || '―'} badge={<CsvBadge name="locationTel" />} />
                <FinalRow label="業務内容" value={businessContent || '―'} badge={<CsvBadge name="business" />} />
                <FinalRow label="始業時刻" value={startTime || '―'} badge={<CsvBadge name="time" />} />
                <FinalRow label="終業時刻" value={endTime ? `${endTime}${isShift ? '　※シフト制' : ''}` : '―'} badge={<CsvBadge name="time" />} />
                <FinalRow label="休憩時間" value={breakTime ? `${breakTime}分` : '―'} badge={<CsvBadge name="breakTime" />} />
                <FinalRow label="所定労働時間" value={(workingHoursH || workingHoursM) ? `${workingHoursH || 0}時間${workingHoursM || 0}分` : '―'} badge={<CsvBadge name="workingHours" />} />
                <FinalRow label="所定労働日数" value={workDays === 'other' ? (workDaysOther || '―') : (workDays || '―')} />
                <FinalRow label="組織単位" value={organizationUnit || '―'} badge={<CsvBadge name="org" />} />
                {!isConflictDateExempt && <FinalRow label="抵触日（事業所単位）" value={conflictDate || '―'} badge={<CsvBadge name="conflict" />} />}
                <FinalRow label="業務に伴う責任の程度" value={responsibility || '―'} badge={<CsvBadge name="resp" />} />
              </FinalSection>

              {/* ===== STEP3：派遣先担当者（パターンB・Cのみ） ===== */}
              {(pattern === 'B' || pattern === 'C') && (
                <FinalSection id="s3" title="STEP3：派遣先担当者" sub="派遣先の担当者情報を入力します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(3)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="指揮命令者" />
                  <FinalRow label="部署" value={cmd_dept || '―'} badge={<CsvBadge name="cmdDept" />} />
                  <FinalRow label="役職" value={cmd_role || '―'} badge={<CsvBadge name="cmdRole" />} />
                  <FinalRow label="氏名" value={cmd_name || '―'} badge={<CsvBadge name="cmdName" />} />
                  <FinalRow label="電話番号" value={cmd_tel || '―'} badge={<CsvBadge name="cmdTel" />} />

                  <FinalGroupHeader label="派遣先責任者" />
                  <FinalRow label="部署" value={resp_dept || '―'} badge={<CsvBadge name="respDept" />} />
                  <FinalRow label="役職" value={resp_role || '―'} badge={<CsvBadge name="respRole" />} />
                  <FinalRow label="氏名" value={resp_name || '―'} badge={<CsvBadge name="respName" />} />
                  <FinalRow label="電話番号" value={resp_tel || '―'} badge={<CsvBadge name="respTel" />} />

                  <FinalGroupHeader label="苦情処理申出先（派遣先）" />
                  <FinalRow label="部署" value={comp_dept || '―'} badge={<CsvBadge name="compDept" />} />
                  <FinalRow label="役職" value={comp_role || '―'} badge={<CsvBadge name="compRole" />} />
                  <FinalRow label="氏名" value={comp_name || '―'} badge={<CsvBadge name="compName" />} />
                  <FinalRow label="電話番号" value={comp_tel || '―'} badge={<CsvBadge name="compTel" />} />

                  <FinalGroupHeader label="追加項目" />
                  <FinalRow label="福利厚生施設の利用等" value={welfare || '―'} badge={<CsvBadge name="welfare" />} />
                  <FinalRow label="安全及び衛生" value={safetyText || '―'} badge={<CsvBadge name="safety" />} multiline />
                  <FinalRow label="紛争防止措置" value={conflictText || '―'} badge={<CsvBadge name="conflict2" />} multiline />
                </FinalSection>
              )}

              {/* ===== STEP4：派遣元担当者（パターンB・Cのみ） ===== */}
              {(pattern === 'B' || pattern === 'C') && (
                <FinalSection id="s4" title="STEP4：派遣元担当者" sub="自社の担当者情報を確認・修正します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(4)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="派遣元責任者" />
                  <FinalRow label="部署" value={mgr_dept || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept} />} />
                  <FinalRow label="役職" value={mgr_role || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role} />} />
                  <FinalRow label="氏名" value={mgr_name || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name} />} />
                  <FinalRow label="電話番号" value={mgr_tel || '―'} badge={<AutoBadge modified={masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel} />} />

                  <FinalGroupHeader label="苦情処理申出先（派遣元）" />
                  <FinalRow label="部署" value={cmp_dept || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept} />} />
                  <FinalRow label="役職" value={cmp_role || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role} />} />
                  <FinalRow label="氏名" value={cmp_name || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name} />} />
                  <FinalRow label="電話番号" value={cmp_tel || '―'} badge={<AutoBadge modified={masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel} />} />
                </FinalSection>
              )}

              {/* ===== STEP5：期間・労働条件 ===== */}
              <FinalSection id="s5" title="STEP5：期間・労働条件" sub="雇用期間・派遣期間・残業の有無を入力します"
                collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                onEdit={() => setCurrentStep(pattern === 'A' ? 3 : 5)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                {(pattern === 'B' || pattern === 'C') && (
                  <>
                    <FinalRow label="派遣期間" value={(dispatchStart && dispatchEnd) ? `${dispatchStart} 〜 ${dispatchEnd}` : '―'} />
                    {!isConflictDateExempt && <FinalRow label="抵触日（組織単位）" value={conflictDateOrg || '―'} />}
                  </>
                )}
                <FinalRow label="雇用期間" value={
                  employStart
                    ? (period === '有期' ? `${employStart} 〜 ${employEnd || '―'}` : `${employStart} 〜 期間の定めなし`)
                    : '―'
                } />
                <FinalRow label="試用期間" value={
                  trialPeriod === '有' ? `有　${trialStart || '―'} 〜 ${trialEnd || '―'}` : trialPeriod === '無' ? '無' : '―'
                } />
                <FinalRow label="変形労働時間制" value={flexTime || '―'} />
                <FinalRow label="所定労働時間外労働" value={overtime || '―'} />
              </FinalSection>

              {/* ===== STEP6：契約条件（パターンA・Cのみ） ===== */}
              {(pattern === 'A' || pattern === 'C') && (
                <FinalSection id="s6" title="STEP6：契約条件" sub="契約書の締結方法と備考欄の内容を選びます"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(pattern === 'A' ? 4 : 6)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalRow label="締結パターン" value={
                    `${CLOSING_PATTERNS.find(p => p.id === closingPattern)?.label || '―'}\n${CLOSING_PATTERNS.find(p => p.id === closingPattern)?.desc || ''}`
                  } multiline />
                  <FinalRow label="備考欄" value={remarksText || '―'} multiline />
                </FinalSection>
              )}

              {/* ===== STEP7：給与・保険（パターンA・Cのみ） ===== */}
              {(pattern === 'A' || pattern === 'C') && (
                <FinalSection id="s7" title="STEP7：給与・保険" sub="給与の金額と加入する保険を入力します"
                  collapsed={collapsedSections} setCollapsed={setCollapsedSections}
                  onEdit={() => setCurrentStep(pattern === 'A' ? 5 : 7)} editLabel={isRejected ? '確認・修正する' : '修正する'}>
                  <FinalGroupHeader label="賃金" />
                  <FinalRow label="給与の種類" value={salaryType || '―'} />
                  <FinalRow label="基本給" value={basicSalary ? `${parseAmount(basicSalary).toLocaleString()}円` : '―'} />
                  <FinalRow label="役職手当" value={parseAmount(rolePay) > 0 ? `${parseAmount(rolePay).toLocaleString()}円` : '―'} />
                  <FinalRow label="職能給" value={parseAmount(skillPay) > 0 ? `${parseAmount(skillPay).toLocaleString()}円` : '―'} />
                  <FinalRow label="営業手当" value={parseAmount(salesPay) > 0 ? `${parseAmount(salesPay).toLocaleString()}円` : '―'} />
                  <FinalRow label="定額残業手当" value={parseAmount(overtimePay) > 0 ? `${parseAmount(overtimePay).toLocaleString()}円（${parseAmount(overtimeHours)}時間分）` : '―'} />
                  <FinalRow label="住宅手当" value={parseAmount(housingPay) > 0 ? `${parseAmount(housingPay).toLocaleString()}円` : '―'} />
                  {salaryType === '時給' && hourlyMonthlyBreakdown && (
                    <FinalRow label="月額換算（概算）" value={
                      `${hourlyMonthlyBreakdown.join('\n')}\n※月所定労働日数20日・1日8時間（160時間）での計算例です。実際の支給額は勤務実績により異なります。`
                    } multiline highlight={`月額換算例（基本給×160時間＋各種手当）：${salaryTotal.toLocaleString()}円`} />
                  )}

                  <FinalGroupHeader label="交通費" />
                  <FinalRow label="交通費区分" value={selectedTransport.label} />
                  <FinalRow label="帳票プレビュー" value={selectedTransport.preview} multiline preview />

                  <FinalGroupHeader label="各種保険" />
                  <FinalRow label="労災保険" value="全員加入（自動）" badge={<AutoBadge />} />
                  <FinalRow label="加入保険" value={
                    [hasEmployInsurance && '雇用保険に加入する', hasSocialInsurance && '健康保険・厚生年金に加入する'].filter(Boolean).join(' / ') || '―'
                  } />
                  <FinalRow label="帳票プレビュー" value={insurancePreview} preview />
                  <FinalRow label="賃金支払時の控除" value={deductionText} />
                </FinalSection>
              )}

              {/* ===== 申請エリア ===== */}
              <div className="bg-white rounded-xl border shadow-sm p-6 mt-4" style={{ borderColor: '#D0DAF0' }}>
                <div className="rounded-lg px-4 py-3 mb-4 text-sm leading-relaxed border-l-4" style={{ background: '#EEF2FA', color: '#5A6A8A', borderColor: '#1B3A8C' }}>
                  {closingPattern === 'auto'
                    ? '申請後はSSCの承認をお待ちください。承認後、スタッフへ署名依頼が自動送信されます。'
                    : '申請後はSSCの承認をお待ちください。承認後、ダッシュボードから説明手続きを行ってください。'}
                </div>

                {isRejected && submitClickCount === 1 && (
                  <div className="rounded-lg px-4 py-3 mb-3 border" style={{ background: '#FFFBEB', borderColor: '#D97706' }}>
                    <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
                      ⚠️ 差し戻し前と入力内容が変わっていません。内容に問題がないか今一度ご確認ください。問題なければ、もう一度ボタンを押して申請してください。
                    </p>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (isRejected) {
                      if (submitClickCount === 0) { setSubmitClickCount(1); return }
                      alert('申請が完了しました。ダッシュボードへ移動します。')
                      router.push('/dashboard/sales')
                      return
                    }
                    alert('申請が完了しました。ダッシュボードへ移動します。')
                    router.push('/dashboard/sales')
                  }}
                  className="w-full py-3.5 rounded-lg text-white font-bold text-sm mb-2" style={{ background: '#1B3A8C' }}>
                  {isRejected && submitClickCount === 1 ? 'このまま申請する' : '申請する'}
                </button>
                <button onClick={handleCancel} className="w-full text-center text-xs underline py-1" style={{ color: '#5A6A8A' }}>
                  この申請をやめる
                </button>
              </div>

              <div className="flex justify-start mt-3">
                <button onClick={handleBack}
                  className="bg-white border px-5 py-2.5 rounded-lg text-sm transition-all"
                  style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>← 前へ</button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
