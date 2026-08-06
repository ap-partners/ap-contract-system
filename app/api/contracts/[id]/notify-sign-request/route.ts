// ===== 署名依頼通知API =====
// 呼び出し元は2箇所あり、trigger パラメータで区別する。
//   ① trigger=auto_approve（デフォルト）：SSC承認直後
//      （app/dashboard/ssc/contracts/[id]/page.tsx）。
//      締結パターンが「指定しない（自動送信）」かつ現在ステータスが「SSC承認済み」の
//      時だけ、ここで「署名待ち」へ自動遷移してメール送信する（9-1章タスク8の残課題・
//      2026-07-08フェーズ5でまとめて対応）。「対面」「印刷」パターンはここでは何もしない
//      （担当営業の「説明完了」ボタンを待つ）。
//   ② trigger=explain：担当営業の「説明完了」ボタン押下時
//      （app/dashboard/sales/page.tsx）。対面・印刷パターン専用で、現在ステータスが
//      「SSC承認済み」であれば無条件で「署名待ち」へ遷移してメール送信する。
//   ③ trigger=resend（2026-08-06・C-06対応）：SSC/管理部の契約詳細画面の
//      「署名依頼を再送する」ボタン押下時。以下の2ケースを1つのtriggerで扱う。
//      ・ステータスが既に「署名待ち」＝一度は送信できているが従業員に届いていない／
//        紛失した等のリマインド目的。ステータス遷移・sign_requested_atの更新は行わず、
//        同じ内容のメールを再送するだけ（in_initial_loginの場合は認証コードを新規発行し
//        直す＝古いコードを失効させて再送する）。
//      ・ステータスがまだ「SSC承認済み」＝C-07で判明した「メール送信に一度失敗し
//        SSC承認済みへロールバックされたまま誰も気づかず止まっていた」ケースの復旧。
//        この場合は通常のauto_approveと全く同じ判定・処理（下記shouldTransition以降）を
//        そのまま辿らせることで、承認直後の自動送信と同じコードパスで再試行する。
// どちらの分岐も「SSC承認済み→署名待ち」という一方向の遷移が前提のため、
// 二重クリック等で既に「署名待ち」になっている場合は対象外（何もしない＝二重送信防止）。
//
// 2026-07-09追加：署名待ちへ遷移する瞬間に、contracts.sign_action_type
// （signature=手書き署名が必要／confirmation=内容確認のみ）もあわせて確定・保存する。
// /sign/[id]（app/api/sign/[id]/verify・complete）はこの値を読み、無い場合のみ
// 同じロジックでフォールバック計算する（docs/SYSTEM_DESIGN.md 10章 2026-07-09決定）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendStaffLoginCodeMail, sendStaffDocumentReadyMail, sendExplainNeededMail } from '@/lib/mail'
import { generateSignAuthCode, computeSignAuthCodeExpiry } from '@/lib/signAuthCode'
import { getAuthenticatedStaff } from '@/lib/apiAuth'

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${(documentType || '').replace(/\n/g, ' ')}${suffix}`
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// C-06対応（2026-08-06）：通常フローの送信処理と再送（resend）専用パスの両方から
// 共通で呼び出すため、実際のメール送信部分だけを切り出したヘルパー。
// is_initial_login＝trueの場合は認証コードを新規発行し直す（再送のたびに古いコードは失効する）。
const sendSignNotificationMail = async (
  staffRow: { id: string; email: string; name: string; employee_number: string; is_initial_login: boolean },
  documentLabel: string
) => {
  if (staffRow.is_initial_login) {
    const authCode = generateSignAuthCode()
    const authCodeExpiresAt = computeSignAuthCodeExpiry()
    await supabaseAdmin
      .from('staff')
      .update({ login_auth_code: authCode, login_auth_code_expires_at: authCodeExpiresAt, login_auth_attempts: 0 })
      .eq('id', staffRow.id)
    await sendStaffLoginCodeMail(staffRow.email, staffRow.employee_number, authCode, staffRow.name, 'initial', documentLabel)
  } else {
    await sendStaffDocumentReadyMail(staffRow.email, staffRow.name, documentLabel)
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 総合レビュー指摘4対応（2026-07-15）：契約IDさえ分かれば未ログインでも
  // 「SSC承認済み→署名待ち」遷移＋メール送信を発火できてしまっていた問題を修正。
  // 社内（担当営業・SSC・管理部）のログイン済みユーザーのみ呼び出せるようにする。
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || !staffAuth.role) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { id } = await context.params
  const trigger = req.nextUrl.searchParams.get('trigger') || 'auto_approve'

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  if (trigger === 'resend' && contract.status === '署名待ち') {
    // 再送専用パス：ステータス遷移・sign_requested_atの更新は行わず、
    // 既に送信済みのメールと同じ内容を再送するだけ。
    const { data: staffRow } = await supabaseAdmin
      .from('staff')
      .select('id, email, name, employee_number, is_initial_login')
      .eq('id', contract.staff_id)
      .maybeSingle()
    const toEmail = staffRow?.email
    if (!staffRow || !toEmail) {
      return NextResponse.json(
        { error: '送信先メールアドレスが取得できませんでした。スタッフのメールアドレス登録をご確認ください。' },
        { status: 400 }
      )
    }
    try {
      await sendSignNotificationMail({ ...staffRow, email: toEmail }, getDocumentLabel(contract.document_type, contract.contract_type))
    } catch (e: any) {
      return NextResponse.json({ error: 'メール送信に失敗しました：' + (e?.message || '') }, { status: 500 })
    }
    return NextResponse.json({ sent: true })
  }

  if (contract.status !== 'SSC承認済み') {
    // 対象外（差し戻し中等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false })
  }

  // 2026-07-13修正：就業条件明示書（パターンB）は締結パターンを選ぶSTEP自体が無いため、
  // contracts.closing_pattern は常にnullで保存される（3-6章の仕様どおり）。この修正前は
  // auto_approveトリガーがclosing_pattern==='auto'だけを見ていたため、パターンBの案件は
  // SSC承認後どこにも進めなくなっていた（docs/SYSTEM_DESIGN.md 10章 2026-07-13参照）。
  // パターンBは実質的に常に「指定しない（自動送信）」と同じ扱いなので、nullもauto側に含める。
  const shouldTransition =
    trigger === 'explain'
      ? (contract.closing_pattern === 'face' || contract.closing_pattern === 'print') // 対面・印刷パターンのみ
      : (contract.closing_pattern === 'auto' || contract.closing_pattern === null) // 指定しない（自動送信）、およびパターンB（締結パターン選択が無いため常にこちら扱い）

  if (!shouldTransition) {
    // 2026-07-29追加：締結パターンが「対面」「印刷」で、かつ承認直後（trigger=auto_approve）の
    // 呼び出しである場合、これまでは何も起きず担当営業がダッシュボードを自分で見に行かない限り
    // 承認されたことに気づけなかった（伊藤さん指摘）。承認された旨・説明対応が必要な旨を
    // 担当営業へメールで通知する（従業員へのメール送信・ステータス遷移は「説明完了」ボタンまで
    // 行わない、という既存の設計はそのまま維持）。
    // 呼び出し元（handleApprove等）はすべて「実際に申請中→SSC承認済みへ遷移できた時だけ」この
    // APIを呼ぶ設計になっているため、ここで重複送信になる心配はない。
    if (trigger === 'auto_approve' && (contract.closing_pattern === 'face' || contract.closing_pattern === 'print') && contract.created_by) {
      try {
        const { data: submitterUser } = await supabaseAdmin.auth.admin.getUserById(contract.created_by)
        const submitterEmail = submitterUser?.user?.email
        if (submitterEmail) {
          await sendExplainNeededMail(submitterEmail, contract.created_by_name || null, id)
        }
      } catch {
        // 通知メールの失敗は承認フロー自体をブロックしない（ログのみ・UIには表示しない）
      }
    }
    return NextResponse.json({ sent: false })
  }

  const isConfirmationOnly = contract.document_type === '就業条件明示書'
  const signActionType: 'signature' | 'confirmation' = isConfirmationOnly ? 'confirmation' : 'signature'

  // 2026-07-17変更：マイページ導入に伴い、本人確認用の認証コードは契約単位（このAPIで発行）
  // ではなく従業員単位（staffテーブル。/api/staff/request-code等）で管理する方式に変更した。
  // ここではステータス遷移のみ行い、コードの要否・発行はこの後の従業員情報取得後に判断する。
  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: '署名待ち',
      sign_requested_at: now,
      sign_action_type: signActionType,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'SSC承認済み') // 二重実行の競合を避けるための条件付き更新
    .select()
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    // 既に別の呼び出しで遷移済み（同時クリック等）。二重送信防止のため何もしない。
    return NextResponse.json({ sent: false })
  }

  // 総合レビュー指摘10対応（2026-07-15）：この条件付きUPDATE自体は同時実行時の二重遷移・
  // 二重送信を防ぐための唯一の排他制御なので順序はそのまま維持する。ただし、この後の
  // メール送信先取得・送信のいずれかに失敗した場合、以前は契約が「署名待ち」のまま
  // 誰にもコードが届かない状態で座礁していた（従業員はURL自体を知らないため実質復旧不能）。
  // 失敗時はここで「SSC承認済み」へ戻すことで、承認待ちの一覧に再び現れ、担当者が気づいて
  // 再実行できるようにする。
  const rollbackToApproved = async () => {
    await supabaseAdmin
      .from('contracts')
      .update({
        status: 'SSC承認済み',
        sign_requested_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', '署名待ち')
  }

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('id, email, name, employee_number, is_initial_login')
    .eq('id', updatedRow.staff_id)
    .maybeSingle()

  const toEmail = staffRow?.email
  if (!staffRow || !toEmail) {
    await rollbackToApproved()
    return NextResponse.json(
      { error: '送信先メールアドレスが取得できませんでした。ステータスは「SSC承認済み」に戻しました。スタッフのメールアドレス登録をご確認のうえ、もう一度お試しください。' },
      { status: 400 }
    )
  }

  const documentLabel = getDocumentLabel(contract.document_type, contract.contract_type)

  try {
    await sendSignNotificationMail({ ...staffRow, email: toEmail }, documentLabel)
  } catch (e: any) {
    await rollbackToApproved()
    return NextResponse.json(
      { error: 'メール送信に失敗しました。ステータスは「SSC承認済み」に戻しましたので、もう一度お試しください：' + (e?.message || '') },
      { status: 500 }
    )
  }

  return NextResponse.json({ sent: true })
}
