// ===== 帳票PDF生成API =====
// /api/contracts/[id]/pdf にGETすると、該当契約のPDFをその場で生成して返す。
// 2026-07-07実装（第1弾：雇用契約書・パターンAのみ対応）。
// 2026-07-08：就業条件明示書（パターンB）、兼用版（パターンC）を追加。全パターン対応完了。
// 2026-07-09：フィールドマッピング・派遣料金マスタ参照ロジックをlib/pdf/renderContractPdf.tsへ
// 切り出し（署名完了API app/api/sign/[id]/complete/route.ts と共通化するため）。
// このAPI自体は基本的に「未署名のプレビュー用PDF」を返す（署名画像は渡さない）。
// 2026-07-10追加：ただし署名済みで`contracts.drive_file_id`が入っている場合は、
// 署名時にGoogle Driveへ保存した「押印済みの実物PDF」をそのまま返す。以前はダッシュボードの
// プレビューが常に未署名の状態で再生成されており、押印済みPDFを確認する手段が
// Google Driveを直接開くことしかなかった（伊藤さん指摘・2026-07-10）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderContractPdfBuffer } from '@/lib/pdf/renderContractPdf'
import { downloadDriveFile } from '@/lib/googleDrive'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  let buffer: Buffer
  if (contract.drive_file_id) {
    // 署名済み：Google Driveに保存済みの押印済み実物PDFをそのまま返す。
    try {
      buffer = await downloadDriveFile(contract.drive_file_id)
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Google Driveからの取得に失敗しました：' + (e?.message || '') },
        { status: 502 }
      )
    }
  } else {
    // 未署名：その場で再生成したプレビュー用PDF（従業員の押印は空欄）。
    try {
      buffer = await renderContractPdfBuffer(contract, supabaseAdmin)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'この書類種別のPDF生成は未対応です。' },
        { status: 501 }
      )
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="contract.pdf"',
    },
  })
}
