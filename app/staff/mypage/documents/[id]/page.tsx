'use client'

// ===== マイページ：書類の確認・署名画面 =====
// 2026-07-17新設。/sign/[id]（社員番号＋契約ごとの認証コード方式）のマイページ版。
// ログインセッションで本人確認済みのため、この画面では社員番号・認証コードの入力を求めない。
// 完了後は「画面を閉じてください」ではなく「マイページに戻る」ボタンでmypageへ戻す
// （2026-07-17伊藤さん指定）。
// 2026-07-17：プロのWebデザイナーによるビジュアルリニューアルを反映（ロジックは無変更）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { drawSeal } from '@/app/sign/[id]/seal'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  PenTool,
  ShieldCheck,
  Stamp,
} from 'lucide-react'

type Stage = 'loading' | 'view' | 'action' | 'done'
type SignAction = 'signature' | 'confirmation'

const cardClass =
  'rounded-[28px] border border-[#EEF2F7] bg-white shadow-[0_20px_60px_rgba(15,23,42,.08)]'

const primaryButtonClass =
  'flex h-[60px] w-full items-center justify-center gap-2 rounded-[18px] px-5 text-[16px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(14,91,216,.28)] active:translate-y-0 active:shadow-[0_8px_18px_rgba(14,91,216,.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30'

function ProgressSteps({ stage }: { stage: Stage }) {
  const currentStep = stage === 'done' ? 3 : stage === 'action' ? 2 : 1
  const steps = ['書類確認', '内容確認', '完了']

  return (
    <div className="mb-8 rounded-3xl border border-[#EEF2F7] bg-[#F8FBFF] p-4">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const number = index + 1
          const active = number <= currentStep

          return (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
                  active ? 'bg-[#0E5BD8] text-white' : 'bg-white text-[#8A96A8] ring-1 ring-[#E5EAF2]'
                }`}
              >
                {number}
              </span>
              <span
                className={`min-w-0 text-[14px] font-semibold leading-5 ${
                  active ? 'text-[#0F172A]' : 'text-[#8A96A8]'
                }`}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-10 text-[#0F172A] sm:px-8">
      <div className="pointer-events-none absolute left-[-210px] top-[-250px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,.25)_0%,rgba(191,219,254,.12)_42%,rgba(255,255,255,0)_72%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-280px] right-[-230px] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(14,91,216,.14)_0%,rgba(147,197,253,.10)_44%,rgba(255,255,255,0)_74%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,255,.76)_0%,rgba(255,255,255,.96)_42%,rgba(248,251,255,.72)_100%)]" />
      <div className="relative z-10 w-full max-w-[560px] animate-[documentCardIn_.55s_cubic-bezier(.2,.8,.2,1)_both]">
        {children}
      </div>
      <style jsx global>{`
        @keyframes documentCardIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  )
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null

  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-[#F7C7C7] bg-[#FFF4F4] px-5 py-4 text-[#B42318]">
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="whitespace-pre-line text-[14px] font-medium leading-6">{message}</p>
    </div>
  )
}

export default function StaffDocumentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id as string

  const [stage, setStage] = useState<Stage>('loading')
  const [error, setError] = useState('')
  const [documentLabel, setDocumentLabel] = useState('')
  const [signAction, setSignAction] = useState<SignAction>('confirmation')
  const [pdfToken, setPdfToken] = useState('')
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

      const res = await fetch(`/api/sign/${id}/complete`, {
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
    <PageShell>
      <section className={`${cardClass} p-8 sm:p-9`}>
        {stage === 'loading' && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EEF6FF] text-[#0E5BD8]">
              <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
            </div>
            <h1 className="text-[30px] font-bold leading-[1.2] tracking-normal text-[#0F172A]">
              書類を読み込んでいます
            </h1>
            <p className="mt-3 text-[16px] leading-7 text-[#64748B]">
              安全な署名画面を準備しています。このままお待ちください。
            </p>
          </div>
        )}

        {stage === 'view' && (
          <div>
            <ProgressSteps stage={stage} />

            {error ? (
              <>
                <ErrorMessage message={error} />
                <button
                  onClick={() => router.push('/staff/mypage')}
                  className={`${primaryButtonClass} bg-[#0E5BD8]`}
                >
                  マイページに戻る
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#ECFDF5] text-[#087443]">
                    <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <p className="mb-3 text-[14px] font-semibold leading-5 tracking-[.08em] text-[#0E5BD8]">
                    確認済みの書類
                  </p>
                  <h1 className="text-[30px] font-bold leading-[1.2] tracking-normal text-[#0F172A]">
                    {documentLabel}
                  </h1>
                  <p className="mt-4 text-[16px] leading-7 text-[#64748B]">
                    この書類の確認・署名は既に完了しています。必要に応じてPDFを確認できます。
                  </p>
                </div>

                <a
                  href={`/api/contracts/${id}/pdf?t=${encodeURIComponent(pdfToken)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mb-6 flex min-h-[76px] w-full items-center justify-between gap-4 rounded-[22px] border border-[#DDEAFF] bg-[#F6FAFF] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_40px_rgba(14,91,216,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
                >
                  <span className="flex items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0E5BD8] shadow-[0_8px_18px_rgba(14,91,216,.08)]">
                      <FileText className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-[16px] font-bold leading-6 text-[#0F172A]">
                        書類の内容を見る
                      </span>
                      <span className="block text-[14px] leading-6 text-[#64748B]">
                        PDFが別タブで開きます
                      </span>
                    </span>
                  </span>
                  <ExternalLink className="h-5 w-5 text-[#0E5BD8] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </a>

                <button
                  onClick={() => router.push('/staff/mypage')}
                  className={`${primaryButtonClass} bg-[#0E5BD8]`}
                >
                  マイページに戻る
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}

        {stage === 'action' && (
          <>
            <ProgressSteps stage={stage} />

            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EEF6FF] text-[#0E5BD8]">
                {signAction === 'signature' ? (
                  <PenTool className="h-8 w-8" aria-hidden="true" />
                ) : (
                  <Eye className="h-8 w-8" aria-hidden="true" />
                )}
              </div>
              <p className="mb-3 text-[14px] font-semibold leading-5 tracking-[.08em] text-[#0E5BD8]">
                電子契約
              </p>
              <h1 className="text-[32px] font-bold leading-[1.18] tracking-normal text-[#0F172A]">
                {documentLabel}
              </h1>
              <p className="mt-4 text-[16px] leading-7 text-[#64748B]">
                まずPDFの内容を確認し、問題がなければ下記の手続きを完了してください。
              </p>
            </div>

            <a
              href={`/api/contracts/${id}/pdf?t=${encodeURIComponent(pdfToken)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={submitting}
              onClick={e => { if (submitting) e.preventDefault() }}
              className="group mb-8 flex min-h-[84px] w-full items-center justify-between gap-4 rounded-[24px] border border-[#DDEAFF] bg-[#F6FAFF] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_46px_rgba(14,91,216,.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
              style={{
                opacity: submitting ? 0.5 : 1, pointerEvents: submitting ? 'none' : 'auto',
              }}
            >
              <span className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0E5BD8] shadow-[0_8px_18px_rgba(14,91,216,.08)]">
                  <FileText className="h-7 w-7" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[20px] font-bold leading-7 text-[#0F172A]">
                    書類の内容を確認する
                  </span>
                  <span className="mt-1 block text-[14px] leading-6 text-[#64748B]">
                    PDFが別タブで開きます
                  </span>
                </span>
              </span>
              <ExternalLink className="h-5 w-5 text-[#0E5BD8] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>

            {signAction === 'signature' ? (
              <div className="mb-6 rounded-[24px] border border-[#EEF2F7] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,.04)]">
                <div className="mb-5 flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF6FF] text-[#0E5BD8]">
                    <Stamp className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[20px] font-bold leading-7 text-[#0F172A]">署名情報</h2>
                    <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                      フルネームから印影を作成します。プレビューを確認してから署名してください。
                    </p>
                  </div>
                </div>

                <label className="mb-2 block text-[14px] font-semibold leading-5 text-[#1F2937]">
                  フルネームをご記入ください
                </label>
                <input
                  type="text"
                  value={sealName}
                  onChange={e => setSealName(e.target.value)}
                  disabled={submitting}
                  className="mb-5 h-[60px] w-full rounded-[18px] border border-[#E5EAF2] bg-white px-5 text-[16px] font-medium text-[#111827] outline-none transition-all duration-200 placeholder:text-[#9AA6B8] focus:border-[#0E5BD8] focus:ring-2 focus:ring-[#0E5BD8]/20 disabled:bg-[#F5F7FB]"
                  placeholder="例：山田 太郎"
                />

                <div className="rounded-[22px] border border-[#E5EAF2] bg-[#FAFBFD] p-5">
                  <div className="mb-4 text-center">
                    <p className="text-[16px] font-bold leading-6 text-[#0F172A]">
                      印影プレビュー
                    </p>
                    <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                      実際に登録される印影イメージです。
                    </p>
                  </div>
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-[156px] w-[156px] items-center justify-center rounded-[28px] border border-[#E5EAF2] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
                      <canvas ref={previewCanvasRef} width={280} height={280} style={{ width: 140, height: 140 }} />
                    </div>
                    <canvas ref={exportCanvasRef} width={280} height={280} style={{ display: 'none' }} />
                  </div>

                  <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[18px] border border-[#E5EAF2] bg-white px-4 py-3 transition-all duration-200 hover:border-[#D7E4F7]">
                    <input
                      type="checkbox"
                      checked={sealConfirmed}
                      onChange={e => setSealConfirmed(e.target.checked)}
                      disabled={sealName.trim().length === 0 || submitting}
                      className="mt-1 h-5 w-5 rounded border-[#C9D3E2] text-[#0E5BD8] focus:ring-2 focus:ring-[#0E5BD8]/30 disabled:opacity-50"
                    />
                    <span className="text-[16px] font-medium leading-6 text-[#1F2937]">
                      この印影の内容で相違ありません
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-[24px] border border-[#EEF2F7] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,.04)]">
                <div className="mb-5 flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF6FF] text-[#0E5BD8]">
                    <BadgeCheck className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[20px] font-bold leading-7 text-[#0F172A]">内容確認</h2>
                    <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                      PDFの内容を確認したうえで、チェックを入れてください。
                    </p>
                  </div>
                </div>

                <label className="flex min-h-[64px] cursor-pointer items-start gap-3 rounded-[18px] border border-[#E5EAF2] bg-[#FAFBFD] px-4 py-4 transition-all duration-200 hover:border-[#D7E4F7] hover:bg-white">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={e => setConfirmChecked(e.target.checked)}
                    disabled={submitting}
                    className="mt-1 h-5 w-5 rounded border-[#C9D3E2] text-[#0E5BD8] focus:ring-2 focus:ring-[#0E5BD8]/30 disabled:opacity-50"
                  />
                  <span className="text-[16px] font-medium leading-6 text-[#1F2937]">
                    内容を確認しました
                  </span>
                </label>
              </div>
            )}

            <ErrorMessage message={error} />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`${primaryButtonClass} ${canSubmit ? 'bg-[#0E5BD8]' : 'cursor-not-allowed bg-[#9CB9E9] shadow-none hover:translate-y-0 hover:shadow-none'}`}
            >
              {submitting && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {submitting ? '送信中です...' : signAction === 'signature' ? '署名する' : '確認する'}
              {!submitting && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </button>

            {submitting && (
              <div className="mt-6 rounded-[24px] border border-[#DDEAFF] bg-[#F6FAFF] p-5 text-center">
                <LoaderCircle className="mx-auto mb-3 h-7 w-7 animate-spin text-[#0E5BD8]" aria-hidden="true" />
                <p className="text-[20px] font-bold leading-7 text-[#0F172A]">送信中</p>
                <p className="mt-2 text-[16px] leading-7 text-[#64748B]">
                  {signAction === 'signature' ? '署名情報を登録しています。' : '確認情報を登録しています。'}
                  このままお待ちください。
                </p>
              </div>
            )}
          </>
        )}

        {stage === 'done' && (
          <div className="text-center">
            <ProgressSteps stage={stage} />
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#ECFDF5] text-[#087443] shadow-[0_18px_40px_rgba(8,116,67,.12)]">
              <CheckCircle2 className="h-11 w-11" aria-hidden="true" />
            </div>
            <p className="mb-3 text-[14px] font-semibold leading-5 tracking-[.08em] text-[#087443]">
              COMPLETED
            </p>
            <h1 className="text-[32px] font-bold leading-[1.18] tracking-normal text-[#0F172A]">
              {signAction === 'signature' ? '署名が完了しました' : '確認が完了しました'}
            </h1>
            <p className="mx-auto mt-4 max-w-[420px] text-[16px] leading-7 text-[#64748B]">
              ありがとうございます。{documentLabel}の
              {signAction === 'signature' ? '署名' : '内容確認'}は正常に完了しました。
            </p>
            <button
              onClick={() => router.push('/staff/mypage')}
              className={`${primaryButtonClass} mt-8 bg-[#0E5BD8]`}
            >
              マイページに戻る
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
    </PageShell>
  )
}
