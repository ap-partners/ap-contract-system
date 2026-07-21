// ===== 管理部専用：csvMetaバックアップからの復元API =====
// 2026-07-21新設・タスク⑤対応。将来的にinput_data.csvMeta（CSVからどう自動反映されたかの
// 記録）を容量対策として削除する可能性に備え、署名完了時にGoogle Driveへ追加保存している
// バックアップ（app/api/sign/[id]/complete/route.ts参照）を、管理部が画面から復元できるように
// するAPI。
//
// GET：復元ボタン押下時の確認ダイアログ用に、バックアップの保存日時のみを返す（中身は返さない。
//   伊藤さんとの合意「復元前に必ずバックアップのメタ情報を見せてから確認を取る」対応）。
// POST：実際にinput_data.csvMetaを上書き復元する。復元前のcsvMetaが既に存在する場合も、
//   確認画面を経ていること前提で上書きする（バックアップ自体は追加保存のみで消えないため、
//   復元操作自体は取り消し可能＝再度過去のバックアップを取り直すことはできないが、
//   復元前の状態を失うわけではない点で強制承認等ほど危険な操作ではない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { getDriveFileMetadata, downloadJsonBackup } from '@/lib/googleDrive'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const { id } = await context.params
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, csvmeta_backup_file_id, csvmeta_restored_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) return NextResponse.json({ error: '対象の申請が見つかりませんでした。' }, { status: 404 })
  if (!contract.csvmeta_backup_file_id) {
    return NextResponse.json({ error: 'この申請にはバックアップが保存されていません。' }, { status: 404 })
  }

  try {
    const meta = await getDriveFileMetadata(contract.csvmeta_backup_file_id)
    return NextResponse.json({
      backedUpAt: meta.createdTime,
      lastRestoredAt: contract.csvmeta_restored_at,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'バックアップ情報の取得に失敗しました：' + (e?.message || '') }, { status: 502 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const { id } = await context.params
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, input_data, csvmeta_backup_file_id')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) return NextResponse.json({ error: '対象の申請が見つかりませんでした。' }, { status: 404 })
  if (!contract.csvmeta_backup_file_id) {
    return NextResponse.json({ error: 'この申請にはバックアップが保存されていません。' }, { status: 404 })
  }

  let restoredCsvMeta: any
  try {
    restoredCsvMeta = await downloadJsonBackup(contract.csvmeta_backup_file_id)
  } catch (e: any) {
    return NextResponse.json({ error: 'バックアップの取得に失敗しました：' + (e?.message || '') }, { status: 502 })
  }

  const now = new Date().toISOString()
  const newInputData = { ...(contract.input_data || {}), csvMeta: restoredCsvMeta }

  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      input_data: newInputData,
      csvmeta_restored_at: now,
      csvmeta_restored_by: auth.userId,
      updated_at: now,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: '復元の保存に失敗しました：' + updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, restoredAt: now })
}
