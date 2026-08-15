'use client'

import { useMemo } from 'react'

// ===== 差分表示（変更前／変更後のハイライト表示） =====
// 2026-08-14新設。外部総合品質監査レポート★2 L-08対応。
// 従来、同一のLCS文字差分アルゴリズム（computeCharDiff）と表示コンポーネント（DiffText）が
// app/apply/_lib/helpers.ts・app/apply/_components/FormParts.tsx・
// app/dashboard/sales/contracts/[id]/page.tsx・app/dashboard/ssc/contracts/[id]/page.tsx の
// 計3箇所に完全に重複コピーされていた（保守性の問題）ため、この1ファイルに集約。
// あわせて、①差分計算をuseMemoでメモ化（従来はレンダーのたびに毎回O(n×m)のDPを再計算していた）、
// ②極端に長いフィールド（自由記述欄など）で1文字ずつのハイライト計算・表示がかえって見づらく、
// 計算コストも無視できなくなるケースに備え、しきい値（800文字）を超える場合は文字単位の差分計算・
// ハイライト表示をスキップし、変更前後の全文をそのまま2ブロックで表示するフォールバックを追加。

export type DiffPart = { type: 'same' | 'removed' | 'added'; text: string }

// 1文字あたりの差分表示・計算が現実的な上限（これを超える場合はフォールバック表示にする）
export const DIFF_TEXT_LENGTH_THRESHOLD = 800

// LCS（最長共通部分列）ベースの文字単位差分計算
export const computeCharDiff = (oldText: string, newText: string): DiffPart[] => {
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

// 差分（DiffPart配列）を、削除部分は取り消し線、追加部分は色付けで表示するコンポーネント
// oldTextとnewTextが完全に同じ場合は newText をそのまま表示する（差分なし）
export const DiffText = ({ oldText, newText, multiline, suffix }: { oldText: string; newText: string; multiline?: boolean; suffix?: string }) => {
  const isTooLong = oldText.length > DIFF_TEXT_LENGTH_THRESHOLD || newText.length > DIFF_TEXT_LENGTH_THRESHOLD

  // フィールドの値が変わるたび（≒レンダーのたび）にO(n×m)のLCS計算をやり直さないよう、
  // oldText/newTextが変わらない限り再計算しない。しきい値超過時はそもそも計算自体を行わない。
  const parts = useMemo(() => {
    if (oldText === newText || isTooLong) return null
    return computeCharDiff(oldText, newText)
  }, [oldText, newText, isTooLong])

  if (oldText === newText) {
    return <span className={multiline ? 'whitespace-pre-line' : ''}>{newText}{suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}</span>
  }

  // 長文フィールド用フォールバック：1文字ずつのハイライトはせず、変更前後の全文をそのまま表示
  if (isTooLong || !parts) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <span className="text-xs font-bold shrink-0 px-1 py-0.5 rounded mt-0.5" style={{ color: '#B91C1C', background: '#FEF2F2' }}>変更前</span>
          <span className={multiline ? 'whitespace-pre-line' : ''}>{oldText}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="text-xs font-bold shrink-0 px-1 py-0.5 rounded mt-0.5" style={{ color: '#15803D', background: '#ECFDF5' }}>変更後</span>
          <span className={multiline ? 'whitespace-pre-line' : ''}>
            {newText}
            {suffix && <span className="text-xs ml-1.5" style={{ color: '#1A2340' }}>{suffix}</span>}
          </span>
        </div>
      </div>
    )
  }

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
