'use client'

// 総合レビュー追加指摘（2026-07-29）：親タブ（契約一覧／更新期限管理／アルバイト誓約書 等）と、
// その中の絞り込みタブ（承認待ち／差し戻し／取り下げ 等）が同じ下線タブの見た目で並んでいたため、
// どちらが親でどちらが子か一目で分からないという指摘を受けて新設した共通部品。
// 親タブ側は従来どおりの下線タブのまま変更せず、子タブ側だけをこのグレー地＋ピル型に置き換えることで、
// 「グレーの帯＝入れ子の器」「青いピル＝選択中」という色の意味を1つずつに揃えている。
// SSC・管理部（契約一覧／社内承認）・担当営業・アルバイト誓約書一覧の4画面共通で使用する。

export type SubTabItem<T extends string> = { key: T; label: string; count: number }

export function SubTabBar<T extends string>({
  items,
  activeKey,
  onChange,
}: {
  items: SubTabItem<T>[]
  activeKey: T
  onChange: (key: T) => void
}) {
  return (
    <div className="rounded-2xl bg-[#F3F5F8] p-3">
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-[#E8EDF5] bg-white p-1">
        {items.map(item => {
          const active = item.key === activeKey
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-[#2F5FD0] text-white shadow-[0_2px_8px_rgba(47,95,208,.25)]'
                  : 'text-[#6B7280] hover:text-[#2F5FD0]'
              }`}
            >
              {item.label} <span className={active ? 'text-white/80' : 'text-[#9AA5B8]'}>{item.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
