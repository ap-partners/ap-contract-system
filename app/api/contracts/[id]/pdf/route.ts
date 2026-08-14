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
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { verifyPdfAccessToken } from '@/lib/pdfAccessToken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: NextRequest,
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

  // 総合レビュー指摘1対応（2026-07-15）：契約UUIDさえ分かれば未ログインでも氏名・住所・
  // 給与を含むPDFを取得できてしまっていた問題を修正。以下のいずれかを満たさない場合は403。
  // ①署名画面（/sign/[id]）で本人確認済みの短命トークン（?t=...）を持っている
  // ②社内ダッシュボードにログイン済みで、かつ自分が閲覧してよい契約である
  //   （管理部＝全件／SSC＝社内案件を除く全件／担当営業＝自部門のみ。RLSの閲覧範囲と同じ考え方）
  const token = req.nextUrl.searchParams.get('t') || ''
  const hasValidToken = !!token && verifyPdfAccessToken(token, id)

  if (!hasValidToken) {
    const staffAuth = await getAuthenticatedStaff(req)
    // B-10対応（2026-08-12）：契約詳細画面（app/dashboard/ssc/contracts/[id]/page.tsx）は
    // 社内案件（work_place==='社内'）を「is_internal_approverを持つ管理部のみ」に絞り込んで
    // いるが、このPDF取得APIはservice role（RLSを経由しない全権限）でDBへアクセスするため、
    // role==='管理部'というだけでは画面側の制限をすり抜けて社内社員の給与等が記載された
    // PDFを取得できてしまっていた。詳細画面・notify-sign-request（B-01）・
    // force-logout-staff（B-07）と同じ判定に統一する。
    const allowed =
      !!staffAuth &&
      (
        (staffAuth.role === '管理部' && (contract.work_place !== '社内' || staffAuth.isInternalApprover)) ||
        (staffAuth.role === 'SSC' && contract.work_place !== '社内') ||
        (staffAuth.role === '担当営業' && contract.created_by_dept_no != null && contract.created_by_dept_no === staffAuth.deptNo)
      )
    if (!allowed) {
      return NextResponse.json({ error: 'この書類を閲覧する権限がありません。' }, { status: 403 })
    }
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

  // L-05対応（2026-08-14）：従来はファイル名が常に固定の"contract.pdf"だったため、
  // 複数契約分をダウンロードすると全て同名で上書き・混同されるリスクがあった。
  // 書類種別・スタッフ氏名・社員番号を含む名前に変更（RFC5987エンコードで日本語ファイル名に対応。
  // app/api/admin/csv-import/[id]/protected-export/route.tsと同じ方式）。
  const staffInfo = (contract.input_data as any)?.staff || null
  const docLabel = (contract.document_type || '契約書').replace(/\n/g, ' ')
  const namePart = [staffInfo?.name, staffInfo?.employee_number].filter(Boolean).join('_')
  const fileName = `${docLabel}${namePart ? '_' + namePart : ''}_${id.slice(0, 8)}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
