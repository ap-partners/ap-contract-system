// ===== ダッシュボード共通：一覧の絞り込み・並び替え・検索 =====
// 2026-07-14追加。「承認済み・完了」等、案件が蓄積していくタブで、ステータスが混在して
// 分かりづらい／目当ての案件を探しにくい、という伊藤さんの指摘を受けて新設した共通部品。
// 担当営業ダッシュボードに既にあった「ステータス別ピルボタン」の絞り込み方式を踏襲しつつ、
// 新たにテキスト検索・並び替えを追加し、SSC・担当営業・管理部の全ての一覧タブで共通して使う
// （docs/SYSTEM_DESIGN.md 10章 2026-07-14参照）。
'use client'

import { useEffect, useMemo, useState } from 'react'

export type StatusOption = { value: string; label: string }
export type SortOption<T> = { key: string; label: string; compare: (a: T, b: T) => number }

export type ContractListToolbarConfig<T> = {
  // ステータス別の絞り込みピル。実装は「1件も無い（未設定）」場合のみ行自体を非表示にする
  // （長らくコメントが「2件未満」となっていたが実装は`length > 0`判定。2026-07-22訂正）。
  statusOptions?: StatusOption[]
  // 並び替えの選択肢。先頭がデフォルトの並び順になる。
  sortOptions: SortOption<T>[]
  // 検索対象文字列を1件ごとに作る関数（氏名・社員番号・就業先などを連結する想定）。
  getSearchText: (item: T) => string
  searchPlaceholder?: string
  // メインタブ切り替え時など、絞り込み状態をリセットしたいタイミングで変える値
  resetKey?: string
}

export function useContractListToolbar<T extends { status: string }>(
  items: T[],
  config: ContractListToolbarConfig<T>
) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<string>(config.sortOptions[0]?.key || '')

  // resetKeyが変わったら（例：メインタブの切り替え）絞り込み状態を初期化する。
  // 前のタブで選んだステータス値が今のタブに存在せず、一覧が意図せず0件に見えるのを防ぐ。
  useEffect(() => {
    setStatusFilter('all')
    setSearchText('')
    setSortKey(config.sortOptions[0]?.key || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.resetKey])

  const result = useMemo(() => {
    let out = items
    if (config.statusOptions && config.statusOptions.length > 0 && statusFilter !== 'all') {
      out = out.filter(c => c.status === statusFilter)
    }
    const q = searchText.trim().toLowerCase()
    if (q) {
      out = out.filter(c => config.getSearchText(c).toLowerCase().includes(q))
    }
    const sortOption = config.sortOptions.find(s => s.key === sortKey)
    if (sortOption) {
      out = [...out].sort(sortOption.compare)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, statusFilter, searchText, sortKey])

  const toolbar = (
    <div className="mb-4 flex flex-col gap-3">
      {config.statusOptions && config.statusOptions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium flex-shrink-0" style={{ color: '#5A6A8A' }}>絞り込み：</span>
          <button
            onClick={() => setStatusFilter('all')}
            className="text-xs font-medium px-3 py-1 rounded-full transition-all"
            style={statusFilter === 'all'
              ? { background: '#1B3A8C', color: 'white', border: '1px solid #1B3A8C' }
              : { background: 'white', color: '#5A6A8A', border: '1px solid #D0DAF0' }}>
            すべて
          </button>
          {config.statusOptions.map(opt => {
            const isActive = statusFilter === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className="text-xs font-medium px-3 py-1 rounded-full transition-all"
                style={isActive
                  ? { background: '#1B3A8C', color: 'white', border: '1px solid #1B3A8C' }
                  : { background: 'white', color: '#5A6A8A', border: '1px solid #D0DAF0' }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#5A6A8A' }}>🔍</span>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={config.searchPlaceholder || '氏名・社員番号・就業先で検索'}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
            style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
          />
        </div>
        {config.sortOptions.length > 1 && (
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: '#D0DAF0', color: '#1A2340', background: 'white' }}>
            {config.sortOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )

  return { result, toolbar, statusFilter, searchText, sortKey }
}

// よく使う並び替え軸（申請日時／確認・署名日時）を組み立てるヘルパー。
// 署名日時（signed_at）はnullの案件があるため、null側は常に末尾に回す。
export function buildDateSortOptions<T extends { created_at: string; signed_at?: string | null }>(): SortOption<T>[] {
  return [
    { key: 'created_desc', label: '申請日が新しい順', compare: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() },
    { key: 'created_asc', label: '申請日が古い順', compare: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() },
    {
      key: 'signed_desc', label: '確認・署名日が新しい順', compare: (a, b) => {
        const at = a.signed_at ? new Date(a.signed_at).getTime() : -Infinity
        const bt = b.signed_at ? new Date(b.signed_at).getTime() : -Infinity
        return bt - at
      },
    },
    {
      key: 'signed_asc', label: '確認・署名日が古い順', compare: (a, b) => {
        const at = a.signed_at ? new Date(a.signed_at).getTime() : Infinity
        const bt = b.signed_at ? new Date(b.signed_at).getTime() : Infinity
        return at - bt
      },
    },
  ]
}
