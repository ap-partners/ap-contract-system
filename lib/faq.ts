// ===== チャットボット（FAQ検索型）共通の型・検索ロジック =====
// 2026-07-28新設。docs/chatbot_faq_design.md で確定した設計に基づく実装。
// 完全無料のキーワード一致検索（AIの自然文生成は使わない）。データ量が数十〜数百件程度の
// 想定のため、初回に全件取得してブラウザ側でフィルタする方式にしている（サーバー検索不要）。

export type FaqEntry = {
  id: string
  major_category: string
  major_label: string
  minor_category: string
  question: string
  keywords: string
  answer: string
  related_labels: string
  escalation_note: string
  sort_order: number
  source: 'initial' | 'user_submitted'
  created_at: string
  updated_at: string
}

export type FaqInquiry = {
  id: string
  question_text: string
  submitted_by: string
  submitted_by_email: string | null
  submitted_by_role: string | null
  submitted_at: string
  status: 'unanswered' | 'answered'
  answer_text: string | null
  answered_by: string | null
  answered_by_email: string | null
  answered_at: string | null
  created_faq_id: string | null
}

// 大カテゴリの表示順・ラベル（faq_entries.major_categoryのコードと対応）
export const FAQ_MAJOR_CATEGORIES: { code: string; label: string }[] = [
  { code: 'A', label: 'ログイン・パスワード・認証コード' },
  { code: 'B', label: 'メールが届かない' },
  { code: 'C', label: '申請の作り方' },
  { code: 'D', label: '申請後の状況確認' },
  { code: 'E', label: '承認・差し戻し業務' },
  { code: 'F', label: '管理部専用機能' },
  { code: 'G', label: '署名・確認（従業員）' },
  { code: 'H', label: '制度・ルール・その他' },
]

// 全角・半角/大文字小文字のゆらぎを吸収したうえで、questionとkeywordsの両方に対して
// 部分一致するかどうかを見る簡易な検索（形態素解析等は行わない、素朴なキーワード一致）。
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[　\s]+/g, '') // 全角/半角スペース除去
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角英数→半角
}

export function searchFaqEntries(entries: FaqEntry[], rawQuery: string): FaqEntry[] {
  const q = normalize(rawQuery)
  if (!q) return entries
  return entries.filter(e => {
    const haystack = normalize(`${e.question} ${e.keywords} ${e.major_label}`)
    return haystack.includes(q)
  })
}

export function filterFaqByMajorCategory(entries: FaqEntry[], majorCode: string | null): FaqEntry[] {
  if (!majorCode) return entries
  return entries.filter(e => e.major_category === majorCode)
}

// related_labels（例："A2,A3"）から実体のFaqEntryを引く
export function getRelatedEntries(entry: FaqEntry, all: FaqEntry[]): FaqEntry[] {
  const codes = entry.related_labels.split(',').map(s => s.trim()).filter(Boolean)
  if (codes.length === 0) return []
  return codes
    .map(code => all.find(e => e.minor_category === code))
    .filter((e): e is FaqEntry => !!e)
}
