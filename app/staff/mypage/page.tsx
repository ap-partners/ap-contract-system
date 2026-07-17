'use client'

// ===== マイページ：ホーム画面 =====
// 2026-07-17新設。確定仕様（過去のトーク履歴⑨）：
//   A. 署名待ち書類の確認・署名（期限が近い場合は「あと○日」を目立つ形で表示）
//   B. 署名済み・確認済み書類の一覧表示・閲覧（新しい順。増えても見やすいよう直近のみ表示し
//      「過去の書類を見る」で展開する＝2026-07-17伊藤さん指定）
// お知らせ機能（E・H）は2026-07-17伊藤さんとの相談の結果、スコープ外とした。
// 2026-07-17：プロのWebデザイナーによるビジュアルリニューアルを反映。
// なお、いただいたデザイン案には「お知らせ」（固定文言・固定日付のダミー）と
// 「その他メニュー」（給与明細・勤怠・住所変更・組織情報・設定。いずれもクリックしても
// 何も起きない飾りのリンク）が含まれていたが、①お知らせはスコープ外と既に確定済みの内容と
// 矛盾する、②その他メニューは未実装機能への導線をあたかも動くかのように見せてしまう、という
// 2点から伊藤さんと相談のうえ削除している（実装しているのはA・Bのみ）。
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronRight, CircleAlert, FileText, LogOut, Sparkles, User } from 'lucide-react'

type PendingDocument = { id: string; documentLabel: string; signAction: string; remainingDays: number | null }
type SignedDocument = { id: string; documentLabel: string; signAction: string; signedAt: string }

const cardClass =
  'rounded-[28px] border border-[#EEF2F7] bg-white shadow-[0_20px_60px_rgba(15,23,42,.06)]'

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[20px] font-bold leading-7 tracking-normal text-[#0F172A]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[14px] leading-6 text-[#64748B]">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function IconBadge({
  children,
  tone = 'blue',
}: {
  children: ReactNode
  tone?: 'blue' | 'amber' | 'green' | 'slate'
}) {
  const tones = {
    blue: 'bg-[#EEF6FF] text-[#0E5BD8]',
    amber: 'bg-[#FFF7E8] text-[#B76A00]',
    green: 'bg-[#ECFDF5] text-[#087443]',
    slate: 'bg-[#F4F7FB] text-[#526174]',
  }

  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>
      {children}
    </span>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className={`${cardClass} p-8 text-center`}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#F4F8FF] text-[#0E5BD8]">
        {icon}
      </div>
      <p className="text-[16px] font-bold leading-6 text-[#0F172A]">{title}</p>
      <p className="mt-2 text-[14px] leading-6 text-[#64748B]">{description}</p>
    </div>
  )
}

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
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6">
        <div className="pointer-events-none absolute left-[-180px] top-[-220px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,.24)_0%,rgba(191,219,254,.12)_42%,rgba(255,255,255,0)_70%)] blur-2xl" />
        <div className={`${cardClass} relative flex w-full max-w-[360px] flex-col items-center p-8`}>
          <div className="mb-5 h-12 w-12 animate-pulse rounded-2xl bg-[#EEF6FF]" />
          <p className="text-[16px] font-semibold leading-6 text-[#526174]">読み込み中です...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-[#0F172A]">
      <div className="pointer-events-none absolute left-[-220px] top-[-260px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,.24)_0%,rgba(191,219,254,.12)_42%,rgba(255,255,255,0)_72%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-300px] right-[-240px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,rgba(14,91,216,.13)_0%,rgba(147,197,253,.10)_44%,rgba(255,255,255,0)_74%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,255,.74)_0%,rgba(255,255,255,.96)_36%,rgba(248,251,255,.72)_100%)]" />

      <header className="sticky top-0 z-20 border-b border-[#EEF2F7] bg-white/86 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] w-full max-w-3xl items-center justify-between px-6 sm:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="APパートナーズ"
              width={176}
              height={64}
              priority
              className="h-auto w-[168px] object-contain"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-full border border-[#EEF2F7] bg-white px-4 py-2 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF6FF] text-[#0E5BD8]">
                <User className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate text-[14px] font-bold leading-5 text-[#0F172A]">
                  {staffName || 'ゲスト'} さん
                </span>
                <span className="block text-[14px] leading-5 text-[#64748B]">従業員マイページ</span>
              </span>
            </div>
            <button
              onClick={handleLogout}
              aria-label="ログアウト"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#EEF2F7] bg-white text-[#526174] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DDE6F3] hover:text-[#0E5BD8] hover:shadow-[0_12px_28px_rgba(15,23,42,.08)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 sm:py-10">
        {error && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-[#F7C7C7] bg-[#FFF4F4] px-5 py-4 text-[#B42318] shadow-[0_12px_30px_rgba(180,35,24,.06)]">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-[14px] font-medium leading-6">{error}</p>
          </div>
        )}

        <section className={`${cardClass} animate-[dashboardIn_.55s_cubic-bezier(.2,.8,.2,1)_both] overflow-hidden p-8 sm:p-10`}>
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#DDEAFF] bg-[#F6FAFF] px-4 py-2 text-[14px] font-semibold leading-5 text-[#0E5BD8]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                従業員専用アプリ
              </div>
              <p className="text-[20px] font-bold leading-7 text-[#64748B]">こんにちは</p>
              <h1 className="mt-1 text-[32px] font-bold leading-[1.18] tracking-normal text-[#0F172A]">
                {staffName || 'ゲスト'} さん
              </h1>
              <p className="mt-4 max-w-[560px] text-[16px] leading-7 text-[#64748B]">
                今日もお疲れさまです。必要な手続きや確認済みの書類を、ここからすぐに確認できます。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
              <div className="rounded-3xl border border-[#EEF2F7] bg-[#F8FBFF] p-5">
                <p className="text-[30px] font-bold leading-none text-[#0E5BD8]">{pendingDocuments.length}</p>
                <p className="mt-2 text-[14px] font-semibold leading-5 text-[#64748B]">対応待ち</p>
              </div>
              <div className="rounded-3xl border border-[#EEF2F7] bg-[#F8FBFF] p-5">
                <p className="text-[30px] font-bold leading-none text-[#0F172A]">{signedTotalCount}</p>
                <p className="mt-2 text-[14px] font-semibold leading-5 text-[#64748B]">確認済み</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader
            title="確認・署名が必要な書類"
            description="タップして内容を確認し、対応してください。"
          />

          {pendingDocuments.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {pendingDocuments.map(doc => {
                const urgent = doc.remainingDays !== null && doc.remainingDays <= 7

                return (
                  <button
                    key={doc.id}
                    onClick={() => router.push(`/staff/mypage/documents/${doc.id}`)}
                    className={`${cardClass} group min-h-[120px] p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#DDE6F3] hover:shadow-[0_24px_70px_rgba(15,23,42,.10)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30`}
                  >
                    <div className="flex h-full items-start justify-between gap-5">
                      <div className="flex min-w-0 gap-4">
                        <IconBadge tone={urgent ? 'amber' : 'blue'}>
                          <FileText className="h-6 w-6" aria-hidden="true" />
                        </IconBadge>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[20px] font-bold leading-7 text-[#0F172A]">
                              契約書
                            </h3>
                            {urgent && (
                              <span className="rounded-full bg-[#FFF0D5] px-3 py-1 text-[14px] font-bold leading-5 text-[#A15C00]">
                                残り{Math.max(doc.remainingDays || 0, 0)}日
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[16px] font-semibold leading-6 text-[#334155]">
                            {doc.documentLabel}
                          </p>
                          <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                            契約内容を確認する
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-[#9AA6B8] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#0E5BD8]" aria-hidden="true" />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="h-7 w-7" aria-hidden="true" />}
              title="現在、確認・署名が必要な書類はありません。"
              description="必要な手続きが届いたら、このエリアに大きく表示されます。"
            />
          )}
        </section>

        <section className="mt-10">
          <SectionHeader
            title="署名・確認済みの書類"
            description="新しい順に表示しています。"
            action={<span className="text-[14px] font-semibold leading-5 text-[#0E5BD8]">新しい順</span>}
          />

          <div className={`${cardClass} overflow-hidden p-2`}>
            {signedDocuments.length === 0 && (
              <div className="p-6">
                <p className="text-[16px] font-semibold leading-6 text-[#0F172A]">
                  まだ署名・確認済みの書類はありません。
                </p>
                <p className="mt-2 text-[14px] leading-6 text-[#64748B]">
                  確認済みの書類は、ここに履歴として表示されます。
                </p>
              </div>
            )}

            {signedDocuments.map(doc => (
              <button
                key={doc.id}
                onClick={() => router.push(`/staff/mypage/documents/${doc.id}`)}
                className="group flex w-full items-center gap-4 rounded-[22px] px-4 py-4 text-left transition-all duration-200 hover:bg-[#F8FBFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
              >
                <IconBadge tone="green">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </IconBadge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold leading-6 text-[#0F172A]">
                    {doc.documentLabel}
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                    {formatSignedAt(doc.signedAt, doc.signAction)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#9AA6B8] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#0E5BD8]" aria-hidden="true" />
              </button>
            ))}

            {!showAllHistory && signedTotalCount > signedDocuments.length && (
              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={handleShowHistory}
                  disabled={historyLoading}
                  className="flex h-14 w-full items-center justify-center rounded-[18px] border border-[#E5EAF2] bg-[#F8FBFF] text-[16px] font-bold text-[#526174] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-[#0E5BD8] hover:shadow-[0_12px_30px_rgba(15,23,42,.08)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
                >
                  {historyLoading ? '読み込み中...' : '過去の書類を見る'}
                </button>
              </div>
            )}
            {showAllHistory && <div className="h-4" />}
          </div>
        </section>

        <p className="mt-10 text-center text-[14px] leading-6 text-[#7C8BA1]">
          © 2026 株式会社APパートナーズ
        </p>
      </div>

      <style jsx global>{`
        @keyframes dashboardIn {
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
