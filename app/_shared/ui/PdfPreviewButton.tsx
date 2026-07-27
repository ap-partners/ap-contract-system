'use client'

// ===== 帳票PDFプレビューボタン（共通化） =====
// 総合レビュー指摘8対応（2026-07-27）。契約詳細（SSC/担当営業）・アルバイト誓約書詳細
// （SSC/担当営業）の計4画面に、ほぼ同一の「PDFを取得してnew tabで開く」ボタンが
// 個別実装されていた。新規タブが開くまでの間クリックへの反応が画面上に何も出ず、
// ユーザーが「反応していない」と誤解し連打するリスクが指摘されたため、共通コンポーネント化と
// 合わせてローディング表示（ボタン内スピナー・一時的な連打防止）を追加する。
import { useState } from 'react'
import { getAuthHeader } from '@/lib/supabase'
import { useToast } from './ToastProvider'

export default function PdfPreviewButton({ url, label = '帳票PDFプレビュー' }: { url: string; label?: string }) {
  const { showError } = useToast()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(url, { headers: await getAuthHeader() })
      if (!res.ok) { showError('PDFの取得に失敗しました。'); return }
      const blobUrl = URL.createObjectURL(await res.blob())
      window.open(blobUrl, '_blank')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading}
      className="text-xs font-medium px-3 py-1 rounded-full border inline-flex items-center gap-1.5"
      style={{ color: '#1B3A8C', borderColor: '#1B3A8C', background: '#EEF2FA', opacity: loading ? 0.7 : 1 }}>
      {loading ? (
        <>
          <span className="inline-block h-3 w-3 rounded-full border-2 animate-spin" style={{ borderColor: '#1B3A8C', borderTopColor: 'transparent' }} />
          準備しています…
        </>
      ) : (
        <>📄 {label}</>
      )}
    </button>
  )
}
