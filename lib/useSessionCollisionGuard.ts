// ===== セッション衝突検知ガード（2026-07-22追加） =====
// 社内システム担当者によるQA総合監査（2026-07-22）指摘C1対応。
//
// 問題：Supabase-jsは認証情報を既定で同一オリジンのlocalStorageに保存し、全タブで共有する。
// そのため、同一ブラウザの別タブで別アカウントにログインすると、既に開いていたタブの認証情報も
// 気づかないうちに新しいアカウントへ上書きされてしまう（画面にエラー等は一切出ない）。
// 通常業務では各自が自分のアカウントのみでログインするため発生頻度は低いと考えられるが、
// 同一PC・同一ブラウザで複数ロールを使い分ける場面（社内テスト運用・共有PCでの代理対応等）では、
// 操作者が気づかないまま別ロールとして処理してしまう誤操作リスクがある。
//
// 対応方針：ログイン維持の使い勝手（sessionStorage化するとタブを閉じる／ブラウザを再起動する
// たびに全員が再ログインを強いられ、日常利用への影響が大きい）は変えず、認証情報が
// 裏で別ユーザーへ切り替わったことを検知した場合にのみ、安全のため強制的にログアウトして
// ログイン画面へ戻す。中途半端な状態のまま操作を続けさせないことを優先する。
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// expectedUserId: この画面を開いた時点で確認したログインユーザーのid。
// これと異なるユーザーへ認証情報が変わったことを検知したら、強制ログアウト＋ログイン画面へ遷移する。
// loginPath: 遷移先のログイン画面（社内ダッシュボード系は'/login'固定でよいが、念のため引数化）。
export function useSessionCollisionGuard(expectedUserId: string | null | undefined, loginPath: string = '/login') {
  const router = useRouter()
  const handledRef = useRef(false)

  useEffect(() => {
    if (!expectedUserId) return

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (handledRef.current) return
      const currentId = session?.user?.id
      // ログアウト（currentIdがundefined）は既存の画面側の認証チェックに任せ、ここでは
      // 「別のユーザーに変わった」場合のみを対象にする（自分自身のトークン自動更新等はcurrentId===expectedUserIdのため対象外）
      if (currentId && currentId !== expectedUserId) {
        handledRef.current = true
        supabase.auth.signOut().finally(() => {
          alert('別のタブまたは別の端末で、別のアカウントにログインされたことを検知しました。\n安全のため、いったんログアウトしました。お手数ですが、もう一度ログインし直してください。')
          router.push(loginPath)
        })
      }
    })

    return () => { listener.subscription.unsubscribe() }
  }, [expectedUserId, loginPath, router])
}
