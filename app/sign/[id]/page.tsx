'use client'

// ===== 従業員向け署名・確認画面（フェーズ5・2026-07-09実装、同日 丸印鑑方式に変更） =====
// ログイン画面を介さず、署名依頼メールの /sign/[id] リンクから直接アクセスする
// （docs/SYSTEM_DESIGN.md 7-2章）。本人確認は社員番号＋認証コード
// （2026-07-13：生年月日方式から変更。コードは通知メールに記載される6桁の数字。
// 5回間違えると失効し、その場合は再発行ボタンから新しいコードを送信できる。
// docs/SYSTEM_DESIGN.md 10章 2026-07-13決定）。
// パターンA・C（雇用契約書を含む）→ フルネームをテキスト入力し、丸印鑑（横書き・クラウドサイン方式）
// をリアルタイム生成してPDFに埋め込む（過去のトーク履歴の確定仕様。手書きサインではない）。
// パターンB（就業条件明示書のみ）→ 内容確認ボタンのみ。
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { drawSeal } from './seal'

type Stage = 'verify' | 'action' | 'done'
type SignAction = 'signature' | 'confirmation'
type ErrorReason = 'invalid' | 'expired' | 'locked' | ''

export default function SignPage() {
  const params = useParams<{ id: string }>()
  const id = params.id as string

  const [stage, setStage] = useState<Stage>('verify')
  const [employeeNumber, setEmployeeNumber] = useState('')
  // 2026-07-13：生年月日入力（8桁連続入力方式）を廃止し、通知メールに記載される
  // 6桁の認証コードの入力に置き換えた。
  const [authCode, setAuthCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [errorReason, setErrorReason] = useState<ErrorReason>('')
  const [reissuing, setReissuing] = useState(false)
  const [reissueSent, setReissueSent] = useState(false)

  const handleReissue = async () => {
    if (!employeeNumber.trim()) {
      setError('社員番号を入力してから再発行してください。')
      return
    }
    setReissuing(true)
    setError('')
    try {
      const res = await fetch(`/api/sign/${id}/reissue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '再発行に失敗しました。')
        return
      }
      setReissueSent(true)
      setErrorReason('')
      setAuthCode('')
    } catch {
      setError('通信エラーが発生しました。\n電波状況をご確認の上、再度お試しください。')
    } finally {
      setReissuing(false)
    }
  }

  const [staffName, setStaffName] = useState('')
  const [documentLabel, setDocumentLabel] = useState('')
  const [signAction, setSignAction] = useState<SignAction>('confirmation')
  const [pdfToken, setPdfToken] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [sealName, setSealName] = useState('')
  const [sealConfirmed, setSealConfirmed] = useState(false)

  // 印鑑プレビュー用（画面表示、CSSで140pxに縮小表示）と、実際にPDFへ埋め込むための
  // 高解像度版の2枚を同じロジックで描画する（保存用は印刷しても粗くならないよう大きめに生成）。
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (stage !== 'action' || signAction !== 'signature') return
    if (previewCanvasRef.current) drawSeal(previewCanvasRef.current, sealName)
    if (exportCanvasRef.current) drawSeal(exportCanvasRef.current, sealName)
  }, [stage, signAction, sealName])

  useEffect(() => {
    // 氏名入力が変わったら、押印確認チェックはリセットする（別の名前で押したまま完了しないように）
    setSealConfirmed(false)
  }, [sealName])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    setError('')
    setErrorReason('')
    setReissueSent(false)
    try {
      const res = await fetch(`/api/sign/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim(), authCode: authCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '確認できませんでした。')
        setErrorReason(data.reason || 'invalid')
        return
      }
      setStaffName(data.staffName)
      // 2026-07-09修正：フルネーム欄に最初から本人の名前が自動入力されていると、
      // 「自分で入力する」という意味が無くなってしまう（伊藤さん指摘）ため、空欄から始める。
      setDocumentLabel(data.documentLabel)
      setSignAction(data.signAction)
      setPdfToken(data.pdfToken || '')
      setStage('action')
    } catch {
      setError('通信エラーが発生しました。\n電波状況をご確認の上、再度お試しください。')
    } finally {
      setVerifying(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const signatureImageDataUrl =
        signAction === 'signature' ? exportCanvasRef.current?.toDataURL('image/png') : undefined

      const res = await fetch(`/api/sign/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeNumber: employeeNumber.trim(),
          authCode: authCode.trim(),
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
        <div className="text-center mb-8">
          <h1 className="text-lg font-bold" style={{ color: '#1A2340' }}>
            APパートナーズ　契約書管理システム
          </h1>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#FFFFFF', boxShadow: '0 2px 12px rgba(26,35,64,0.08)' }}>
          {stage === 'verify' && (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#1A2340' }}>本人確認</h2>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: '#5A6A8A' }}>
                社員番号と、通知メールに記載の認証コードを入力してください。
              </p>
              <form onSubmit={handleVerify} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A2340' }}>
                    社員番号
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
                    placeholder="例：100047"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A2340' }}>
                    認証コード（半角数字6桁）
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={authCode}
                    onChange={e => setAuthCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
                    placeholder="例：482913（メールに記載の6桁の数字）"
                    required
                  />
                </div>

                {reissueSent && (
                  <div className="rounded-lg px-4 py-3 text-sm leading-relaxed" style={{ background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC' }}>
                    新しい認証コードをメールで送信しました。
                    <br />
                    メールをご確認のうえ、新しいコードを入力してください。
                  </div>
                )}

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-line" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    {error}
                  </div>
                )}

                {(errorReason === 'expired' || errorReason === 'locked') && (
                  <button
                    type="button"
                    onClick={handleReissue}
                    disabled={reissuing}
                    className="w-full py-3 rounded-lg text-sm font-semibold transition-all"
                    style={{ background: '#EEF2FC', color: '#1B3A8C', border: '1px solid #D0DAF0' }}
                  >
                    {reissuing ? '再発行中...' : '認証コードを再発行する'}
                  </button>
                )}

                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-2"
                  style={{ background: verifying ? '#A8C0E8' : '#1B3A8C' }}
                >
                  {verifying ? '確認中...' : '確認する'}
                </button>
              </form>
            </>
          )}

          {stage === 'action' && (
            <>
              <h2 className="text-xl font-bold mb-1" style={{ color: '#1A2340' }}>
                {staffName} 様
              </h2>
              <p className="text-sm mb-6" style={{ color: '#5A6A8A' }}>{documentLabel}</p>

              <a
                href={`/api/contracts/${id}/pdf?t=${encodeURIComponent(pdfToken)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={submitting}
                onClick={e => { if (submitting) e.preventDefault() }}
                className="block w-full text-center py-3 rounded-lg text-sm font-semibold mb-6 transition-all"
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
                    className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all mb-4"
                    style={{ borderColor: '#D0DAF0', background: submitting ? '#F5F7FC' : '#FFFFFF', color: '#1A2340' }}
                    placeholder={staffName ? `例：${staffName}` : '例：山田　太郎'}
                  />

                  <p className="text-sm font-medium mb-2 text-center" style={{ color: '#1A2340' }}>
                    押印イメージ（プレビュー）
                  </p>
                  <div className="flex justify-center mb-3">
                    <canvas
                      ref={previewCanvasRef}
                      width={280}
                      height={280}
                      style={{ width: 140, height: 140 }}
                    />
                    {/* 実際にPDFへ埋め込む高解像度版（非表示・同じ内容を大きめに描画。
                        drawSeal()はcanvas.widthを基準に全要素を比率で描くため、
                        サイズを変えるだけで印刷時の粗さを改善できる。2026-07-22：
                        プレビューと同じ280pxのままだった不一致を修正し560pxに拡大。） */}
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

              {/* 2026-07-10追加：署名/確認完了ボタンを押してからAPI応答までPDF再生成・
                  Google Driveアップロードで数秒かかることがあり、「反応が無いように見えて不安」
                  との指摘（伊藤さん）を受けた。ボタン自体はdisabled={!canSubmit}（canSubmitに
                  !submittingが含まれる）で元々連打は防げていたが、処理中であることが視覚的に
                  伝わりにくかったため、①スピナーアイコンを追加、②処理中のみ「画面を閉じずに
                  お待ちください」の注意文を表示、③フルネーム欄・PDFリンク・チェックボックスも
                  処理中は操作不可にして、誤操作の余地を無くした。 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                style={{ background: canSubmit ? '#1B3A8C' : '#A8C0E8' }}
              >
                {submitting && (
                  <span
                    className="inline-block w-4 h-4 rounded-full animate-spin"
                    style={{ border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF' }}
                  />
                )}
                {submitting
                  ? '送信中です…'
                  : signAction === 'signature'
                    ? '署名する'
                    : '確認する'}
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
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
                style={{ background: '#E9F7EF', color: '#1E8449' }}
              >
                ✓
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#1A2340' }}>
                {signAction === 'signature' ? '署名が完了しました' : '確認が完了しました'}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: '#5A6A8A' }}>
                ご対応ありがとうございました。
                <br />
                この画面は閉じていただいて構いません。
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#5A6A8A' }}>
          © 2026 株式会社APパートナーズ
        </p>
      </div>
    </div>
  )
}
