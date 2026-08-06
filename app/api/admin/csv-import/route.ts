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
import { sendCsvImportMatchedMail, sendStaffRegisterMatchedMail } from '@/lib/mail'
import { resolveRequesterNotifyEmail } from '@/lib/mailingList'
import {
  ImportSystemKey,
  DbSystemType,
  parseCsvBuffer,
  buildRecordForUpsert,
  resolveCsvSearchStaffCode,
  ProtectedRowDetail,
} from '@/lib/csvImportShared'
import { readExcelBuffer, buildStaffRecord, normalizeStaffNameForCompare, buildArchivedEmployeeNumber } from '@/lib/staffMasterImportShared'
import { friendlyDbReason } from '@/lib/friendlyError'

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
  errorDetails: string[]
  protectedDetails: ProtectedRowDetail[]
}

// エラー詳細メッセージが際限なく長くなるのを防ぐため、保存件数の上限とその旨の注記を統一するヘルパー
const MAX_ERROR_DETAIL_LINES = 20
function buildErrorDetailText(details: string[]): string | null {
  if (details.length === 0) return null
  const shown = details.slice(0, MAX_ERROR_DETAIL_LINES)
  const rest = details.length - shown.length
  return shown.join('\n') + (rest > 0 ? `\n…ほか${rest}件のエラー` : '')
}

// 1ファイル分のCSVを処理し、csv_raw_dataへ反映する（csv_importsの作成・更新は呼び出し元で行う）
async function processSingleFile(
  buffer: Buffer,
  importSystemKey: ImportSystemKey,
  dbSystemType: DbSystemType,
  importId: string
): Promise<FileCounts> {
  const rows = parseCsvBuffer(buffer)
  const counts: FileCounts = { total: rows.length, newCount: 0, updatedCount: 0, pendingProtectedCount: 0, skippedNoKeyCount: 0, errorCount: 0, errorDetails: [], protectedDetails: [] }

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
    if (error) { counts.errorCount += chunk.length; counts.errorDetails.push(`既存データ確認エラー（${chunk.length}件分）：${friendlyDbReason(error)}`); continue }
    for (const r of existingRows || []) existingByKey.set(r.unique_key, r.id)
  }

  // 既存データのうち、有効な契約（申請中以降のステータス）から参照されている行＝保護対象を洗い出す
  // 2026-07-29デモ指摘②：保護理由の可視化のため、単なるSetではなく、保護している契約の
  // ステータス・申請者名・対象スタッフ（staff_id）まで保持するMapに変更。
  const existingIds = Array.from(new Set(existingByKey.values()))
  const protectedByRawId = new Map<string, { status: string | null; createdByName: string | null; staffId: string | null }>()
  // C-04対応（2026-08-06）：以前は保護判定クエリが失敗した場合`continue`するだけで、
  // 該当existingIdをprotectedByRawIdへ登録し損ねていた。コメントは「安全側（保護しない＝
  // 上書き）に倒さない」と書いていたが、実装は後続の「保護対象でなければ上書き」という
  // 判定にそのまま素通りしてしまい、実際には上書きされていた（コメントと実装の食い違い）。
  // 正しい安全側の挙動として、判定に失敗したexistingIdを別途記録し、該当するCSV行は
  // 「保護対象かどうか判定できなかったため今回は上書きしない」としてスキップする。
  const protectionCheckFailedIds = new Set<string>()
  for (let i = 0; i < existingIds.length; i += CHUNK) {
    const chunk = existingIds.slice(i, i + CHUNK)
    const { data: refRows, error } = await supabaseAdmin
      .from('contracts')
      .select('csv_raw_data_id, status, created_by_name, staff_id')
      .in('csv_raw_data_id', chunk)
      .neq('status', '差し戻し中')
      .neq('status', '取り下げ')
    if (error) {
      for (const rawId of chunk) protectionCheckFailedIds.add(rawId)
      continue
    }
    for (const r of refRows || []) {
      if (r.csv_raw_data_id && !protectedByRawId.has(r.csv_raw_data_id)) {
        protectedByRawId.set(r.csv_raw_data_id, { status: r.status, createdByName: r.created_by_name, staffId: r.staff_id })
      }
    }
  }

  // 保護対象スタッフの氏名・所属部門名をまとめて解決（詳細レポート用）
  const protectedStaffIds = Array.from(new Set(Array.from(protectedByRawId.values()).map(v => v.staffId).filter((v): v is string => !!v)))
  const staffById = new Map<string, { employeeNumber: string; name: string; deptNo: number | null }>()
  if (protectedStaffIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from('staff')
      .select('id, employee_number, name, dept_no')
      .in('id', protectedStaffIds)
    for (const s of staffRows || []) staffById.set(s.id, { employeeNumber: s.employee_number, name: s.name, deptNo: s.dept_no })
  }
  const protectedDeptNos = Array.from(new Set(Array.from(staffById.values()).map(v => v.deptNo).filter((v): v is number => v !== null)))
  const deptNameByNo = new Map<number, string>()
  if (protectedDeptNos.length > 0) {
    const { data: deptRows } = await supabaseAdmin
      .from('department_master')
      .select('dept_no, dept_name')
      .in('dept_no', protectedDeptNos)
    for (const d of deptRows || []) deptNameByNo.set(d.dept_no, d.dept_name)
  }

  const upsertBatch: (typeof parsedRows[number]['record'] & { unique_key: string; import_id: string; is_overwrite_pending: boolean })[] = []
  for (const { uniqueKey, record } of parsedRows) {
    const existingId = existingByKey.get(uniqueKey)
    // C-04対応（2026-08-06）：既存契約からの参照有無（＝上書き保護が必要か）を判定できなかった行は、
    // 安全側に倒して今回は上書きしない（スキップしてエラー扱いにする）。判定できたが保護対象でない
    // 場合とは区別する。
    if (existingId && protectionCheckFailedIds.has(existingId)) {
      counts.errorCount++
      counts.errorDetails.push(
        `${record.client_name || record.work_location || '（就業場所不明）'}：既存申請からの参照有無（上書き保護の要否）を確認できなかったため、安全のため今回は上書きしませんでした。再度インポートをお試しください。`
      )
      continue
    }
    const protectedInfo = existingId ? protectedByRawId.get(existingId) : undefined
    if (existingId && protectedInfo) {
      counts.pendingProtectedCount++
      const staffInfo = protectedInfo.staffId ? staffById.get(protectedInfo.staffId) : undefined
      const deptName = staffInfo?.deptNo != null ? (deptNameByNo.get(staffInfo.deptNo) || null) : null
      counts.protectedDetails.push({
        systemName: dbSystemType,
        deptName,
        staffNo: staffInfo?.employeeNumber || null,
        staffName: staffInfo?.name || null,
        dispatchStart: record.dispatch_start,
        dispatchEnd: record.dispatch_end,
        workLocation: record.client_name || record.work_location,
        reason: `既存の申請（ステータス：${protectedInfo.status || '不明'}）から参照されているため、CSVの内容で上書きされませんでした`,
        blockingStatus: protectedInfo.status,
        blockingApplicantName: protectedInfo.createdByName,
      })
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
      counts.errorDetails.push(`保存エラー（${chunk.length}件分）：${friendlyDbReason(error)}`)
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
// C-08対応：氏名不一致で「別人への再割当」と判定しアーカイブ処理した件数（reassignedCount）、
// 氏名不一致だが既存が現役のため自動処理せずスキップした件数・詳細（needsReview系）を追加。
// reassignedCountはnewCountにも重複計上する（新規UUID行が実際に1件増えるため）が、
// 区別して見せることで伊藤さん・管理部が「本当に新規なのか、再割当なのか」を判別できるようにする。
type MasterImportCounts = {
  total: number
  newCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errorDetails: string[]
  reassignedCount: number
  needsReviewCount: number
  needsReviewDetails: { employeeNumber: string; oldName: string; newName: string }[]
}

async function processDepartmentMasterFile(buffer: Buffer, uploadedBy: string): Promise<MasterImportCounts> {
  const rows = readExcelBuffer(buffer)
  const counts: MasterImportCounts = { total: rows.length, newCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errorDetails: [], reassignedCount: 0, needsReviewCount: 0, needsReviewDetails: [] }

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
      if (error) { counts.errorCount++; counts.errorDetails.push(`部門NO ${deptNo}（${deptName}）の更新に失敗：${friendlyDbReason(error)}`) } else counts.updatedCount++
    } else {
      const { error } = await supabaseAdmin.from('department_master').insert({ dept_no: deptNo, dept_name: deptName })
      if (error) { counts.errorCount++; counts.errorDetails.push(`部門NO ${deptNo}（${deptName}）の新規登録に失敗：${friendlyDbReason(error)}`) } else counts.newCount++
    }
  }

  await supabaseAdmin.from('master_imports').update({
    new_rows: counts.newCount, updated_rows: counts.updatedCount, skipped_rows: counts.skippedCount, error_rows: counts.errorCount,
    error_detail: buildErrorDetailText(counts.errorDetails),
  }).eq('id', importRecord.id)

  return counts
}

// 2026-07-21改修：実データ規模（約1780件）で1行ずつSELECT→UPDATE/INSERTを行う旧実装は
// Vercelの関数タイムアウトに抵触するリスクがあったため、processSingleFile（契約CSV取込）と
// 同じ「まとめて既存確認→JS側で分類→チャンク単位でupsert」方式に統一した。
// あわせて、今回のStaffExpressエクスポートにSBクルーコード列が含まれていない問題（伊藤さん指摘）
// にも対応：新しいファイルのSBクルーコードが空欄の場合は、DBに既にある値を保持し、
// 値が入っている場合のみ上書きする（既存157件のcrew_codeを消さないための必須対応）。
async function processStaffMasterFile(buffer: Buffer, uploadedBy: string): Promise<MasterImportCounts> {
  const rows = readExcelBuffer(buffer)
  const counts: MasterImportCounts = { total: rows.length, newCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errorDetails: [], reassignedCount: 0, needsReviewCount: 0, needsReviewDetails: [] }

  const { data: importRecord, error: importError } = await supabaseAdmin
    .from('master_imports')
    .insert({ master_type: 'staff', file_name: '', total_rows: rows.length, uploaded_by: uploadedBy })
    .select()
    .single()
  if (importError || !importRecord) return counts

  const parsedRecords: NonNullable<ReturnType<typeof buildStaffRecord>>[] = []
  for (const row of rows) {
    const record = buildStaffRecord(row)
    if (!record) { counts.skippedCount++; continue }
    parsedRecords.push(record)
  }

  const CHUNK = 300

  // 既存データ（id・crew_code・氏名・退職年月日）をまとめて取得。
  // 氏名・退職年月日はC-08対応（社員番号の再利用検知）に必要。
  const existingMap = new Map<string, { id: string; crew_code: string | null; name: string; retired_at: string | null }>()
  const allEmployeeNumbers = parsedRecords.map(r => r.employee_number)
  for (let i = 0; i < allEmployeeNumbers.length; i += CHUNK) {
    const chunk = allEmployeeNumbers.slice(i, i + CHUNK)
    const { data: existingRows, error } = await supabaseAdmin
      .from('staff')
      .select('id, employee_number, crew_code, name, retired_at')
      .in('employee_number', chunk)
    if (error) {
      counts.errorCount += chunk.length
      counts.errorDetails.push(`既存データ確認エラー（${chunk.length}件分）：${friendlyDbReason(error)}`)
      continue
    }
    for (const r of existingRows || []) existingMap.set(r.employee_number, { id: r.id, crew_code: r.crew_code, name: r.name, retired_at: r.retired_at })
  }

  // ===== C-08対応：社員番号の再利用（退職者番号を新入社員へ再割当）検知 =====
  // 同じemployee_numberの既存行が見つかっても、氏名が一致しなければ「同一人物の更新」とは
  // 見なさない。その場合：
  //  ・既存行が退職済み（retired_at設定済み）→ 正当な再割当とみなし、既存行のemployee_numberを
  //    リネームして退避（archived_at記録）。前任者の契約・誓約書はarchivedになった旧staff.idの
  //    ままなので履歴は保全され、今回のCSV行は新規UUIDの行として登録される
  //    （＝マイページは新入社員について完全に空の状態からスタートする）。
  //  ・既存行が現役（retired_atがNULL）→ データ異常の疑いがあるため自動処理せずスキップし、
  //    「要確認」として管理部に報告する（人手での判断に委ねる）。
  const now = new Date().toISOString()
  const reassignTargets: { employeeNumber: string; existingId: string }[] = []
  const skippedRecords = new Set<number>() // parsedRecords内のインデックス

  for (let idx = 0; idx < parsedRecords.length; idx++) {
    const record = parsedRecords[idx]
    const existing = existingMap.get(record.employee_number)
    if (!existing) continue // 新規登録：問題なし

    const sameName = normalizeStaffNameForCompare(existing.name) === normalizeStaffNameForCompare(record.name)
    if (sameName) continue // 同一人物の更新：問題なし

    if (existing.retired_at) {
      reassignTargets.push({ employeeNumber: record.employee_number, existingId: existing.id })
    } else {
      skippedRecords.add(idx)
      counts.needsReviewCount++
      counts.needsReviewDetails.push({ employeeNumber: record.employee_number, oldName: existing.name, newName: record.name || '' })
    }
  }

  // 再割当対象の旧行をリネームして退避（employee_numberのUNIQUE制約に抵触しないよう、
  // 通常のupsertより前に個別UPDATEで処理する）
  for (const target of reassignTargets) {
    const { error } = await supabaseAdmin
      .from('staff')
      .update({
        employee_number: buildArchivedEmployeeNumber(target.employeeNumber),
        archived_at: now,
        archived_original_employee_number: target.employeeNumber,
      })
      .eq('id', target.existingId)
    if (error) {
      // 退避に失敗した場合、このemployee_numberはまだ旧行が握ったままのため、
      // 今回のCSV行は upsert に回さず「要確認」に落として安全側に倒す
      const record = parsedRecords.find(r => r.employee_number === target.employeeNumber)
      counts.errorCount++
      counts.errorDetails.push(`社員番号${target.employeeNumber}の再割当（旧データの退避）に失敗：${friendlyDbReason(error)}`)
      counts.needsReviewCount++
      counts.needsReviewDetails.push({ employeeNumber: target.employeeNumber, oldName: existingMap.get(target.employeeNumber)?.name || '', newName: record?.name || '' })
      existingMap.delete(target.employeeNumber) // 下のupsert対象外にするため、既存フラグ判定から外す
      const idx = parsedRecords.findIndex(r => r.employee_number === target.employeeNumber)
      if (idx >= 0) skippedRecords.add(idx)
    } else {
      // 退避成功：existingMapから外すことで、以降このemployee_numberは「新規」として扱われる
      existingMap.delete(target.employeeNumber)
    }
  }

  const upsertBatch: (NonNullable<ReturnType<typeof buildStaffRecord>> & { updated_at: string })[] = []
  const isExistingFlags: boolean[] = []
  const isReassignedFlags: boolean[] = []
  for (let idx = 0; idx < parsedRecords.length; idx++) {
    if (skippedRecords.has(idx)) continue // 要確認としてスキップした行は取込しない
    const record = parsedRecords[idx]
    const existing = existingMap.get(record.employee_number)
    // SBクルーコードが今回のファイルで空欄の場合、既存値があればそれを保持する（伊藤さん指示・2026-07-21）
    const crewCode = record.crew_code || existing?.crew_code || null
    upsertBatch.push({ ...record, crew_code: crewCode, updated_at: now })
    isExistingFlags.push(!!existing)
    isReassignedFlags.push(reassignTargets.some(t => t.employeeNumber === record.employee_number))
  }

  for (let i = 0; i < upsertBatch.length; i += CHUNK) {
    const chunk = upsertBatch.slice(i, i + CHUNK)
    const flags = isExistingFlags.slice(i, i + CHUNK)
    const reassignFlags = isReassignedFlags.slice(i, i + CHUNK)
    const { error } = await supabaseAdmin
      .from('staff')
      .upsert(chunk, { onConflict: 'employee_number' })
    if (error) {
      counts.errorCount += chunk.length
      counts.errorDetails.push(`保存エラー（${chunk.length}件分）：${friendlyDbReason(error)}`)
    } else {
      for (let j = 0; j < flags.length; j++) {
        if (flags[j]) counts.updatedCount++
        else {
          counts.newCount++
          if (reassignFlags[j]) counts.reassignedCount++
        }
      }
    }
  }

  await supabaseAdmin.from('master_imports').update({
    new_rows: counts.newCount, updated_rows: counts.updatedCount, skipped_rows: counts.skippedCount, error_rows: counts.errorCount,
    error_detail: buildErrorDetailText(counts.errorDetails),
    reassigned_rows: counts.reassignedCount,
    needs_review_rows: counts.needsReviewCount,
    needs_review_detail: counts.needsReviewDetails.length > 0 ? counts.needsReviewDetails : null,
  }).eq('id', importRecord.id)

  return counts
}

// スタッフマスタ登録依頼（requests.staff_register_status='pending'）の自動マッチ・自動完了・通知
// （2026-07-21新規実装。過去に「STEP1/2の依頼をrequestsへ保存する」対応＝2026-07-02決定・
// staff_register_completed_at/byカラムの事前用意まで済んでいたが、自動完了処理自体は
// これまで一度も実装されていなかった機能ギャップだったため、今回のスタッフマスタ取込と
// 同じタイミングで実装した）。
async function runStaffRegisterAutoMatch(uploaderId: string) {
  // 2026-07-31：完了通知メールの項目網羅（伊藤さん指摘）のため、staff_dept・staff_hire_date・
  // requested_by_name・requested_by_dept を追加取得。
  const { data: pendingRequests, error } = await supabaseAdmin
    .from('requests')
    .select('id, staff_code, staff_name, staff_dept, staff_hire_date, requested_by, requested_by_name, requested_by_dept')
    .eq('staff_register_status', 'pending')

  if (error || !pendingRequests || pendingRequests.length === 0) {
    return { matchedCount: 0, notifiedCount: 0, notifyErrors: [] as string[] }
  }

  let matchedCount = 0
  let notifiedCount = 0
  const notifyErrors: string[] = []

  const employeeNumbers = Array.from(new Set(pendingRequests.map(r => r.staff_code).filter(Boolean))) as string[]
  const { data: staffRows } = await supabaseAdmin
    .from('staff')
    .select('employee_number')
    .in('employee_number', employeeNumbers)
  const registeredNumbers = new Set((staffRows || []).map(s => s.employee_number))

  for (const req of pendingRequests) {
    if (!req.staff_code || !registeredNumbers.has(req.staff_code)) continue

    const now = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('requests')
      .update({ staff_register_status: 'completed', staff_register_completed_at: now, staff_register_completed_by: uploaderId })
      .eq('id', req.id)
      .eq('staff_register_status', 'pending') // 二重マッチ防止の条件付き更新
    if (updateError) continue
    matchedCount++

    if (req.requested_by) {
      try {
        // 2026-07-31変更：依頼者個人のアカウントに直接送るのではなく、依頼者の所属部署の
        // メーリングリストが登録されていればそちらへ送る（未登録なら従来通り個人宛）。
        const toEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || await resolveRequesterNotifyEmail(req.requested_by)
        if (toEmail) {
          await sendStaffRegisterMatchedMail(toEmail, {
            staffName: req.staff_name,
            staffCode: req.staff_code,
            staffDept: req.staff_dept,
            staffHireDate: req.staff_hire_date,
            requestedByName: req.requested_by_name,
            requestedByDept: req.requested_by_dept,
          })
          notifiedCount++
        } else {
          notifyErrors.push(`依頼ID ${req.id}：依頼者の通知先メールアドレスが見つかりませんでした`)
        }
      } catch (e: any) {
        notifyErrors.push(`依頼ID ${req.id}：通知メール送信エラー（${e?.message || ''}）`)
      }
    }
  }

  return { matchedCount, notifiedCount, notifyErrors }
}

// CSVインポート依頼（requests）の自動マッチ・自動完了・通知
async function runAutoMatch(dbSystemType: DbSystemType, uploaderId: string) {
  // 2026-07-31：完了通知メールの項目網羅（伊藤さん指摘）のため、staff_dept・system_type・
  // requested_by_name・requested_by_dept を追加取得。
  const { data: pendingRequests, error } = await supabaseAdmin
    .from('requests')
    .select('id, staff_code, staff_name, staff_dept, client_name, system_type, dispatch_start_date, requested_by, requested_by_name, requested_by_dept')
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
        // 2026-07-31変更：依頼者個人のアカウントに直接送るのではなく、依頼者の所属部署の
        // メーリングリストが登録されていればそちらへ送る（未登録なら従来通り個人宛）。
        const toEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || await resolveRequesterNotifyEmail(req.requested_by)
        if (toEmail) {
          await sendCsvImportMatchedMail(toEmail, {
            staffName: req.staff_name,
            staffCode: req.staff_code,
            staffDept: req.staff_dept,
            workLocationName: req.client_name,
            systemType: req.system_type,
            dispatchStartDate: req.dispatch_start_date,
            requestedByName: req.requested_by_name,
            requestedByDept: req.requested_by_dept,
          })
          notifiedCount++
        } else {
          notifyErrors.push(`依頼ID ${req.id}：依頼者の通知先メールアドレスが見つかりませんでした`)
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
  // ・上書き方針も「保護対象なし・全件上書き」で、requests連携は「スタッフ登録依頼」の自動マッチのみ対象。
  // ・部門マスタは staff.dept_no の参照元のため、両ファイルとも指定された場合は必ず部門→スタッフの順で処理する。
  // ・2026-07-23追加：winworksのみ社員番号でなくstaff.crew_code経由でCSVと紐づくため、スタッフ登録済み・
  //   winworksのCSVデータも既に存在するのにcrew_code未反映だった、という理由で「CSVインポート依頼」が
  //   宙ぶらりんのまま残るケースが判明。runAutoMatch自体はマッチ判定のたびにcrew_codeを引き直す設計に
  //   なっているため、ここでも呼び出すことで、crew_code反映後に既存の未解消winworks依頼を解消できる。
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
      let staffRegisterAutoMatch: { matchedCount: number; notifiedCount: number; notifyErrors: string[] } | null = null
      let winworksCrewCodeAutoMatch: { matchedCount: number; notifiedCount: number; notifyErrors: string[] } | null = null
      if (fileStaff) {
        const buf = Buffer.from(await fileStaff.arrayBuffer())
        fileNames.push(fileStaff.name)
        staffResult = await processStaffMasterFile(buf, auth.userId)
        staffRegisterAutoMatch = await runStaffRegisterAutoMatch(auth.userId)
        // crew_codeが今回新たに反映されたことで解消できるようになったwinworksのCSVインポート依頼がないか再判定する
        winworksCrewCodeAutoMatch = await runAutoMatch('winworks', auth.userId)
      }
      return NextResponse.json({
        success: true,
        fileNames,
        winworksCrewCodeAutoMatch,
        staffExpressResult: {
          department: deptResult,
          staff: staffResult,
        },
        staffRegisterAutoMatch,
      })
    } catch (e: any) {
      return NextResponse.json({ error: 'Excelの読み込み・保存中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
    }
  }

  const fileNames: string[] = []
  let combinedTotal = 0, combinedNew = 0, combinedUpdated = 0, combinedProtected = 0, combinedSkipped = 0, combinedError = 0
  const combinedErrorDetails: string[] = []
  const combinedProtectedDetails: ProtectedRowDetail[] = []

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
        combinedErrorDetails.push(...r.errorDetails)
        combinedProtectedDetails.push(...r.protectedDetails)
      }
    } else {
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'ファイルが選択されていません。' }, { status: 400 })
      const buf = Buffer.from(await file.arrayBuffer())
      fileNames.push(file.name)
      const result = await processSingleFile(buf, system as ImportSystemKey, system as DbSystemType, importRecord.id)
      combinedTotal = result.total; combinedNew = result.newCount; combinedUpdated = result.updatedCount
      combinedProtected = result.pendingProtectedCount; combinedSkipped = result.skippedNoKeyCount; combinedError = result.errorCount
      combinedErrorDetails.push(...result.errorDetails)
      combinedProtectedDetails.push(...result.protectedDetails)
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
      error_detail: buildErrorDetailText(combinedErrorDetails),
      protected_detail: combinedProtectedDetails.length > 0 ? combinedProtectedDetails : null,
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
