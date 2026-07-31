'use client'

import { useState } from 'react'

// 総合レビュー追加指摘（2026-07-29）：親タブ（契約一覧／更新期限管理／アルバイト誓約書 等）と、
// その中の絞り込みタブ（承認待ち／差し戻し／取り下げ 等）が同じ下線タブの見た目で並んでいたため、
// どちらが親でどちらが子か一目で分からないという指摘を受けて新設した共通部品。
// 親タブ側は従来どおりの下線タブのまま変更せず、子タブ側だけをこのグレー地＋ピル型に置き換えることで、
// 「グレーの帯＝入れ子の器」「青いピル＝選択中」という色の意味を1つずつに揃えている。
// SSC・管理部（契約一覧／社内承認）・担当営業・アルバイト誓約書一覧の4画面共通で使用する。

// 2026-07-31追加：更新期限管理タブの5分類（仕分け待ち／CSV自動反映／期間のみ更新／
// 修正更新／CSVインポート待ち）で、タブごとに意味の異なる色分けを行うため、任意の
// `color`（アクティブ時の背景色）・`helpText`（？アイコンでの説明文）を追加。指定が無い
// 場合は従来通りの青一色（既存の呼び出し箇所は無変更で従来通りの見た目のまま）。
// 2026-07-31追加（伊藤さんレビュー：？の色がタブの色に紛れて見えづらい／単色統一だと逆にダサい、との
// 指摘対応）：？バッジは常に白丸にして視認性を確保しつつ、文字色だけをそのタブ自身の色を濃くした
// 同系色にする（helpColor）。指定が無い場合は既存通りグレー系にフォールバック。
export type SubTabItem<T extends string> = { key: T; label: string; count: number; color?: string; helpColor?: string; helpText?: string }

export function SubTabBar<T extends string>({
  items,
  activeKey,
  onChange,
}: {
  items: SubTabItem<T>[]
  activeKey: T
  onChange: (key: T) => void
}) {
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null)
  return (
    <div className="rounded-2xl bg-[#F3F5F8] p-3">
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-[#E8EDF5] bg-white p-1">
        {items.map(item => {
          const active = item.key === activeKey
          return (
            <div key={item.key} className="relative">
              <button
                onClick={() => onChange(item.key)}
                style={active && item.color ? { background: item.color } : undefined}
                className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? item.color
                      ? 'text-white shadow-[0_2px_8px_rgba(15,23,42,.18)]'
                      : 'bg-[#2F5FD0] text-white shadow-[0_2px_8px_rgba(47,95,208,.25)]'
                    : 'text-[#6B7280] hover:text-[#2F5FD0]'
                }`}
              >
                {item.label} <span className={active ? 'text-white/80' : 'text-[#9AA5B8]'}>{item.count}</span>
                {item.helpText && (
                  <span
                    onClick={e => { e.stopPropagation(); setOpenHelpKey(openHelpKey === item.key ? null : item.key) }}
                    style={{ color: item.helpColor || '#6B7280' }}
                    className="ml-1.5 inline-flex h-[19px] w-[19px] items-center justify-center rounded-full border border-black/5 bg-white text-[11px] font-bold align-middle shadow-[0_1px_3px_rgba(0,0,0,.2)] cursor-pointer"
                  >?</span>
                )}
              </button>
              {item.helpText && openHelpKey === item.key && (
                <div
                  className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-[#1F2937] px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white shadow-[0_10px_30px_rgba(15,23,42,.2)]"
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {item.helpText}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
