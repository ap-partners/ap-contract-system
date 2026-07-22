// ===== 契約状況モニタリング（フェーズ1・一覧表示） =====
// docs/SYSTEM_DESIGN.md 10章 2026-07-23「(A) 契約状況モニタリング機能」参照。
// 管理部ダッシュボード「更新期限管理」タブ内のサブセクションとして表示する（管理部専用）。
// フェーズ1のスコープ：検知ロジック＋一覧表示（重大度ソート込み・台帳なしトグル込み）のみ。
// アクション動線（対応状況管理・担当営業への確認依頼ボタン）はフェーズ2で実装予定
// （設計メモに準拠。ここではボタンを「準備中」表示に留める）。
'use client'

import { useEffect, useState } from 'react'
import { MonitoringRow } from './useContractMonitoring'

type Props = {
  rows: MonitoringRow[]
  loading: boolean
  onRefresh: () => void
}

const SEVERITY_META: Record<1 | 2 | 3 | 4, { label: string; bg: string; color: string; dot: string }> = {
  1: { label: '台帳なし', bg: '#FDECEC', color: '#C0392B', dot: '#C0392B' },
  2: { label: '重大', bg: '#FDECEC', color: '#E74C3C', dot: '#E74C3C' },
  3: { label: '警告', bg: '#FFF3E8', color: '#B7791F', dot: '#F2A73B' },
  4: { label: '注意', bg: '#FFF8E1', color: '#8A6D1D', dot: '#E8C547' },
}

function SeverityBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const m = SEVERITY_META[level]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: m.bg, color: m.color }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  )
}

export default function ContractMonitoringSection({ rows, loading, onRefresh }: Props) {
  const [showLedgerless, setShowLedgerless] = useState(false)

  useEffect(() => { onRefresh() }, [onRefresh])

  const visibleRows = showLedgerless ? rows : rows.filter(r => r.topSeverity !== 1)
  const ledgerlessCount = rows.filter(r => r.topSeverity === 1).length
  const counts = {
    2: rows.filter(r => r.topSeverity === 2).length,
    3: rows.filter(r => r.topSeverity === 3).length,
    4: rows.filter(r => r.topSeverity === 4).length,
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-[#1B2233]">契約状況モニタリング</h3>
          <p className="text-xs text-[#8B98B1] mt-0.5">
            契約未締結・期限切れ放置・長期未対応を検知します（現場の期限間近は上の一覧を参照）。
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showLedgerless}
            onChange={e => setShowLedgerless(e.target.checked)}
            className="rounded"
          />
          台帳なし（契約実績ゼロ・{ledgerlessCount}件）を表示する
        </label>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <SeverityBadge level={2} /><span className="text-xs text-[#6B7280]">{counts[2]}件</span>
        <SeverityBadge level={3} /><span className="text-xs text-[#6B7280]">{counts[3]}件</span>
        <SeverityBadge level={4} /><span className="text-xs text-[#6B7280]">{counts[4]}件</span>
      </div>

      {loading ? (
        <div className="text-sm text-[#8B98B1] py-6 text-center">読み込み中…</div>
      ) : visibleRows.length === 0 ? (
        <div className="text-sm text-[#8B98B1] py-6 text-center bg-white rounded-2xl border border-[#EDF0F5]">
          {showLedgerless ? '該当する案件はありません。' : '要対応の案件はありません（台帳なしを含めて確認する場合は上のチェックをオンにしてください）。'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map(row => (
            <div
              key={row.employeeNumber}
              className="bg-white rounded-2xl border border-[#EDF0F5] px-4 py-3 flex items-start justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <SeverityBadge level={row.topSeverity} />
                  <span className="text-sm font-semibold text-[#1B2233]">{row.staffName || '(氏名不明)'}</span>
                  <span className="text-xs text-[#8B98B1]">社員番号 {row.employeeNumber}</span>
                </div>
                <div className="text-xs text-[#6B7280] flex items-center gap-2 flex-wrap">
                  <span>{row.deptName || '所属部署不明'}</span>
                  {row.contractType && <span>・{row.contractType}</span>}
                  {row.inferredWorkPlace && <span>・{row.inferredWorkPlace}</span>}
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {row.issues.map((issue, i) => (
                    <li key={i} className="text-xs text-[#3A4256]">・{issue.detail}</li>
                  ))}
                </ul>
              </div>
              <button
                disabled
                title="対応状況の管理・担当営業への確認依頼はフェーズ2で実装予定です"
                className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap bg-[#F3F5F8] text-[#B0B8C4] cursor-not-allowed"
              >
                対応依頼（準備中）
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
