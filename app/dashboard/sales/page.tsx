'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SalesDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.push('/login')
        return
      }
      const role = data.user.user_metadata?.role
      if (role !== '担当営業') {
        router.push('/login')
        return
      }
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">APパートナーズ 契約書管理システム</h1>
            <p className="text-sm text-gray-500">担当営業ダッシュボード</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
            ログアウト
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">申請中</p>
            <p className="text-3xl font-bold text-blue-500 mt-2">0</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">差し戻し</p>
            <p className="text-3xl font-bold text-red-500 mt-2">0</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">署名待ち</p>
            <p className="text-3xl font-bold text-yellow-500 mt-2">0</p>
          </div>
        </div>
        <div className="mb-8">
          <button
            onClick={() => router.push('/apply')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
          >
            ＋ 新規発行申請
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">進行中の書類</h2>
            <p className="text-gray-500 text-sm">現在、進行中の書類はありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">差し戻し対応が必要</h2>
            <p className="text-gray-500 text-sm">現在、差し戻しはありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">管理部への依頼</h2>
            <p className="text-gray-500 text-sm">現在、依頼はありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">更新回答が必要</h2>
            <p className="text-gray-500 text-sm">現在、更新回答が必要な契約はありません。</p>
          </div>
        </div>
      </main>
    </div>
  )
}