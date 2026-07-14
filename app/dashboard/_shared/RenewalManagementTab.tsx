// ===== 更新期限管理タブ（共通コンポーネント） =====
// 管理部ダッシュボード（全部門）・担当営業ダッシュボード（自部門のみ）で共有する。
// docs/SYSTEM_DESIGN.md 10章 2026-07-14「更新期限管理タブの仕様を確定」参照。
'use client'

import { useEffect, useState, Fragment } from 'react'
import {
  useRenewalCandidates,
  remainingDays,
  RenewalCandidate,
} from './useRenewalCandidates'

type Props = {
  // null = 全部門（管理部・SSC）／数値 = その部門のみ（担当営業）
  deptNo: number | null
  currentUserId: string
  currentUserDeptName: string | null
}

function daysBadge(days: number | null) {
  if (days === null) return <span className="text-xs text-[#8B98B1]">―</span>
  let bg = '#EEF2FA', color = '#1B3A8C', label = `残${days}日`
  if (days < 0) { bg = '#FDECEC'; color = '#E74C3C'; label = `${Math.abs(days)}日超過` }
  else if (days <= 7) { bg = '#FDECEC'; color = '#E74C3C' }
  else if (days <= 20) { bg = '#FFF3E8'; color = '#F59E42' }
  return <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: bg, color }}>{label}</span>
}

function Segmented({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: '#E8EDF5' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap transition"
          style={value === o.value ? { background: '#2F5FD0', color: '#fff' } : { color: '#6B7280' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function RenewalManagementTab({ deptNo, currentUserId, currentUserDeptName }: Props) {
  const {
    candidates, loading, syncing,
    syncCandidates, fetchCandidates, updateCandidate,
    searchCsvRenewal, requestCsvImport, switchToManualOverride,
    copyDispatchToEmploy, bulkMarkReady,
  } = useRenewalCandidates()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrideReasonId, setOverrideReasonId] = useState<string | null>(null)
  const [overrideReasonText, setOverrideReasonText] = useState('')
  const [manualDraft, setManualDraft] = useState<Record<string, { start: string; end: string }>>({})

  useEffect(() => {
    (async () => {
      await syncCandidates()
      await fetchCandidates(deptNo)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptNo])

  const toggleExpand = async (c: RenewalCandidate) => {
    const opening = expandedId !== c.id
    setExpandedId(opening ? c.id : null)
    if (opening && c.data_source === 'csv' && !c.manual_override && !c.new_csv_raw_data_id && c.status !== 'csv_pending') {
      await searchCsvRenewal(c)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const showManualForm = (c: RenewalCandidate) => c.data_source === 'manual' || c.manual_override

  if (loading || syncing) {
    return <div className="rounded-[18px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#6B7280]">読み込み中です…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.05)] overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '16%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '13%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
            <col style={{ width: '13%' }} /><col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#E8EDF5]">
              <th></th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">対象スタッフ</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">残日数</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">雇用/派遣期間_至</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">スタッフ意向</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">クライアント意向</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">データ元</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-[#6B7280]">内容</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[#8B98B1]">現在、更新期限が近い対象者はいません。</td></tr>
            )}
            {candidates.map(c => {
              const days = remainingDays(c)
              const sameDate = c.employ_end_date && c.dispatch_end_date && c.employ_end_date === c.dispatch_end_date
              const periodLabel = sameDate
                ? `同一・${c.employ_end_date}`
                : `雇${c.employ_end_date || '―'} / 派${c.dispatch_end_date || '―'}`
              const isManual = showManualForm(c)
              const draft = manualDraft[c.id] || { start: c.new_dispatch_start || '', end: c.new_dispatch_end || '' }

              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-[#E8EDF5]">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[#1F2937]">{c.staff_name || '―'}</div>
                      <div className="text-xs text-[#8B98B1]">{c.employee_number}</div>
                    </td>
                    <td className="px-3 py-3">{daysBadge(days)}</td>
                    <td className="px-3 py-3 text-xs text-[#1F2937]">{periodLabel}</td>
                    <td className="px-3 py-3">
                      <Segmented
                        value={c.staff_intent}
                        onChange={v => updateCandidate(c.id, { staff_intent: v as any })}
                        options={[{ value: 'renew', label: '希望' }, { value: 'end', label: '希望しない' }]}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Segmented
                        value={c.client_intent}
                        onChange={v => updateCandidate(c.id, { client_intent: v as any })}
                        options={[{ value: 'ok', label: 'OK' }, { value: 'ng', label: 'NG' }]}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
                        style={isManual ? { background: '#F3ECFF', color: '#5A3EC8' } : { background: '#EAF1FF', color: '#244CB3' }}>
                        {isManual ? (c.manual_override ? '手入力（クライアント変更）' : '手入力') : 'CSV自動'}
                      </span>
                      {!isManual && (
                        <button
                          onClick={() => { setOverrideReasonId(c.id); setOverrideReasonText('') }}
                          className="block mt-1 text-[10px] font-semibold underline"
                          style={{ color: '#F59E42' }}
                        >
                          派遣先変更のため手入力に切替
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleExpand(c)}
                        className="inline-flex items-center gap-1 rounded-2xl border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F5FD0] whitespace-nowrap"
                      >
                        {expandedId === c.id ? '閉じる' : (c.status === 'csv_pending' ? 'CSV未反映' : !isManual ? '差異を確認' : '内容を入力')}
                      </button>
                    </td>
                  </tr>

                  {overrideReasonId === c.id && (
                    <tr className="bg-[#FFF8F1]">
                      <td></td>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs text-[#8B98B1] mb-2">派遣先クライアントの変更理由を入力してください（手入力に切り替わります）</div>
                        <div className="flex gap-2">
                          <input
                            value={overrideReasonText}
                            onChange={e => setOverrideReasonText(e.target.value)}
                            placeholder="例：派遣先が◯◯から××に変更"
                            className="flex-1 text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                          />
                          <button
                            onClick={async () => {
                              if (!overrideReasonText.trim()) return
                              await switchToManualOverride(c.id, overrideReasonText.trim())
                              setOverrideReasonId(null)
                            }}
                            className="rounded-2xl bg-[#2F5FD0] text-white text-xs font-semibold px-4 py-1.5 whitespace-nowrap"
                          >切替確定</button>
                          <button onClick={() => setOverrideReasonId(null)} className="rounded-2xl border border-[#E8EDF5] text-xs font-semibold px-4 py-1.5 whitespace-nowrap">キャンセル</button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {expandedId === c.id && (
                    <tr className="bg-[#F7FBFF]">
                      <td></td>
                      <td colSpan={7} className="px-4 py-4">
                        {!isManual ? (
                          c.status === 'csv_pending' ? (
                            <div className="flex flex-col gap-2">
                              <div className="text-xs text-[#8B98B1]">CSVに新しい個別契約データがまだ反映されていません。管理部へインポートを依頼してください。</div>
                              <button
                                onClick={() => requestCsvImport(c, currentUserId, currentUserDeptName)}
                                className="self-start rounded-2xl border border-[#E8EDF5] bg-white px-4 py-1.5 text-xs font-semibold text-[#2F5FD0]"
                              >CSVインポートを依頼</button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div className="text-[11px] text-[#8B98B1]">CSVから自動取得した最新内容との差異</div>
                              <table className="text-xs w-full">
                                <tbody>
                                  <tr className="text-[#6B7280]"><td className="py-1 pr-3 w-1/5">項目</td><td className="py-1 pr-3 w-2/5">前回</td><td className="py-1 w-2/5">今回</td></tr>
                                  <tr>
                                    <td className="py-1 pr-3">雇用期間_至</td>
                                    <td className="py-1 pr-3 text-[#8B98B1] line-through">{c.employ_end_date || '―'}</td>
                                    <td className="py-1 font-semibold" style={{ color: c.new_employ_end !== c.employ_end_date ? '#E74C3C' : '#1F2937' }}>{c.new_employ_end || '―'}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 pr-3">派遣期間_至</td>
                                    <td className="py-1 pr-3 text-[#8B98B1] line-through">{c.dispatch_end_date || '―'}</td>
                                    <td className="py-1 font-semibold" style={{ color: c.new_dispatch_end !== c.dispatch_end_date ? '#E74C3C' : '#1F2937' }}>{c.new_dispatch_end || '―'}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 pr-3">就業場所</td>
                                    <td className="py-1 pr-3 text-[#8B98B1] line-through">{c.work_location_name || '―'}</td>
                                    <td className="py-1 font-semibold" style={{ color: c.new_work_location_name !== c.work_location_name ? '#E74C3C' : '#1F2937' }}>{c.new_work_location_name || '―'}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="text-[11px] text-[#8B98B1]">
                              {c.manual_override ? '派遣先クライアント変更のため手入力です。' : '前回の派遣期間がデフォルト表示されています。'}
                              派遣期間を入力すると雇用期間に自動でコピーされます。
                            </div>
                            <div className="grid grid-cols-3 gap-2 items-end">
                              <div>
                                <div className="text-[11px] text-[#6B7280] mb-1">派遣期間_自</div>
                                <input
                                  value={draft.start || c.dispatch_end_date || ''}
                                  onChange={e => setManualDraft(prev => ({ ...prev, [c.id]: { start: e.target.value, end: prev[c.id]?.end || draft.end } }))}
                                  className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] text-[#6B7280] mb-1">派遣期間_至</div>
                                <input
                                  value={draft.end}
                                  onChange={e => setManualDraft(prev => ({ ...prev, [c.id]: { start: prev[c.id]?.start || draft.start, end: e.target.value } }))}
                                  className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5"
                                />
                              </div>
                              <button
                                onClick={() => draft.start && draft.end && copyDispatchToEmploy(c.id, draft.start, draft.end)}
                                className="rounded-2xl border border-[#E8EDF5] px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                                style={{ background: '#EAF1FF', color: '#244CB3' }}
                              >雇用期間へコピー ↓</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[11px] text-[#6B7280] mb-1">雇用期間_自</div>
                                <input readOnly value={c.new_employ_start || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                              </div>
                              <div>
                                <div className="text-[11px] text-[#6B7280] mb-1">雇用期間_至</div>
                                <input readOnly value={c.new_employ_end || ''} className="w-full text-xs rounded-lg border border-[#E8EDF5] px-2 py-1.5" style={{ background: '#F3F5F8' }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-[#8B98B1]">{selected.size}件選択中</span>
        <button
          disabled={selected.size === 0}
          onClick={async () => { await bulkMarkReady(Array.from(selected)); setSelected(new Set()) }}
          className="rounded-2xl bg-[#2F5FD0] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          選択行を一括で送付準備完了に
        </button>
      </div>
    </div>
  )
}
