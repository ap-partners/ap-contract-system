'use client'

// ===== ヘッダー用：新規発行ボタン統合メニュー ===== // 2026-07-24新設
// SSC・管理部・担当営業の3ダッシュボードのヘッダーにあった「雇用契約書 新規発行」
// 「アルバイト誓約書 新規発行」の2ボタンを、「＋ 新規発行」1ボタン＋選択メニューに統合
// （伊藤さん指摘：ヘッダーに表示項目が増え手狭になったため。モックアップで開閉動作を
// 確認の上、承認済み）。雇用契約書を上に固定表示し、使用頻度の差はメニュー内の並び順で
// カバーする（A案：シンプルな単一ボタン方式を伊藤さんが選択）。
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MENU_ITEMS = [
  {
    label: '雇用契約書・就業条件明示書',
    description: '社員向けの契約書を発行',
    href: '/apply',
    iconBg: '#E6F1FB',
    iconColor: '#185FA5',
  },
  {
    label: 'アルバイト誓約書',
    description: 'アルバイト向けの誓約書を発行',
    href: '/pledge/apply',
    iconBg: '#FFF3E8',
    iconColor: '#B45309',
  },
] as const

export default function NewDocumentMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl bg-[#2F5FD0] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,.22)] transition hover:-translate-y-0.5 hover:bg-[#244CB3] hover:shadow-[0_15px_34px_rgba(47,95,208,.26)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        新規発行
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[56px] z-20 w-[280px] overflow-hidden rounded-2xl border border-[#E8EDF5] bg-white shadow-[0_12px_32px_rgba(15,23,42,.14)]">
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.href}
              onClick={() => { setOpen(false); router.push(item.href) }}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#F8FAFD] ${i < MENU_ITEMS.length - 1 ? 'border-b border-[#F1F4F9]' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: item.iconBg, color: item.iconColor }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M9 15h6" />
                  <path d="M9 11h2" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block break-words text-[13px] font-semibold text-[#1F2937]">{item.label}</span>
                <span className="block break-words text-[11px] font-medium text-[#6B7280]">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
