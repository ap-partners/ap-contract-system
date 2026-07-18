'use client'

// ===== マイページ：ホーム画面 =====
// 2026-07-17新設。確定仕様（過去のトーク履歴⑨）：
//   A. 署名待ち書類の確認・署名（期限が近い場合は「あと○日」を目立つ形で表示）
//   B. 署名済み・確認済み書類の一覧表示・閲覧（新しい順。増えても見やすいよう直近のみ表示し
//      「過去の書類を見る」で展開する＝2026-07-17伊藤さん指定）
// お知らせ機能（E・H）は2026-07-17伊藤さんとの相談の結果、スコープ外とした。
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type PendingDocument = { id: string; documentLabel: string; signAction: string; remainingDays: number | null }
type SignedDocument = { id: string; documentLabel: string; signAction: string; signedAt: string }

export default function StaffMyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [staffName, setStaffName] = useState('')
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([])
  const [signedDocuments, setSignedDocuments] = useState<SignedDocument[]>([])
  const [signedTotalCount, setSignedTotalCount] = useState(0)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = async (all: boolean) => {
    try {
      const res = await fetch(`/api/staff/me${all ? '?all=1' : ''}`)
      if (res.status === 401) {
        router.push('/staff/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '読み込みに失敗しました。')
        return
      }
      setStaffName(data.staffName)
      setPendingDocuments(data.pendingDocuments || [])
      setSignedDocuments(data.signedDocuments || [])
      setSignedTotalCount(data.signedDocumentsTotalCount || 0)
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
      setHistoryLoading(false)
    }
  }

  useEffect(() => { load(false) }, [])

  const handleShowHistory = async () => {
    setHistoryLoading(true)
    setShowAllHistory(true)
    await load(true)
  }

  const handleLogout = async () => {
    await fetch('/api/staff/logout', { method: 'POST' })
    router.push('/staff/login')
  }

  const formatSignedAt = (iso: string, signAction: string): string => {
    const d = new Date(iso)
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    return signAction === 'signature' ? `${label}に署名済み` : `${label}に確認済み`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FC' }}>
        <p className="text-sm" style={{ color: '#5A6A8A' }}>読み込み中です...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex justify-center px-4 py-8" style={{ background: '#F5F7FC' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 16px rgba(26,35,64,0.08)' }}>
          <div className="px-6 pt-6 pb-10" style={{ background: '#1B3A8C' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs" style={{ color: '#C7D3EF' }}>こんにちは</p>
                <p className="text-lg font-bold text-white mt-0.5">{staffName || 'ゲスト'} さん</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label="ログアウト"
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Image src="/logo.png" alt="" width={20} height={20} style={{ borderRadius: '50%' }} />
              </button>
            </div>
          </div>

          <div className="px-6" style={{ marginTop: -28 }}>
            {error && (
              <div className="rounded-lg px-4 py-3 mb-4 text-xs leading-relaxed" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            {pendingDocuments.length > 0 && pendingDocuments.map(doc => (
              <div key={doc.id} className="rounded-2xl p-5 mb-4" style={{ background: '#FFF3E8' }}>
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-lg leading-none" style={{ color: '#F59E42' }}>📄</span>
                  <div>
                    <p className="text-sm font-bold leading-snug" style={{ color: '#B95F0F' }}>
                      確認・署名が必要な
                      <br />
                      書類があります
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#B95F0F' }}>
                      {doc.documentLabel}
                      {doc.remainingDays !== null && doc.remainingDays <= 7 && (
                        <>　残り{Math.max(doc.remainingDays, 0)}日</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/staff/mypage/documents/${doc.id}`)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1"
                  style={{ background: '#F59E42' }}
                >
                  内容を確認する <span>›</span>
                </button>
              </div>
            ))}

            {pendingDocuments.length === 0 && (
              <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: '#EEF2FA' }}>
                <p className="text-xs" style={{ color: '#5A6A8A' }}>現在、確認・署名が必要な書類はありません。</p>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: '#1A2340' }}>署名・確認済みの書類</p>
              <p className="text-xs" style={{ color: '#1B3A8C' }}>新しい順</p>
            </div>

            {signedDocuments.length === 0 && (
              <p className="text-xs pb-4" style={{ color: '#8A94AA' }}>まだ署名・確認済みの書類はありません。</p>
            )}

            <div className="mb-2">
              {signedDocuments.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => router.push(`/staff/mypage/documents/${doc.id}`)}
                  className="w-full flex items-center gap-3 py-2.5 text-left"
                  style={{ borderBottom: '1px solid #EEF0F5' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#E9F7EF' }}>
                    <span style={{ color: '#1E8449' }}>✓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: '#1A2340' }}>{doc.documentLabel}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8A94AA' }}>{formatSignedAt(doc.signedAt, doc.signAction)}</p>
                  </div>
                  <span style={{ color: '#B4B8C6' }}>›</span>
                </button>
              ))}
            </div>

            {!showAllHistory && signedTotalCount > signedDocuments.length && (
              <button
                onClick={handleShowHistory}
                disabled={historyLoading}
                className="w-full py-2.5 rounded-xl text-xs font-medium mb-6"
                style={{ background: '#F5F7FC', color: '#5A6A8A' }}
              >
                {historyLoading ? '読み込み中...' : '過去の書類を見る ⌄'}
              </button>
            )}
            {showAllHistory && <div className="mb-6" />}
          </div>
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#5A6A8A' }}>
          © 2026 株式会社APパートナーズ
        </p>
      </div>
    </div>
  )
}
