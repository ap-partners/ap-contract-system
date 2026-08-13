'use client'

// ===== 帳票PDFプレビューボタン（共通化） =====
// 総合レビュー指摘8対応（2026-07-27）。契約詳細（SSC/担当営業）・アルバイト誓約書詳細
// （SSC/担当営業）の計4画面に、ほぼ同一の「PDFを取得してnew tabで開く」ボタンが
// 個別実装されていた。新規タブが開くまでの間クリックへの反応が画面上に何も出ず、
// ユーザーが「反応していない」と誤解し連打するリスクが指摘されたため、共通コンポーネント化と
// 合わせてローディング表示（ボタン内スピナー・一時的な連打防止）を追加する。
//
// 外部総合品質監査レポートM-07対応（2026-08-14）：①fetch自体が失敗した場合（通信断等）に
// catchが無くエラーが握りつぶされ画面が無反応に見える、②`window.open()`をawaitの後
// （非同期処理の途中）で呼んでいるため、ブラウザによってはユーザー操作起点と認識されず
// ポップアップブロックされる、③生成した`URL.createObjectURL()`を一度も解放しておらず
// 連打するたびにメモリを消費し続ける、の3点を修正。②の対策として、クリック直後
// （まだ同期的な処理の中）に空のタブを先に開いておき、PDFが取得できた時点でそのタブの
// 行き先を差し替える方式に変更する（ポップアップブロッカーは「クリックの結果として
// タブが開かれたかどうか」を見ているため、この順序ならブロックされない）。
import { useEffect, useRef, useState } from 'react'
import { getAuthHeader } from '@/lib/supabase'
import { useToast } from './ToastProvider'

export default function PdfPreviewButton({ url, label = '帳票PDFプレビュー' }: { url: string; label?: string }) {
  const { showError } = useToast()
  const [loading, setLoading] = useState(false)
  const lastBlobUrlRef = useRef<string | null>(null)

  // コンポーネントが画面から消える際、直前に生成したblob URLが残っていれば解放する
  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) URL.revokeObjectURL(lastBlobUrlRef.current)
    }
  }, [])

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    // ユーザー操作と同期的なタイミングで先に空タブを開いておく（ポップアップブロック対策）
    const newTab = window.open('', '_blank')
    try {
      const res = await fetch(url, { headers: await getAuthHeader() })
      if (!res.ok) {
        showError('PDFの取得に失敗しました。')
        newTab?.close()
        return
      }
      // 前回分のblob URLが残っていれば先に解放してから今回分を生成する
      if (lastBlobUrlRef.current) URL.revokeObjectURL(lastBlobUrlRef.current)
      const blobUrl = URL.createObjectURL(await res.blob())
      lastBlobUrlRef.current = blobUrl
      if (newTab) {
        newTab.location.href = blobUrl
      } else {
        // ブラウザ設定等で空タブ自体が開けなかった場合の保険（従来の挙動にフォールバック）
        window.open(blobUrl, '_blank')
      }
    } catch {
      showError('PDFの取得に失敗しました。通信状況をご確認のうえ、もう一度お試しください。')
      newTab?.close()
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
