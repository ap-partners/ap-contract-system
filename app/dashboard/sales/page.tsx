'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function SalesDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push('/login'); return }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業') { router.push('/login'); return }
      setUser(data.user)
    }
    checkUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return <div className="p-8">読み込み中...</div>

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FC' }}>
      <header className="bg-white border-b" style={{ borderColor: '#D0DAF0' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="APパートナーズ" width={60} height={35} />
            <div className="border-l pl-3" style={{ borderColor: '#D0DAF0' }}>
              <p className="text-sm font-bold" style={{ color: '#1A2340' }}>契約書管理システム</p>
              <p className="text-xs" style={{ color: '#5A6A8A' }}>担当営業ダッシュボード</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-sm px-4 py-2 rounded-lg border transition-all"
            style={{ color: '#5A6A8A', borderColor: '#D0DAF0' }}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>申請中</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#1B3A8C' }}>0</p>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>差し戻し</p>
            <p className="text-3xl font-bold mt-2 text-red-500">0</p>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>署名待ち</p>
            <p className="text-3xl font-bold mt-2 text-yellow-500">0</p>
          </div>
        </div>
        <div className="mb-8">
          <button onClick={() => router.push('/apply')}
            className="text-white px-6 py-3 rounded-lg font-medium transition-all"
            style={{ background: '#1B3A8C' }}>
            ＋ 新規発行申請
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>進行中の書類</h2>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>現在、進行中の書類はありません。</p>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>差し戻し対応が必要</h2>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>現在、差し戻しはありません。</p>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>管理部への依頼</h2>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>現在、依頼はありません。</p>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#D0DAF0' }}>
            <h2 className="text-base font-bold mb-4" style={{ color: '#1A2340' }}>更新回答が必要</h2>
            <p className="text-sm" style={{ color: '#5A6A8A' }}>現在、更新回答が必要な契約はありません。</p>
          </div>
        </div>
      </main>
    </div>
  )
}