'use client'

// ===== CSVインポート「保護によりスキップ」行の詳細ダウンロードボタン =====
// 2026-07-29デモ指摘②対応。/api/admin/csv-import/[id]/protected-export をAuthorizationヘッダー付きで
// fetchし、Excel（.xlsx）としてダウンロードさせる。認証が必要なAPIのため、単純な<a href>ではなく
// PdfPreviewButton.tsxと同じ「fetch→blob→一時的な<a>でダウンロードをトリガー」方式を使う。
import { useState } from 'react'
import { getAuthHeader } from '@/lib/supabase'
import { useToast } from './ToastProvider'

export default function ProtectedRowsDownloadButton({ importId, count }: { importId: string; count: number }) {
  const { showError } = useToast()
  const [loading, setLoading] = useState(false)

  if (!count || count <= 0) return null

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/csv-import/${importId}/protected-export`, { headers: await getAuthHeader() })
      if (!res.ok) { showError('対象データの取得に失敗しました。'); return }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `保護スキップ一覧_${importId.slice(0, 8)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      showError('対象データの取得に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading}
      className="text-xs font-semibold underline underline-offset-2"
      style={{ color: '#B45309', opacity: loading ? 0.6 : 1 }}>
      {loading ? '準備しています…' : `保護によりスキップされた${count}件の対象データをダウンロード`}
    </button>
  )
}
