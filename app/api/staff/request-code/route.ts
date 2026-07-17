// ===== マイページ：認証コードの発行・送信 =====
// 2026-07-17新設。以下2つの入口から共通で使う：
//  ①ログイン画面「初めての方・認証コードでログイン」→ まだパスワード未設定の従業員が
//    メールに記載のコードを持っていない／期限切れの場合に再送してもらう。
//  ②ログイン画面「パスワードをお忘れの場合」→ パスワード設定済みの従業員が、認証コードで
//    本人確認のうえパスワードを再設定するために使う。
// どちらも従業員単位（staffテーブル）でコードを発行する点が、契約単位だった旧方式
// （lib/signAuthCode.ts・contracts.sign_auth_code）との違い。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendStaffLoginCodeMail } from '@/lib/mail'
import {
  generateSignAuthCode,
  computeSignAuthCodeExpiry,
  SIGN_AUTH_CODE_EXPIRY_DAYS,
  SIGN_AUTH_REISSUE_COOLDOWN_MINUTES,
} from '@/lib/signAuthCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()

  if (!employeeNumber) {
    return NextResponse.json({ error: '社員番号を入力してください。' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff')
    .select('id, name, email, employee_number, is_initial_login, login_auth_code_expires_at, login_auth_attempts')
    .eq('employee_number', employeeNumber)
    .maybeSingle()

  // セキュリティ上の理由から、社員番号が存在しない場合も存在する場合と同じ応答を返す
  // （社員番号の在籍有無を外部から推測できないようにするため）。
  if (error || !staff) {
    return NextResponse.json({ sent: true })
  }

  if (!staff.email) {
    return NextResponse.json({ error: '登録されているメールアドレスが確認できませんでした。管理部にご連絡ください。' }, { status: 400 })
  }

  // 再発行のクールダウン（総合レビュー指摘8と同じ考え方：連打によるメール連投・
  // 正規コードの意図しない無効化を防ぐ）
  const prevAttempts = staff.login_auth_attempts ?? 0
  const prevExpiresAt = staff.login_auth_code_expires_at ? new Date(staff.login_auth_code_expires_at) : null
  const now = new Date()
  const wasExpired = !prevExpiresAt || prevExpiresAt.getTime() <= now.getTime()

  if (!wasExpired && prevExpiresAt) {
    const issuedAt = new Date(prevExpiresAt.getTime() - SIGN_AUTH_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const minutesSinceIssued = (now.getTime() - issuedAt.getTime()) / (60 * 1000)
    if (minutesSinceIssued < SIGN_AUTH_REISSUE_COOLDOWN_MINUTES) {
      return NextResponse.json(
        { error: '再発行は少し時間をおいてからお試しください（発行済みのメールもご確認ください）。' },
        { status: 429 }
      )
    }
  }

  const authCode = generateSignAuthCode()
  const authCodeExpiresAt = computeSignAuthCodeExpiry()

  const { error: updateError } = await supabaseAdmin
    .from('staff')
    .update({
      login_auth_code: authCode,
      login_auth_code_expires_at: authCodeExpiresAt,
      login_auth_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', staff.id)

  if (updateError) {
    return NextResponse.json({ error: '認証コードの発行に失敗しました。' }, { status: 500 })
  }

  try {
    await sendStaffLoginCodeMail(
      staff.email,
      staff.employee_number,
      authCode,
      staff.name,
      staff.is_initial_login ? 'initial' : 'reset'
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
