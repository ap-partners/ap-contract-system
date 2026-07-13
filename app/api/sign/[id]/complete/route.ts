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
// → ④contractsをstatus='署名済み'・signed_at・drive_file_id・sign_action_typeで更新
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderContractPdfBuffer } from '@/lib/pdf/renderContractPdf'
import { uploadSignedPdf } from '@/lib/googleDrive'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  if (!employeeNumber || !authCode) {
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

  if (!contract.sign_auth_code || !contract.sign_auth_code_expires_at || new Date(contract.sign_auth_code_expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: '認証コードの有効期限が切れています。お手数ですが、最初の画面からやり直してください。', reason: 'expired' },
      { status: 410 }
    )
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, name, employee_number, dept_no')
    .eq('id', contract.staff_id)
    .maybeSingle()

  if (!staff || staff.employee_number !== employeeNumber || contract.sign_auth_code !== authCode) {
    return NextResponse.json({ error: '確認できませんでした。お手数ですが、最初の画面からやり直してください。', reason: 'invalid' }, { status: 401 })
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

  // ③ ステータス更新（二重送信防止のため、まだ「署名待ち」の場合のみ更新する条件付きUPDATE）
  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: '署名済み',
      signed_at: now,
      drive_file_id: driveFileId,
      sign_action_type: signAction,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', '署名待ち')
    .select()
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }

  return NextResponse.json({ success: true, signAction })
}
