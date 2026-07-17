// ===== CSVインポート自動化：管理部ダッシュボード「CSVインポート」タブ用API =====
// 2026-07-15実装。9-1章タスク4（管理部ダッシュボード残り3タブ）のうち「CSVインポート」に対応。
//
// 【確定仕様（2026-07-15・伊藤さん決定）】
// ① 上書き方針：CSVを再取り込みして既存の契約キー（system_type+unique_key）と一致した場合、
//   上書きしてよい。ただし、その既存csv_raw_data行が「申請中もしくはそれ以降のステータス」
//   （＝差し戻し中・取り下げ以外）の契約から参照されている場合は、その行を勝手に上書きしない
//   （申請済みデータの保護。SSC確認画面のCSV差分表示の前提となるスナップショットを壊さないため）。
// ② CSVインポート依頼（requestsテーブル）の自動マッチは、社員番号（またはwinworksのcrew_code・
//   HRstationのF3810プレフィックス付き社員番号）＋派遣開始日に加えて、システム名（system_type）
//   も一致条件に含める（過去は社員番号＋日付のみだったが、他システムの偶然の一致を防ぐため追加）。
// ③ ②で自動マッチが成立した依頼は自動的に csv_import_status='completed' にし、依頼元の
//   担当営業へメール通知する（旧来の「CSV差異アラート」構想は伊藤さんの判断で簡略化し、
//   ①の申請済みデータ保護のみで足りるとされたため、別途のダッシュボード・通知は作らない）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { sendCsvImportMatchedMail } from '@/lib/mail'
import {
  ImportSystemKey,
  DbSystemType,
  parseCsvBuffer,
  buildRecordForUpsert,
  resolveCsvSearchStaffCode,
} from '@/lib/csvImportShared'
import { readExcelBuffer, buildStaffRecord } from '@/lib/staffMasterImportShared'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 画面から受け取るシステム指定（Staffiaのみ2ファイル、StaffExpressはスタッフ/部門マスタのExcel）
const UPLOAD_SYSTEMS = ['e-staffing', 'HRstation', 'winworks', 'Staffia', 'StaffExpress'] as const
type UploadSystem = typeof UPLOAD_SYSTEMS[number]

type FileCounts = {
  total: number
  newCount: number
  updatedCount: number
  pendingProtectedCount: number
  skippedNoKeyCount: number
  errorCount: number
}

// 1ファイル分のCSVを処理し、csv_raw_dataへ反映する（csv_importsの作成・更新は呼び出し元で行う）
async function processSingleFile(
  buffer: Buffer,
  importSystemKey: ImportSystemKey,
  dbSystemType: DbSystemType,
  importId: string
): Promise<FileCounts> {
  const rows = parseCsvBuffer(buffer)
  const counts: FileCounts = { total: rows.length, newCount: 0, updatedCount: 0, pendingProtectedCount: 0, skippedNoKeyCount: 0, errorCount: 0 }

  const parsedRows: { uniqueKey: string; record: NonNullable<ReturnType<typeof buildRecordForUpsert>['record']> }[] = []
  for (const row of rows) {
    const { uniqueKey, record } = buildRecordForUpsert(row, importSystemKey)
    if (!uniqueKey || !record) { counts.skippedNoKeyCount++; continue }
    parsedRows.push({ uniqueKey, record })
  }
  if (parsedRows.length === 0) return counts

  // 既存データの有無をまとめて確認（system_type + unique_key）
  const allKeys = parsedRows.map(r => r.uniqueKey)
  const existingByKey = new Map<string, string>() // unique_key -> id
  const CHUNK = 300
  for (let i = 0; i < allKeys.length; i += CHUNK) {
    const chunk = allKeys.slice(i, i + CHUNK)
    const { data: existingRows, error } = await supabaseAdmin
      .from('csv_raw_data')
      .select('id, unique_key')
      .eq('system_type', dbSystemType)
      .in('unique_key', chunk)
    if (error) { counts.errorCount += chunk.length; continue }
    for (const r of existingRows || []) existingByKey.set(r.unique_key, r.id)
  }

  // 既存データのうち、有効な契約（申請中以降のステータス）から参照されている行＝保護対象を洗い出す
  const existingIds = Array.from(new Set(existingByKey.values()))
  const protectedIds = new Set<string>()
  for (let i = 0; i < existingIds.length; i += CHUNK) {
    const chunk = existingIds.slice(i, i + CHUNK)
    const { data: refRows, error } = await supabaseAdmin
      .from('contracts')
      .select('csv_raw_data_id')
      .in('csv_raw_data_id', chunk)
      .neq('status', '差し戻し中')
      .neq('status', '取り下げ')
    if (error) continue // 保護判定に失敗した場合は安全側（保護しない＝上書き）に倒さず、対象から一旦除外する
    for (const r of refRows || []) { if (r.csv_raw_data_id) protectedIds.add(r.csv_raw_data_id) }
  }

  const upsertBatch: (typeof parsedRows[number]['record'] & { unique_key: string; import_id: string; is_overwrite_pending: boolean })[] = []
  for (const { uniqueKey, record } of parsedRows) {
    const existingId = existingByKey.get(uniqueKey)
    if (existingId && protectedIds.has(existingId)) {
      counts.pendingProtectedCount++
      continue
    }
    if (existingId) counts.updatedCount++
    else counts.newCount++
    upsertBatch.push({ ...record, unique_key: uniqueKey, import_id: importId, is_overwrite_pending: !!existingId })
  }

  for (let i = 0; i < upsertBatch.length; i += CHUNK) {
    const chunk = upsertBatch.slice(i, i + CHUNK)
    const { error } = await supabaseAdmin
      .from('csv_raw_data')
      .upsert(chunk, { onConflict: 'system_type,unique_key' })
    if (error) {
      // このチャンク分は書き込めなかったため、new/updatedへ計上した分を差し戻してエラーに計上する
      counts.errorCount += chunk.length
      counts.newCount -= chunk.filter(c => !c.is_overwrite_pending).length
      counts.updatedCount -= chunk.filter(c => c.is_overwrite_pending).length
    }
  }

  return counts
}

// ===== StaffExpress取込：部門マスタ・スタッフマスタ（2026-07-17実装） =====
// `scripts/import-master.js`のロジックをそのまま踏襲（lib/staffMasterImportShared.tsに
// 変換ロジックを切り出し済み）。伊藤さんとの確認により、上書き方針は「全件上書き
// （employee_numberキー）」：契約CSVと異なり保護対象という概念は無く、アップロードした
// Excelの内容で該当行を毎回まるごと上書きする（退職・異動等の最新状態をそのまま反映するため）。
// 部門マスタは staff.dept_no の外部キー参照元のため、必ず部門マスタを先に処理する
// （呼び出し側で順序を保証）。
type MasterImportCounts = { total: number; newCount: number; updatedCount: number; skippedCount: number; errorCount: number }

async function processDepartmentMasterFile(buffer: Buffer, uploadedBy: string): Promise<MasterImportCounts> {
  const rows = readExcelBuffer(buffer)
  const counts: MasterImportCounts = { total: rows.length, newCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0 }

  const { data: importRecord, error: importError } = await supabaseAdmin
    .from('master_imports')
    .insert({ master_type: 'department', file_name: '', total_rows: rows.length, uploaded_by: uploadedBy })
    .select()
    .single()
  if (importError || !importRecord) return counts

  for (const row of rows) {
    const deptNo = row['部門NO']
    const deptName = row['部門名1']
    if (deptNo === null || deptNo === undefined) { counts.skippedCount++; continue }

    const { data: existing } = await supabaseAdmin.from('department_master').select('id').eq('dept_no', deptNo).maybeSingle()
    if (existing) {
      const { error } = await supabaseAdmin.from('department_master').update({ dept_name: deptName }).eq('id', existing.id)
      if (error) counts.errorCount++; else counts.updatedCount++
    } else {
      const { error } = await supabaseAdmin.from('department_master').insert({ dept_no: deptNo, dept_name: deptName })
      if (error) counts.errorCount++; else counts.newCount++
    }
  }

  await supabaseAdmin.from('master_imports').update({
    new_rows: counts.newCount, updated_rows: counts.updatedCount, skipped_rows: counts.skippedCount, error_rows: counts.errorCount,
  }).eq('id', importRecord.id)

  return counts
}

async function processStaffMasterFile(buffer: Buffer, uploadedBy: string): Promise<MasterImportCounts> {
  const rows = readExcelBuffer(buffer)
  const counts: MasterImportCounts = { total: rows.length, newCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0 }

  const { data: importRecord, error: importError } = await supabaseAdmin
    .from('master_imports')
    .insert({ master_type: 'staff', file_name: '', total_rows: rows.length, uploaded_by: uploadedBy })
    .select()
    .single()
  if (importError || !importRecord) return counts

  for (const row of rows) {
    const record = buildStaffRecord(row)
    if (!record) { counts.skippedCount++; continue }

    const { data: existing } = await supabaseAdmin.from('staff').select('id').eq('employee_number', record.employee_number).maybeSingle()
    if (existing) {
      const { error } = await supabaseAdmin.from('staff').update({ ...record, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) counts.errorCount++; else counts.updatedCount++
    } else {
      const { error } = await supabaseAdmin.from('staff').insert(record)
      if (error) counts.errorCount++; else counts.newCount++
    }
  }

  await supabaseAdmin.from('master_imports').update({
    new_rows: counts.newCount, updated_rows: counts.updatedCount, skipped_rows: counts.skippedCount, error_rows: counts.errorCount,
  }).eq('id', importRecord.id)

  return counts
}

// CSVインポート依頼（requests）の自動マッチ・自動完了・通知
async function runAutoMatch(dbSystemType: DbSystemType, uploaderId: string) {
  const { data: pendingRequests, error } = await supabaseAdmin
    .from('requests')
    .select('id, staff_code, staff_name, client_name, dispatch_start_date, requested_by')
    .eq('csv_import_status', 'pending')
    .eq('system_type', dbSystemType)

  if (error || !pendingRequests || pendingRequests.length === 0) {
    return { matchedCount: 0, notifiedCount: 0, notifyErrors: [] as string[] }
  }

  let matchedCount = 0
  let notifiedCount = 0
  const notifyErrors: string[] = []

  // winworksの場合、社員番号→crew_codeの変換が必要なため、対象スタッフをまとめて引く
  const employeeNumbers = Array.from(new Set(pendingRequests.map(r => r.staff_code).filter(Boolean))) as string[]
  const { data: staffRows } = await supabaseAdmin
    .from('staff')
    .select('employee_number, crew_code')
    .in('employee_number', employeeNumbers)
  const crewCodeByEmpNo = new Map((staffRows || []).map(s => [s.employee_number, s.crew_code as string | null]))

  for (const req of pendingRequests) {
    if (!req.staff_code || !req.dispatch_start_date) continue
    const crewCode = crewCodeByEmpNo.get(req.staff_code) || null
    const searchCode = resolveCsvSearchStaffCode(dbSystemType, req.staff_code, crewCode)
    if (!searchCode) continue

    const { data: rowsFound } = await supabaseAdmin
      .from('csv_raw_data')
      .select('id')
      .eq('system_type', dbSystemType)
      .eq('staff_code', searchCode)
      .lte('dispatch_start', req.dispatch_start_date)
      .gte('dispatch_end', req.dispatch_start_date)
      .limit(1)

    if (!rowsFound || rowsFound.length === 0) continue

    const now = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('requests')
      .update({ csv_import_status: 'completed', csv_import_completed_at: now, csv_import_completed_by: uploaderId })
      .eq('id', req.id)
      .eq('csv_import_status', 'pending') // 二重マッチ防止の条件付き更新
    if (updateError) continue
    matchedCount++

    if (req.requested_by) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.requested_by)
        const toEmail = userData?.user?.email
        if (toEmail) {
          await sendCsvImportMatchedMail(toEmail, req.staff_name, req.client_name)
          notifiedCount++
        } else {
          notifyErrors.push(`依頼ID ${req.id}：依頼者のメールアドレスが見つかりませんでした`)
        }
      } catch (e: any) {
        notifyErrors.push(`依頼ID ${req.id}：通知メール送信エラー（${e?.message || ''}）`)
      }
    }
  }

  return { matchedCount, notifiedCount, notifyErrors }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'アップロード内容を読み取れませんでした。' }, { status: 400 })

  const system = (formData.get('system') as string) || ''
  if (!UPLOAD_SYSTEMS.includes(system as UploadSystem)) {
    return NextResponse.json({ error: 'システム名が不正です。' }, { status: 400 })
  }

  // ===== StaffExpress（スタッフマスタ・部門マスタ）は契約CSVと仕組みが異なるため別処理 =====
  // ・保存先が csv_raw_data ではなく department_master / staff（履歴は master_imports）。
  // ・上書き方針も「保護対象なし・全件上書き」で、依頼の自動マッチ（requests連携）も対象外。
  // ・部門マスタは staff.dept_no の参照元のため、両ファイルとも指定された場合は必ず部門→スタッフの順で処理する。
  if (system === 'StaffExpress') {
    const fileDept = formData.get('fileDept') as File | null
    const fileStaff = formData.get('fileStaff') as File | null
    if (!fileDept && !fileStaff) {
      return NextResponse.json({ error: '部門マスタ・スタッフマスタのうち、少なくとも一方のファイルを選択してください。' }, { status: 400 })
    }
    try {
      const fileNames: string[] = []
      let deptResult: MasterImportCounts | null = null
      let staffResult: MasterImportCounts | null = null
      if (fileDept) {
        const buf = Buffer.from(await fileDept.arrayBuffer())
        fileNames.push(fileDept.name)
        deptResult = await processDepartmentMasterFile(buf, auth.userId)
      }
      if (fileStaff) {
        const buf = Buffer.from(await fileStaff.arrayBuffer())
        fileNames.push(fileStaff.name)
        staffResult = await processStaffMasterFile(buf, auth.userId)
      }
      return NextResponse.json({
        success: true,
        fileNames,
        staffExpressResult: {
          department: deptResult,
          staff: staffResult,
        },
      })
    } catch (e: any) {
      return NextResponse.json({ error: 'Excelの読み込み・保存中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
    }
  }

  const fileNames: string[] = []
  let combinedTotal = 0, combinedNew = 0, combinedUpdated = 0, combinedProtected = 0, combinedSkipped = 0, combinedError = 0

  // csv_importsの履歴レコードを先に作成（総行数は後で更新）
  const { data: importRecord, error: importInsertError } = await supabaseAdmin
    .from('csv_imports')
    .insert({ system_type: system, file_name: '', total_rows: 0, uploaded_by: auth.userId })
    .select()
    .single()
  if (importInsertError || !importRecord) {
    return NextResponse.json({ error: 'インポート履歴の作成に失敗しました：' + (importInsertError?.message || '') }, { status: 500 })
  }

  try {
    if (system === 'Staffia') {
      const file103 = formData.get('file103') as File | null
      const file104 = formData.get('file104') as File | null
      if (!file103 || !file104) {
        return NextResponse.json({ error: 'Staffiaは契約詳細（KEF00103）・スタッフ個人/派遣期間（KEF00104）の両ファイルが必要です。' }, { status: 400 })
      }
      const buf103 = Buffer.from(await file103.arrayBuffer())
      const buf104 = Buffer.from(await file104.arrayBuffer())
      fileNames.push(file103.name, file104.name)

      const result103 = await processSingleFile(buf103, 'Staffia103', 'Staffia', importRecord.id)
      const result104 = await processSingleFile(buf104, 'Staffia104', 'Staffia', importRecord.id)
      for (const r of [result103, result104]) {
        combinedTotal += r.total; combinedNew += r.newCount; combinedUpdated += r.updatedCount
        combinedProtected += r.pendingProtectedCount; combinedSkipped += r.skippedNoKeyCount; combinedError += r.errorCount
      }
    } else {
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'ファイルが選択されていません。' }, { status: 400 })
      const buf = Buffer.from(await file.arrayBuffer())
      fileNames.push(file.name)
      const result = await processSingleFile(buf, system as ImportSystemKey, system as DbSystemType, importRecord.id)
      combinedTotal = result.total; combinedNew = result.newCount; combinedUpdated = result.updatedCount
      combinedProtected = result.pendingProtectedCount; combinedSkipped = result.skippedNoKeyCount; combinedError = result.errorCount
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'CSVの読み込み・保存中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
  }

  await supabaseAdmin
    .from('csv_imports')
    .update({
      file_name: fileNames.join(' + '),
      total_rows: combinedTotal,
      new_rows: combinedNew,
      updated_rows: combinedUpdated,
      pending_rows: combinedProtected,
      skipped_rows: combinedSkipped,
      error_rows: combinedError,
    })
    .eq('id', importRecord.id)

  const autoMatchResult = await runAutoMatch(system as DbSystemType, auth.userId)

  return NextResponse.json({
    success: true,
    importId: importRecord.id,
    fileNames,
    counts: {
      total: combinedTotal,
      new: combinedNew,
      updated: combinedUpdated,
      protectedSkipped: combinedProtected,
      skippedNoKey: combinedSkipped,
      error: combinedError,
    },
    autoMatch: autoMatchResult,
  })
}
