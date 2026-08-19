// ===== システム状況タブ（管理部ダッシュボード専用・#11対応・2026-08-19新設） =====
// 外部総合品質監査レポート12章-11「管理部向けのシステム健全性ダッシュボード」への対応。
// サマリータブ（今日やるべき業務件数）とは目的が異なり、こちらは「止まっている・異常な
// 状態」を検知するための画面という位置づけ（伊藤さんとの合意・見出し・警告トーンの色使いで
// 区別する）。①署名待ち7日超過②依頼pending14日超過③直近のCSV取込エラー
// ④メール送信失敗件数（#10のmail_logsから）⑤3本のcronの直近実行状況（#14のcron_runsから）。
'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAuthHeader } from '@/lib/supabase'
import { formatDateTimeJp } from '@/lib/dateFormat'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import SkeletonBlock from '@/app/_shared/ui/SkeletonBlock'

type CsvErrorRow = { id: string; system_type: string; file_name: string; error_rows: number; uploaded_at: string }
type MailFailureRow = { id: string; mail_type: string; to_emails: string[]; error_message: string | null; sent_at: string }
type CronStatus = {
  cronName: string
  lastRun: { status: 'success' | 'error' | 'skipped'; finished_at: string; error_message: string | null; summary: any } | null
}

type HealthData = {
  overdueSignCount: number
  overdueRequestCount: number
  recentCsvErrors: CsvErrorRow[]
  mailFailureCount: number
  recentMailFailures: MailFailureRow[]
  cronStatuses: CronStatus[]
}

const card = 'rounded-2xl border border-[#E8EDF5] bg-white'

const CRON_LABEL: Record<string, string> = {
  'renewal-notify': '更新期限：残日数通知',
  'withdrawn-cleanup': '取り下げ申請の自動削除',
  'csvmeta-cleanup': 'CSVメタ情報等の保持期間削除',
}

function KpiCard({ label, value, unit, danger }: { label: string; value: number; unit: string; danger: boolean }) {
  return (
    <div className={`${card} p-5 ${danger ? 'border-[#F3C6C6] bg-[#FEF6F6]' : ''}`}>
      <p className="text-xs font-semibold text-[#5A6A8A]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${danger ? 'text-[#C0392B]' : 'text-[#1A2340]'}`}>
        {value}<span className="ml-1 text-sm font-semibold text-[#8A94AA]">{unit}</span>
      </p>
    </div>
  )
}

function CronBadge({ status }: { status: 'success' | 'error' | 'skipped' | null }) {
  if (status === 'error') return <span className="rounded-full bg-[#FDECEC] px-2.5 py-1 text-xs font-bold text-[#C0392B]">失敗</span>
  if (status === 'skipped') return <span className="rounded-full bg-[#F1F3F8] px-2.5 py-1 text-xs font-bold text-[#5A6A8A]">スキップ</span>
  if (status === 'success') return <span className="rounded-full bg-[#EAF7EE] px-2.5 py-1 text-xs font-bold text-[#1F7A45]">正常</span>
  return <span className="rounded-full bg-[#F1F3F8] px-2.5 py-1 text-xs font-bold text-[#8A94AA]">実行履歴なし</span>
}

export default function SystemHealthTab() {
  const { showError } = useToast()
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/admin/system-health', { headers })
      const json = await res.json()
      if (!res.ok) {
        showError(json.error || 'システム状況の取得に失敗しました。')
        return
      }
      setData(json)
    } catch {
      showError('システム状況の取得に失敗しました。時間をおいて再読み込みしてください。')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div className="mt-5">
        <SkeletonBlock />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="mt-5 space-y-6">
      <section className={`${card} p-6`}>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A2340]">システム状況</h2>
            <p className="mt-1 text-sm text-[#5A6A8A]">止まっている・異常な状態になっていないかを確認できます。件数が0であれば正常です。</p>
          </div>
          <button onClick={load} className="rounded-xl border border-[#E8EDF5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]">
            再読み込み
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="署名待ちで7日超過" value={data.overdueSignCount} unit="件" danger={data.overdueSignCount > 0} />
        <KpiCard label="依頼が14日以上pending" value={data.overdueRequestCount} unit="件" danger={data.overdueRequestCount > 0} />
        <KpiCard label="エラーを含むCSV取込（直近10件中）" value={data.recentCsvErrors.length} unit="件" danger={data.recentCsvErrors.length > 0} />
        <KpiCard label="メール送信失敗（直近7日）" value={data.mailFailureCount} unit="件" danger={data.mailFailureCount > 0} />
      </div>

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-bold text-[#1A2340]">自動処理（Cron）の直近の実行状況</h3>
        <div className="mt-3 space-y-2">
          {data.cronStatuses.map(cs => (
            <div key={cs.cronName} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EEF1F7] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#1A2340]">{CRON_LABEL[cs.cronName] || cs.cronName}</p>
                <p className="mt-0.5 text-xs text-[#8A94AA]">
                  {cs.lastRun ? `最終実行：${formatDateTimeJp(cs.lastRun.finished_at)}` : '実行履歴がありません'}
                  {cs.lastRun?.error_message ? `／${cs.lastRun.error_message}` : ''}
                </p>
              </div>
              <CronBadge status={cs.lastRun?.status ?? null} />
            </div>
          ))}
        </div>
      </section>

      {data.recentCsvErrors.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-bold text-[#1A2340]">直近のCSV取込エラー</h3>
          <div className="mt-3 space-y-2">
            {data.recentCsvErrors.map(row => (
              <div key={row.id} className="rounded-xl border border-[#F3C6C6] bg-[#FEF6F6] px-4 py-3 text-sm">
                <p className="font-semibold text-[#1A2340]">{row.system_type}／{row.file_name}</p>
                <p className="mt-0.5 text-xs text-[#C0392B]">エラー {row.error_rows} 件／{formatDateTimeJp(row.uploaded_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.recentMailFailures.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-bold text-[#1A2340]">直近のメール送信失敗</h3>
          <div className="mt-3 space-y-2">
            {data.recentMailFailures.map(row => (
              <div key={row.id} className="rounded-xl border border-[#F3C6C6] bg-[#FEF6F6] px-4 py-3 text-sm">
                <p className="font-semibold text-[#1A2340]">{row.mail_type}　宛先：{(row.to_emails || []).join(', ') || '(不明)'}</p>
                <p className="mt-0.5 text-xs text-[#C0392B]">{row.error_message || 'エラー内容不明'}／{formatDateTimeJp(row.sent_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
