'use client'

// ===== マイページ：書類の確認・署名画面 =====
// 2026-07-17新設。/sign/[id]（社員番号＋契約ごとの認証コード方式）のマイページ版。
// ログインセッションで本人確認済みのため、この画面では社員番号・認証コードの入力を求めない。
// 完了後は「画面を閉じてください」ではなく「マイページに戻る」ボタンでmypageへ戻す
// （2026-07-17伊藤さん指定）。
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { drawSeal } from '@/app/sign/[id]/seal'

type Stage = 'loading' | 'view' | 'action' | 'done'
type SignAction = 'signature' | 'confirmation'
type DocKind = 'contract' | 'pledge'

export default function StaffDocumentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id as string

  const [stage, setStage] = useState<Stage>('loading')
  const [error, setError] = useState('')
  const [documentLabel, setDocumentLabel] = useState('')
  const [signAction, setSignAction] = useState<SignAction>('confirmation')
  const [pdfToken, setPdfToken] = useState('')
  const [kind, setKind] = useState<DocKind>('contract')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sealName, setSealName] = useState('')
  const [sealConfirmed, setSealConfirmed] = useState(false)

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/staff/documents/${id}`)
        if (res.status === 401) {
          router.push('/staff/login')
          return
        }
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || '書類を読み込めませんでした。')
          setStage('view')
          return
        }
        setDocumentLabel(data.documentLabel)
        setSignAction(data.signAction)
        setPdfToken(data.pdfToken || '')
        setKind(data.kind === 'pledge' ? 'pledge' : 'contract')
        setStage(data.status === '署名待ち' ? 'action' : 'view')
      } catch {
        setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
        setStage('view')
      }
    })()
  }, [id, router])

  useEffect(() => {
    if (stage !== 'action' || signAction !== 'signature') return
    if (previewCanvasRef.current) drawSeal(previewCanvasRef.current, sealName)
    if (exportCanvasRef.current) drawSeal(exportCanvasRef.current, sealName)
  }, [stage, signAction, sealName])

  useEffect(() => {
    setSealConfirmed(false)
  }, [sealName])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const signatureImageDataUrl =
        signAction === 'signature' ? exportCanvasRef.current?.toDataURL('image/png') : undefined

      const res = await fetch(kind === 'pledge' ? `/api/pledges/${id}/complete` : `/api/sign/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureImageDataUrl,
          sealName: signAction === 'signature' ? sealName.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '処理に失敗しました。\n時間をおいて再度お試しください。')
        return
      }
      setStage('done')
    } catch {
      setError('通信エラーが発生しました。\n電波状況をご確認の上、再度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    signAction === 'signature'
      ? sealName.trim().length > 0 && sealConfirmed && !submitting
      : confirmChecked && !submitting

  return (
    <div className="min-h-screen flex justify-center px-4 py-10" style={{ background: '#F5F7FC' }}>
      <div className="w-full max-w-md">
        <div className="rounded-3xl p-6" style={{ background: '#FFFFFF', boxShadow: '0 2px 16px rgba(26,35,64,0.08)' }}>
          {stage === 'loading' && (
            <p className="text-sm text-center py-6" style={{ color: '#5A6A8A' }}>読み込み中です...</p>
          )}

          {stage === 'view' && (
            <div className="text-center py-4">
              {error ? (
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#DC2626' }}>{error}</p>
              ) : (
                <>
                  <p className="text-sm font-bold mb-1" style={{ color: '#1A2340' }}>{documentLabel}</p>
                  <p className="text-xs mb-6" style={{ color: '#5A6A8A' }}>この書類の確認・署名は既に完了しています。</p>
                  <a
                    href={`${kind === 'pledge' ? `/api/pledges/${id}/pdf` : `/api/contracts/${id}/pdf`}?t=${encodeURIComponent(pdfToken)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-xl text-sm font-semibold mb-4"
                    style={{ background: '#EEF2FC', color: '#1B3A8C', border: '1px solid #D0DAF0' }}
                  >
                    書類の内容を見る（PDFが開きます）
                  </a>
                </>
              )}
              <button
                onClick={() => router.push('/staff/mypage')}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#1B3A8C' }}
              >
                マイページに戻る
              </button>
            </div>
          )}

          {stage === 'action' && (
            <>
              <h2 className="text-lg font-bold mb-1" style={{ color: '#1A2340' }}>{documentLabel}</h2>
              <p className="text-xs mb-6" style={{ color: '#5A6A8A' }}>内容をご確認のうえ、下記にご対応ください。</p>

              <a
                href={`${kind === 'pledge' ? `/api/pledges/${id}/pdf` : `/api/contracts/${id}/pdf`}?t=${encodeURIComponent(pdfToken)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={submitting}
                onClick={e => { if (submitting) e.preventDefault() }}
                className="block w-full text-center py-3 rounded-xl text-sm font-semibold mb-6"
                style={{
                  background: '#EEF2FC', color: '#1B3A8C', border: '1px solid #D0DAF0',
                  opacity: submitting ? 0.5 : 1, pointerEvents: submitting ? 'none' : 'auto',
                }}
              >
                書類の内容を確認する（PDFが開きます）
              </a>

              {signAction === 'signature' ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A2340' }}>
                    フルネームをご記入ください
                  </label>
                  <input
                    type="text"
                    value={sealName}
                    onChange={e => setSealName(e.target.value)}
                    disabled={submitting}
                    className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all mb-4"
                    style={{ borderColor: '#D0DAF0', background: submitting ? '#F5F7FC' : '#FFFFFF', color: '#1A2340' }}
                    placeholder="例：山田　太郎"
                  />

                  <p className="text-sm font-medium mb-2 text-center" style={{ color: '#1A2340' }}>
                    押印イメージ（プレビュー）
                  </p>
                  <div className="flex justify-center mb-3">
                    <canvas ref={previewCanvasRef} width={280} height={280} style={{ width: 140, height: 140 }} />
                    {/* PDFへ埋め込む高解像度版。/sign/[id]と同じ2026-07-22の修正（280→560）をこちらにも適用 */}
                    <canvas ref={exportCanvasRef} width={560} height={560} style={{ display: 'none' }} />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sealConfirmed}
                      onChange={e => setSealConfirmed(e.target.checked)}
                      disabled={sealName.trim().length === 0 || submitting}
                      className="mt-1"
                    />
                    <span className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
                      この印影の内容で相違ありません
                    </span>
                  </label>
                </div>
              ) : (
                <label className="flex items-start gap-2 mb-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={e => setConfirmChecked(e.target.checked)}
                    disabled={submitting}
                    className="mt-1"
                  />
                  <span className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
                    内容を確認しました
                  </span>
                </label>
              )}

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm leading-relaxed mb-4 whitespace-pre-line" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                style={{ background: canSubmit ? '#1B3A8C' : '#A8C0E8' }}
              >
                {submitting && (
                  <span className="inline-block w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF' }} />
                )}
                {submitting ? '送信中です…' : signAction === 'signature' ? '署名する' : '確認する'}
              </button>

              {submitting && (
                <p className="text-xs text-center mt-3 leading-relaxed" style={{ color: '#5A6A8A' }}>
                  {signAction === 'signature' ? '署名登録中です。' : '登録処理中です。'}
                  <br />
                  数秒ほどお時間をいただく場合があります。
                  <br />
                  画面を閉じたり、戻ったりせずそのままお待ちください。
                </p>
              )}
            </>
          )}

          {stage === 'done' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl" style={{ background: '#E9F7EF', color: '#1E8449' }}>
                ✓
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#1A2340' }}>
                {signAction === 'signature' ? '署名が完了しました' : '確認が完了しました'}
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#5A6A8A' }}>
                {documentLabel}の
                {signAction === 'signature' ? '署名' : '内容確認'}を
                <br />
                受け付けました。
              </p>
              <button
                onClick={() => router.push('/staff/mypage')}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1"
                style={{ background: '#1B3A8C' }}
              >
                マイページに戻る <span>›</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
