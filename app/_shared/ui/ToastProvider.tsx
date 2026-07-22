'use client'

// ===== トースト通知（非同期処理失敗時などの一時的な通知） =====
// 2026-07-22新設。CLAUDE.md/SYSTEM_DESIGN.md「ブラウザネイティブalert/confirmの全体置き換え」タスクの
// 土台部分。従来alert()で表示していた「一括承認に失敗しました」等の非ブロッキングな通知を、
// 画面右上に一時表示するトーストに置き換えるための共通コンポーネント。
//
// 使い方：
//   const { showError, showSuccess } = useToast()
//   showError('一括承認に失敗しました: ' + error.message)
//
// ProviderでラップされていないページからuseToast()を呼んだ場合は、開発中の呼び出し忘れに気づけるよう
// window.alert()にフォールバックする（無言で握りつぶさない）。

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastType = 'error' | 'success'
type ToastItem = { id: number; type: ToastType; message: string }

type ToastContextValue = {
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      showError: (m: string) => { if (typeof window !== 'undefined') window.alert(m) },
      showSuccess: (m: string) => { if (typeof window !== 'undefined') window.alert(m) },
    }
  }
  return ctx
}

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
  }, [])

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, type, message }])
    timers.current[id] = setTimeout(() => remove(id), 6000)
  }, [remove])

  const showError = useCallback((message: string) => push('error', message), [push])
  const showSuccess = useCallback((message: string) => push('success', message), [push])

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none" style={{ maxWidth: 'calc(100vw - 32px)' }}>
        {toasts.map(t => (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg w-full text-sm leading-relaxed"
            style={{
              maxWidth: '380px',
              animation: 'toast-in 0.2s ease-out',
              ...(t.type === 'error'
                ? { background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }
                : { background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }),
            }}>
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
            <button onClick={() => remove(t.id)} className="shrink-0 text-xs font-bold opacity-60 hover:opacity-100" aria-label="閉じる">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
