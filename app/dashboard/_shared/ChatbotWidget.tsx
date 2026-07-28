'use client'

// ===== チャットボット（FAQ検索型・無料）共通ウィジェット =====
// 2026-07-28新設・2026-07-28 UI改善版。docs/chatbot_faq_design.md で確定した設計に基づく実装：
//   ・完全無料のキーワード一致検索（AI自然文生成は使わない）
//   ・ヘッダー右上固定のオレンジ色アイコン（伊藤さん作成の画像をそのまま使用）
//   ・該当する回答が見つからない場合は「質問を送る」から自由記述で送信でき、
//     管理部が回答すると自動的にFAQへ追加される学習型の仕組み
// 3ダッシュボード（担当営業・SSC・管理部）のヘッダーに <ChatbotWidget /> を1行追加するだけで
// 動くよう、必須propsなしの自己完結コンポーネントにしている。
//
// UI改善（伊藤さんとの相談・mcp__visualizeでのモックアップ確認を経て2026-07-28に合意した内容）：
//   ①カテゴリ選択が横スクロールで使いにくい → 8大カテゴリを2列カードグリッドに変更
//   ②回答文の改行が読みにくい → データ側（chatbot_faq_design.md / SQLシード）で句点ごとに
//     改行済み。ここではleading-7で行間も広げる
//   ③全体のUIがダサい・チャットらしい温度感がない → オレンジヘッダー・戻るはchevron-left・
//     質問一覧はフラットな行リスト＋chevron-right・回答はボットアバター＋吹き出し風グレー背景
//   ④エスカレーション導線が説明文で終わっていた → 「質問を送る」入力欄をパネル下部に常時表示、
//     エスカレーション注記がある回答には「この件で質問を送る」ボタンを追加
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  FaqEntry,
  FAQ_MAJOR_CATEGORIES,
  searchFaqEntries,
  filterFaqByMajorCategory,
  getRelatedEntries,
} from '@/lib/faq'

const ORANGE = '#F59E42'
const ORANGE_DARK = '#C2680F'

// 大カテゴリごとのアイコン（Tabler等の外部アイコンフォントは使わず、既存の手描きinline SVG方式に統一）
const CATEGORY_ICON_PATHS: Record<string, ReactNode> = {
  A: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  B: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  C: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>,
  D: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  E: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
  F: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  G: <><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></>,
  H: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
}

function CategoryIcon({ code, size = 20 }: { code: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CATEGORY_ICON_PATHS[code] || <circle cx="12" cy="12" r="9" />}
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function BotAvatar({ size = 32 }: { size?: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      <Image src="/icons/chatbot-icon.png" alt="" width={size} height={size} className="h-full w-full object-cover" />
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  )
}

// 表示中の状態：カテゴリ一覧／カテゴリ内一覧・検索結果一覧／回答詳細
type ViewMode = 'categories' | 'list' | 'detail'

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
  const questionInputRef = useRef<HTMLTextAreaElement>(null)

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
  const isSearching = query.trim().length > 0

  // 表示モードの判定：詳細＞検索中＞カテゴリ内一覧＞カテゴリ一覧、の優先順
  const viewMode: ViewMode = selectedEntry ? 'detail' : (isSearching || selectedMajor) ? 'list' : 'categories'

  const resetPanelState = () => {
    setSelectedEntry(null)
    setQuery('')
    setSelectedMajor(null)
    setQuestionText('')
    setSubmitted(false)
    setSubmitError('')
  }

  const handleBack = () => {
    if (selectedEntry) {
      setSelectedEntry(null)
      return
    }
    // 検索中／カテゴリ内一覧 → カテゴリ一覧へ
    setQuery('')
    setSelectedMajor(null)
  }

  const focusQuestionInput = (prefill?: string) => {
    if (prefill) setQuestionText(prefill)
    setSubmitted(false)
    setSubmitError('')
    requestAnimationFrame(() => questionInputRef.current?.focus())
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

  const headerTitle =
    viewMode === 'detail' ? (selectedEntry?.major_label || 'よくある質問')
    : viewMode === 'list' ? (isSearching ? '検索結果' : (FAQ_MAJOR_CATEGORIES.find(c => c.code === selectedMajor)?.label || 'よくある質問'))
    : 'よくある質問'

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
        <div className="absolute right-0 top-14 z-50 flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-2xl border border-[#E8EDF5] bg-white shadow-[0_20px_50px_rgba(15,23,42,.15)]">
          {/* ヘッダー（オレンジ帯） */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: ORANGE }}>
            {viewMode !== 'categories' && (
              <button onClick={handleBack} aria-label="戻る" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15">
                <ChevronLeft />
              </button>
            )}
            <div className="shrink-0 overflow-hidden rounded-full ring-2 ring-white/40" style={{ width: 26, height: 26 }}>
              <Image src="/icons/chatbot-icon.png" alt="" width={26} height={26} className="h-full w-full object-cover" />
            </div>
            <p className="flex-1 truncate text-sm font-semibold text-white">{headerTitle}</p>
            <button onClick={() => setOpen(false)} aria-label="閉じる" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15">✕</button>
          </div>

          {/* 本文（スクロール領域） */}
          <div className="flex-1 overflow-auto">
            {viewMode === 'detail' && selectedEntry && (
              <div className="p-4">
                <div className="flex gap-2.5">
                  <BotAvatar />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[#F3F4F6] px-3.5 py-3">
                    <p className="mb-2 text-sm font-bold text-[#1F2937]">{selectedEntry.question}</p>
                    <p className="whitespace-pre-line text-sm leading-7 text-[#1F2937]">{selectedEntry.answer}</p>
                  </div>
                </div>

                {selectedEntry.escalation_note && (
                  <div className="ml-[42px] mt-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3">
                    <p className="text-xs font-semibold text-[#92400E]">こんな場合は管理部にご相談ください</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#92400E]">{selectedEntry.escalation_note}</p>
                    <button
                      onClick={() => focusQuestionInput(`【${selectedEntry.question}】の件で、`)}
                      className="mt-2 text-xs font-semibold hover:underline"
                      style={{ color: ORANGE_DARK }}
                    >
                      この件で質問を送る →
                    </button>
                  </div>
                )}

                {getRelatedEntries(selectedEntry, entries).length > 0 && (
                  <div className="ml-[42px] mt-3">
                    <p className="mb-1.5 text-xs font-semibold text-[#6B7280]">関連する質問</p>
                    <div className="overflow-hidden rounded-xl border border-[#E8EDF5]">
                      {getRelatedEntries(selectedEntry, entries).map((rel, i) => (
                        <button
                          key={rel.id}
                          onClick={() => setSelectedEntry(rel)}
                          className={`flex w-full items-center justify-between gap-2 bg-white px-3 py-2.5 text-left text-xs font-medium text-[#1F2937] transition hover:bg-[#FFF7ED] ${i > 0 ? 'border-t border-[#E8EDF5]' : ''}`}
                        >
                          <span className="truncate">{rel.question}</span>
                          <span className="shrink-0 text-[#B0B7C3]"><ChevronRight /></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {viewMode !== 'detail' && (
              <>
                <div className="border-b border-[#E8EDF5] p-3">
                  <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelectedMajor(null) }}
                    placeholder="キーワードで検索（例：ログイン できない）"
                    className="w-full rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#F59E42]"
                  />
                </div>

                {loading && <p className="p-4 text-center text-xs text-[#6B7280]">読み込み中…</p>}
                {loadError && <p className="p-4 text-center text-xs text-[#B91C1C]">{loadError}</p>}

                {!loading && !loadError && viewMode === 'categories' && (
                  <div className="grid grid-cols-2 gap-2.5 p-3">
                    {FAQ_MAJOR_CATEGORIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setSelectedMajor(c.code)}
                        className="flex flex-col items-start gap-2 rounded-xl border border-[#E8EDF5] bg-white p-3 text-left transition hover:border-[#F59E42] hover:bg-[#FFF7ED]"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: '#FFF1E0', color: ORANGE_DARK }}>
                          <CategoryIcon code={c.code} />
                        </span>
                        <span className="text-xs font-semibold leading-snug text-[#1F2937]">{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!loading && !loadError && viewMode === 'list' && (
                  <div className="p-3">
                    {filtered.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-[#E8EDF5]">
                        {filtered.map((entry, i) => (
                          <button
                            key={entry.id}
                            onClick={() => setSelectedEntry(entry)}
                            className={`flex w-full items-center justify-between gap-2 bg-white px-3.5 py-3 text-left text-sm font-medium text-[#1F2937] transition hover:bg-[#FFF7ED] ${i > 0 ? 'border-t border-[#E8EDF5]' : ''}`}
                          >
                            <span className="truncate">{entry.question}</span>
                            <span className="shrink-0 text-[#B0B7C3]"><ChevronRight /></span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="p-3 text-center text-xs leading-relaxed text-[#6B7280]">
                        該当する回答が見つかりませんでした。
                        <br />
                        下の入力欄から質問を送ってください。
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* フッター（質問を送る欄。常時表示） */}
          <div className="border-t border-[#E8EDF5] bg-[#FAFAFA] p-3">
            {submitted ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#ECFDF5] px-3 py-2.5">
                <p className="text-xs leading-relaxed text-[#15803D]">質問を送信しました。管理部が確認のうえ回答します。</p>
                <button onClick={() => { setSubmitted(false); setQuestionText('') }} className="shrink-0 text-xs font-semibold text-[#15803D] hover:underline">続けて質問する</button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={questionInputRef}
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  placeholder="解決しない場合はこちらから質問を送れます"
                  rows={1}
                  maxLength={1000}
                  className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none focus:border-[#F59E42]"
                />
                <button
                  onClick={handleSubmitQuestion}
                  disabled={submitting || !questionText.trim()}
                  aria-label="質問を送る"
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: ORANGE }}
                >
                  <SendIcon />
                </button>
              </div>
            )}
            {submitError && <p className="mt-1.5 text-xs text-[#B91C1C]">{submitError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
