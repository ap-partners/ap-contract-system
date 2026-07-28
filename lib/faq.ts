// ===== チャットボット（FAQ検索型）共通の型・検索ロジック =====
// 2026-07-28新設。docs/chatbot_faq_design.md で確定した設計に基づく実装。
// 完全無料のキーワード一致検索（AIの自然文生成は使わない）。データ量が数十〜数百件程度の
// 想定のため、初回に全件取得してブラウザ側でフィルタする方式にしている（サーバー検索不要）。
//
// 【2026-07-28 品質監査後の改修】
// 旧実装は「入力文字列“全体”が、question+keywordsを連結した文字列にそのまま連続して
// 含まれるか」のみを見る単純な includes() 判定だった。これだと「パスワードを忘れました」
// のように利用者が自然文で入力した瞬間、登録済みキーワードと一字一句一致しない限り
// 0件になってしまう（表記ゆれ・活用形にも一切対応できない）ことが監査で判明した。
// 追加の有料AI APIを使わず、次の2段構えに変更している。
//   ①完全一致・部分文字列一致は従来通り最優先でヒットさせる（意図が明確なため）
//   ②それ以外は「クエリを2文字ずつの塊（バイグラム）に分解し、そのうちどれだけが
//     質問文・キーワードの側にも含まれているか」の重なり率でスコアリングするOR型検索。
//     形態素解析エンジンなしでも、言い回しの揺れにある程度強くなる（PostgreSQLの
//     pg_trgmと同じ考え方）。

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
    .replace(/[　\s、。！？!?]+/g, '') // 全角/半角スペース・句読点除去（句読点混じりの自然文にも強くする）
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角英数→半角
}

// クエリを2文字ずつの塊（バイグラム）に分解する。1文字しかない場合はその1文字自体を返す。
function toBigrams(s: string): string[] {
  if (s.length <= 1) return s ? [s] : []
  const grams: string[] = []
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2))
  return grams
}

// スコア付きの検索結果を返す内部関数。scoreが高いほど関連度が高い。
// 0.999以上＝完全な部分文字列一致（従来ロジックと同じ強い一致）
// それ未満＝バイグラム重なり率（0〜1）。閾値未満は候補から除外する。
//
// 【注意】major_labelは同じ大カテゴリの全件で共通の文言（例：A1〜A5は全て
// 「ログイン・パスワード・認証コード」）のため、これをバイグラム判定の主計算に
// 含めると「カテゴリ名に含まれる単語」だけで、本来関係のない同カテゴリ内の別項目まで
// まとめて高スコアになってしまう（実機検証で確認済み）。そのため、question・keywords
// （個々の項目固有の文言）を主信号、major_labelは大分類名で検索された場合だけ拾える
// ごく弱い副信号として重みを分離している。
const BIGRAM_MATCH_THRESHOLD = 0.34
const LABEL_SCORE_WEIGHT = 0.15 // major_label一致の寄与を弱く抑える重み

function scoreEntries(entries: FaqEntry[], rawQuery: string): { entry: FaqEntry; score: number }[] {
  const q = normalize(rawQuery)
  if (!q) return entries.map(entry => ({ entry, score: 1 }))

  const qGrams = toBigrams(q)

  return entries
    .map(entry => {
      const coreText = normalize(`${entry.question} ${entry.keywords}`)
      const labelText = normalize(entry.major_label)

      // ①question・keywords側への完全な部分文字列一致（意図が明確なので最優先）
      if (coreText.includes(q)) return { entry, score: 1 }

      if (qGrams.length === 0) return { entry, score: 0 }

      // ②question・keywords側のバイグラム重なり率（主信号）
      const coreGramSet = new Set(toBigrams(coreText))
      let coreHit = 0
      for (const g of qGrams) { if (coreGramSet.has(g)) coreHit++ }
      const coreRatio = coreHit / qGrams.length

      // ③major_label（大分類名）側の一致は弱い副信号として少しだけ加点する
      //   （例：「ログイン」とだけ打った場合にA1〜A5全体を拾えるようにするため）
      const labelGramSet = new Set(toBigrams(labelText))
      let labelHit = 0
      for (const g of qGrams) { if (labelGramSet.has(g)) labelHit++ }
      const labelRatio = labelHit / qGrams.length

      // 閾値判定・ベーススコアは必ずcoreRatio（項目固有の文言）を基準にする。
      // labelRatioはコアが一定以上一致している時だけ、順位の微調整として加点する。
      if (coreRatio < BIGRAM_MATCH_THRESHOLD) return { entry, score: 0 }
      const score = coreRatio * 0.85 + labelRatio * LABEL_SCORE_WEIGHT
      return { entry, score: Math.min(score, 0.95) }
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function searchFaqEntries(entries: FaqEntry[], rawQuery: string): FaqEntry[] {
  return scoreEntries(entries, rawQuery).map(r => r.entry)
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
