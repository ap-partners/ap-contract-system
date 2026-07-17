// ===== マスタ管理タブ（管理部ダッシュボード専用） =====
// 2026-07-17新設。CLAUDE.md残タスク5番（部門マスタ・最低賃金/所定労働時間マスタ・
// 労働者派遣料金額マスタの管理画面）に対応。API（app/api/admin/master-data/route.ts）を
// 経由して4テーブルを読み書きする。書き込みは管理部ロールのみ（API・RLS双方でガード済み）。
//
// 【確定仕様（2026-07-17・伊藤さんとの相談で確定）】
// ①部門マスタ：新規追加のみ（既存行の編集・削除は画面から不可）
// ②最低賃金・所定労働時間マスタ：新規追加＋直近レコードの修正が可能
// ③派遣料金額マスタ：営業所をあらかじめ全件表示し、金額を入力する表形式（office_nameで upsert）
'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAuthHeader } from '@/lib/supabase'

type Department = { id: string; dept_no: number; dept_name: string; created_at: string }
type MinimumWage = { id: string; dept_no: number; hourly_wage: number; effective_from: string; created_at: string; updated_at: string }
type WorkingHours = { id: string; work_place: string; contract_type: string; pattern_name: string; monthly_hours: number; created_at: string; updated_at: string }
type DispatchFee = { id: string; office_name: string; fiscal_year_label: string; amount_per_day: number; updated_at: string }

type MasterData = {
  departments: Department[]
  minimumWages: MinimumWage[]
  workingHours: WorkingHours[]
  dispatchFees: DispatchFee[]
  officeNames: string[]
}

const SUB_TABS = ['部門', '最低賃金', '所定労働時間', '派遣料金額'] as const
type SubTab = typeof SUB_TABS[number]

const card = 'rounded-2xl border border-[#E8EDF5] bg-white'
const inputCls = 'w-full rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] focus:border-[#2F5FD0] focus:outline-none'
const primaryBtn = 'inline-flex items-center gap-2 rounded-2xl bg-[#2F5FD0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#274CB0] disabled:cursor-not-allowed disabled:opacity-60'
const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-[#E8EDF5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]'

export default function MasterManagementTab() {
  const [subTab, setSubTab] = useState<SubTab>('部門')
  const [data, setData] = useState<MasterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/admin/master-data', { headers })
      const json = await res.json()
      if (!res.ok) { setLoadError(json.error || 'マスタデータの取得に失敗しました。'); setLoading(false); return }
      setData(json)
    } catch {
      setLoadError('マスタデータの取得に失敗しました。通信環境をご確認ください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <p className="text-lg font-semibold text-[#1F2937]">マスタ管理</p>
        <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
          部門・最低賃金・所定労働時間・労働者派遣料金額の各マスタを管理します。
          部門マスタは新規追加のみ、既存の部門名変更・削除が必要な場合はClaudeにご相談ください。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {SUB_TABS.map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition ${subTab === t ? 'border-[#2F5FD0] bg-[#EAF1FF] text-[#2F5FD0]' : 'border-[#E8EDF5] bg-white text-[#1F2937] hover:border-[#2F5FD0] hover:text-[#2F5FD0]'}`}
            >
              {t}マスタ
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className={`${card} p-8 text-center`}>
          <p className="text-sm font-medium text-[#6B7280]">読み込み中…</p>
        </section>
      ) : loadError ? (
        <section className={`${card} p-8`}>
          <p className="text-sm font-medium leading-6 text-[#E74C3C]">{loadError}</p>
          <button onClick={load} className={`${secondaryBtn} mt-4`}>再読み込み</button>
        </section>
      ) : data ? (
        <>
          {subTab === '部門' && <DepartmentSection data={data} reload={load} />}
          {subTab === '最低賃金' && <MinimumWageSection data={data} reload={load} />}
          {subTab === '所定労働時間' && <WorkingHoursSection data={data} reload={load} />}
          {subTab === '派遣料金額' && <DispatchFeeSection data={data} reload={load} />}
        </>
      ) : null}
    </div>
  )
}

// 共通：APIへのPOSTラッパー
async function postAction(action: string, payload: any): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers = await getAuthHeader()
    const res = await fetch('/api/admin/master-data', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json.error || '処理に失敗しました。' }
    return { ok: true }
  } catch {
    return { ok: false, error: '通信エラーが発生しました。' }
  }
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-2xl border border-[#FDE0E0] bg-[#FDECEC] p-4">
      <p className="text-sm font-medium leading-6 text-[#E74C3C]">{message}</p>
    </div>
  )
}

// ===== 部門マスタ =====
function DepartmentSection({ data, reload }: { data: MasterData; reload: () => Promise<void> }) {
  const [deptNo, setDeptNo] = useState('')
  const [deptName, setDeptName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    setError('')
    setSubmitting(true)
    const result = await postAction('add_department', { deptNo: Number(deptNo), deptName })
    setSubmitting(false)
    if (!result.ok) { setError(result.error || '登録に失敗しました。'); return }
    setDeptNo(''); setDeptName('')
    await reload()
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">新規部門を追加</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr_auto]">
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">部門番号</label>
            <input type="number" value={deptNo} onChange={e => setDeptNo(e.target.value)} className={inputCls} placeholder="例：51" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">部門名</label>
            <input type="text" value={deptName} onChange={e => setDeptName(e.target.value)} className={inputCls} placeholder="例：新設営業所" />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={submitting || !deptNo || !deptName} className={primaryBtn}>
              {submitting ? '追加中…' : '追加する'}
            </button>
          </div>
        </div>
        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
      </section>

      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">登録済み部門（{data.departments.length}件）</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF5] text-left text-xs font-semibold text-[#6B7280]">
                <th className="px-3 py-2">部門番号</th>
                <th className="px-3 py-2">部門名</th>
              </tr>
            </thead>
            <tbody>
              {data.departments.map(d => (
                <tr key={d.id} className="border-b border-[#F1F4F9]">
                  <td className="px-3 py-2 font-medium text-[#1F2937]">{d.dept_no}</td>
                  <td className="px-3 py-2 text-[#1F2937]">{d.dept_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ===== 最低賃金マスタ =====
function MinimumWageSection({ data, reload }: { data: MasterData; reload: () => Promise<void> }) {
  const [addDeptNo, setAddDeptNo] = useState('')
  const [addWage, setAddWage] = useState('')
  const [addDate, setAddDate] = useState('')
  const [addError, setAddError] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editWage, setEditWage] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [expandedDept, setExpandedDept] = useState<number | null>(null)

  const deptNameOf = (deptNo: number) => data.departments.find(d => d.dept_no === deptNo)?.dept_name || `部門${deptNo}`

  // dept_noごとにグルーピングし、適用開始日が最新の行を「現在の設定」、それ以外を履歴とする
  const byDept = new Map<number, MinimumWage[]>()
  for (const row of data.minimumWages) {
    const arr = byDept.get(row.dept_no) || []
    arr.push(row)
    byDept.set(row.dept_no, arr)
  }
  const deptNos = Array.from(byDept.keys()).sort((a, b) => a - b)

  const handleAdd = async () => {
    setAddError('')
    setAddSubmitting(true)
    const result = await postAction('add_minimum_wage', { deptNo: Number(addDeptNo), hourlyWage: Number(addWage), effectiveFrom: addDate })
    setAddSubmitting(false)
    if (!result.ok) { setAddError(result.error || '登録に失敗しました。'); return }
    setAddDeptNo(''); setAddWage(''); setAddDate('')
    await reload()
  }

  const startEdit = (row: MinimumWage) => {
    setEditingId(row.id)
    setEditWage(String(row.hourly_wage))
    setEditDate(row.effective_from)
    setEditError('')
  }

  const handleUpdate = async (id: string) => {
    setEditError('')
    setEditSubmitting(true)
    const result = await postAction('update_minimum_wage', { id, hourlyWage: Number(editWage), effectiveFrom: editDate })
    setEditSubmitting(false)
    if (!result.ok) { setEditError(result.error || '更新に失敗しました。'); return }
    setEditingId(null)
    await reload()
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">新規改定を追加</p>
        <p className="mt-1 text-xs font-medium leading-5 text-[#6B7280]">改定のたびに新しいレコードとして追加します（過去の記録は履歴として保持されます）。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_160px_180px_auto]">
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">部門</label>
            <select value={addDeptNo} onChange={e => setAddDeptNo(e.target.value)} className={inputCls}>
              <option value="">選択してください</option>
              {data.departments.map(d => <option key={d.dept_no} value={d.dept_no}>{d.dept_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">時給額（円）</label>
            <input type="number" value={addWage} onChange={e => setAddWage(e.target.value)} className={inputCls} placeholder="例：1100" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">適用開始日</label>
            <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={addSubmitting || !addDeptNo || !addWage || !addDate} className={primaryBtn}>
              {addSubmitting ? '追加中…' : '追加する'}
            </button>
          </div>
        </div>
        {addError && <div className="mt-4"><ErrorBanner message={addError} /></div>}
      </section>

      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">現在の設定（部門ごとに最新の適用開始日のもの）</p>
        <div className="mt-4 space-y-3">
          {deptNos.length === 0 && <p className="text-sm font-medium text-[#6B7280]">登録がありません。</p>}
          {deptNos.map(deptNo => {
            const rows = (byDept.get(deptNo) || []).slice().sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
            const latest = rows[0]
            const history = rows.slice(1)
            const isEditing = editingId === latest.id
            const isExpanded = expandedDept === deptNo
            return (
              <div key={deptNo} className="rounded-2xl border border-[#E8EDF5] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1F2937]">{deptNameOf(deptNo)}</p>
                    {!isEditing ? (
                      <p className="mt-1 text-xs font-medium text-[#6B7280]">
                        時給 {latest.hourly_wage.toLocaleString()}円　適用開始：{latest.effective_from}
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="number" value={editWage} onChange={e => setEditWage(e.target.value)} className={`${inputCls} w-32`} />
                        <span className="text-xs text-[#6B7280]">円　適用開始：</span>
                        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={`${inputCls} w-40`} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isEditing ? (
                      <button onClick={() => startEdit(latest)} className={secondaryBtn}>修正する</button>
                    ) : (
                      <>
                        <button onClick={() => handleUpdate(latest.id)} disabled={editSubmitting} className={primaryBtn}>{editSubmitting ? '保存中…' : '保存する'}</button>
                        <button onClick={() => setEditingId(null)} className={secondaryBtn}>キャンセル</button>
                      </>
                    )}
                    {history.length > 0 && (
                      <button onClick={() => setExpandedDept(isExpanded ? null : deptNo)} className={secondaryBtn}>
                        履歴（{history.length}件）{isExpanded ? 'を閉じる' : 'を表示'}
                      </button>
                    )}
                  </div>
                </div>
                {isEditing && editError && <div className="mt-3"><ErrorBanner message={editError} /></div>}
                {isExpanded && (
                  <div className="mt-3 space-y-1 border-t border-[#F1F4F9] pt-3">
                    {history.map(h => (
                      <p key={h.id} className="text-xs font-medium text-[#6B7280]">
                        時給 {h.hourly_wage.toLocaleString()}円　適用開始：{h.effective_from}（履歴・編集不可）
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ===== 所定労働時間マスタ =====
function WorkingHoursSection({ data, reload }: { data: MasterData; reload: () => Promise<void> }) {
  const WORK_PLACES = ['現場', '社内'] as const
  const CONTRACT_TYPES = ['有期契約', '無期契約', '正社員', 'アルバイト'] as const

  const [addWorkPlace, setAddWorkPlace] = useState<typeof WORK_PLACES[number]>('現場')
  const [addContractType, setAddContractType] = useState<typeof CONTRACT_TYPES[number]>('有期契約')
  const [addPatternName, setAddPatternName] = useState('')
  const [addHours, setAddHours] = useState('')
  const [addError, setAddError] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPatternName, setEditPatternName] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const handleAdd = async () => {
    setAddError('')
    setAddSubmitting(true)
    const result = await postAction('add_working_hours', { workPlace: addWorkPlace, contractType: addContractType, patternName: addPatternName, monthlyHours: Number(addHours) })
    setAddSubmitting(false)
    if (!result.ok) { setAddError(result.error || '登録に失敗しました。'); return }
    setAddPatternName(''); setAddHours('')
    await reload()
  }

  const startEdit = (row: WorkingHours) => {
    setEditingId(row.id)
    setEditPatternName(row.pattern_name)
    setEditHours(String(row.monthly_hours))
    setEditError('')
  }

  const handleUpdate = async (id: string) => {
    setEditError('')
    setEditSubmitting(true)
    const result = await postAction('update_working_hours', { id, patternName: editPatternName, monthlyHours: Number(editHours) })
    setEditSubmitting(false)
    if (!result.ok) { setEditError(result.error || '更新に失敗しました。'); return }
    setEditingId(null)
    await reload()
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">新規パターンを追加</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[140px_160px_1fr_160px_auto]">
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">就業場所</label>
            <select value={addWorkPlace} onChange={e => setAddWorkPlace(e.target.value as any)} className={inputCls}>
              {WORK_PLACES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">雇用区分</label>
            <select value={addContractType} onChange={e => setAddContractType(e.target.value as any)} className={inputCls}>
              {CONTRACT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">パターン名</label>
            <input type="text" value={addPatternName} onChange={e => setAddPatternName(e.target.value)} className={inputCls} placeholder="例：標準" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[#6B7280]">所定労働時間（月間・時間）</label>
            <input type="number" value={addHours} onChange={e => setAddHours(e.target.value)} className={inputCls} placeholder="例：160" />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={addSubmitting || !addPatternName || !addHours} className={primaryBtn}>
              {addSubmitting ? '追加中…' : '追加する'}
            </button>
          </div>
        </div>
        {addError && <div className="mt-4"><ErrorBanner message={addError} /></div>}
      </section>

      {WORK_PLACES.map(wp => (
        <section key={wp} className={`${card} p-6 md:p-8`}>
          <p className="text-sm font-semibold text-[#1F2937]">
            {wp}
            {wp === '社内' && <span className="ml-2 text-xs font-medium text-[#B98900]">※現在の自動チェックロジックでは参照されていません（現場のみ対象）</span>}
          </p>
          <div className="mt-4 space-y-3">
            {data.workingHours.filter(r => r.work_place === wp).length === 0 && (
              <p className="text-sm font-medium text-[#6B7280]">登録がありません。</p>
            )}
            {data.workingHours.filter(r => r.work_place === wp).map(row => {
              const isEditing = editingId === row.id
              return (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8EDF5] p-4">
                  <div>
                    <p className="text-xs font-medium text-[#6B7280]">{row.contract_type}</p>
                    {!isEditing ? (
                      <p className="mt-1 text-sm font-semibold text-[#1F2937]">{row.pattern_name}　（月{row.monthly_hours}時間）</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="text" value={editPatternName} onChange={e => setEditPatternName(e.target.value)} className={`${inputCls} w-40`} />
                        <input type="number" value={editHours} onChange={e => setEditHours(e.target.value)} className={`${inputCls} w-28`} />
                        <span className="text-xs text-[#6B7280]">時間</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <button onClick={() => startEdit(row)} className={secondaryBtn}>修正する</button>
                    ) : (
                      <>
                        <button onClick={() => handleUpdate(row.id)} disabled={editSubmitting} className={primaryBtn}>{editSubmitting ? '保存中…' : '保存する'}</button>
                        <button onClick={() => setEditingId(null)} className={secondaryBtn}>キャンセル</button>
                      </>
                    )}
                  </div>
                  {isEditing && editError && <div className="mt-3 w-full"><ErrorBanner message={editError} /></div>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ===== 労働者派遣料金額マスタ =====
// 伊藤さんのご要望：営業所をあらかじめ全件表示し、金額を入力する表形式。
// 営業所名はdepartment_masterから機械的に導出される候補（officeNames）に固定し、自由記述は不可。
function DispatchFeeSection({ data, reload }: { data: MasterData; reload: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, { fiscalYearLabel: string; amountPerDay: string }>>(() => {
    const initial: Record<string, { fiscalYearLabel: string; amountPerDay: string }> = {}
    for (const office of data.officeNames) {
      const existing = data.dispatchFees.find(f => f.office_name === office)
      initial[office] = { fiscalYearLabel: existing?.fiscal_year_label || '', amountPerDay: existing ? String(existing.amount_per_day) : '' }
    }
    return initial
  })
  const [savingOffice, setSavingOffice] = useState<string | null>(null)
  const [errorByOffice, setErrorByOffice] = useState<Record<string, string>>({})
  const [savedOffice, setSavedOffice] = useState<string | null>(null)

  const handleSave = async (office: string) => {
    setErrorByOffice(prev => ({ ...prev, [office]: '' }))
    setSavingOffice(office)
    const draft = drafts[office]
    const result = await postAction('upsert_dispatch_fee', { officeName: office, fiscalYearLabel: draft.fiscalYearLabel, amountPerDay: Number(draft.amountPerDay) })
    setSavingOffice(null)
    if (!result.ok) { setErrorByOffice(prev => ({ ...prev, [office]: result.error || '更新に失敗しました。' })); return }
    setSavedOffice(office)
    setTimeout(() => setSavedOffice(cur => (cur === office ? null : cur)), 2500)
    await reload()
  }

  return (
    <section className={`${card} p-6 md:p-8`}>
      <p className="text-sm font-semibold text-[#1F2937]">労働者派遣料金額マスタ（年1回・年度更新時に上書き）</p>
      <p className="mt-1 text-xs font-medium leading-5 text-[#6B7280]">
        就業条件明示書PDFの「当該事業所における労働者派遣料金額の平均額」欄に表示されます。営業所は部門マスタから自動的に一覧表示されます。
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8EDF5] text-left text-xs font-semibold text-[#6B7280]">
              <th className="px-3 py-2">営業所</th>
              <th className="px-3 py-2">年度</th>
              <th className="px-3 py-2">金額（円/日）</th>
              <th className="px-3 py-2">最終更新</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.officeNames.map(office => {
              const existing = data.dispatchFees.find(f => f.office_name === office)
              const draft = drafts[office] || { fiscalYearLabel: '', amountPerDay: '' }
              return (
                <tr key={office} className="border-b border-[#F1F4F9] align-top">
                  <td className="px-3 py-3 font-medium text-[#1F2937]">{office}</td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      value={draft.fiscalYearLabel}
                      onChange={e => setDrafts(prev => ({ ...prev, [office]: { ...prev[office], fiscalYearLabel: e.target.value } }))}
                      className={`${inputCls} w-24`}
                      placeholder="例：R7"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      value={draft.amountPerDay}
                      onChange={e => setDrafts(prev => ({ ...prev, [office]: { ...prev[office], amountPerDay: e.target.value } }))}
                      className={`${inputCls} w-32`}
                      placeholder="例：20000"
                    />
                  </td>
                  <td className="px-3 py-3 text-xs font-medium text-[#6B7280]">
                    {existing ? new Date(existing.updated_at).toLocaleDateString('ja-JP') : '未登録'}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => handleSave(office)}
                      disabled={savingOffice === office || !draft.fiscalYearLabel || !draft.amountPerDay}
                      className={primaryBtn}
                    >
                      {savingOffice === office ? '保存中…' : savedOffice === office ? '保存しました✓' : '保存する'}
                    </button>
                    {errorByOffice[office] && <div className="mt-2 w-64"><ErrorBanner message={errorByOffice[office]} /></div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
