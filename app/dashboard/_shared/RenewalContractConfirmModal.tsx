// ===== 更新期限管理タブ用：原契約・反映内容のSTEP8形式確認画面（読み取り専用） =====
// 2026-07-17実装（意思決定ログ「更新期限管理タブの改修方針を確定」チャットB・⑥）。
// 更新期限管理の一覧・差異確認パネルからは雇用期間・派遣期間・指揮命令者等の限られた項目しか
// 差異チェックしていない。実際にはそれ以外のSTEP項目（就業場所住所・業務内容など）も変わって
// いる可能性があるため、前回契約の実データ（contracts.input_data）とCSVから反映される最新内容を
// STEP8と同じ「項目・前回・今回」形式で全項目並べて確認できるようにする画面。
// 伊藤さんとの確認の結果、セクションは折りたたまず全項目を最初から開いて表示する方式で確定
// （2026-07-17）。あくまで閲覧専用。修正が必要な場合は一覧の「個別に申請する」（チャットDで
// 実装予定）から`/apply`へ進む想定。
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { extractCsvFields } from '@/app/apply/_lib/helpers'
import { RenewalCandidate } from './useRenewalCandidates'
import { RENEWAL_SECTIONS as SECTIONS, RenewalFieldDef } from './renewalFieldMap'

type Props = {
  candidate: RenewalCandidate
  onClose: () => void
}

function formatPeriod(start: string | null, end: string | null) {
  return (!start && !end) ? '―' : `自${start || '―'} 〜 至${end || '―'}`
}

export default function RenewalContractConfirmModal({ candidate, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [prevFields, setPrevFields] = useState<Record<string, any> | null>(null)
  const [csvFields, setCsvFields] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data: contractRow, error: contractError } = await supabase
        .from('contracts')
        .select('input_data')
        .eq('id', candidate.source_contract_id)
        .maybeSingle()
      if (contractError) console.error('原契約の取得エラー:', contractError)
      const fields = (contractRow?.input_data as any)?.fields || {}

      let csv: Record<string, any> | null = null
      if (candidate.new_csv_raw_data_id) {
        const { data: csvRow, error: csvError } = await supabase
          .from('csv_raw_data')
          .select('raw_data')
          .eq('id', candidate.new_csv_raw_data_id)
          .maybeSingle()
        if (csvError) console.error('CSV反映内容の取得エラー:', csvError)
        if (csvRow?.raw_data) {
          csv = extractCsvFields(candidate.csv_system || '', csvRow.raw_data) as Record<string, any>
        }
      }
      if (!cancelled) {
        setPrevFields(fields)
        setCsvFields(csv)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [candidate.source_contract_id, candidate.new_csv_raw_data_id, candidate.csv_system])

  const getPrev = (key: string) => prevFields?.[key] ?? null
  const getNew = (def: RenewalFieldDef) => {
    if (!def.csvKey) return getPrev(def.prevKey) // CSVで管理していない項目＝前回のまま
    if (!csvFields) return getPrev(def.prevKey) // CSV未マッチ＝前回のまま
    return csvFields[def.csvKey] ?? null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0F172A]/45 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-[18px] bg-white shadow-[0_20px_60px_rgba(15,23,42,.25)]">
        <div className="flex items-center justify-between rounded-t-[18px] border-b border-[#E8EDF5] bg-white px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">契約内容の確認（読み取り専用）</p>
            <p className="mt-0.5 text-xs text-[#8B98B1]">
              {candidate.staff_name || '―'}　・　{candidate.employee_number}　・　{candidate.document_type ? candidate.document_type.replace(/\n/g, ' ') : '―'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-[#E8EDF5] bg-[#F3F5F8] px-4 py-1.5 text-xs font-semibold text-[#6B7280]">閉じる</button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="mb-4 rounded-2xl bg-[#EAF1FF] px-4 py-3 text-xs text-[#244CB3]">
            前回契約の内容と、CSVから反映される最新内容をSTEP1〜8と同じ並びで全項目表示しています。修正したい場合は一覧から「個別に申請する」を選んでください（この画面自体は編集できません）。
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#F7FBFF] px-4 py-8 text-center text-xs text-[#8B98B1]">読み込み中です…</div>
          ) : (
            <div className="flex flex-col gap-3">
              <section className="rounded-2xl border border-[#E8EDF5] bg-white px-4 py-4">
                <p className="mb-2 text-xs font-semibold text-[#1F2937]">雇用期間・派遣期間</p>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="text-[#8B98B1]"><td className="w-1/4 py-1 pr-3">項目</td><td className="w-3/8 py-1 pr-3">前回</td><td className="w-3/8 py-1">今回</td></tr>
                    {[
                      { label: '雇用期間', before: formatPeriod(candidate.employ_start_date, candidate.employ_end_date), after: formatPeriod(candidate.new_employ_start, candidate.new_employ_end) },
                      { label: '派遣期間', before: formatPeriod(candidate.dispatch_start_date, candidate.dispatch_end_date), after: formatPeriod(candidate.new_dispatch_start, candidate.new_dispatch_end) },
                      {
                        // 2026-07-17決定：試用期間は更新のたびに引き継がず、一括申請では必ず「無」にする
                        // （入社時の見極めが目的の制度のため。詳細はCLAUDE.md該当日の意思決定ログ参照）。
                        // 前回の値に関わらず「今回」は常に「無（更新のため自動設定）」で固定表示する。
                        label: '試用期間',
                        before: getPrev('trialPeriod') === '有'
                          ? `有　${formatPeriod(getPrev('trialStart'), getPrev('trialEnd'))}`
                          : (getPrev('trialPeriod') === '無' ? '無' : '―'),
                        after: '無（更新のため自動設定）',
                      },
                    ].map(r => {
                      const changed = r.before !== r.after
                      return (
                        <tr key={r.label}>
                          <td className="py-1 pr-3 align-top text-[#6B7280]">{r.label}</td>
                          <td className={`py-1 pr-3 align-top ${changed ? 'text-[#B4B8C2] line-through' : 'text-[#6B7280]'}`}>{r.before}</td>
                          <td className={`py-1 align-top ${changed ? 'font-semibold text-[#E74C3C]' : 'text-[#6B7280]'}`}>{r.after}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              {SECTIONS.filter(s => s.fields.length > 0).map(section => (
                <section key={section.title} className="rounded-2xl border border-[#E8EDF5] bg-white px-4 py-4">
                  <p className="mb-2 text-xs font-semibold text-[#1F2937]">{section.title}</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="text-[#8B98B1]"><td className="w-1/4 py-1 pr-3">項目</td><td className="w-3/8 py-1 pr-3">前回</td><td className="w-3/8 py-1">今回</td></tr>
                      {section.title === '就業場所'
                        ? [
                            { label: '就業場所名', before: candidate.work_location_name || '―', after: candidate.new_work_location_name || candidate.work_location_name || '―' },
                            { label: '住所', before: getPrev('workLocationAddress') || '―', after: candidate.new_work_address || getPrev('workLocationAddress') || '―' },
                            { label: '電話番号', before: getPrev('workLocationTel') || '―', after: getPrev('workLocationTel') || '―' },
                          ].map(r => {
                            const changed = r.before !== r.after
                            return (
                              <tr key={r.label}>
                                <td className="py-1 pr-3 align-top text-[#6B7280]">{r.label}</td>
                                <td className={`py-1 pr-3 align-top ${changed ? 'text-[#B4B8C2] line-through' : 'text-[#6B7280]'}`}>{r.before}</td>
                                <td className={`py-1 align-top ${changed ? 'font-semibold text-[#E74C3C]' : 'text-[#6B7280]'}`}>{r.after}</td>
                              </tr>
                            )
                          })
                        : section.fields.map(def => {
                            const before = getPrev(def.prevKey)
                            const after = getNew(def)
                            const beforeText = (before === null || before === '') ? '―' : String(before)
                            const afterText = (after === null || after === '') ? '―' : String(after)
                            const changed = beforeText !== afterText
                            return (
                              <tr key={def.label}>
                                <td className="py-1 pr-3 align-top text-[#6B7280]">{def.label}</td>
                                <td className={`py-1 pr-3 align-top ${changed ? 'text-[#B4B8C2] line-through' : 'text-[#6B7280]'} ${def.multiline ? 'whitespace-pre-wrap' : ''}`}>{beforeText}</td>
                                <td className={`py-1 align-top ${changed ? 'font-semibold text-[#E74C3C]' : 'text-[#6B7280]'} ${def.multiline ? 'whitespace-pre-wrap' : ''}`}>{afterText}</td>
                              </tr>
                            )
                          })}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
