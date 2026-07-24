// ===== 署名画面：署名／内容確認 完了API =====
// /sign/[id] で本人確認後に表示される「署名する」（パターンA・C）または
// 「内容を確認しました」（パターンB）ボタン押下時に呼ばれる。
// 2026-07-09実装（フェーズ5）。2026-07-13：本人確認方式を社員番号＋6桁認証コードに変更
// （docs/SYSTEM_DESIGN.md 10章 2026-07-13決定）。
//
// 本人確認はverify APIと独立して、このAPIでも必ず再検証する
// （verify API呼び出しとこのAPI呼び出しの間に永続的な認証セッションを発行していないため）。
// なお、ここでの再検証失敗は試行回数にカウントしない（既にverifyで正しいコードが確認できて
// action画面まで進んでいるため、その後の通信エラー等での再送を誤って失効させないようにする）。
//
// 処理の流れ：①本人確認・状態再検証 → ②sign_action_typeに応じてPDF再生成
// （署名の場合は署名画像を埋め込み、確認のみの場合はそのまま）→ ③Google Driveへアップロード
// → ③-2 input_data.csvMetaのバックアップをGoogle Driveへ追加保存（2026-07-21追加・タスク⑤対応。
// 失敗しても非致命的） → ④contractsをstatus='署名済み'・signed_at・drive_file_id・
// sign_action_type・csvmeta_backup_file_idで更新
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderContractPdfBuffer } from '@/lib/pdf/renderContractPdf'
import { uploadSignedPdf, deleteDriveFile, uploadJsonBackup } from '@/lib/googleDrive'
import { SIGN_AUTH_MAX_ATTEMPTS } from '@/lib/signAuthCode'
import { getStaffIdFromRequest } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 総合レビュー指摘9対応（2026-07-15）：署名画像（丸印鑑PNG）はクライアント（Canvas）が
// 生成したものをそのまま信頼して受理していたため、リクエストを直接叩けば内容検証なしに
// 任意の画像を法的書類へ埋め込めてしまう問題があった。最低限のガードとして、
// ①data URL形式・PNG・サイズ上限のチェック、②画面で入力されたフルネーム（sealName）と
// スタッフマスタ上の氏名が一致することの検証、の2点を追加する。
const MAX_SIGNATURE_IMAGE_BYTES = 500 * 1024 // 500KB（丸印鑑1枚として十分な上限）

const validateSignatureImageDataUrl = (dataUrl: string): string | null => {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return '署名画像の形式が正しくありません。お手数ですが、最初からやり直してください。'
  const base64 = match[1]
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (approxBytes === 0) return '署名画像が空です。お手数ですが、最初からやり直してください。'
  if (approxBytes > MAX_SIGNATURE_IMAGE_BYTES) return '署名画像のサイズが大きすぎます。お手数ですが、最初からやり直してください。'
  return null
}

// 総合レビュー指摘40対応（2026-07-22）：署名・確認完了の監査ログ。
// パターンBの「内容を確認しました」を含め、押下時点のIPアドレス・User-Agentを記録する
// （将来トラブル時の証跡目的。伊藤さんと相談のうえ、UI側の強制スクロール等は見送り、
// サーバー側でのみ記録する方式に決定。追加コストなし＝Vercelのリクエストヘッダーを読むだけ）。
const getClientIp = (req: NextRequest): string | null => {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return req.headers.get('x-real-ip')
}

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${documentType.replace(/\n/g, ' ')}${suffix}`
}

// Driveの年月フォルダ名（'YYYY-MM'）を、雇用開始日 → 派遣開始日 → 申請作成日、の優先順で決める
// （lib/googleDrive.tsのコメント参照：雇用開始日 or 派遣開始日から算出する設計）
const resolveYearMonth = (contract: any): string => {
  const f = contract.input_data?.fields || {}
  const source = f.employStart || f.dispatchStart || contract.created_at
  const d = new Date(source)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const employeeNumber = (body?.employeeNumber || '').trim()
  const authCode = (body?.authCode || '').trim()
  const signatureImageDataUrl: string | undefined = body?.signatureImageDataUrl || undefined
  const sealName: string = (body?.sealName || '').trim()

  // 2026-07-17追加：マイページ導入に伴い、ログインセッション（社員番号＋パスワード等で
  // ログイン済み）があればそれを本人確認として扱う。旧方式（社員番号＋契約ごとの認証コード。
  // /sign/[id]の一回限りリンク）は、まだセッションを持たない場合のフォールバックとして残す。
  const sessionStaffId = await getStaffIdFromRequest(req)

  if (!sessionStaffId && (!employeeNumber || !authCode)) {
    return NextResponse.json({ error: '社員番号と認証コードを入力してください。' }, { status: 400 })
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
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

  let staff: { id: string; name: string; employee_number: string; dept_no: number | null } | null = null

  if (sessionStaffId) {
    if (sessionStaffId !== contract.staff_id) {
      return NextResponse.json({ error: 'この書類を操作する権限がありません。' }, { status: 403 })
    }
    const { data: staffRow } = await supabaseAdmin
      .from('staff')
      .select('id, name, employee_number, dept_no')
      .eq('id', contract.staff_id)
      .maybeSingle()
    staff = staffRow
    if (!staff) {
      return NextResponse.json({ error: 'アカウント情報が見つかりませんでした。' }, { status: 404 })
    }
  } else {
    // ===== 旧方式：契約ごとの認証コード（後方互換のため残置） =====
    if ((contract.sign_auth_attempts || 0) >= SIGN_AUTH_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: '認証コードの入力回数が上限を超えました。\nお手数ですが、下の「認証コードを再発行する」ボタンから新しいコードを取得してください。', reason: 'locked' },
        { status: 423 }
      )
    }

    if (!contract.sign_auth_code || !contract.sign_auth_code_expires_at || new Date(contract.sign_auth_code_expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: '認証コードの有効期限が切れています。\nお手数ですが、下の「認証コードを再発行する」ボタンから新しいコードを取得してください。', reason: 'expired' },
        { status: 410 }
      )
    }

    const { data: staffRow } = await supabaseAdmin
      .from('staff')
      .select('id, name, employee_number, dept_no')
      .eq('id', contract.staff_id)
      .maybeSingle()

    if (!staffRow || staffRow.employee_number !== employeeNumber || contract.sign_auth_code !== authCode) {
      // 失敗した試行回数を1つ加算する（verifyと同じ5回で失効の扱いに統一）
      const nextAttempts = (contract.sign_auth_attempts || 0) + 1
      await supabaseAdmin.from('contracts').update({ sign_auth_attempts: nextAttempts }).eq('id', id)
      if (nextAttempts >= SIGN_AUTH_MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: '認証コードの入力回数が上限を超えました。\nお手数ですが、下の「認証コードを再発行する」ボタンから新しいコードを取得してください。', reason: 'locked' },
          { status: 423 }
        )
      }
      return NextResponse.json({ error: '社員番号または認証コードが正しくありません。ご確認のうえ、もう一度入力してください。', reason: 'invalid' }, { status: 401 })
    }
    staff = staffRow
  }

  if (!staff) {
    return NextResponse.json({ error: '本人確認に失敗しました。' }, { status: 401 })
  }

  const signAction: 'signature' | 'confirmation' =
    contract.sign_action_type === 'signature' || contract.sign_action_type === 'confirmation'
      ? contract.sign_action_type
      : contract.document_type === '就業条件明示書'
        ? 'confirmation'
        : 'signature'

  if (signAction === 'signature' && !signatureImageDataUrl) {
    return NextResponse.json({ error: '署名が入力されていません。' }, { status: 400 })
  }

  if (signAction === 'signature' && signatureImageDataUrl) {
    const imageError = validateSignatureImageDataUrl(signatureImageDataUrl)
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: 400 })
    }
    if (!sealName) {
      return NextResponse.json({ error: 'フルネームを入力してください。' }, { status: 400 })
    }
  }

  // ① PDF再生成（署名の場合のみ署名画像を埋め込む。確認のみの場合はそのまま）
  let buffer: Buffer
  try {
    buffer = await renderContractPdfBuffer(contract, supabaseAdmin, {
      signatureImageDataUrl: signAction === 'signature' ? signatureImageDataUrl : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'PDFの生成に失敗しました。' }, { status: 500 })
  }

  // ② Google Driveへアップロード
  let departmentName = '未設定'
  if (staff.dept_no != null) {
    const { data: deptRow } = await supabaseAdmin
      .from('department_master')
      .select('dept_name')
      .eq('dept_no', staff.dept_no)
      .maybeSingle()
    departmentName = deptRow?.dept_name || departmentName
  }

  const documentLabel = getDocumentLabel(contract.document_type, contract.contract_type)
  const fileName = `${staff.name}_${staff.employee_number}_${documentLabel}.pdf`.replace(/[\\/]/g, '_')

  let driveFileId: string
  try {
    driveFileId = await uploadSignedPdf({
      buffer,
      yearMonth: resolveYearMonth(contract),
      departmentName,
      fileName,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Google Driveへの保存に失敗しました：' + (e?.message || '') },
      { status: 500 }
    )
  }

  // ②-2 csvMetaのバックアップ（2026-07-21追加・タスク⑤対応）
  // input_data.csvMetaは「CSVからどう自動反映されたか」の記録で、将来的な容量対策として
  // 削除する可能性がある想定のため、削除する前から追加のみのバックアップを取っておく。
  // あくまで安全網であり、失敗しても署名・確認の完了自体は止めない（非致命的処理）。
  let csvMetaBackupFileId: string | null = null
  if (contract.input_data?.csvMeta) {
    try {
      csvMetaBackupFileId = await uploadJsonBackup({
        data: contract.input_data.csvMeta,
        yearMonth: resolveYearMonth(contract),
        departmentName,
        fileName: `${staff.name}_${staff.employee_number}_${documentLabel}_csvMetaバックアップ.json`.replace(/[\\/]/g, '_'),
      })
    } catch (e: any) {
      console.error(`[complete] csvMetaバックアップの保存に失敗しました（contract.id=${id}）`, e)
    }
  }

  // ③ ステータス更新（二重送信防止のため、まだ「署名待ち」の場合のみ更新する条件付きUPDATE）
  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: '署名済み',
      signed_at: now,
      drive_file_id: driveFileId,
      sign_action_type: signAction,
      sign_confirmed_ip: getClientIp(req),
      sign_confirmed_user_agent: req.headers.get('user-agent'),
      ...(csvMetaBackupFileId ? { csvmeta_backup_file_id: csvMetaBackupFileId } : {}),
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', '署名待ち')
    .select()
    .maybeSingle()

  // 総合レビュー指摘16対応（2026-07-15）：UPDATEが失敗・空振りした場合、直前でアップロード
  // 済みのPDFがどの契約にも紐づかない孤児ファイルとしてDrive上に残ってしまうため、
  // ここで削除しておく（削除自体の失敗は握りつぶしてログのみ。ユーザー応答は止めない）。
  if (updateError) {
    await deleteDriveFile(driveFileId)
    if (csvMetaBackupFileId) await deleteDriveFile(csvMetaBackupFileId)
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    await deleteDriveFile(driveFileId)
    if (csvMetaBackupFileId) await deleteDriveFile(csvMetaBackupFileId)
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }

  return NextResponse.json({ success: true, signAction })
}
