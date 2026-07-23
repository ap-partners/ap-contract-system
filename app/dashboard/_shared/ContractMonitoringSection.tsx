// ===== 契約状況モニタリング（フェーズ1・一覧表示＋フェーズ2・対応状況管理） =====
// docs/SYSTEM_DESIGN.md 10章 2026-07-23「(A) 契約状況モニタリング機能」参照。
// 管理部ダッシュボード「更新期限管理」タブ内のサブセクションとして表示する（管理部専用）。
// フェーズ2（2026-07-23）：対応状況（未着手／依頼済み／対応中／解消）の管理と、
// 「対応依頼」ボタンからの担当営業への即時メール送信（/api/contract-monitoring/notify）を追加。
// 「解消」にした行はデフォルト非表示にする（台帳なしトグルと同じ考え方。対応済みの案件で
// 一覧が埋まらないようにするため）。
'use client'

import { useEffect, useState } from 'react'
import { ActionStatus, MonitoringRow } from './useContractMonitoring'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import { useToast } from '@/app/_shared/ui/ToastProvider'

type Props = {
  rows: MonitoringRow[]
  loading: boolean
  onRefresh: () => void
  currentUserName: string | null
  requestFollowUp: (
    row: Pick<MonitoringRow, 'employeeNumber' | 'staffName' | 'deptNo' | 'issues'>,
    requestedByName: string | null
  ) => Promise<{ ok: boolean; error?: string }>
  updateActionStatus: (employeeNumber: string, status: ActionStatus) => Promise<boolean>
}

const SEVERITY_META: Record<1 | 2 | 3 | 4, { label: string; bg: string; color: string; dot: string }> = {
  1: { label: '台帳なし', bg: '#FDECEC', color: '#C0392B', dot: '#C0392B' },
  2: { label: '重大', bg: '#FDECEC', color: '#E74C3C', dot: '#E74C3C' },
  3: { label: '警告', bg: '#FFF3E8', color: '#B7791F', dot: '#F2A73B' },
  4: { label: '注意', bg: '#FFF8E1', color: '#8A6D1D', dot: '#E8C547' },
}

const ACTION_STATUS_OPTIONS: ActionStatus[] = ['未着手', '依頼済み', '対応中', '解消']

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

function ActionStatusSegmented({
  value, onChange, disabled,
}: {
  value: ActionStatus
  onChange: (v: ActionStatus) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: '#E8EDF5' }}>
      {ACTION_STATUS_OPTIONS.map(opt => (
        <button
          key={opt}
          onClick={() => !disabled && onChange(opt)}
          disabled={disabled}
          className="text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50"
          style={value === opt ? { background: '#2F5FD0', color: '#fff' } : { color: '#6B7280' }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function ContractMonitoringSection({
  rows, loading, onRefresh, currentUserName, requestFollowUp, updateActionStatus,
}: Props) {
  const [showLedgerless, setShowLedgerless] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [sendingFor, setSendingFor] = useState<string | null>(null)
  const confirmDialog = useConfirm()
  const { showError, showSuccess } = useToast()

  useEffect(() => { onRefresh() }, [onRefresh])

  const baseVisible = rows.filter(r => showResolved || r.actionStatus !== '解消')
  const visibleRows = showLedgerless ? baseVisible : baseVisible.filter(r => r.topSeverity !== 1)
  const ledgerlessCount = rows.filter(r => r.topSeverity === 1 && (showResolved || r.actionStatus !== '解消')).length
  const resolvedCount = rows.filter(r => r.actionStatus === '解消').length
  const counts = {
    2: baseVisible.filter(r => r.topSeverity === 2).length,
    3: baseVisible.filter(r => r.topSeverity === 3).length,
    4: baseVisible.filter(r => r.topSeverity === 4).length,
  }

  const handleRequest = async (row: MonitoringRow) => {
    const ok = await confirmDialog({
      title: '担当営業への確認依頼',
      message: `${row.staffName || '対象スタッフ'}様（${row.deptName || '所属部署不明'}）の契約状況について、担当営業へ確認依頼メールを送信します。よろしいですか？`,
      confirmLabel: '送信する',
    })
    if (!ok) return
    setSendingFor(row.employeeNumber)
    const result = await requestFollowUp(row, currentUserName)
    setSendingFor(null)
    if (result.ok) {
      showSuccess('担当営業へ確認依頼メールを送信しました。')
    } else {
      showError(result.error || '確認依頼の送信に失敗しました。')
    }
  }

  const handleStatusChange = async (row: MonitoringRow, status: ActionStatus) => {
    const ok = await updateActionStatus(row.employeeNumber, status)
    if (!ok) showError('対応状況の更新に失敗しました。もう一度お試しください。')
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
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer select-none">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
            解消済み（{resolvedCount}件）を表示する
          </label>
          <label className="flex items-center gap-2 text-xs text-[#6B7280] cursor-pointer select-none">
            <input type="checkbox" checked={showLedgerless} onChange={e => setShowLedgerless(e.target.checked)} className="rounded" />
            台帳なし（契約実績ゼロ・{ledgerlessCount}件）を表示する
          </label>
        </div>
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
              className="bg-white rounded-2xl border border-[#EDF0F5] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
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
                  {row.requestedAt && (
                    <p className="mt-1.5 text-xs text-[#8B98B1]">
                      {new Date(row.requestedAt).toLocaleString('ja-JP')}に{row.requestedByName ? `${row.requestedByName}が` : ''}確認依頼を送信済み
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRequest(row)}
                  disabled={sendingFor === row.employeeNumber}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap text-white disabled:opacity-60"
                  style={{ background: '#2F5FD0' }}
                >
                  {sendingFor === row.employeeNumber ? '送信中…' : '担当営業へ確認依頼'}
                </button>
              </div>
              <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid #F3F5F8' }}>
                <span className="text-xs text-[#8B98B1]">対応状況</span>
                <ActionStatusSegmented
                  value={row.actionStatus}
                  onChange={status => handleStatusChange(row, status)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
