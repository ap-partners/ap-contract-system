// ===== 最低賃金改定対応（2026-07-29新設） =====
// docs/SYSTEM_DESIGN.md 10章 2026-07-29「最低賃金改定対応機能」参照。
// 更新期限管理タブのサブタブとして、担当営業（自部門のみ）・SSC（全部門）・管理部（全部門）の
// 3ダッシュボードすべてに組み込む。対象契約の絞り込み自体はcontractsテーブルの既存RLSに委ねており、
// このコンポーネントは受け取ったcandidatesをそのまま一覧表示するだけ（役割ごとの出し分けロジックは持たない）。
// 「修正して再申請する」ボタンは3ロールとも表示する（伊藤さん確認：SSC・管理部にも自部門の申請の
// 可能性があるため、担当営業だけでなく全員に必要）。
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WageRevisionCandidate } from './useWageRevisionCandidates'
// 2026-08-05：日付表記統一によりハイフン生値表示（2026-05-01）を廃止し漢字表記へ
import { formatDateJp } from '@/lib/dateFormat'

type Props = {
  rows: WageRevisionCandidate[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function formatPeriod(row: WageRevisionCandidate): string {
  if (row.employStart || row.employEnd) {
    return `${row.employStart ? formatDateJp(row.employStart) : '未定'} 〜 ${row.employEnd ? formatDateJp(row.employEnd) : '未定'}`
  }
  if (row.contractStartDate) return `${formatDateJp(row.contractStartDate)} 〜（適用開始）`
  return '期間不明'
}

// 2026-07-29追加：時給制はそのままの金額が最低賃金と直接比較できるが、日給・月給は「時給換算した
// 結果」がいくつなのかが伝わらないと、担当営業が実際に何円に直せばよいか判断できない。
// 給与形態ごとに、元の金額と時給換算後の金額の両方を明示する。
// 2026-07-29追記（伊藤さん指摘）：金額計算自体にズレが生じる可能性があるため、計算を経た金額
// （最低賃金マスタの適用行選定・時給換算）には必ず「約」を付ける（basicSalaryは契約書に
// 入力されている値そのものであり計算を経ていないため付けない）。
function formatWageComparison(row: WageRevisionCandidate): string {
  const required = `約${row.requiredWage.toLocaleString()}円`
  if (row.salaryType === '時給') {
    return `時給${row.basicSalary.toLocaleString()}円 → ${required}以上に修正が必要`
  }
  if (row.salaryType === '日給') {
    return `日給${row.basicSalary.toLocaleString()}円（時給換算 約${row.hourlyEquivalent.toLocaleString()}円）→ 時給換算で${required}以上に修正が必要`
  }
  if (row.salaryType === '月給') {
    return `月給${row.basicSalary.toLocaleString()}円（時給換算 約${row.hourlyEquivalent.toLocaleString()}円）→ 時給換算で${required}以上に修正が必要`
  }
  return `時給換算 約${row.hourlyEquivalent.toLocaleString()}円 → ${required}必要`
}

export default function WageRevisionSection({ rows, loading, error, onRefresh }: Props) {
  const router = useRouter()

  useEffect(() => { onRefresh() }, [onRefresh])

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-[#1B2233]">最低賃金改定対応</h3>
          <p className="text-xs text-[#8B98B1] mt-0.5">
            現在の最低賃金マスタと比較して、賃金が不足している申請中・締結済みの契約です（雇用契約書・雇用契約書兼就業条件明示書のみが対象）。
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
          style={{ background: rows.length > 0 ? '#FFF3E8' : '#F3F5F8', color: rows.length > 0 ? '#B7791F' : '#8B98B1' }}
        >
          {rows.length}件
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-2xl border px-4 py-3 text-xs" style={{ background: '#FDECEC', borderColor: '#F5C4C4', color: '#C0392B' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#8B98B1] py-6 text-center">読み込み中…</div>
      ) : rows.length === 0 && !error ? (
        <div className="text-sm text-[#8B98B1] py-6 text-center bg-white rounded-2xl border border-[#EDF0F5]">
          対応が必要な契約はありません。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <div key={row.contractId} className="bg-white rounded-2xl border border-[#EDF0F5] px-4 py-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-[#1B2233]">{row.staffName || '(氏名不明)'}</span>
                    <span className="text-xs text-[#8B98B1]">社員番号 {row.employeeNumber}</span>
                  </div>
                  <div className="text-xs text-[#6B7280] flex items-center gap-2 flex-wrap">
                    <span>{row.deptName || '所属部署不明'}</span>
                    <span>・{row.documentType}</span>
                    <span>・雇用期間 {formatPeriod(row)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold" style={{ color: '#C0392B' }}>
                    {formatWageComparison(row)}
                  </p>
                  <p className="text-xs text-[#8B98B1] mt-0.5">{formatDateJp(row.effectiveFrom)}時点の最低賃金基準（時給約{row.requiredWage.toLocaleString()}円）</p>
                </div>
              </div>
              <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid #F3F5F8' }}>
                <button
                  onClick={() => router.push(`/apply?wageAmend=${row.contractId}`)}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap text-white"
                  style={{ background: '#2F5FD0' }}
                >
                  修正して再申請する
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
