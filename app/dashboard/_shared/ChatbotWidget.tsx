'use client'

// ===== チャットボット（FAQ検索型・無料）共通ウィジェット =====
// 2026-07-28新設。docs/chatbot_faq_design.md で確定した設計に基づく実装：
//   ・完全無料のキーワード一致検索（AI自然文生成は使わない）
//   ・ヘッダー右上固定のオレンジ色アイコン（伊藤さん作成の画像をそのまま使用）
//   ・該当する回答が見つからない場合は「質問を送る」から自由記述で送信でき、
//     管理部が回答すると自動的にFAQへ追加される学習型の仕組み
// 3ダッシュボード（担当営業・SSC・管理部）のヘッダーに <ChatbotWidget /> を1行追加するだけで
// 動くよう、必須propsなしの自己完結コンポーネントにしている。
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  FaqEntry,
  FAQ_MAJOR_CATEGORIES,
  searchFaqEntries,
  filterFaqByMajorCategory,
  getRelatedEntries,
} from '@/lib/faq'

const panelCard = 'rounded-2xl border border-[#E8EDF5] bg-white shadow-[0_20px_50px_rgba(15,23,42,.15)]'
const chipBase = 'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition'
const chipActive = 'border-[#2F5FD0] bg-[#2F5FD0] text-white'
const chipInactive = 'border-[#E8EDF5] bg-white text-[#6B7280] hover:border-[#2F5FD0] hover:text-[#2F5FD0]'

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<FaqEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<FaqEntry | null>(null)

  const [questionText, setQuestionText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id || null)
      setUserEmail(data.user?.email || null)
      setUserRole((data.user?.user_metadata as any)?.role || null)
    })()
  }, [])

  const loadEntries = async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('faq_entries')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) {
      setLoadError('FAQの読み込みに失敗しました。通信環境をご確認ください。')
    } else {
      setEntries((data || []) as FaqEntry[])
    }
    setLoading(false)
  }

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && entries.length === 0 && !loading) loadEntries()
    if (!next) resetPanelState()
  }

  // 外側クリック・Escキーで閉じる
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); resetPanelState() }
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); resetPanelState() } }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const filtered = searchFaqEntries(filterFaqByMajorCategory(entries, selectedMajor), query)
  const showSendQuestion = query.trim().length > 0 && filtered.length === 0 && !selectedEntry

  const resetPanelState = () => {
    setSelectedEntry(null)
    setQuery('')
    setSelectedMajor(null)
    setQuestionText('')
    setSubmitted(false)
    setSubmitError('')
  }

  const handleSubmitQuestion = async () => {
    const text = questionText.trim()
    if (!text || !userId) return
    setSubmitting(true)
    setSubmitError('')
    const { error } = await supabase.from('faq_inquiries').insert([{
      question_text: text,
      submitted_by: userId,
      submitted_by_email: userEmail,
      submitted_by_role: userRole,
    }])
    if (error) {
      setSubmitError('質問の送信に失敗しました。お手数ですが、もう一度お試しください。')
    } else {
      setSubmitted(true)
      setQuestionText('')
    }
    setSubmitting(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        aria-label="よくある質問（チャットボット）を開く"
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8EDF5] bg-white shadow-[0_10px_30px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(15,23,42,.08)]"
      >
        <Image src="/icons/chatbot-icon.png" alt="よくある質問" width={48} height={48} className="h-full w-full object-cover" />
      </button>

      {open && (
        <div className={`${panelCard} absolute right-0 top-14 z-50 flex max-h-[70vh] w-[380px] flex-col overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#E8EDF5] px-4 py-3">
            <p className="text-sm font-semibold text-[#1F2937]">よくある質問</p>
            <button onClick={() => setOpen(false)} aria-label="閉じる" className="text-[#6B7280] hover:text-[#1F2937]">✕</button>
          </div>

          {selectedEntry ? (
            <div className="flex-1 overflow-auto p-4">
              <button
                onClick={() => setSelectedEntry(null)}
                className="mb-3 text-xs font-semibold text-[#2F5FD0] hover:underline"
              >
                ← 検索結果に戻る
              </button>
              <p className="mb-1 text-[11px] font-semibold text-[#6B7280]">{selectedEntry.major_label}</p>
              <p className="mb-3 text-sm font-bold text-[#1F2937]">{selectedEntry.question}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-[#1F2937]">{selectedEntry.answer}</p>

              {selectedEntry.escalation_note && (
                <div className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3">
                  <p className="text-xs font-semibold text-[#92400E]">こんな場合は管理部にご相談ください</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#92400E]">{selectedEntry.escalation_note}</p>
                </div>
              )}

              {getRelatedEntries(selectedEntry, entries).length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[#6B7280]">関連する質問</p>
                  <div className="space-y-1.5">
                    {getRelatedEntries(selectedEntry, entries).map(rel => (
                      <button
                        key={rel.id}
                        onClick={() => setSelectedEntry(rel)}
                        className="block w-full rounded-lg border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2 text-left text-xs font-medium text-[#1F2937] hover:border-[#2F5FD0]"
                      >
                        {rel.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="border-b border-[#E8EDF5] p-3">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="キーワードで検索（例：ログイン できない）"
                  className="w-full rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#2F5FD0]"
                />
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedMajor(null)}
                    className={`${chipBase} ${selectedMajor === null ? chipActive : chipInactive}`}
                  >
                    すべて
                  </button>
                  {FAQ_MAJOR_CATEGORIES.map(c => (
                    <button
                      key={c.code}
                      onClick={() => setSelectedMajor(c.code)}
                      className={`${chipBase} ${selectedMajor === c.code ? chipActive : chipInactive}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-auto p-3">
                {loading && <p className="p-3 text-center text-xs text-[#6B7280]">読み込み中…</p>}
                {loadError && <p className="p-3 text-center text-xs text-[#B91C1C]">{loadError}</p>}

                {!loading && !loadError && filtered.length > 0 && (
                  <div className="space-y-1.5">
                    {filtered.map(entry => (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="block w-full rounded-lg border border-[#E8EDF5] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]"
                      >
                        {entry.question}
                      </button>
                    ))}
                  </div>
                )}

                {!loading && !loadError && filtered.length === 0 && !query && (
                  <p className="p-3 text-center text-xs text-[#6B7280]">キーワードを入力するか、カテゴリを選んで質問を探してください。</p>
                )}

                {showSendQuestion && (
                  <div className="mt-3 rounded-xl border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#1F2937]">該当する回答が見つかりませんでした</p>
                    {submitted ? (
                      <p className="text-xs leading-relaxed text-[#15803D]">質問を送信しました。管理部が確認のうえ回答します（回答は今後同じ質問への自動回答として登録されます）。</p>
                    ) : (
                      <>
                        <textarea
                          value={questionText}
                          onChange={e => setQuestionText(e.target.value)}
                          placeholder="質問を自由に入力してください"
                          rows={3}
                          maxLength={1000}
                          className="w-full rounded-lg border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#2F5FD0]"
                        />
                        {submitError && <p className="mt-1 text-xs text-[#B91C1C]">{submitError}</p>}
                        <button
                          onClick={handleSubmitQuestion}
                          disabled={submitting || !questionText.trim()}
                          className="mt-2 w-full rounded-lg bg-[#2F5FD0] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#274CB0] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {submitting ? '送信中…' : '質問を送る'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
