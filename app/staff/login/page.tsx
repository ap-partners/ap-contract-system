'use client'

// ===== マイページ：従業員ログイン画面 =====
// 2026-07-17新設。社員番号＋パスワードでの持続ログインを基本とし、まだパスワード未設定
// （is_initial_login=true）の従業員、およびパスワードを忘れた従業員は、メール記載の
// 認証コードで本人確認したうえでパスワードを（再）設定する。
// docs/SYSTEM_DESIGN.md 過去のトーク履歴⑨確定仕様・2026-07-17伊藤さんデザイン指定に基づく。
import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, CircleAlert, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'

type Mode = 'password' | 'requestCode' | 'verifyCode' | 'setPassword'

const inputShellClass =
  'group relative flex h-[60px] items-center rounded-[18px] border border-[#E5EAF2] bg-white shadow-[0_1px_0_rgba(15,23,42,.02)] transition-all duration-200 focus-within:border-[#0E5BD8] focus-within:ring-2 focus-within:ring-[#0E5BD8]/18 focus-within:shadow-[0_12px_28px_rgba(14,91,216,.08)]'

const inputClass =
  'h-full w-full bg-transparent text-[16px] font-medium leading-none text-[#111827] outline-none placeholder:text-[#9AA6B8]'

const labelClass = 'mb-2 block text-[14px] font-semibold leading-5 text-[#1F2937]'

function AuthHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="mb-8 text-center">
      <p className="mb-3 text-[14px] font-semibold leading-5 tracking-[.08em] text-[#0E5BD8]">
        {eyebrow}
      </p>
      <h1 className="text-[32px] font-bold leading-[1.18] tracking-normal text-[#0F172A]">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-[320px] text-[16px] leading-7 text-[#64748B]">
        {description}
      </p>
    </div>
  )
}

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string
  label: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className={inputShellClass}>
        {icon && (
          <div className="pointer-events-none flex h-full w-14 shrink-0 items-center justify-center text-[#7C8BA1] transition-colors duration-200 group-focus-within:text-[#0E5BD8]">
            {icon}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null

  return (
    <div className="flex gap-3 rounded-2xl border border-[#F7C7C7] bg-[#FFF4F4] px-4 py-3.5 text-[#B42318]">
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="whitespace-pre-line text-[14px] font-medium leading-6">{message}</p>
    </div>
  )
}

function PrimaryButton({
  children,
  loading,
}: {
  children: ReactNode
  loading?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group mt-7 flex h-[60px] w-full items-center justify-center gap-2 rounded-[18px] bg-[#0E5BD8] px-5 text-[16px] font-bold text-white shadow-[0_14px_30px_rgba(14,91,216,.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0B52C6] hover:shadow-[0_20px_42px_rgba(14,91,216,.28)] active:translate-y-0 active:shadow-[0_8px_18px_rgba(14,91,216,.2)] disabled:cursor-not-allowed disabled:bg-[#9CB9E9] disabled:shadow-none"
    >
      <span>{children}</span>
      {!loading && (
        <ArrowRight
          className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-5 block rounded-full px-4 py-2 text-[14px] font-semibold text-[#526174] transition-colors duration-200 hover:bg-[#F5F7FB] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
    >
      {children}
    </button>
  )
}

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

  // ===== パスワードログイン =====
  const handlePasswordLogin = async (e: FormEvent) => {
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
  const handleRequestCode = async (e: FormEvent) => {
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
  const handleVerifyCode = async (e: FormEvent) => {
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
  const handleSetPassword = async (e: FormEvent) => {
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
    setAuthCode('')
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  const moveToRequestCodeMode = () => {
    setMode('requestCode')
    setError('')
    setErrorReason('')
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-10 text-[#0F172A] sm:px-8">
      <div className="pointer-events-none absolute left-[-180px] top-[-220px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,.28)_0%,rgba(191,219,254,.14)_42%,rgba(255,255,255,0)_70%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-240px] right-[-190px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(14,91,216,.16)_0%,rgba(147,197,253,.11)_44%,rgba(255,255,255,0)_72%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,255,.72)_0%,rgba(255,255,255,.92)_42%,rgba(248,251,255,.7)_100%)]" />

      <div className="relative w-full max-w-[420px] animate-[authCardIn_.55s_cubic-bezier(.2,.8,.2,1)_both]">
        <section className="rounded-[30px] border border-[#EEF2F7] bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,.08)] backdrop-blur sm:p-10">
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo.png"
              alt="APパートナーズ"
              width={176}
              height={64}
              priority
              className="h-auto w-[176px] object-contain"
            />
          </div>

          {mode === 'password' && (
            <>
              <AuthHeader
                eyebrow="従業員マイページ"
                title="ようこそ"
                description="社員番号とパスワードを入力してログインしてください。"
              />

              <form onSubmit={handlePasswordLogin} className="space-y-5 text-left">
                <Field
                  id="employeeNumber"
                  label="社員番号"
                  icon={<User className="h-5 w-5" aria-hidden="true" />}
                >
                  <input
                    id="employeeNumber"
                    type="text"
                    inputMode="numeric"
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    placeholder="100047"
                    required
                    className={`${inputClass} pr-5 ${employeeNumber ? '' : 'font-normal'}`}
                  />
                </Field>

                <Field
                  id="password"
                  label="パスワード"
                  icon={<Lock className="h-5 w-5" aria-hidden="true" />}
                >
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    required
                    className={`${inputClass} pr-14 ${password ? '' : 'font-normal'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#7C8BA1] transition-colors duration-200 hover:bg-[#F4F7FB] hover:text-[#0E5BD8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </Field>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={moveToRequestCodeMode}
                    className="rounded-full px-1 py-1 text-[14px] font-semibold text-[#0E5BD8] transition-colors duration-200 hover:text-[#0948AC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
                  >
                    パスワードをお忘れの場合
                  </button>
                </div>

                <ErrorMessage message={error} />

                <PrimaryButton loading={loading}>
                  {loading ? 'ログイン中...' : 'ログイン'}
                </PrimaryButton>
              </form>

              <button
                type="button"
                onClick={moveToRequestCodeMode}
                className="mt-6 flex w-full items-center justify-between rounded-3xl border border-[#E5EAF2] bg-[#F8FBFF] px-5 py-4 text-left shadow-[0_10px_28px_rgba(15,23,42,.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6E2F3] hover:bg-white hover:shadow-[0_18px_38px_rgba(15,23,42,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E5BD8]/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#0E5BD8] shadow-[0_8px_20px_rgba(14,91,216,.09)]">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold leading-5 text-[#64748B]">
                      初めてご利用の方
                    </span>
                    <span className="mt-0.5 block text-[16px] font-bold leading-6 text-[#0F172A]">
                      認証コードでログイン
                    </span>
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 text-[#0E5BD8]" aria-hidden="true" />
              </button>
            </>
          )}

          {mode === 'requestCode' && (
            <>
              <AuthHeader
                eyebrow="本人確認"
                title="認証コードを送信"
                description="社員番号を入力してください。登録メールアドレスへ認証コードをお送りします。"
              />

              <form onSubmit={handleRequestCode} className="space-y-5 text-left">
                <Field
                  id="requestEmployeeNumber"
                  label="社員番号"
                  icon={<User className="h-5 w-5" aria-hidden="true" />}
                >
                  <input
                    id="requestEmployeeNumber"
                    type="text"
                    inputMode="numeric"
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    placeholder="100047"
                    required
                    className={`${inputClass} pr-5 ${employeeNumber ? '' : 'font-normal'}`}
                  />
                </Field>

                <ErrorMessage message={error} />

                <PrimaryButton loading={loading}>
                  {loading ? '送信中...' : '認証コードを送信する'}
                </PrimaryButton>
                <GhostButton onClick={resetToPasswordMode}>ログイン画面に戻る</GhostButton>
              </form>
            </>
          )}

          {mode === 'verifyCode' && (
            <>
              <AuthHeader
                eyebrow="メール認証"
                title="認証コードの入力"
                description="メールに記載された6桁の認証コードを入力してください。"
              />

              <form onSubmit={handleVerifyCode} className="space-y-5 text-left">
                {codeSent && (
                  <div className="flex gap-3 rounded-2xl border border-[#BFE8D0] bg-[#F2FBF6] px-4 py-3.5 text-[#1E7A45]">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-[14px] font-medium leading-6">
                      認証コードをメールで送信しました。メールをご確認のうえ入力してください。
                    </p>
                  </div>
                )}

                <Field id="authCode" label="認証コード（半角数字6桁）">
                  <input
                    id="authCode"
                    type="text"
                    inputMode="numeric"
                    value={authCode}
                    onChange={e => setAuthCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="482913"
                    required
                    className="h-full w-full bg-transparent px-5 text-center text-[24px] font-bold leading-none tracking-[.36em] text-[#0F172A] outline-none placeholder:text-[#AAB5C4]"
                  />
                </Field>

                <ErrorMessage message={error} />

                {(errorReason === 'expired' || errorReason === 'locked') && (
                  <button
                    type="button"
                    onClick={e => handleRequestCode(e as unknown as FormEvent)}
                    disabled={loading}
                    className="flex h-[56px] w-full items-center justify-center rounded-[18px] border border-[#D7E4F7] bg-[#F6FAFF] text-[16px] font-bold text-[#0E5BD8] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(14,91,216,.1)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    認証コードを再送する
                  </button>
                )}

                <PrimaryButton loading={loading}>
                  {loading ? '確認中...' : '確認する'}
                </PrimaryButton>
                <GhostButton onClick={resetToPasswordMode}>ログイン画面に戻る</GhostButton>
              </form>
            </>
          )}

          {mode === 'setPassword' && (
            <>
              <AuthHeader
                eyebrow="パスワード設定"
                title="新しいパスワード"
                description="次回から使うパスワードを設定してください。"
              />

              <form onSubmit={handleSetPassword} className="space-y-5 text-left">
                <Field
                  id="newPassword"
                  label="新しいパスワード"
                  icon={<Lock className="h-5 w-5" aria-hidden="true" />}
                >
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="8文字以上・英大文字小文字数字を含む"
                    required
                    className={`${inputClass} pr-5 ${newPassword ? '' : 'font-normal'}`}
                  />
                </Field>

                <div className="rounded-2xl border border-[#E5EAF2] bg-[#F8FBFF] px-4 py-3.5">
                  <p className="text-[14px] font-semibold leading-6 text-[#334155]">
                    パスワード条件
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[#64748B]">
                    8文字以上で、半角英大文字・小文字・数字をすべて含めてください。
                  </p>
                </div>

                <Field
                  id="newPasswordConfirm"
                  label="確認のため再入力"
                  icon={<Lock className="h-5 w-5" aria-hidden="true" />}
                >
                  <input
                    id="newPasswordConfirm"
                    type="password"
                    value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                    placeholder="もう一度入力"
                    required
                    className={`${inputClass} pr-5 ${newPasswordConfirm ? '' : 'font-normal'}`}
                  />
                </Field>

                <ErrorMessage message={error} />

                <PrimaryButton loading={loading}>
                  {loading ? '設定中...' : '設定してマイページへ'}
                </PrimaryButton>
              </form>
            </>
          )}
        </section>

        <p className="mt-8 text-center text-[14px] leading-6 text-[#7C8BA1]">
          © 2026 株式会社APパートナーズ
        </p>
      </div>

      <style jsx global>{`
        @keyframes authCardIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  )
}
