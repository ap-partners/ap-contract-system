'use client'

// ===== 確認モーダル（はい/いいえの判断が必要な操作） =====
// 2026-07-22新設。CLAUDE.md/SYSTEM_DESIGN.md「ブラウザネイティブalert/confirmの全体置き換え」タスクの
// 土台部分。従来window.confirm()で表示していた「ログアウトしますか？」「削除しますか？」等を、
// アプリのデザインに合わせたモーダルに置き換えるための共通コンポーネント。
//
// 使い方（既存のif (!confirm(...)) return パターンからの置き換えを最小限にするため、Promise<boolean>を返す設計）：
//   const confirmDialog = useConfirm()
//   const ok = await confirmDialog('ログアウトしますか？')
//   if (!ok) return
//
//   // タイトルや危険操作の色分けが必要な場合：
//   const ok = await confirmDialog({ title: '削除の確認', message: '元に戻せません。削除しますか？', tone: 'danger', confirmLabel: '削除する' })
//
// ProviderでラップされていないページからuseConfirm()を呼んだ場合は、開発中の呼び出し忘れに気づけるよう
// window.confirm()にフォールバックする。

import { createContext, useCallback, useContext, useState } from 'react'

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    return async (options: ConfirmOptions | string) => {
      const message = typeof options === 'string' ? options : options.message
      if (typeof window === 'undefined') return false
      return window.confirm(message)
    }
  }
  return ctx
}

type PendingState = { options: ConfirmOptions; resolve: (v: boolean) => void } | null

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState>(null)

  const confirmFn = useCallback<ConfirmFn>((options: ConfirmOptions | string) => {
    const normalized: ConfirmOptions = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setPending({ options: normalized, resolve })
    })
  }, [])

  const handle = (result: boolean) => {
    pending?.resolve(result)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.4)', animation: 'confirm-overlay-in 0.15s ease-out' }}
          onClick={() => handle(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6"
            style={{ animation: 'confirm-card-in 0.15s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            {pending.options.title && (
              <p className="text-base font-bold mb-2" style={{ color: '#1A2340' }}>{pending.options.title}</p>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#374151' }}>{pending.options.message}</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => handle(false)}
                className="text-sm px-4 py-2 rounded-lg border font-medium transition-colors"
                style={{ color: '#5A6A8A', borderColor: '#D0DAF0', background: 'white' }}>
                {pending.options.cancelLabel || 'キャンセル'}
              </button>
              <button onClick={() => handle(true)}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-colors"
                style={{ background: pending.options.tone === 'danger' ? '#DC2626' : '#1B3A8C' }}>
                {pending.options.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
