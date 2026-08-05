'use client'

// ===== 「FAQ管理」タブ（管理部ダッシュボード専用） =====
// 2026-07-28新設。docs/chatbot_faq_design.md の学習型フローに対応：
//   未回答の質問（faq_inquiries）を確認 → 回答すると自動的にfaq_entriesへ新規登録され、
//   以降チャットボットの検索で即座にヒットするようになる。
// 書き込み（faq_entries・faq_inquiries）はRLSで管理部ロールのみに制限済みのため、
// このタブはクライアントから直接Supabaseへ読み書きする（他の管理タブと違いAPIルートを
// 経由しない設計。書き込み対象がシンプルな2テーブルのみのため）。
import { useCallback, useEffect, useState } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { useToast } from '@/app/_shared/ui/ToastProvider'
import { useConfirm } from '@/app/_shared/ui/ConfirmDialog'
import { FaqEntry, FaqInquiry } from '@/lib/faq'
// 2026-08-05：日付表記統一によりローカル定義（スラッシュ表記）を廃止し共通ヘルパーへ移行
import { formatDateTimeJp as formatDateTime } from '@/lib/dateFormat'

const card = 'rounded-2xl border border-[#E8EDF5] bg-white'
const inputCls = 'w-full rounded-xl border border-[#E8EDF5] bg-white px-3 py-2 text-sm text-[#1F2937] focus:border-[#2F5FD0] focus:outline-none'
const primaryBtn = 'inline-flex items-center gap-2 rounded-2xl bg-[#2F5FD0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#274CB0] disabled:cursor-not-allowed disabled:opacity-60'
const secondaryBtn = 'inline-flex items-center gap-2 rounded-xl border border-[#E8EDF5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] transition hover:border-[#2F5FD0] hover:text-[#2F5FD0]'

// 2026-07-29：伊藤さんの指摘（回答者にカテゴリ・キーワード・エスカレーション条件まで
// その場で判断させるのは負担が大きく、誤ったカテゴリに割り振られるリスクもある）を受けて、
// その場で入力するのは「回答」の一文だけに簡略化。カテゴリ・検索キーワード・エスカレーション文言は
// 空欄のまま、いったん「未整理（精査待ち）」という暫定カテゴリで保存する。
// この未整理分は、週次のスケジュールタスクでClaudeが内容を精査し、適切なカテゴリ・言い回し・
// キーワードへまとめて整理する運用にしている（詳細はCLAUDE.md・docs/chatbot_faq_design.md参照）。
// 精査が済むまでの間も、questionとanswerの文言そのものはそのまま検索対象になるため、
// 検索できなくなる空白期間は発生しない。
const UNSORTED_CATEGORY_CODE = 'UNSORTED'
const UNSORTED_CATEGORY_LABEL = '未整理（精査待ち）'

function AnswerForm({ inquiry, onDone }: { inquiry: FaqInquiry; onDone: () => void }) {
  const { showError, showSuccess } = useToast()
  const [title, setTitle] = useState(inquiry.question_text)
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!answer.trim()) { showError('回答を入力してください。'); return }
    setSaving(true)
    const minorCode = `${UNSORTED_CATEGORY_CODE}-${Math.random().toString(36).slice(2, 8)}`

    const { data: authData } = await supabase.auth.getUser()

    const { data: newEntry, error: insertError } = await supabase
      .from('faq_entries')
      .insert([{
        major_category: UNSORTED_CATEGORY_CODE,
        major_label: UNSORTED_CATEGORY_LABEL,
        minor_category: minorCode,
        question: title.trim() || inquiry.question_text,
        keywords: '',
        answer: answer.trim(),
        related_labels: '',
        escalation_note: '',
        sort_order: 999,
        source: 'user_submitted',
      }])
      .select()
      .single()

    if (insertError || !newEntry) {
      showError('FAQへの登録に失敗しました: ' + (insertError?.message || ''))
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('faq_inquiries')
      .update({
        status: 'answered',
        answer_text: answer.trim(),
        answered_by: authData.user?.id,
        answered_by_email: authData.user?.email,
        answered_at: new Date().toISOString(),
        created_faq_id: newEntry.id,
      })
      .eq('id', inquiry.id)
      .eq('status', 'unanswered')

    if (updateError) {
      setSaving(false)
      showError('回答済みへの更新に失敗しました: ' + updateError.message)
      return
    }

    // 2026-07-29追加：質問した本人へ、回答内容をそのまま記載したメールを送信する
    // （伊藤さん指摘：回答してもFAQに追加されるだけでは質問者本人が気づけないため）。
    // メール送信に失敗しても、FAQ登録自体は既に完了しているため処理は止めず、
    // その旨だけ分かるようにトーストの文言を変える。
    let mailNotice = ''
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/faq/notify-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          toEmail: inquiry.submitted_by_email,
          questionText: title.trim() || inquiry.question_text,
          answerText: answer.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        mailNotice = '（質問者へのメール送信には失敗しました）'
      } else if (json?.reason === 'no_email') {
        mailNotice = '（質問者のメールアドレスが不明なため、メールは送信されていません）'
      }
    } catch {
      mailNotice = '（質問者へのメール送信には失敗しました）'
    }

    setSaving(false)
    showSuccess(`回答を登録し、FAQに追加しました。${mailNotice}`)
    onDone()
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[#E8EDF5] bg-[#F8FAFD] p-4">
      <p className="rounded-lg bg-[#EAF1FF] px-3 py-2 text-xs leading-relaxed text-[#274CB0]">
        カテゴリ分けや検索用の言い回しは、ここで考える必要はありません。
        回答だけ入力してください。あとでまとめて整理されます。
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">想定質問（一覧・検索に表示するタイトル）</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">回答</label>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={4} className={inputCls} placeholder="回答内容を入力してください" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className={secondaryBtn}>キャンセル</button>
        <button onClick={handleSave} disabled={saving} className={primaryBtn}>{saving ? '登録中…' : '回答してFAQに登録する'}</button>
      </div>
    </div>
  )
}

export default function FaqManagementTab() {
  const { showError, showSuccess } = useToast()
  const confirmDialog = useConfirm()
  const [inquiries, setInquiries] = useState<FaqInquiry[]>([])
  const [entries, setEntries] = useState<FaqEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [showAnswered, setShowAnswered] = useState(false)
  const [showEntries, setShowEntries] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editAnswerText, setEditAnswerText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: inquiryRows }, { data: entryRows }] = await Promise.all([
      supabase.from('faq_inquiries').select('*').order('submitted_at', { ascending: false }),
      supabase.from('faq_entries').select('*').order('major_category', { ascending: true }).order('sort_order', { ascending: true }),
    ])
    setInquiries((inquiryRows || []) as FaqInquiry[])
    setEntries((entryRows || []) as FaqEntry[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const unanswered = inquiries.filter(i => i.status === 'unanswered')
  const answered = inquiries.filter(i => i.status === 'answered')

  const handleDeleteEntry = async (entry: FaqEntry) => {
    const ok = await confirmDialog({
      title: 'FAQを削除しますか',
      message: `「${entry.question}」を削除します。この操作は取り消せません。`,
      tone: 'danger',
      confirmLabel: '削除する',
    })
    if (!ok) return
    const { error } = await supabase.from('faq_entries').delete().eq('id', entry.id)
    if (error) { showError('削除に失敗しました: ' + error.message); return }
    showSuccess('FAQを削除しました。')
    load()
  }

  const handleSaveEditedAnswer = async (entry: FaqEntry) => {
    const { error } = await supabase.from('faq_entries').update({ answer: editAnswerText, updated_at: new Date().toISOString() }).eq('id', entry.id)
    if (error) { showError('更新に失敗しました: ' + error.message); return }
    showSuccess('回答を更新しました。')
    setEditingEntryId(null)
    load()
  }

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 md:p-8`}>
        <p className="text-sm font-semibold text-[#1F2937]">未回答の質問（{unanswered.length}件）</p>
        <p className="mt-1 text-xs text-[#6B7280]">チャットボットで該当する回答が見つからず「質問を送る」から届いた質問です。回答するとFAQへ自動追加され、以降同じ質問に自動で回答できるようになります。</p>

        {loading && <p className="mt-4 text-sm text-[#6B7280]">読み込み中…</p>}

        {!loading && unanswered.length === 0 && (
          <p className="mt-4 rounded-xl border border-[#E8EDF5] bg-[#F8FAFD] p-4 text-sm text-[#6B7280]">現在、未回答の質問はありません。</p>
        )}

        <div className="mt-4 space-y-3">
          {unanswered.map(inquiry => (
            <div key={inquiry.id} className="rounded-xl border border-[#E8EDF5] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">{inquiry.question_text}</p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {inquiry.submitted_by_role || '―'}・{inquiry.submitted_by_email || '―'}・{formatDateTime(inquiry.submitted_at)}
                  </p>
                </div>
                {answeringId !== inquiry.id && (
                  <button onClick={() => setAnsweringId(inquiry.id)} className={secondaryBtn}>回答する</button>
                )}
              </div>
              {answeringId === inquiry.id && (
                <AnswerForm inquiry={inquiry} onDone={() => { setAnsweringId(null); load() }} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} p-6 md:p-8`}>
        <button onClick={() => setShowAnswered(!showAnswered)} className={secondaryBtn}>
          {showAnswered ? '回答済みの質問を隠す' : `回答済みの質問を表示（${answered.length}件）`}
        </button>
        {showAnswered && (
          <div className="mt-4 space-y-3">
            {answered.length === 0 && <p className="text-sm text-[#6B7280]">回答済みの質問はまだありません。</p>}
            {answered.map(inquiry => (
              <div key={inquiry.id} className="rounded-xl border border-[#E8EDF5] p-4">
                <p className="text-sm font-semibold text-[#1F2937]">{inquiry.question_text}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{formatDateTime(inquiry.submitted_at)}に受信・{formatDateTime(inquiry.answered_at)}に回答（{inquiry.answered_by_email || '―'}）</p>
                <p className="mt-2 whitespace-pre-line text-sm text-[#1F2937]">{inquiry.answer_text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${card} p-6 md:p-8`}>
        <button onClick={() => setShowEntries(!showEntries)} className={secondaryBtn}>
          {showEntries ? '登録済みFAQ一覧を隠す' : `登録済みFAQ一覧を表示（${entries.length}件）`}
        </button>
        {showEntries && (
          <div className="mt-4 space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="rounded-xl border border-[#E8EDF5] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#6B7280]">{entry.major_label}</p>
                    <p className="text-sm font-semibold text-[#1F2937]">{entry.question}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => { setEditingEntryId(editingEntryId === entry.id ? null : entry.id); setEditAnswerText(entry.answer) }}
                      className={secondaryBtn}
                    >
                      {editingEntryId === entry.id ? 'キャンセル' : '回答を編集'}
                    </button>
                    <button onClick={() => handleDeleteEntry(entry)} className="text-xs font-semibold text-[#B91C1C] hover:underline">削除</button>
                  </div>
                </div>
                {editingEntryId === entry.id ? (
                  <div className="mt-3">
                    <textarea value={editAnswerText} onChange={e => setEditAnswerText(e.target.value)} rows={3} className={inputCls} />
                    <button onClick={() => handleSaveEditedAnswer(entry)} className={`${primaryBtn} mt-2`}>保存する</button>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-line text-sm text-[#1F2937]">{entry.answer}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
