'use client'

// ===== 従業員向け署名・確認画面（フェーズ5・2026-07-09実装、同日 丸印鑑方式に変更） =====
// ログイン画面を介さず、署名依頼メールの /sign/[id] リンクから直接アクセスする
// （docs/SYSTEM_DESIGN.md 7-2章）。本人確認は社員番号＋生年月日。
// パターンA・C（雇用契約書を含む）→ フルネームをテキスト入力し、丸印鑑（横書き・クラウドサイン方式）
// をリアルタイム生成してPDFに埋め込む（過去のトーク履歴の確定仕様。手書きサインではない）。
// パターンB（就業条件明示書のみ）→ 内容確認ボタンのみ。
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { drawSeal } from './seal'

type Stage = 'verify' | 'action' | 'done'
type SignAction = 'signature' | 'confirmation'

export default function SignPage() {
  const params = useParams<{ id: string }>()
  const id = params.id as string

  const [stage, setStage] = useState<Stage>('verify')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [birthday, setBirthday] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const [staffName, setStaffName] = useState('')
  const [documentLabel, setDocumentLabel] = useState('')
  const [signAction, setSignAction] = useState<SignAction>('confirmation')
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
    try {
      const res = await fetch(`/api/sign/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim(), birthday }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '確認できませんでした。')
        return
      }
      setStaffName(data.staffName)
      // 2026-07-09修正：フルネーム欄に最初から本人の名前が自動入力されていると、
      // 「自分で入力する」という意味が無くなってしまう（伊藤さん指摘）ため、空欄から始める。
      setDocumentLabel(data.documentLabel)
      setSignAction(data.signAction)
      setStage('action')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認の上、再度お試しください。')
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
          birthday,
          signatureImageDataUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '処理に失敗しました。時間をおいて再度お試しください。')
        return
      }
      setStage('done')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認の上、再度お試しください。')
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
                社員番号と生年月日を入力してください。
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
                    生年月日
                  </label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={e => setBirthday(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm leading-relaxed" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    {error}
                  </div>
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
                href={`/api/contracts/${id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-3 rounded-lg text-sm font-semibold mb-6 transition-all"
                style={{ background: '#EEF2FC', color: '#1B3A8C', border: '1px solid #D0DAF0' }}
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
                    className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all mb-4"
                    style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
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
                    {/* 実際にPDFへ埋め込む高解像度版（非表示・同じ内容を大きめに描画） */}
                    <canvas ref={exportCanvasRef} width={280} height={280} style={{ display: 'none' }} />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sealConfirmed}
                      onChange={e => setSealConfirmed(e.target.checked)}
                      disabled={sealName.trim().length === 0}
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
                    className="mt-1"
                  />
                  <span className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
                    内容を確認しました
                  </span>
                </label>
              )}

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm leading-relaxed mb-4" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: canSubmit ? '#1B3A8C' : '#A8C0E8' }}
              >
                {submitting
                  ? '送信中...'
                  : signAction === 'signature'
                    ? '署名する'
                    : '確認する'}
              </button>
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
