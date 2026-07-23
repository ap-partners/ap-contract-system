'use client'

// ===== マイページ：従業員ログイン画面 =====
// 2026-07-17新設。社員番号＋パスワードでの持続ログインを基本とし、まだパスワード未設定
// （is_initial_login=true）の従業員、およびパスワードを忘れた従業員は、メール記載の
// 認証コードで本人確認したうえでパスワードを（再）設定する。
// docs/SYSTEM_DESIGN.md 過去のトーク履歴⑨確定仕様・2026-07-17伊藤さんデザイン指定に基づく。
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Mode = 'password' | 'requestCode' | 'verifyCode' | 'setPassword'

export default function StaffLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('password')

  const [employeeNumber, setEmployeeNumber] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [resetToken, setResetToken] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorReason, setErrorReason] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [fromEmailLink, setFromEmailLink] = useState(false)

  // 2026-07-23：認証コード付きメールの「マイページを開く」リンクに社員番号（?emp=）が
  // 付与されるようにした（lib/mail.ts sendStaffLoginCodeMail）。従業員は既にメールで
  // コードを受け取っている状態でここに来るため、「認証コードを送信する」ボタンを経由させず
  // 直接コード入力画面へ進める。これにより、承認直後の再発行クールダウン（3分）と
  // 衝突して詰まっていた問題を回避する。認証コード自体は依然として必須のため、
  // 社員番号だけがURLに含まれていてもログインは完了しない。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const emp = params.get('emp')
    if (emp) {
      setEmployeeNumber(emp)
      setFromEmailLink(true)
      setMode('verifyCode')
    }
  }, [])

  // ===== パスワードログイン =====
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorReason('')
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'ログインできませんでした。')
        setErrorReason(data.reason || '')
        return
      }
      router.push('/staff/mypage')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  // ===== 認証コードの送信（初回ログイン／パスワードをお忘れの場合、共通） =====
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeNumber.trim()) {
      setError('社員番号を入力してください。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/staff/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '認証コードの送信に失敗しました。')
        return
      }
      setCodeSent(true)
      setMode('verifyCode')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  // ===== 認証コードの照合 =====
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorReason('')
    try {
      const res = await fetch('/api/staff/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim(), authCode: authCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '確認できませんでした。')
        setErrorReason(data.reason || 'invalid')
        return
      }
      setResetToken(data.resetToken)
      setMode('setPassword')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  // ===== 新しいパスワードの設定 =====
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const hasUpper = /[A-Z]/.test(newPassword)
    const hasLower = /[a-z]/.test(newPassword)
    const hasDigit = /[0-9]/.test(newPassword)
    if (newPassword.length < 8 || !hasUpper || !hasLower || !hasDigit) {
      setError('パスワードは8文字以上で、半角英大文字・小文字・数字をすべて含めてください。')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setError('パスワードが一致しません。もう一度ご確認ください。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/staff/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNumber: employeeNumber.trim(), resetToken, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'パスワードの設定に失敗しました。')
        return
      }
      router.push('/staff/mypage')
    } catch {
      setError('通信エラーが発生しました。電波状況をご確認のうえ、もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const resetToPasswordMode = () => {
    setMode('password')
    setError('')
    setErrorReason('')
    setCodeSent(false)
    setFromEmailLink(false)
    setAuthCode('')
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  return (
    <div className="min-h-screen flex justify-center items-center px-4 py-10" style={{ background: '#F5F7FC' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 16px rgba(26,35,64,0.08)' }}>
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="flex justify-center mb-4">
              <Image src="/logo.png" alt="APパートナーズ" width={72} height={72} />
            </div>

            {mode === 'password' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>ようこそ</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  社員番号とパスワードを入力して
                  <br />
                  ログインしてください
                </p>
              </>
            )}
            {mode === 'requestCode' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>本人確認</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  社員番号を入力してください。
                  <br />
                  認証コードをメールでお送りします。
                </p>
              </>
            )}
            {mode === 'verifyCode' && (
              <>
                <h1 className="text-lg font-bold mb-1.5" style={{ color: '#1A2340' }}>認証コードの入力</h1>
                <p className="text-xs leading-relaxed mb-7" style={{ color: '#5A6A8A' }}>
                  メールに記載の6桁の認証コードを
                  <br />
                  入力してください
                </p>
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
              </>
            )}

            {mode === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>社員番号</label>
                  <div className="relative">
                    {/* 2026-07-22：絵文字（👤）は端末・OSによって色が固定され明るさを調整できないため、
                        色指定可能な線画SVGアイコンに置き換え（伊藤さん確認・案B＝#7FA3E8で確定）。
                        パスワード欄の鍵アイコンと同じ色・線幅で統一している。 */}
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7FA3E8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                    </svg>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={employeeNumber}
                      onChange={e => setEmployeeNumber(e.target.value)}
                      placeholder="100047"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>パスワード</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7FA3E8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="パスワード"
                      required
                      className="w-full pl-10 pr-10 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 transition-all"
                      style={{ borderColor: '#D0DAF0', color: '#1A2340' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                      style={{ color: '#8A94AA' }}
                    >
                      {showPassword ? '隠す' : '表示'}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode('requestCode'); setError('') }}
                    className="text-xs font-medium"
                    style={{ color: '#1B3A8C' }}
                  >
                    パスワードをお忘れの場合
                  </button>
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
                  {loading ? 'ログイン中...' : 'ログイン'}
                </button>
              </form>
            )}

            {mode === 'requestCode' && (
              <form onSubmit={handleRequestCode} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#1A2340' }}>社員番号</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    placeholder="100047"
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
                  {loading ? '送信中...' : '認証コードを送信する'}
                </button>
                <button type="button" onClick={resetToPasswordMode} className="w-full text-xs font-medium" style={{ color: '#5A6A8A' }}>
                  ログイン画面に戻る
                </button>
              </form>
            )}

            {mode === 'verifyCode' && (
              <form onSubmit={handleVerifyCode} className="space-y-4 text-left">
                {fromEmailLink && !codeSent && (
                  <div className="rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC' }}>
                    メールに記載の認証コードを入力してください。
                  </div>
                )}
                {codeSent && (
                  <div className="rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC' }}>
                    認証コードをメールで送信しました。
                    <br />
                    メールをご確認のうえ入力してください。
                  </div>
                )}
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

                {(errorReason === 'expired' || errorReason === 'locked') && (
                  <button
                    type="button"
                    onClick={handleRequestCode}
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: '#EEF2FC', color: '#1B3A8C', border: '1px solid #D0DAF0' }}
                  >
                    認証コードを再送する
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: loading ? '#A8C0E8' : '#1B3A8C' }}
                >
                  {loading ? '確認中...' : '確認する'}
                </button>
                <button type="button" onClick={resetToPasswordMode} className="w-full text-xs font-medium" style={{ color: '#5A6A8A' }}>
                  ログイン画面に戻る
                </button>
              </form>
            )}

            {mode === 'setPassword' && (
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
                  {loading ? '設定中...' : '設定してマイページへ'}
                </button>
              </form>
            )}
          </div>

          {mode === 'password' && (
            <div className="px-8 py-4 text-center" style={{ background: '#EEF2FA', borderTop: '1px solid #D0DAF0' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#5A6A8A' }}>
                初めてご利用の方は
                <br />
                <button
                  type="button"
                  onClick={() => { setMode('requestCode'); setError('') }}
                  className="font-semibold"
                  style={{ color: '#1B3A8C' }}
                >
                  認証コードでログイン
                </button>
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#5A6A8A' }}>
          © 2026 株式会社APパートナーズ
        </p>
      </div>
    </div>
  )
}
