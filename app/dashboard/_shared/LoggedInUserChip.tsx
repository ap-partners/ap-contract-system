'use client'

// ===== ヘッダー用：ログイン中ユーザーの識別チップ ===== // 2026-07-24新設
// SSC・管理部・担当営業の3ダッシュボードのヘッダーに共通で埋め込む。
// アバターは頭文字ではなく汎用の人物アイコン（伊藤さん指定・2026-07-24）。
import { useLoggedInUser } from './useLoggedInUser'

export default function LoggedInUserChip({ userId }: { userId: string | undefined | null }) {
  const { name, departmentLabel, loading } = useLoggedInUser(userId)

  if (loading || (!name && !departmentLabel)) return null

  return (
    <div
      className="flex items-center gap-2.5 shrink-0 rounded-2xl border border-[#E8EDF5] bg-[#F8FAFD] pl-1.5 pr-3.5"
      style={{ height: 48 }}
    >
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#E6F1FB] text-[#185FA5]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div className="leading-tight">
        {departmentLabel && <p className="text-[11px] font-medium text-[#6B7280]">{departmentLabel}</p>}
        <p className="whitespace-nowrap text-[13px] font-semibold text-[#1F2937]">{name || 'ゲスト'} さん</p>
      </div>
    </div>
  )
}
