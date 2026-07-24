'use client'

// ===== アカウント初回設定／パスワード再設定画面 =====
// 2026-07-24新設。管理部ダッシュボード「アカウント管理」から新規発行された担当営業・SSC・
// 管理部アカウント、および既存アカウントのパスワード再設定で使う。メール記載の認証コードを
// 入力後、次回から使うパスワードを設定するとログイン画面へ進める。
// app/staff/login/page.tsxの認証コード方式と同じ考え方（メールに?email=を付けて
// メールアドレス入力の手間を省く）を踏襲。
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Mode = 'verifyCode' | 'setPassword' | 'done'

export default function AccountSetupPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('verifyCode')
  const [email, setEmail] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const e = params.get('email')
    if (e) setEmail(e)
  }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/account-setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: authCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || '確認できませんでした。'); return }
      setMode('setPassword')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== newPasswordConfirm) {
      setError('パスワードが一致しません。もう一度ご確認ください。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/account-setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: authCode.trim(), newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'パスワードの設定に失敗しました。'); return }
      setMode('done')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex justify-center items-center px-4 py-10" style={{ background: '#F5F7FC' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 16px rgba(26,35,64,0.08)' }}>
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="flex justify-center mb-4">
              <Image src="/logo.png" alt="APパートナーズ" width={72} height={72} />
            </div>

            {mode === 'verifyCode' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>認証コードの入力</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  メールに記載の6桁の認証コードを
                  <br />
                  入力してください
                </p>
                <form onSubmit={handleVerify} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>メールアドレス</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="example@appart.co.jp"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>認証コード（半角数字6桁）</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={authCode}
                      onChange={e => setAuthCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      placeholder="482913"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border text-center tracking-widest font-semibold focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg px-4 py-3 text-xs leading-relaxed whitespace-pre-line" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: loading ? '#A8C0E8' : '#1B3A8C' }}
                  >
                    {loading ? '確認中...' : '確認する'}
                  </button>
                </form>
              </>
            )}

            {mode === 'setPassword' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>パスワードの設定</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  次回から使うパスワードを
                  <br />
                  設定してください
                </p>
                <form onSubmit={handleSetPassword} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>新しいパスワード</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="8文字以上・英大文字小文字数字を含む"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: '#5A6A8A' }}>
                      8文字以上で、半角英大文字・小文字・数字を
                      <br />
                      すべて含めてください。
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>確認のため再入力</label>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={e => setNewPasswordConfirm(e.target.value)}
                      placeholder="もう一度入力"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg px-4 py-3 text-xs leading-relaxed whitespace-pre-line" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: loading ? '#A8C0E8' : '#1B3A8C' }}
                  >
                    {loading ? '設定中...' : '設定する'}
                  </button>
                </form>
              </>
            )}

            {mode === 'done' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>設定が完了しました</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  新しいパスワードでログインしてください。
                </p>
                <button
                  onClick={() => router.push('/login')}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: '#1B3A8C' }}
                >
                  ログイン画面へ
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#5A6A8A' }}>
          © 2026 株式会社APパートナーズ
        </p>
      </div>
    </div>
  )
}
