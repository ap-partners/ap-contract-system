'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }
    const role = data.user?.user_metadata?.role
    if (role === '管理部') router.push('/dashboard/admin')
    else if (role === 'SSC') router.push('/dashboard/ssc')
    else if (role === '担当営業') router.push('/dashboard/sales')
    else {
      // 総合レビュー指摘23対応：以前はロール未設定でも/dashboard/salesへ送っていたが、
      // sales側のロールチェックで即座に/loginへ押し戻され、エラーメッセージも出ないまま
      // ログイン画面に無言で戻されるだけになっていた。ロールが判定できない場合はここで
      // 止めて、原因が分かるメッセージを表示する。
      await supabase.auth.signOut()
      setError('アカウントに権限が設定されていません。管理部にご連絡ください。')
      setLoading(false)
      return
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F5F7FC' }}>

      {/* 左パネル：ログインフォーム */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">

          {/* モバイル用ロゴ */}
          <div className="lg:hidden flex justify-center mb-8">
            <Image src="/logo.png" alt="APパートナーズ" width={140} height={82} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#1A2340' }}>ログイン</h2>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>メールアドレスとパスワードを入力してください</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A2340' }}>
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
                placeholder="example@appart.co.jp"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A2340' }}>
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: '#D0DAF0', background: '#FFFFFF', color: '#1A2340' }}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-2"
              style={{ background: loading ? '#A8C0E8' : '#1B3A8C' }}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          <p className="text-xs text-center mt-8" style={{ color: '#5A6A8A' }}>
            © 2026 株式会社APパートナーズ
          </p>
        </div>
      </div>

      {/* 右パネル：ブランド */}
      <div className="hidden lg:flex flex-col justify-center items-center w-2/5 px-12 py-10"
        style={{ background: '#1B3A8C' }}>
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <div className="rounded-2xl p-4" style={{ background: 'white' }}>
              <Image src="/logo.png" alt="APパートナーズ" width={160} height={94} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white leading-snug mb-4">
            契約書管理システム
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: '#A8C0E8' }}>
            雇用契約書・就業条件明示書の<br />
            発行・電子署名・保管をオンラインで。
          </p>
        </div>
      </div>

    </div>
  )
}