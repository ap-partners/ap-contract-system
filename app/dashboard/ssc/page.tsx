 'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SSCDashboard() {
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
      if (role !== 'SSC') {
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
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">APパートナーズ 契約書管理システム</h1>
            <p className="text-sm text-gray-500">SSCダッシュボード</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* サマリー */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">承認待ち合計</p>
            <p className="text-3xl font-bold text-blue-500 mt-2">0</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">期日超過</p>
            <p className="text-3xl font-bold text-red-500 mt-2">0</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">N日以内</p>
            <p className="text-3xl font-bold text-yellow-500 mt-2">0</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">本日承認済み</p>
            <p className="text-3xl font-bold text-green-500 mt-2">0</p>
          </div>
        </div>

        {/* 確認キュー */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">確認キュー（承認待ち）</h2>
            <p className="text-gray-500 text-sm">現在、承認待ちの書類はありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">進行中（A/B/C対応中）</h2>
            <p className="text-gray-500 text-sm">現在、進行中の書類はありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">差し戻し中</h2>
            <p className="text-gray-500 text-sm">現在、差し戻し中の書類はありません。</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">更新期限管理</h2>
            <p className="text-gray-500 text-sm">現在、期限が近い契約はありません。</p>
          </div>
        </div>
      </main>
    </div>
  )
}
