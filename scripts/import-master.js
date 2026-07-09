/**
 * スタッフマスタ・部門マスタ インポートスクリプト
 *
 * StaffExpressからエクスポートした「スタッフマスタ.xlsx」「部門マスタ.xlsx」を読み込み、
 * Supabaseの staff テーブル・department_master テーブルに取り込む。
 *
 * 【実行方法】
 * 1. 必ず先に部門マスタを取り込む
 *    （staff.dept_no が department_master.dept_no を外部キー参照するため、
 *      部門マスタが未登録だとスタッフのインポートがエラーになる）
 *    node scripts/import-master.js department ./部門マスタ.xlsx <アップロードユーザーID>
 *
 * 2. 次にスタッフマスタを取り込む
 *    node scripts/import-master.js staff ./スタッフマスタ.xlsx <アップロードユーザーID>
 *
 * 【2026-07-09変更】
 * ・住所（staff.address）の取込を追加。StaffExpressエクスポートの「現在住所(住所1)」
 *   「現在住所(住所2)」「現在住所(住所3)」の3列を半角スペースで結合して1つの文字列にする
 *   （住所2・3は建物名・部屋番号等で空欄のことが多いため、空欄の列は詰めて結合する）。
 *   docs/SYSTEM_DESIGN.md 6章の確定仕様を「対象外」から「取込む」に変更（伊藤さんの実データ
 *   確認・承認済み）。
 * ・クルーコード列のキー名を実データに合わせて修正。旧コードは 'クルーコード' というキーで
 *   読んでいたが、実際のヘッダーは 'SBクルーコード' だったため、これまでの再インポートでは
 *   常にnullになり、既存のcrew_codeを意図せず上書きしていた可能性がある不具合を修正。
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ===== 雇用形態：区分マスタNO → contract_type 変換表（確定仕様） =====
const CONTRACT_TYPE_MAP = {
  '0001': '正社員',
  '0002': '有期契約',
  '0003': '無期契約',
  '0004': 'アルバイト',
  '0005': null, // 外注（協力会社）→ インポート対象外
  '0006': null, // 役員 → インポート対象外
  '0007': null, // ログイン専用 → インポート対象外
  '0008': '正社員',
  '0009': '有期契約',
  '0010': '無期契約',
}
const SKIP_CONTRACT_CODES = ['0005', '0006', '0007'] // これらの区分はインポート自体をスキップする

// ===== ユーティリティ =====

// 社員番号を6桁ゼロ埋めにする
function padEmployeeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  return String(value).trim().padStart(6, '0')
}

// 雇用形態コードを4桁の文字列に正規化する（0001, 0004 等）
function normalizeContractCode(value) {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (str === '-1') return '-1'
  return str.padStart(4, '0')
}

// Excelの日付シリアル値や文字列をYYYY-MM-DD形式に変換
//
// 【2026-07-09重大バグ修正】以前は value.toISOString().split('T')[0] としていたが、
// xlsxライブラリ（cellDates:true）はExcelのシリアル値を「その日の日本時間0時」を表すDate
// オブジェクトとして生成する。toISOString()はUTCに変換してから文字列化するため、日本時間は
// UTC+9のぶんだけ巻き戻り、日付が1日早くずれてしまっていた（例：2005/02/13 → 2005-02-12）。
// 生年月日はスタッフ本人確認（/sign/[id]）に使われるため、実際の生年月日を入力すると
// 本人確認に失敗する状態になっていた（伊藤さん実機テストで発覚）。
// 修正：toISOString()（UTC変換）ではなく、Dateオブジェクトのローカルgetter
// （getFullYear/getMonth/getDate）を使い、タイムゾーン変換を発生させないようにする。
function excelDateToISO(value) {
  if (!value) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const mo = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  // 文字列形式（"20xx/xx/xx" 等）の場合
  const str = String(value).trim()
  const m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// 現在住所(住所1)(住所2)(住所3)の3列を、空欄を詰めて半角スペース区切りで結合する
function buildAddress(row) {
  const parts = [row['現在住所(住所1)'], row['現在住所(住所2)'], row['現在住所(住所3)']]
    .map(v => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(v => v.length > 0)
  return parts.length > 0 ? parts.join(' ') : null
}

function readExcel(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

// ===== 部門マスタのインポート =====
async function importDepartment(filePath, uploadedBy) {
  console.log(`📂 ${filePath} を読み込みます（部門マスタ）...`)
  const rows = readExcel(filePath)
  console.log(`📊 ${rows.length} 行を検出しました`)

  const { data: importRecord, error: importError } = await supabase
    .from('master_imports')
    .insert({
      master_type: 'department',
      file_name: filePath.split('/').pop(),
      total_rows: rows.length,
      uploaded_by: uploadedBy,
    })
    .select()
    .single()

  if (importError) {
    console.error('❌ master_imports への登録に失敗しました:', importError.message)
    process.exit(1)
  }

  let newCount = 0
  let updatedCount = 0
  let errorCount = 0

  for (const row of rows) {
    const deptNo = row['部門NO']
    const deptName = row['部門名1']
    if (deptNo === null || deptNo === undefined) continue

    const { data: existing } = await supabase
      .from('department_master')
      .select('id')
      .eq('dept_no', deptNo)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('department_master')
        .update({ dept_name: deptName })
        .eq('id', existing.id)
      if (error) { errorCount++; console.error('⚠️ 更新エラー:', error.message) }
      else updatedCount++
    } else {
      const { error } = await supabase
        .from('department_master')
        .insert({ dept_no: deptNo, dept_name: deptName })
      if (error) { errorCount++; console.error('⚠️ 挿入エラー:', error.message) }
      else newCount++
    }
  }

  await supabase
    .from('master_imports')
    .update({ new_rows: newCount, updated_rows: updatedCount, error_rows: errorCount })
    .eq('id', importRecord.id)

  console.log('')
  console.log('===== 部門マスタ インポート結果 =====')
  console.log(`新規登録: ${newCount}件`)
  console.log(`更新: ${updatedCount}件`)
  console.log(`エラー: ${errorCount}件`)
  console.log('======================================')
}

// ===== スタッフマスタのインポート =====
async function importStaff(filePath, uploadedBy) {
  console.log(`📂 ${filePath} を読み込みます（スタッフマスタ）...`)
  const rows = readExcel(filePath)
  console.log(`📊 ${rows.length} 行を検出しました`)

  const { data: importRecord, error: importError } = await supabase
    .from('master_imports')
    .insert({
      master_type: 'staff',
      file_name: filePath.split('/').pop(),
      total_rows: rows.length,
      uploaded_by: uploadedBy,
    })
    .select()
    .single()

  if (importError) {
    console.error('❌ master_imports への登録に失敗しました:', importError.message)
    process.exit(1)
  }

  let newCount = 0
  let updatedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const row of rows) {
    const rawStaffNo = String(row['スタッフNO'] || '').trim()
    const employeeNumber = padEmployeeNumber(row['スタッフNO'])
    if (!employeeNumber) {
      skippedCount++
      continue
    }

    // 社員番号の頭文字が「8」（ログイン専用）または「9」（社外社員・外注）の場合はインポート対象外
    // 雇用形態コードの値とは関係なく、社員番号の頭文字だけで判定する（確定仕様）
    if (rawStaffNo.startsWith('8') || rawStaffNo.startsWith('9')) {
      skippedCount++
      continue
    }

    const contractCode = normalizeContractCode(row['雇用形態'])

    // 区分NO 0005・0006・0007（外注・役員・ログイン専用）はインポート対象外
    if (contractCode && SKIP_CONTRACT_CODES.includes(contractCode)) {
      skippedCount++
      continue
    }

    const contractType = contractCode ? CONTRACT_TYPE_MAP[contractCode] : null // -1や未定義はnull（雇用形態不明）

    const record = {
      employee_number: employeeNumber,
      name: row['スタッフ氏名'] || null,
      name_kana: row['スタッフカナ'] || null,
      dept_no: (row['所属部門'] !== null && row['所属部門'] !== undefined) ? row['所属部門'] : null,
      contract_type: contractType,
      hired_at: excelDateToISO(row['入社年月日']),
      birthday: excelDateToISO(row['生年月日']),
      retired_at: excelDateToISO(row['退職年月日']),
      retirement_scheduled_at: excelDateToISO(row['退職予定日']),
      address: buildAddress(row),
      // テスト運用中は誤送信防止のため、全スタッフのメールアドレスを管理者アドレスに固定する
      // ※本番運用前には、この固定を解除して実際のメールアドレス（row['メールアドレス１']）に戻すこと
      email: 'ito@appart.co.jp',
      crew_code: row['SBクルーコード'] || null,
    }

    const { data: existing } = await supabase
      .from('staff')
      .select('id')
      .eq('employee_number', employeeNumber)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('staff')
        .update({ ...record, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) { errorCount++; console.error(`⚠️ 更新エラー（${employeeNumber}）:`, error.message) }
      else updatedCount++
    } else {
      const { error } = await supabase
        .from('staff')
        .insert(record)
      if (error) { errorCount++; console.error(`⚠️ 挿入エラー（${employeeNumber}）:`, error.message) }
      else newCount++
    }
  }

  await supabase
    .from('master_imports')
    .update({ new_rows: newCount, updated_rows: updatedCount, skipped_rows: skippedCount, error_rows: errorCount })
    .eq('id', importRecord.id)

  console.log('')
  console.log('===== スタッフマスタ インポート結果 =====')
  console.log(`新規登録: ${newCount}件`)
  console.log(`更新: ${updatedCount}件`)
  console.log(`スキップ（社員番号なし・外注/役員/ログイン専用）: ${skippedCount}件`)
  console.log(`エラー: ${errorCount}件`)
  console.log('==========================================')
}

// ===== メイン =====
async function main() {
  const [, , masterType, filePath, uploadedBy] = process.argv

  if (!masterType || !filePath || !uploadedBy) {
    console.error('使い方: node scripts/import-master.js <staff|department> <ファイルパス> <アップロードユーザーID>')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ ファイルが見つかりません: ${filePath}`)
    process.exit(1)
  }

  if (masterType === 'department') {
    await importDepartment(filePath, uploadedBy)
  } else if (masterType === 'staff') {
    await importStaff(filePath, uploadedBy)
  } else {
    console.error('❌ 第1引数は staff または department を指定してください')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ 予期しないエラーが発生しました:', err)
  process.exit(1)
})
