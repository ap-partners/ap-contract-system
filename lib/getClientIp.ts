// ===== リクエスト元IPアドレスの取得 =====
// 2026-08-10新設（B-05対応）。Vercel環境ではNextRequest.ipが提供されないため、
// リバースプロキシが付与するヘッダーから取得する。取得できない場合はレート制限の
// キーとして'unknown'を使う（同一キーに複数の未識別アクセスがまとまるだけで、
// ログイン機能自体は壊れない安全側の挙動）。
import { NextRequest } from 'next/server'

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
