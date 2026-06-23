/**
 * CSVインポートスクリプト
 *
 * e-staffing / HRstation / winworks / Staffia(KEF00103) / Staffia(KEF00104) の
 * 5種類のCSVファイルを読み込み、Supabaseの csv_raw_data テーブルに格納する。
 *
 * 【実行方法】
 * node scripts/import-csv.js <システム名> <CSVファイルパス> <アップロードしたユーザーのID>
 *
 * 例：
 * node scripts/import-csv.js e-staffing ./e-staffing.csv 11111111-1111-1111-1111-111111111111
 *
 * 【システム名の指定値】
 * e-staffing / HRstation / winworks / Staffia103 / Staffia104
 * （Staffia103 = KEF00103、Staffia104 = KEF00104。DB上はどちらも system_type = 'Staffia' として保存）
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const Papa = require('papaparse')
const iconv = require('iconv-lite')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // RLSをバイパスするため service_role を使用
)

// ===== システムごとのユニークキー列名 =====
const UNIQUE_KEY_COLUMNS = {
  'e-staffing': ['契約No'],
  'HRstation': ['契約番号'],
  'winworks': ['個別契約番号'],
  'Staffia103': ['個別契約書番号'],
  'Staffia104': ['個別契約書番号', '氏名コード'], // 複合キー
}

// DB保存用のsystem_type（Staffia103・Staffia104はどちらも'Staffia'にまとめる）
const DB_SYSTEM_TYPE = {
  'e-staffing': 'e-staffing',
  'HRstation': 'HRstation',
  'winworks': 'winworks',
  'Staffia103': 'Staffia',
  'Staffia104': 'Staffia',
}

// ===== 列マッピング（システムごとに必要な代表列だけ抜き出す） =====
// csv_raw_data の専用カラム（staff_code, client_name, work_location, work_address, work_tel,
// dispatch_start, dispatch_end）に入れる値を、各システムの列名から取得する
const COLUMN_MAP = {
  'e-staffing': {
    staff_code: 'スタッフコード',
    client_name: '就業先企業名',
    // 就業先名は「就業先企業名」＋「就業先事業所」の結合（業務的に確定済み）
    work_location: ['就業先企業名', '就業先事業所'],
    work_address: '就業先住所',
    work_tel: null, // 列なし
    dispatch_start: '契約開始日',
    dispatch_end: '契約終了日',
  },
  'HRstation': {
    staff_code: 'スタッフコード',
    client_name: '派遣先会社名',
    work_location: '就業先事業所名',
    work_address: '就業先住所1', // 住所2は raw_data 側で参照
    work_tel: null, // 列なし
    dispatch_start: '契約開始日',
    dispatch_end: '契約終了日',
  },
  'winworks': {
    staff_code: 'スタッフコード',
    client_name: null, // 専用列なし。就業場所名と同じ情報を使う想定
    // 就業場所名は「名称」＋「店舗名」の結合（業務的に確定済み）
    work_location: ['派遣先情報（就業場所） 名称', '派遣先情報（就業場所） 店舗名'],
    work_address: '派遣先情報（就業場所） 所在地',
    work_tel: '派遣先情報（就業場所） 電話番号',
    dispatch_start: '派遣期間 開始日',
    dispatch_end: '派遣期間 終了日',
  },
  'Staffia103': {
    staff_code: null, // Staffia103には個人別のスタッフコードがない（104側で管理）
    client_name: '派遣先会社名',
    // 就業場所名は「派遣先会社名」＋「派遣先事業部名」の結合（業務的に確定済み）
    work_location: ['派遣先会社名', '派遣先事業部名'],
    work_address: '就業先住所',
    work_tel: '就業先電話番号',
    dispatch_start: null, // 派遣期間はStaffia104（個人別データ）側にある
    dispatch_end: null,
  },
  'Staffia104': {
    staff_code: '氏名コード',
    client_name: null,
    work_location: null, // 就業場所情報はStaffia103側にある（個別契約書番号で紐付け）
    work_address: null,
    work_tel: null,
    dispatch_start: '派遣開始日',
    dispatch_end: '派遣終了日',
  },
}

// ===== ユーティリティ =====

// 日付文字列をYYYY-MM-DD形式に変換（変換できない場合はnull）
function normalizeDate(value) {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null
  // 既にYYYY-MM-DD / YYYY/MM/DD 形式を想定
  const m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// 複数列を結合してひとつの値にする（winworksの就業場所名のように）
function resolveValue(row, columnDef) {
  if (!columnDef) return null
  if (Array.isArray(columnDef)) {
    return columnDef
      .map(col => (row[col] || '').toString().trim())
      .filter(Boolean)
      .join(' ') || null
  }
  const v = row[columnDef]
  return v ? String(v).trim() : null
}

// ユニークキーを生成する（複合キーの場合は結合）
function buildUniqueKey(row, systemKey) {
  const cols = UNIQUE_KEY_COLUMNS[systemKey]
  const parts = cols.map(c => (row[c] || '').toString().trim())
  if (parts.some(p => !p)) return null // キーが欠けている行はスキップ対象
  return parts.join('___') // 複合キーは ___ で連結
}

// ===== CSV読み込み（cp932エンコード対応） =====
function readCsv(filePath) {
  const buffer = fs.readFileSync(filePath)
  const text = iconv.decode(buffer, 'cp932')
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) {
    console.warn(`⚠️ CSVパース時に${parsed.errors.length}件の警告がありました（先頭5件を表示）`)
    parsed.errors.slice(0, 5).forEach(e => console.warn('  ', e))
  }
  return parsed.data
}

// ===== メイン処理 =====
async function main() {
  const [, , systemKeyArg, filePath, uploadedBy] = process.argv

  if (!systemKeyArg || !filePath || !uploadedBy) {
    console.error('使い方: node scripts/import-csv.js <システム名> <CSVファイルパス> <アップロードユーザーID>')
    console.error('システム名: e-staffing / HRstation / winworks / Staffia103 / Staffia104')
    process.exit(1)
  }

  if (!UNIQUE_KEY_COLUMNS[systemKeyArg]) {
    console.error(`❌ 不明なシステム名です: ${systemKeyArg}`)
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ ファイルが見つかりません: ${filePath}`)
    process.exit(1)
  }

  console.log(`📂 ${filePath} を読み込みます（システム: ${systemKeyArg}）...`)
  const rows = readCsv(filePath)
  console.log(`📊 ${rows.length} 行を検出しました`)

  const dbSystemType = DB_SYSTEM_TYPE[systemKeyArg]
  const colMap = COLUMN_MAP[systemKeyArg]

  // 1. csv_imports に履歴レコードを作成
  const { data: importRecord, error: importError } = await supabase
    .from('csv_imports')
    .insert({
      system_type: dbSystemType,
      file_name: filePath.split('/').pop(),
      total_rows: rows.length,
      uploaded_by: uploadedBy,
    })
    .select()
    .single()

  if (importError) {
    console.error('❌ csv_imports への登録に失敗しました:', importError.message)
    process.exit(1)
  }

  console.log(`✅ インポート履歴を作成しました（import_id: ${importRecord.id}）`)

  let newCount = 0
  let skippedCount = 0
  let pendingCount = 0
  let errorCount = 0

  for (const row of rows) {
    const uniqueKey = buildUniqueKey(row, systemKeyArg)
    if (!uniqueKey) {
      skippedCount++
      continue
    }

    const record = {
      import_id: importRecord.id,
      system_type: dbSystemType,
      unique_key: uniqueKey,
      staff_code: resolveValue(row, colMap.staff_code),
      client_name: resolveValue(row, colMap.client_name),
      work_location: resolveValue(row, colMap.work_location),
      work_address: resolveValue(row, colMap.work_address),
      work_tel: resolveValue(row, colMap.work_tel),
      dispatch_start: normalizeDate(resolveValue(row, colMap.dispatch_start)),
      dispatch_end: normalizeDate(resolveValue(row, colMap.dispatch_end)),
      raw_data: row, // 生データは全列まるごとJSONBに保存
    }

    // 既存データの有無を確認（system_type + unique_key で重複チェック）
    const { data: existing } = await supabase
      .from('csv_raw_data')
      .select('id')
      .eq('system_type', dbSystemType)
      .eq('unique_key', uniqueKey)
      .maybeSingle()

    if (existing) {
      // 既存データがある場合は「上書き保留」フラグを立てて、即時上書きはしない
      // （差分チェック機能で後ほど管理部が確認する想定）
      const { error: updateError } = await supabase
        .from('csv_raw_data')
        .update({ ...record, is_overwrite_pending: true })
        .eq('id', existing.id)

      if (updateError) {
        console.error(`⚠️ 更新エラー（key: ${uniqueKey}）:`, updateError.message)
        errorCount++
      } else {
        pendingCount++
      }
    } else {
      const { error: insertError } = await supabase
        .from('csv_raw_data')
        .insert(record)

      if (insertError) {
        console.error(`⚠️ 挿入エラー（key: ${uniqueKey}）:`, insertError.message)
        errorCount++
      } else {
        newCount++
      }
    }
  }

  // 2. csv_imports の件数を更新
  await supabase
    .from('csv_imports')
    .update({
      new_rows: newCount,
      skipped_rows: skippedCount,
      pending_rows: pendingCount,
      error_rows: errorCount,
    })
    .eq('id', importRecord.id)

  console.log('')
  console.log('===== インポート結果 =====')
  console.log(`新規登録: ${newCount}件`)
  console.log(`上書き保留（既存データあり）: ${pendingCount}件`)
  console.log(`スキップ（キー不備）: ${skippedCount}件`)
  console.log(`エラー: ${errorCount}件`)
  console.log('==========================')
}

main().catch(err => {
  console.error('❌ 予期しないエラーが発生しました:', err)
  process.exit(1)
})
