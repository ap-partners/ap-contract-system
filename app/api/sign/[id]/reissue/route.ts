// ===== 署名画面：認証コード再発行API =====
// 2026-07-13追加。/sign/[id]でコードの有効期限切れ（410）または試行回数上限（423）に
// なった場合、この API を呼んで新しいコードを発行し、メールを再送する
// （docs/SYSTEM_DESIGN.md 10章 2026-07-13決定：再発行後は新コードで再度2日間有効）。
//
// 誰でも任意のcontractIdに対して連打できてしまうと他人宛にメールを送りつけられるため、
// 社員番号での本人一致チェックを必須にする（社員番号は誰でも知り得る情報だが、この
// 契約に紐づく本人の社員番号と一致しない限り再発行は行わない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSignRequestMail } from '@/lib/mail'
import {
  generateSignAuthCode,
  computeSignAuthCodeExpiry,
  SIGN_AUTH_MAX_ATTEMPTS,
  SIGN_AUTH_REISSUE_COOLDOWN_MINUTES,
} from '@/lib/signAuthCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()

  if (!employeeNumber) {
    return NextResponse.json({ error: '社員番号を入力してください。' }, { status: 400 })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, staff_id, status, document_type, sign_auth_code_expires_at, sign_auth_attempts, sign_auth_last_issued_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '対象の書類が見つかりませんでした。' }, { status: 404 })
  }

  if (contract.status === '署名済み' || contract.status === '完了') {
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }
  if (contract.status !== '署名待ち') {
    return NextResponse.json({ error: '現在この書類は署名・確認待ちの状態ではありません。' }, { status: 409 })
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('employee_number, email, name')
    .eq('id', contract.staff_id)
    .maybeSingle()

  if (!staff || staff.employee_number !== employeeNumber) {
    return NextResponse.json({ error: '確認できませんでした。社員番号をご確認ください。' }, { status: 401 })
  }

  const toEmail = staff.email
  if (!toEmail) {
    return NextResponse.json({ error: '送信先メールアドレスが取得できませんでした。' }, { status: 400 })
  }

  // 総合レビュー指摘8対応（2026-07-15）：
  // ①レート制限：直近発行から一定時間内は再発行を拒否し、社員番号さえ分かれば
  //   何度でも呼べて従業員へメールを連投できてしまう問題に対処する。
  //
  // 外部総合品質監査レポートM-14対応（2026-08-13）：従来はsign_auth_code_expires_atから
  // 発行時刻を逆算していたが、2026-07-17のマイページ導入以降notify-sign-requestが
  // この契約単位コード方式自体を発行しなくなり（reissue自身しかsign_auth_code系の列を
  // 書き込まなくなった）、初回reissue呼び出し時点ではprevExpiresAtが必ずnullになるため、
  // 逆算に頼るこの判定方式は不安定だった。発行時刻そのものを直接記録するsign_auth_last_issued_at
  // 列を新設し、そちらを直接比較する方式に変更する。
  const prevAttempts = contract.sign_auth_attempts ?? 0
  const prevExpiresAt = contract.sign_auth_code_expires_at ? new Date(contract.sign_auth_code_expires_at) : null
  const prevIssuedAt = contract.sign_auth_last_issued_at ? new Date(contract.sign_auth_last_issued_at) : null
  const now = new Date()
  const wasExpired = !prevExpiresAt || prevExpiresAt.getTime() <= now.getTime()
  const wasLocked = prevAttempts >= SIGN_AUTH_MAX_ATTEMPTS

  // 総合レビュー指摘16対応（2026-07-27）：従来は`!wasLocked`も条件に含まれていたため、
  // 5回失敗してロック中の状態ではこのクールダウン判定自体が丸ごとスキップされ、
  // 「失効→即再発行→試行回数リセット→再度失効」を無制限に繰り返せる穴になっていた。
  // ロック中かどうかに関わらず、直近の発行からの経過時間は必ずチェックする。
  if (!wasExpired && prevIssuedAt) {
    const minutesSinceIssued = (now.getTime() - prevIssuedAt.getTime()) / (60 * 1000)
    if (minutesSinceIssued < SIGN_AUTH_REISSUE_COOLDOWN_MINUTES) {
      return NextResponse.json(
        { error: `再発行は少し時間をおいてからお試しください（発行済みのメールもご確認ください）。` },
        { status: 429 }
      )
    }
  }

  // ②5回試行→再発行→再試行という形での試行回数制限の迂回を防ぐため、既存コードが
  //   まだ有効かつ未失効（=単なる「メールが届かない」等の理由での再発行）の場合は
  //   試行回数を0にリセットせず引き継ぐ。失効・上限到達済みの場合のみ0から再開する。
  const nextAttempts = (wasExpired || wasLocked) ? 0 : prevAttempts

  const authCode = generateSignAuthCode()
  const authCodeExpiresAt = computeSignAuthCodeExpiry()

  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      sign_auth_code: authCode,
      sign_auth_code_expires_at: authCodeExpiresAt,
      sign_auth_last_issued_at: now.toISOString(),
      sign_auth_attempts: nextAttempts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: '認証コードの更新に失敗しました。' }, { status: 500 })
  }

  const isConfirmationOnly = contract.document_type === '就業条件明示書'

  try {
    await sendSignRequestMail(toEmail, id, isConfirmationOnly, authCode, contract.document_type, staff.name)
  } catch (e: any) {
    return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
