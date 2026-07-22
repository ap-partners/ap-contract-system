'use client'

import { useEffect, useState } from 'react'

// 総合レビュー指摘32・33対応（2026-07-22）：依頼管理（管理部）・依頼状況（担当営業）の
// 検索まわりを共通化するための小さな共有フック。
// - 検索語の「入力欄に表示する値」と「実際に検索に使う値（デバウンス後）」を分離する。
//   これにより、1キー入力ごとに検索処理（サーバークエリ or フィルタ再計算）が走るのを防ぐ。
// - PostgREST の .or() フィルタ構文はカンマ・丸括弧で条件を区切るため、検索語にこれらの
//   文字が含まれると意図しない箇所でフィルタが分割・破損する。escapeForPostgrestFilter()で
//   バックスラッシュエスケープしてリテラル文字として扱わせる。
export function useDebouncedSearch(delayMs: number = 300) {
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText, setDebouncedSearchText] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchText(searchText), delayMs)
    return () => clearTimeout(t)
  }, [searchText, delayMs])

  return { searchText, setSearchText, debouncedSearchText }
}

export function escapeForPostgrestFilter(value: string): string {
  return value.replace(/[\\,()]/g, ch => `\\${ch}`)
}
