// ===== CSVインポート「保護によりスキップ」行の詳細Excelダウンロード =====
// 2026-07-29デモ指摘②対応。csv_imports.protected_detail（jsonb）に保存済みの保護行詳細を
// Excel（.xlsx）に変換して返す。管理画面の「対象データをダウンロード」ボタンから、
// 認証ヘッダー付きfetch→blob→ダウンロードトリガーの形で呼ばれる想定（帳票PDFプレビューと同じ方式）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import type { ProtectedRowDetail } from '@/lib/csvImportShared'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const { id } = await params
  const { data: importRow, error } = await supabaseAdmin
    .from('csv_imports')
    .select('id, system_type, file_name, uploaded_at, protected_detail')
    .eq('id', id)
    .maybeSingle()

  if (error || !importRow) return NextResponse.json({ error: '対象のインポート履歴が見つかりませんでした。' }, { status: 404 })

  const details = (importRow.protected_detail || []) as ProtectedRowDetail[]
  if (details.length === 0) return NextResponse.json({ error: '保護によりスキップされた行はありません。' }, { status: 404 })

  const importedAt = importRow.uploaded_at ? new Date(importRow.uploaded_at).toLocaleString('ja-JP') : ''
  const sheetRows = details.map(d => ({
    'システム名': d.systemName,
    '所属部門名': d.deptName || '',
    'スタッフNo': d.staffNo || '',
    'スタッフ名': d.staffName || '',
    '派遣開始日': d.dispatchStart || '',
    '派遣終了日': d.dispatchEnd || '',
    '就業場所名': d.workLocation || '',
    '保護スキップ理由': d.reason,
    '保護している契約のステータス': d.blockingStatus || '',
    '担当営業名': d.blockingSalesName || '',
    'インポート実行日時': importedAt,
  }))

  const sheet = XLSX.utils.json_to_sheet(sheetRows)
  sheet['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 28 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '保護スキップ一覧')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const fileName = `保護スキップ一覧_${importRow.system_type}_${id.slice(0, 8)}.xlsx`
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
