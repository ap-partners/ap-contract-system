// ===== アカウント管理タブ（管理部ダッシュボード専用・「アカウント管理」権限を持つ人のみ） =====
// 2026-07-24新設。ログインアカウント（担当営業／SSC／管理部）の一覧・新規作成（招待メール）・
// 編集（氏名／役割／部門／権限）・凍結／凍結解除を行う。API：app/api/admin/accounts/route.ts
//
// 【確定仕様（2026-07-24・伊藤さんとの相談で確定）】
// ①部門：担当営業は所属部門を選択、SSC・管理部は部門欄に役割名（SSC／管理部）をそのまま表示。
// ②新規作成：本人には仮パスワードを一切渡さず、メール記載の6桁認証コードで
//   本人がパスワードを設定する招待フロー。
// ③削除ではなく凍結（ログイン不可化）。誤操作に備え凍結解除ボタンを用意し、
//   凍結済み一覧はボタンを押した時だけ表示する（通常の一覧を煩雑にしない）。
// ④権限（社内承認・アカウント管理）は役割が管理部の場合のみ設定可能。
'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAuthHeader } from '@/lib/supabase'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import ValidationBanner from '@/app/_shared/ui/ValidationBanner'

type Role = '担当営業' | 'SSC' | '管理部'

type Account = {
  id: string
  name: string | null
  email: string
  role: Role
  deptNo: number | null
  deptLabel: string
  isInternalApprover: boolean
  isAccountAdmin: boolean
  isActive: boolean
  frozenAt: string | null
  needsPasswordSetup: boolean
  createdAt: string
}

type DepartmentOption = { deptNo: number; deptName: string }

const card = 'rounded-2xl border border-[#E8EDF5] bg-white'
const inputCls = 'w-full rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] focus:border-[#2F5FD0] focus:outline-none'
const primaryBtn = 'inline-flex items-center gap-2 rounded-2xl bg-[#2F5FD0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#274CB0] disabled:cursor-not-allowed disabled:opacity-60'
const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-[#E8EDF5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]'
const dangerBtn = 'inline-flex items-center gap-2 rounded-xl border border-[#F3C6C6] bg-white px-4 py-2 text-sm font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]'

const ROLE_FILTERS: { key: 'すべて' | Role; label: string }[] = [
  { key: 'すべて', label: 'すべて' },
  { key: '担当営業', label: '担当営業' },
  { key: 'SSC', label: 'SSC' },
  { key: '管理部', label: '管理部' },
]

async function postAction(action: string, payload: any): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers = await getAuthHeader()
    const res = await fetch('/api/admin/accounts', {
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

export default function AccountManagementTab() {
  const confirmDialog = useConfirm()
  const { showSuccess, showError } = useToast()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [roleFilter, setRoleFilter] = useState<'すべて' | Role>('すべて')
  const [searchText, setSearchText] = useState('')
  const [showFrozenList, setShowFrozenList] = useState(false)

  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; account: Account }>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/admin/accounts', { headers })
      const json = await res.json()
      if (!res.ok) { setLoadError(json.error || 'アカウント一覧の取得に失敗しました。'); setLoading(false); return }
      setAccounts(json.accounts)
      setDepartmentOptions(json.departmentOptions)
    } catch {
      setLoadError('アカウント一覧の取得に失敗しました。通信環境をご確認ください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const matchesFilter = (a: Account) => {
    if (roleFilter !== 'すべて' && a.role !== roleFilter) return false
    if (searchText.trim()) {
      const t = searchText.trim().toLowerCase()
      if (!(a.name || '').toLowerCase().includes(t) && !a.email.toLowerCase().includes(t)) return false
    }
    return true
  }

  const activeAccounts = accounts.filter(a => a.isActive && matchesFilter(a))
  const frozenAccounts = accounts.filter(a => !a.isActive && matchesFilter(a))

  const handleFreeze = async (a: Account) => {
    const ok = await confirmDialog({
      title: 'アカウントを凍結しますか',
      message: `${a.name || a.email}さんはログインできなくなります。\n過去の申請データ等の記録は残ります。誤って凍結した場合は、凍結済み一覧からいつでも解除できます。`,
      tone: 'danger',
      confirmLabel: '凍結する',
    })
    if (!ok) return
    const result = await postAction('freeze', { id: a.id })
    if (!result.ok) { showError(result.error || '凍結に失敗しました。'); return }
    showSuccess('アカウントを凍結しました。')
    load()
  }

  const handleUnfreeze = async (a: Account) => {
    const result = await postAction('unfreeze', { id: a.id })
    if (!result.ok) { showError(result.error || '凍結解除に失敗しました。'); return }
    showSuccess('凍結を解除しました。')
    load()
  }

  const handleResendCode = async (a: Account) => {
    const result = await postAction('resend_code', { id: a.id })
    if (!result.ok) { showError(result.error || '認証コードの送信に失敗しました。'); return }
    showSuccess(`${a.email} 宛に認証コードを送信しました。`)
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-[#1F2937]">アカウント管理</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
              担当営業・SSC・管理部のログインアカウントを管理します。削除ではなく凍結でログインを止める方式です。
            </p>
          </div>
          <button onClick={() => setModal({ mode: 'create' })} className={primaryBtn}>
            + 新規追加
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {ROLE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${roleFilter === f.key ? 'border-[#2F5FD0] bg-[#EAF1FF] text-[#2F5FD0]' : 'border-[#E8EDF5] bg-white text-[#6B7280] hover:border-[#2F5FD0] hover:text-[#2F5FD0]'}`}
            >
              {f.label}
            </button>
          ))}
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="氏名・メールアドレスで検索"
            className={`${inputCls} max-w-xs`}
          />
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
      ) : (
        <>
          <AccountTable
            accounts={activeAccounts}
            onEdit={a => setModal({ mode: 'edit', account: a })}
            onFreeze={handleFreeze}
            onResendCode={handleResendCode}
          />

          <div>
            <button onClick={() => setShowFrozenList(v => !v)} className={secondaryBtn}>
              {showFrozenList ? '凍結済み一覧を隠す' : `凍結済み一覧を表示（${accounts.filter(a => !a.isActive).length}件）`}
            </button>
          </div>

          {showFrozenList && (
            <section className={`${card} p-6`}>
              <p className="mb-4 text-sm font-semibold text-[#6B7280]">凍結済みアカウント</p>
              {frozenAccounts.length === 0 ? (
                <p className="text-sm text-[#6B7280]">該当するアカウントはありません。</p>
              ) : (
                <div className="space-y-3">
                  {frozenAccounts.map(a => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8EDF5] p-4">
                      <div>
                        <p className="text-sm font-semibold text-[#1F2937]">{a.name || '(氏名未設定)'} <span className="ml-2 text-xs font-medium text-[#6B7280]">{a.email}</span></p>
                        <p className="mt-1 text-xs text-[#6B7280]">{a.role}・{a.deptLabel}・凍結日時 {a.frozenAt ? new Date(a.frozenAt).toLocaleString('ja-JP') : '-'}</p>
                      </div>
                      <button onClick={() => handleUnfreeze(a)} className={secondaryBtn}>凍結解除</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {modal && (
        <AccountFormModal
          mode={modal.mode}
          account={modal.mode === 'edit' ? modal.account : undefined}
          departmentOptions={departmentOptions}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

function AccountTable({
  accounts,
  onEdit,
  onFreeze,
  onResendCode,
}: {
  accounts: Account[]
  onEdit: (a: Account) => void
  onFreeze: (a: Account) => void
  onResendCode: (a: Account) => void
}) {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="grid grid-cols-[1.3fr_1.6fr_0.9fr_0.9fr_1.2fr_0.9fr_1.2fr] gap-3 border-b border-[#E8EDF5] px-6 py-3 text-xs font-semibold text-[#6B7280]">
        <div>氏名</div><div>メールアドレス</div><div>役割</div><div>部門</div><div>権限</div><div>状態</div><div>操作</div>
      </div>
      {accounts.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-[#6B7280]">該当するアカウントはありません。</p>
      ) : accounts.map(a => (
        <div key={a.id} className="grid grid-cols-[1.3fr_1.6fr_0.9fr_0.9fr_1.2fr_0.9fr_1.2fr] items-center gap-3 border-b border-[#E8EDF5] px-6 py-4 text-sm last:border-b-0">
          <div className="font-medium text-[#1F2937]">{a.name || '(氏名未設定)'}</div>
          <div className="truncate text-[#6B7280]">{a.email}</div>
          <div>{a.role}</div>
          <div>{a.deptLabel}</div>
          <div className="flex flex-wrap gap-1">
            {a.role === '管理部' && a.isInternalApprover && <span className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[11px] font-semibold text-[#7C3AED]">社内承認</span>}
            {a.role === '管理部' && a.isAccountAdmin && <span className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[11px] font-semibold text-[#7C3AED]">アカウント管理</span>}
            {a.role === '管理部' && !a.isInternalApprover && !a.isAccountAdmin && <span className="text-xs text-[#9CA3AF]">―</span>}
            {a.role !== '管理部' && <span className="text-xs text-[#9CA3AF]">―</span>}
          </div>
          <div>
            {a.needsPasswordSetup ? (
              <span className="rounded-full bg-[#FFF3E6] px-2.5 py-1 text-xs font-semibold text-[#B45309]">設定待ち</span>
            ) : (
              <span className="rounded-full bg-[#E8F7EE] px-2.5 py-1 text-xs font-semibold text-[#1D9E75]">有効</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onEdit(a)} className={secondaryBtn}>編集</button>
            {a.needsPasswordSetup && <button onClick={() => onResendCode(a)} className={secondaryBtn}>コード再送</button>}
            <button onClick={() => onFreeze(a)} className={dangerBtn}>凍結</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function AccountFormModal({
  mode,
  account,
  departmentOptions,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  account?: Account
  departmentOptions: DepartmentOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showSuccess, showError } = useToast()
  const [name, setName] = useState(account?.name || '')
  const [email, setEmail] = useState(account?.email || '')
  const [role, setRole] = useState<Role>(account?.role || '担当営業')
  const [deptNo, setDeptNo] = useState<string>(account?.deptNo != null ? String(account.deptNo) : '')
  const [isInternalApprover, setIsInternalApprover] = useState(account?.isInternalApprover || false)
  const [isAccountAdmin, setIsAccountAdmin] = useState(account?.isAccountAdmin || false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setValidationError('氏名を入力してください。'); return }
    if (mode === 'create' && !email.trim()) { setValidationError('メールアドレスを入力してください。'); return }
    if (role === '担当営業' && !deptNo) { setValidationError('担当営業には部門を選択してください。'); return }
    setValidationError(null)
    setSaving(true)
    const payload = {
      id: account?.id,
      name: name.trim(),
      email: email.trim(),
      role,
      deptNo: role === '担当営業' ? Number(deptNo) : null,
      isInternalApprover,
      isAccountAdmin,
    }
    const result = await postAction(mode === 'create' ? 'create' : 'update', payload)
    setSaving(false)
    if (!result.ok) { showError(result.error || '保存に失敗しました。'); return }
    showSuccess(mode === 'create' ? 'アカウントを作成し、招待メールを送信しました。' : '保存しました。')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-[#1F2937]">{mode === 'create' ? 'アカウントを新規追加' : 'アカウントを編集'}</p>
        {mode === 'edit' && <p className="mt-1 text-xs text-[#6B7280]">{account?.name || account?.email}さんの設定を変更します。</p>}

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">氏名</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="山田 太郎" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">メールアドレス</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={mode === 'edit'}
              className={`${inputCls} ${mode === 'edit' ? 'bg-[#F3F4F6] text-[#9CA3AF]' : ''}`}
              placeholder="example@appart.co.jp"
            />
            {mode === 'edit' && <p className="mt-1 text-[11px] text-[#9CA3AF]">メールアドレスの変更はできません。</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">役割</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)} className={inputCls}>
              <option value="担当営業">担当営業</option>
              <option value="SSC">SSC</option>
              <option value="管理部">管理部</option>
            </select>
          </div>

          {role === '担当営業' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">部門</label>
              <select value={deptNo} onChange={e => setDeptNo(e.target.value)} className={inputCls}>
                <option value="">選択してください</option>
                {departmentOptions.map(d => (
                  <option key={d.deptNo} value={d.deptNo}>{d.deptName}</option>
                ))}
              </select>
            </div>
          )}

          {role === '管理部' && (
            <div className="rounded-xl bg-[#F8FAFD] p-4">
              <p className="mb-2 text-xs font-semibold text-[#6B7280]">権限（管理部のみ設定可）</p>
              <label className="mb-2 flex items-center gap-2 text-sm text-[#1F2937]">
                <input type="checkbox" checked={isInternalApprover} onChange={e => setIsInternalApprover(e.target.checked)} className="h-4 w-4 accent-[#2F5FD0]" />
                社内の雇用契約書を承認できる
              </label>
              <label className="flex items-center gap-2 text-sm text-[#1F2937]">
                <input type="checkbox" checked={isAccountAdmin} onChange={e => setIsAccountAdmin(e.target.checked)} className="h-4 w-4 accent-[#2F5FD0]" />
                アカウントの追加・編集・凍結ができる
              </label>
            </div>
          )}

          <ValidationBanner message={validationError} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className={secondaryBtn}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} className={primaryBtn}>{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
