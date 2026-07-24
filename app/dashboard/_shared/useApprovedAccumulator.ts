// ===== 蓄積型タブ（「承認済み・署名状況」等）の共通データ取得ロジック =====
// SSC・管理部・担当営業の3ダッシュボードで重複しないよう1箇所にまとめる。
// デフォルトは直近45日・50件ずつ「さらに読み込む」方式。それより古い案件は「全期間で検索」
// （search_textへのilikeサーバー検索）でのみアクセスする（docs/SYSTEM_DESIGN.md 10章 2026-07-14参照）。
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const APPROVED_WINDOW_DAYS = 45
export const APPROVED_PAGE_SIZE = 50
export const APPROVED_SEARCH_LIMIT = 200
export const APPROVED_STATUSES = ['SSC承認済み', '署名待ち', '署名済み', '完了']
export const CONTRACT_COLUMNS = 'id, pattern, contract_type, document_type, work_place, status, created_by, created_by_name, created_at, rejection_reason, signed_at, warning_confirmations, warning_level, input_data'
// アルバイト誓約書（pledges）用（2026-07-24追加：署名待ち／署名済みタブの45日窓分割対応）
export const PLEDGE_COLUMNS = 'id, document_type, status, work_place_type, client_name, created_by_name, created_at, signed_at, warning_level, auto_check_results, input_data'

const windowStartIso = () => {
  const d = new Date()
  d.setDate(d.getDate() - APPROVED_WINDOW_DAYS)
  return d.toISOString()
}

// applyBaseFilter: ダッシュボードごとに異なる対象範囲（社内以外／社内のみ／自部門のみ等）を
// 呼び出し側から注入する（例: q => q.neq('work_place', '社内')）。
// table/columns: 2026-07-24より汎用化。省略時は従来通りcontractsを対象にする（既存呼び出し元は無変更で動作）。
export function useApprovedAccumulator<T = any>(
  applyBaseFilter: (query: any) => any,
  statuses: string[] = APPROVED_STATUSES,
  table: string = 'contracts',
  columns: string = CONTRACT_COLUMNS
) {
  const [approvedContracts, setApprovedContracts] = useState<T[]>([])
  const [approvedTotalCount, setApprovedTotalCount] = useState(0)
  const [approvedOffset, setApprovedOffset] = useState(0)
  const [approvedHasMore, setApprovedHasMore] = useState(false)
  const [approvedLoadingMore, setApprovedLoadingMore] = useState(false)
  const [approvedSearchMode, setApprovedSearchMode] = useState(false)
  const [approvedSearching, setApprovedSearching] = useState(false)
  const [approvedSearchNotice, setApprovedSearchNotice] = useState<string | null>(null)

  const fetchApprovedRecent = async () => {
    const { data, count, error } = await applyBaseFilter(
      supabase.from(table).select(columns, { count: 'exact' })
    )
      .in('status', statuses)
      .gte('created_at', windowStartIso())
      .order('created_at', { ascending: false })
      .range(0, APPROVED_PAGE_SIZE - 1)
    if (error) { console.error('承認済み一覧取得エラー:', error); return }
    const rows = (data || []) as T[]
    setApprovedContracts(rows)
    setApprovedTotalCount(count ?? rows.length)
    setApprovedOffset(rows.length)
    setApprovedHasMore((count ?? 0) > rows.length)
    setApprovedSearchMode(false)
    setApprovedSearchNotice(null)
  }

  const loadMoreApproved = async () => {
    if (approvedLoadingMore || approvedSearchMode) return
    setApprovedLoadingMore(true)
    const { data, error } = await applyBaseFilter(
      supabase.from(table).select(columns)
    )
      .in('status', statuses)
      .gte('created_at', windowStartIso())
      .order('created_at', { ascending: false })
      .range(approvedOffset, approvedOffset + APPROVED_PAGE_SIZE - 1)
    if (!error && data) {
      const rows = data as T[]
      setApprovedContracts(prev => [...prev, ...rows])
      setApprovedOffset(prev => prev + rows.length)
      setApprovedHasMore(approvedOffset + rows.length < approvedTotalCount)
    }
    setApprovedLoadingMore(false)
  }

  // 「全期間で検索」：日付の窓を外し、search_text（氏名・社員番号・就業先名を保存時に連結した列）
  // へのilikeでサーバー側検索する。結果は最大200件までとし、それ以上は絞り込みを促す。
  const runApprovedSearch = async (query: string) => {
    const q = query.trim()
    if (!q) { fetchApprovedRecent(); return }
    setApprovedSearching(true)
    const { data, error } = await applyBaseFilter(
      supabase.from(table).select(columns)
    )
      .in('status', statuses)
      .ilike('search_text', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(APPROVED_SEARCH_LIMIT)
    if (!error && data) {
      const rows = data as T[]
      setApprovedContracts(rows)
      setApprovedTotalCount(rows.length)
      setApprovedHasMore(false)
      setApprovedSearchMode(true)
      setApprovedSearchNotice(
        rows.length >= APPROVED_SEARCH_LIMIT
          ? `検索結果が多いため${APPROVED_SEARCH_LIMIT}件のみ表示しています。絞り込みを追加してください。`
          : null
      )
    }
    setApprovedSearching(false)
  }

  return {
    approvedContracts,
    approvedTotalCount,
    approvedHasMore,
    approvedLoadingMore,
    approvedSearchMode,
    approvedSearching,
    approvedSearchNotice,
    fetchApprovedRecent,
    loadMoreApproved,
    runApprovedSearch,
  }
}
