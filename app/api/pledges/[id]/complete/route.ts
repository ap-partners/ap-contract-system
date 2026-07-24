// ===== アルバイト誓約書：署名完了API（マイページ専用） =====
// app/api/sign/[id]/complete/route.ts のpledges版。pledgesは通知メールが最初から
// マイページ案内（sendStaffLoginCodeMail／sendStaffDocumentReadyMail）のみで送られ、
// 契約書のような「契約ごとの1回限りリンク＋認証コード」方式（/sign/[id]）を経由したことが
// 一度も無いため、本APIはセッションCookie（getStaffIdFromRequest）による本人確認のみに対応する
// （契約書のcomplete APIにある旧方式フォールバックは実装しない＝該当ケースが存在しないため）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderPledgePdfBuffer } from '@/lib/pdf/renderPledgePdf'
import { uploadSignedPdf, deleteDriveFile } from '@/lib/googleDrive'
import { getStaffIdFromRequest } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLEDGE_DOCUMENT_LABEL = 'アルバイト誓約書'
const MAX_SIGNATURE_IMAGE_BYTES = 500 * 1024

const validateSignatureImageDataUrl = (dataUrl: string): string | null => {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return '署名画像の形式が正しくありません。お手数ですが、最初からやり直してください。'
  const base64 = match[1]
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (approxBytes === 0) return '署名画像が空です。お手数ですが、最初からやり直してください。'
  if (approxBytes > MAX_SIGNATURE_IMAGE_BYTES) return '署名画像のサイズが大きすぎます。お手数ですが、最初からやり直してください。'
  return null
}

// Driveの年月フォルダ名。雇用契約書と同じ考え方だが、pledgesにはemployStart/dispatchStart相当の
// 単一フィールドが無い（scheduleRows内の最初の行の日付を使う）ため、無ければ申請作成日を使う。
const resolveYearMonth = (pledge: any): string => {
  const firstRow = pledge.input_data?.scheduleRows?.[0]
  const source = firstRow?.label?.split('〜')[0]?.replaceAll('/', '-') || pledge.created_at
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
  const signatureImageDataUrl: string | undefined = body?.signatureImageDataUrl || undefined
  const sealName: string = (body?.sealName || '').trim()

  const sessionStaffId = await getStaffIdFromRequest(req)
  if (!sessionStaffId) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { data: pledge, error } = await supabaseAdmin
    .from('pledges')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !pledge) {
    return NextResponse.json({ error: '対象の書類が見つかりませんでした。' }, { status: 404 })
  }

  if (pledge.status === '署名済み') {
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }
  if (pledge.status !== '署名待ち') {
    return NextResponse.json({ error: '現在この書類は署名待ちの状態ではありません。' }, { status: 409 })
  }
  if (sessionStaffId !== pledge.staff_id) {
    return NextResponse.json({ error: 'この書類を操作する権限がありません。' }, { status: 403 })
  }

  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, name, employee_number, dept_no')
    .eq('id', pledge.staff_id)
    .maybeSingle()
  if (!staff) {
    return NextResponse.json({ error: 'アカウント情報が見つかりませんでした。' }, { status: 404 })
  }

  if (!signatureImageDataUrl) {
    return NextResponse.json({ error: '署名が入力されていません。' }, { status: 400 })
  }
  const imageError = validateSignatureImageDataUrl(signatureImageDataUrl)
  if (imageError) {
    return NextResponse.json({ error: imageError }, { status: 400 })
  }
  if (!sealName) {
    return NextResponse.json({ error: 'フルネームを入力してください。' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = await renderPledgePdfBuffer(pledge, supabaseAdmin, { signatureImageDataUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'PDFの生成に失敗しました。' }, { status: 500 })
  }

  let departmentName = '未設定'
  if (staff.dept_no != null) {
    const { data: deptRow } = await supabaseAdmin
      .from('department_master')
      .select('dept_name')
      .eq('dept_no', staff.dept_no)
      .maybeSingle()
    departmentName = deptRow?.dept_name || departmentName
  }

  const fileName = `${staff.name}_${staff.employee_number}_${PLEDGE_DOCUMENT_LABEL}.pdf`.replace(/[\\/]/g, '_')

  let driveFileId: string
  try {
    driveFileId = await uploadSignedPdf({
      buffer,
      yearMonth: resolveYearMonth(pledge),
      departmentName,
      fileName,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Google Driveへの保存に失敗しました：' + (e?.message || '') },
      { status: 500 }
    )
  }

  const now = new Date().toISOString()
  const { data: updatedRow, error: updateError } = await supabaseAdmin
    .from('pledges')
    .update({
      status: '署名済み',
      signed_at: now,
      drive_file_id: driveFileId,
      sign_action_type: 'signature',
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', '署名待ち')
    .select()
    .maybeSingle()

  if (updateError) {
    await deleteDriveFile(driveFileId)
    return NextResponse.json({ error: 'ステータス更新に失敗しました。' }, { status: 500 })
  }
  if (!updatedRow) {
    await deleteDriveFile(driveFileId)
    return NextResponse.json({ error: 'この書類は既に手続きが完了しています。' }, { status: 409 })
  }

  return NextResponse.json({ success: true, signAction: 'signature' })
}
