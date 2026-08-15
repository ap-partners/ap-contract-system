'use client'

// ===== app/apply/page.tsx から切り出した「小さな再利用UI部品コンポーネント」だけを集めたファイル =====
// スケーラビリティ改善タスク③（apply/page.tsx分割・Phase2）2026-07-14
// JSXを返す小さな部品のみここに置く。純粋な計算・変換ロジックは ../_lib/helpers.ts 側にある。

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { validateTel, normalizeTel, inp } from '../_lib/helpers'
import { DiffText } from '../../_shared/ui/DiffText'

// DiffText（差分表示コンポーネント）は2026-08-14（L-08対応）で
// app/_shared/ui/DiffText.tsx へ集約済み。ここでは呼び出し元の互換性を保つため re-export しておく
// （このファイル内のFinalRow等からも参照するため、importしたうえで再エクスポートする）。
export { DiffText }

export const Req = () => (
  <span className="text-xs px-1.5 py-0.5 rounded ml-1 leading-none shrink-0"
    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>必須</span>
)

export const AutoBadge = ({ modified, source = 'master' }: { modified?: boolean; source?: 'master' | 'csv' }) => {
  const label = source === 'csv' ? 'CSV反映' : 'マスタ情報反映'
  // CSV反映の場合は、STEP2・STEP3のCsvBadgeと同じ配色（緑系）に統一する
  // マスタ情報反映の場合は、元々の配色（紺・オレンジ系）のまま
  if (source === 'csv') {
    return modified ? (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>{label}（修正済み）</span>
    ) : (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
        style={{ background: '#ECFDF5', color: '#0D9488', border: '1px solid #A7F3D0' }}>{label}</span>
    )
  }
  return modified ? (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'white', color: '#D97706', border: '1px solid #D97706' }}>{label}（修正済み）</span>
  ) : (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'white', color: '#1B3A8C', border: '1px solid #1B3A8C' }}>{label}</span>
  )
}

// 2026-07-30修正：吹き出しが常に「アイコンの右側」に固定で開いていたため、2列グリッドの右列にある
// 項目（誓約書の役職手当・営業手当、/apply STEP7の定額残業手当・役職手当・住宅手当等）で画面端に
// はみ出して見切れる不具合があった（伊藤さん実機確認で発覚）。項目ごとに向きを手動指定する方式は
// 今後項目が増えるたびに設定漏れが起こりうるため、アイコンの実際の画面上の位置をその場で計測し、
// 右にはみ出しそうなら左に、画面下端に近ければ上寄りに、と自動で向きを判定する方式に変更。
// 位置計算に使う祖先要素のoverflow-hiddenの影響を受けないよう、吹き出し自体はdocument.bodyへの
// ポータル描画＋position:fixedにしている（見た目・文言・アイコンの配色は変更なし）。
const TOOLTIP_WIDTH = 256 // w-64
const TOOLTIP_MAX_HEIGHT_ESTIMATE = 100
const TOOLTIP_MARGIN = 8

export const Tooltip = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const iconRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!show) return
    const updatePos = () => {
      const el = iconRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // 横方向：まずアイコンの右側に開く。画面右端をはみ出す場合はアイコンの左側に開く
      let left = rect.right + TOOLTIP_MARGIN
      if (left + TOOLTIP_WIDTH > window.innerWidth - TOOLTIP_MARGIN) {
        left = rect.left - TOOLTIP_WIDTH - TOOLTIP_MARGIN
      }
      left = Math.max(TOOLTIP_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN))
      // 縦方向：アイコンの上端に揃える。画面下端に近い場合はアイコンの下端を吹き出しの下端に揃える
      let top = rect.top
      if (top + TOOLTIP_MAX_HEIGHT_ESTIMATE > window.innerHeight - TOOLTIP_MARGIN) {
        top = Math.max(TOOLTIP_MARGIN, rect.bottom - TOOLTIP_MAX_HEIGHT_ESTIMATE)
      }
      setPos({ top, left })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [show])

  return (
    <span ref={iconRef} className="relative inline-flex items-center ml-1 shrink-0">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer shrink-0"
        style={{ background: '#F97316', color: 'white', fontSize: '10px', fontWeight: 600 }}>
        ?
      </span>
      {show && pos && typeof document !== 'undefined' && createPortal(
        <span className="fixed z-50 rounded-lg px-3 py-2 text-xs shadow-lg w-64"
          style={{ background: '#1A2340', color: 'white', lineHeight: '1.6', top: pos.top, left: pos.left }}>
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}

export const FormRow = ({ label, required, tooltip, badge, children, isEmpty, emptyHint, wide, hintInline }: {
  label: string; required?: boolean; tooltip?: string; badge?: React.ReactNode; children: React.ReactNode
  isEmpty?: boolean; emptyHint?: string; wide?: boolean; hintInline?: boolean
}) => {
  // isEmpty（未入力強調）が立っている時だけ、赤系の配色に切り替える
  const highlight = !!isEmpty
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
      <div className="border-r border-b px-4 py-4 flex flex-col items-start justify-center gap-1.5"
        style={{ background: highlight ? '#FEF2F2' : '#EEF2FA', borderColor: highlight ? '#FECACA' : '#D0DAF0' }}>
        <div className="flex items-center flex-wrap gap-1">
          <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
          {required && <Req />}
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        {highlight ? (
          <span className="text-xs px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1"
            style={{ background: 'white', color: '#DC2626', border: '1px solid #DC2626' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></svg>
            未入力
          </span>
        ) : badge}
      </div>
      <div className="border-b px-5 py-4 flex flex-col gap-3"
        style={{ background: highlight ? '#FEF2F2' : '#FFFFFF', borderColor: highlight ? '#FECACA' : '#D0DAF0' }}>
        {highlight && emptyHint && wide && !hintInline && <EmptyHintBubble text={emptyHint} direction="down" />}
        {wide || hintInline ? children : (
          <div className="flex items-center gap-3 flex-wrap">
            {children}
            {highlight && emptyHint && <EmptyHintBubble text={emptyHint} direction="left" />}
          </div>
        )}
      </div>
    </div>
  )
}

// 未入力時の案内吹き出し。
// direction="left"は入力欄の右隣に並べる（左向き矢印）
// direction="down"は入力欄の上に置く（下向き矢印で入力欄を指す）
// direction="up"は入力欄の下に置く（上向き矢印で、上にある入力欄を指す。複数の入力欄が並ぶ行の下に置きたい場合に使う）
export const EmptyHintBubble = ({ text, direction }: { text: string; direction: 'left' | 'down' | 'up' }) => {
  if (direction === 'down') {
    return (
      <div className="text-xs font-medium px-2.5 py-1 rounded-md relative"
        style={{ background: '#DC2626', color: 'white', marginLeft: '12px', whiteSpace: 'nowrap', display: 'inline-block', width: 'fit-content' }}>
        {text}
        <div className="absolute" style={{ bottom: '-5px', left: '16px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #DC2626' }} />
      </div>
    )
  }
  if (direction === 'up') {
    return (
      <div className="text-xs font-medium px-2.5 py-1 rounded-md relative"
        style={{ background: '#DC2626', color: 'white', marginLeft: '12px', whiteSpace: 'nowrap', display: 'inline-block', width: 'fit-content' }}>
        <div className="absolute" style={{ top: '-5px', left: '16px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #DC2626' }} />
        {text}
      </div>
    )
  }
  return (
    <div className="text-xs font-medium px-2.5 py-1 rounded-md relative shrink-0"
      style={{ background: '#DC2626', color: 'white', whiteSpace: 'nowrap' }}>
      <div className="absolute" style={{ top: '50%', left: '-5px', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid #DC2626' }} />
      {text}
    </div>
  )
}

export const FormRowAuto = ({ label, modified, source, children, isEmpty, emptyHint, wide }: { label: string; modified?: boolean; source?: 'master' | 'csv'; children: React.ReactNode; isEmpty?: boolean; emptyHint?: string; wide?: boolean }) => {
  const highlight = !!isEmpty
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
      <div className="border-r border-b px-4 py-4 flex flex-col items-start justify-center gap-1.5"
        style={{ background: highlight ? '#FEF2F2' : '#EEF2FA', borderColor: highlight ? '#FECACA' : '#D0DAF0' }}>
        <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
        {highlight ? (
          <span className="text-xs px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1"
            style={{ background: 'white', color: '#DC2626', border: '1px solid #DC2626' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></svg>
            未入力
          </span>
        ) : <AutoBadge modified={modified} source={source} />}
      </div>
      <div className="border-b px-5 py-4 flex flex-col gap-2"
        style={{ background: highlight ? '#FEF2F2' : '#FFFFFF', borderColor: highlight ? '#FECACA' : '#D0DAF0' }}>
        {wide ? (
          <>
            {highlight && emptyHint && <EmptyHintBubble text={emptyHint} direction="down" />}
            {children}
          </>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            {children}
            {highlight && emptyHint && <EmptyHintBubble text={emptyHint} direction="left" />}
          </div>
        )}
      </div>
    </div>
  )
}

export const SectionHeader = ({ label }: { label: string }) => (
  <>
    <div style={{ height: '12px', background: '#F5F7FC' }} />
    <div className="px-5 py-2.5 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
      <p className="text-sm font-medium text-white">▼ {label}</p>
    </div>
  </>
)

// ===== STEP8：最終確認用コンポーネント =====
export const FinalSection = ({ id, title, sub, collapsed, setCollapsed, onEdit, editLabel, children }: {
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

export const FinalGroupHeader = ({ label }: { label: string }) => (
  <>
    <div style={{ height: '10px', background: '#F5F7FC' }} />
    <div className="px-5 py-2 border-b" style={{ background: '#1B3A8C', borderColor: '#1B3A8C' }}>
      <p className="text-xs font-medium text-white">▼ {label}</p>
    </div>
  </>
)

export const FinalRow = ({ label, value, badge, multiline, preview, highlight, oldValue, suffix }: {
  label: string; value: string; badge?: React.ReactNode; multiline?: boolean; preview?: boolean; highlight?: string; oldValue?: string; suffix?: string
}) => {
  // oldValueが渡されていて、かつ現在値と異なる場合だけ、差分表示（CSV反映項目を手で修正したケース）
  const showDiff = oldValue !== undefined && oldValue !== '' && oldValue !== value
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] border-b" style={{ borderColor: '#D0DAF0' }}>
      <div className="border-r px-4 py-3.5 flex flex-col items-start gap-1.5" style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
        <span className="text-sm font-medium leading-snug" style={{ color: '#1A2340' }}>{label}</span>
        {badge}
      </div>
      <div className={`px-5 py-3.5 text-sm ${multiline ? 'whitespace-pre-line' : (showDiff ? '' : 'flex items-center')}`}
        style={{ background: preview ? '#EEF2FA' : (showDiff ? '#FFFBEB' : 'white'), color: '#1A2340', lineHeight: 1.7, borderRadius: preview ? '8px' : 0, margin: preview ? '6px 12px' : 0 }}>
        {showDiff
          ? <DiffText oldText={oldValue} newText={value} multiline={multiline} suffix={suffix} />
          : <>{value}{suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}</>}
        {highlight && <p className="text-sm mt-2" style={{ color: '#1A2340' }}>{highlight}</p>}
      </div>
    </div>
  )
}

export const ModeToggle = ({ mode, onChange }: { mode: 'default' | 'new'; onChange: (m: 'default' | 'new') => void }) => (
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

// 総合レビュー（QA監査2026-07-22）指摘B1対応：自由記述欄に文字数上限が無かったため、
// 既定で2000文字までに制限する（帳票に埋め込む文言として現実的に十分な長さで、通常の
// 入力を妨げない値。呼び出し側で個別に上限を変えたい場合はmaxLengthを指定できる）。
export const NoBreakTextarea = ({ value, onChange, placeholder, minHeight = '60px', bg = 'white', maxLength = 2000 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: string; bg?: string; maxLength?: number
}) => (
  <textarea
    className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none placeholder:text-gray-400"
    style={{ borderColor: '#D0DAF0', color: '#1A2340', background: bg, minHeight, lineHeight: '1.6', resize: 'vertical' }}
    value={value}
    onChange={e => onChange(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
    placeholder={placeholder}
    maxLength={maxLength}
  />
)

export const TelInput = ({ value, onChange, note }: { value: string; onChange: (v: string) => void; note?: string }) => {
  const [touched, setTouched] = useState(false)
  const error = touched ? validateTel(value) : null
  return (
    <div className="max-w-xs">
      <input type="tel" inputMode="numeric" className={inp} maxLength={20}
        style={{ borderColor: error ? '#DC2626' : '#D0DAF0', color: '#1A2340' }}
        value={value}
        onChange={e => onChange(normalizeTel(e.target.value))}
        onBlur={() => setTouched(true)}
        placeholder="例）03-1234-5678" />
      {error && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{error}</p>}
      {note && !error && <p className="text-xs mt-1" style={{ color: '#5A6A8A' }}>{note}</p>}
    </div>
  )
}

export const RadioGroup = ({ name, value, onChange }: {
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

export const CriticalWarning = ({ message, checked, onCheck, checkboxLabel, title }: {
  message: string; checked: boolean; onCheck: (v: boolean) => void; checkboxLabel?: string; title?: string
}) => (
  <div className="rounded-lg p-4 border-2 mt-3" style={{ background: '#FEF2F2', borderColor: '#DC2626' }}>
    <p className="text-sm font-bold mb-2" style={{ color: '#DC2626' }}>{title || '🔴 最重要警告'}</p>
    <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#1A2340' }}>{message}</p>
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)}
        className="w-4 h-4" style={{ accentColor: '#DC2626' }} />
      <span className="text-sm font-medium" style={{ color: '#DC2626' }}>
        {checkboxLabel || '上記の警告内容について、上長の了承を得ています。'}
      </span>
    </label>
  </div>
)

export function SearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [localQuery, setLocalQuery] = useState('')
  const [localSearching, setLocalSearching] = useState(false)
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    setLocalSearching(true)
    await onSearch(localQuery)
    setLocalSearching(false)
  }
  return (
    <div className="max-w-xl">
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
