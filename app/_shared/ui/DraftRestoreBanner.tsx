'use client'

// ===== 申請ウィザードの下書き復元バナー（M-04対応・2026-08-18新設） =====
// useWizardDraftGuardと組み合わせて使う。何の下書きか（いつ・誰向けか）を具体的に示し、
// 「続きから再開」「破棄して新規作成」のどちらかを選んでもらう。ブロッキングな確認ダイアログには
// せず、情報提示として画面上部に置くだけの控えめなバナーにする（単なる情報提示であり、
// 強制的な二択を迫る必要はないため）。

function formatElapsed(savedAt: string): string {
  const ms = Date.now() - new Date(savedAt).getTime()
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins}分前`
  const hours = Math.round(mins / 60)
  return `${hours}時間前`
}

interface DraftRestoreBannerProps {
  savedAt: string
  staffName: string | null
  onRestore: () => void
  onDiscard: () => void
}

export default function DraftRestoreBanner({ savedAt, staffName, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <div className="rounded-lg px-4 py-3 border mb-4 flex items-center justify-between gap-3 flex-wrap"
      style={{ background: '#EEF2FA', borderColor: '#D0DAF0' }}>
      <p className="text-sm leading-relaxed" style={{ color: '#1A2340' }}>
        ℹ️ {formatElapsed(savedAt)}に入力していた{staffName ? `「${staffName} 様」向けの` : ''}申請の下書きがあります。
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onDiscard}
          className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all"
          style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
          破棄して新規作成
        </button>
        <button onClick={onRestore}
          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-all"
          style={{ background: '#1B3A8C' }}>
          続きから再開
        </button>
      </div>
    </div>
  )
}
