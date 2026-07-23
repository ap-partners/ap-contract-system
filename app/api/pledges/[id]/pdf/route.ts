// ===== アルバイト誓約書PDF生成API =====
// /api/pledges/[id]/pdf にGETすると、該当申請のPDFをその場で生成して返す。
// 2026-07-23実装。app/api/contracts/[id]/pdf/route.ts と同じ設計（未署名はその場で再生成、
// 署名済み＝drive_file_idがある場合はGoogle Driveの実物PDFをそのまま返す／短命トークンまたは
// 社内ログインのいずれかが無いと403）。署名フロー（次の作業項目）が実装されるまでは
// pledges.drive_file_idは常にnullのため、実質的に常にその場再生成のパスのみが使われる。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderPledgePdfBuffer } from '@/lib/pdf/renderPledgePdf'
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

  const { data: pledge, error } = await supabaseAdmin
    .from('pledges')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !pledge) {
    return NextResponse.json({ error: '申請データが見つかりませんでした。' }, { status: 404 })
  }

  // 認可：contracts PDF APIと同じ考え方（総合レビュー指摘1の教訓）。
  // ①署名画面で本人確認済みの短命トークン（?t=...）、②社内ログイン済み（管理部＝全件／
  // SSC＝全件／担当営業＝自部門のみ）のいずれかが無いと403。pledgesには契約書のような
  // 「社内案件」概念が無いためSSCは除外条件なしで全件許可する。
  const token = req.nextUrl.searchParams.get('t') || ''
  const hasValidToken = !!token && verifyPdfAccessToken(token, id)

  if (!hasValidToken) {
    const staffAuth = await getAuthenticatedStaff(req)
    const allowed =
      !!staffAuth &&
      (
        staffAuth.role === '管理部' ||
        staffAuth.role === 'SSC' ||
        (staffAuth.role === '担当営業' && pledge.created_by_dept_no != null && pledge.created_by_dept_no === staffAuth.deptNo)
      )
    if (!allowed) {
      return NextResponse.json({ error: 'この書類を閲覧する権限がありません。' }, { status: 403 })
    }
  }

  let buffer: Buffer
  if (pledge.drive_file_id) {
    try {
      buffer = await downloadDriveFile(pledge.drive_file_id)
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Google Driveからの取得に失敗しました：' + (e?.message || '') },
        { status: 502 }
      )
    }
  } else {
    try {
      buffer = await renderPledgePdfBuffer(pledge, supabaseAdmin)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'PDF生成に失敗しました。' },
        { status: 501 }
      )
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="pledge.pdf"',
    },
  })
}
