'use client'

// ===== インライン警告バナー（必須項目未入力などのSTEPバリデーション用） =====
// 2026-07-22新設。CLAUDE.md/SYSTEM_DESIGN.md「ブラウザネイティブalert/confirmの全体置き換え」タスクの
// 土台部分。従来alert('対象スタッフと帳票種別を選択してください')のようにポップアップで表示していた
// STEPの必須項目チェックを、「次へ進む」ボタンの近くに表示する画面内バナーに置き換えるための共通コンポーネント。
// 配色は既存のsubmitError表示（/apply, /pledge/apply, /sign/[id]）やErrorBanner（MasterManagementTab.tsx）と統一。
//
// 使い方：
//   const [validationError, setValidationError] = useState<string | null>(null)
//   ...
//   <ValidationBanner message={validationError} />
//   <button onClick={() => { if (!valid) { setValidationError('...'); return }; setValidationError(null); next() }}>次へ進む →</button>

export default function ValidationBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-line"
      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
      role="alert"
    >
      {message}
    </div>
  )
}
