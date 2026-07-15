// ===== CSVインポート自動化：共通パース・マッピングロジック =====
// 2026-07-15実装（管理部ダッシュボード「CSVインポート」タブ）。
//
// `scripts/import-csv.js`（ローカルCLIから手動実行する初回一括投入用スクリプト）で
// 確定していた列マッピング・ユニークキー定義をそのまま踏襲し、Webアップロード経由の
// API（app/api/admin/csv-import/route.ts）から使えるようブラウザ非依存の共通モジュールとして
// 切り出したもの。scripts/import-csv.js自体は手動フォールバック用にそのまま残してある
// （定義が2箇所に重複する点は将来的な整理課題として残す）。
import Papa from 'papaparse'
import iconv from 'iconv-lite'

export type ImportSystemKey = 'e-staffing' | 'HRstation' | 'winworks' | 'Staffia103' | 'Staffia104'
export type DbSystemType = 'e-staffing' | 'HRstation' | 'winworks' | 'Staffia'

// ===== システムごとのユニークキー列名 =====
export const UNIQUE_KEY_COLUMNS: Record<ImportSystemKey, string[]> = {
  'e-staffing': ['契約No'],
  'HRstation': ['契約番号'],
  'winworks': ['個別契約番号'],
  'Staffia103': ['個別契約書番号'],
  'Staffia104': ['個別契約書番号', '氏名コード'], // 複合キー
}

// DB保存用のsystem_type（Staffia103・Staffia104はどちらも'Staffia'にまとめる）
export const DB_SYSTEM_TYPE: Record<ImportSystemKey, DbSystemType> = {
  'e-staffing': 'e-staffing',
  'HRstation': 'HRstation',
  'winworks': 'winworks',
  'Staffia103': 'Staffia',
  'Staffia104': 'Staffia',
}

type ColumnDef = string | string[] | null

// csv_raw_data の専用カラムに入れる値を、各システムの列名から取得するためのマッピング
export const COLUMN_MAP: Record<ImportSystemKey, {
  staff_code: ColumnDef
  client_name: ColumnDef
  work_location: ColumnDef
  work_address: ColumnDef
  work_tel: ColumnDef
  dispatch_start: ColumnDef
  dispatch_end: ColumnDef
}> = {
  'e-staffing': {
    staff_code: 'スタッフコード',
    client_name: '就業先企業名',
    work_location: ['就業先企業名', '就業先事業所'],
    work_address: '就業先住所',
    work_tel: null,
    dispatch_start: '契約開始日',
    dispatch_end: '契約終了日',
  },
  'HRstation': {
    staff_code: 'スタッフコード',
    client_name: '派遣先会社名',
    work_location: ['派遣先会社名', '就業先部署名'],
    work_address: '就業先住所1',
    work_tel: null,
    dispatch_start: '契約開始日',
    dispatch_end: '契約終了日',
  },
  'winworks': {
    staff_code: 'スタッフコード',
    client_name: null,
    work_location: ['派遣先情報（就業場所） 名称', '派遣先情報（就業場所） 店舗名'],
    work_address: '派遣先情報（就業場所） 所在地',
    work_tel: '派遣先情報（就業場所） 電話番号',
    dispatch_start: '派遣期間 開始日',
    dispatch_end: '派遣期間 終了日',
  },
  'Staffia103': {
    staff_code: null,
    client_name: '派遣先会社名',
    work_location: ['派遣先会社名', '派遣先事業部名'],
    work_address: '就業先住所',
    work_tel: '就業先電話番号',
    dispatch_start: null,
    dispatch_end: null,
  },
  'Staffia104': {
    staff_code: '雇用元管理コード',
    client_name: null,
    work_location: null,
    work_address: null,
    work_tel: null,
    dispatch_start: '派遣開始日',
    dispatch_end: '派遣終了日',
  },
}

// 日付文字列をYYYY-MM-DD形式に変換（変換できない場合はnull）
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null
  const m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// 複数列を結合してひとつの値にする（winworksの就業場所名のように）
export function resolveValue(row: Record<string, any>, columnDef: ColumnDef): string | null {
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

// ユニークキーを生成する（複合キーの場合は結合）。キーが欠けている行はnullを返す（スキップ対象）
export function buildUniqueKey(row: Record<string, any>, systemKey: ImportSystemKey): string | null {
  const cols = UNIQUE_KEY_COLUMNS[systemKey]
  const parts = cols.map(c => (row[c] || '').toString().trim())
  if (parts.some(p => !p)) return null
  return parts.join('___')
}

// CSVバッファ（cp932エンコード）をパースして行の配列を返す
export function parseCsvBuffer(buffer: Buffer): Record<string, any>[] {
  const text = iconv.decode(buffer, 'cp932')
  const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true })
  return parsed.data
}

export type CsvRecordForUpsert = {
  system_type: DbSystemType
  unique_key: string
  staff_code: string | null
  client_name: string | null
  work_location: string | null
  work_address: string | null
  work_tel: string | null
  dispatch_start: string | null
  dispatch_end: string | null
  raw_data: Record<string, any>
}

// 1行分のCSVレコードを、csv_raw_data保存用の形に変換する
export function buildRecordForUpsert(row: Record<string, any>, systemKey: ImportSystemKey): { uniqueKey: string | null, record: Omit<CsvRecordForUpsert, 'unique_key'> | null } {
  const uniqueKey = buildUniqueKey(row, systemKey)
  if (!uniqueKey) return { uniqueKey: null, record: null }
  const colMap = COLUMN_MAP[systemKey]
  return {
    uniqueKey,
    record: {
      system_type: DB_SYSTEM_TYPE[systemKey],
      staff_code: resolveValue(row, colMap.staff_code),
      client_name: resolveValue(row, colMap.client_name),
      work_location: resolveValue(row, colMap.work_location),
      work_address: resolveValue(row, colMap.work_address),
      work_tel: resolveValue(row, colMap.work_tel),
      dispatch_start: normalizeDate(resolveValue(row, colMap.dispatch_start)),
      dispatch_end: normalizeDate(resolveValue(row, colMap.dispatch_end)),
      raw_data: row,
    },
  }
}

// ===== CSVインポート依頼（requests）自動マッチ用：システムごとの検索コード解決 =====
// app/apply/page.tsx のSTEP2 CSV検索、app/dashboard/_shared/useRenewalCandidates.tsの
// searchCsvRenewal()と同じ考え方（2026-07-15時点で3箇所目の実装。将来的な共通化は別課題）。
export function resolveCsvSearchStaffCode(
  dbSystemType: DbSystemType,
  employeeNumber: string,
  crewCode: string | null
): string {
  if (dbSystemType === 'HRstation') return `F3810${employeeNumber}`
  if (dbSystemType === 'winworks') return crewCode || ''
  return employeeNumber
}
