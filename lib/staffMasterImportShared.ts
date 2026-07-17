// ===== スタッフマスタ／部門マスタ StaffExpress取込：共通変換ロジック =====
// 2026-07-17実装。docs/SYSTEM_DESIGN.md 6章「スタッフマスタ取込仕様（StaffExpressエクスポート）」の
// 確定仕様、および `scripts/import-master.js`（ローカルCLIから手動実行する初回一括投入用スクリプト）で
// 確定していた変換ロジック・除外ルール・バグ修正内容をそのまま踏襲し、Webアップロード経由の
// API（app/api/admin/csv-import/route.ts）から使えるよう切り出したもの。
// scripts/import-master.js自体は手動フォールバック用にそのまま残してある
// （lib/csvImportShared.tsとscripts/import-csv.jsの関係と同じ考え方）。
import * as XLSX from 'xlsx'

// ===== 雇用形態：区分マスタNO → contract_type 変換表（6章確定仕様） =====
export const CONTRACT_TYPE_MAP: Record<string, string | null> = {
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
export const SKIP_CONTRACT_CODES = ['0005', '0006', '0007']

// 社員番号を6桁ゼロ埋めにする
export function padEmployeeNumber(value: any): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value).trim().padStart(6, '0')
}

// 雇用形態コードを4桁の文字列に正規化する（0001, 0004 等）
export function normalizeContractCode(value: any): string | null {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (str === '-1') return '-1'
  return str.padStart(4, '0')
}

// Excelの日付シリアル値や文字列をYYYY-MM-DD形式に変換。
// 【重要】2026-07-09に判明した重大バグの再発防止：toISOString()（UTC変換）を使うと、
// xlsxライブラリ（cellDates:true）が生成する「日本時間0時」のDateオブジェクトが
// UTC+9時間ぶん巻き戻り、日付が1日早くずれる（生年月日は/sign/[id]の本人確認に使われるため
// 実害が大きい）。必ずローカルgetter（getFullYear/getMonth/getDate）を使うこと。
export function excelDateToISO(value: any): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const mo = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  const str = String(value).trim()
  const m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// 現在住所(住所1)(住所2)(住所3)の3列を、空欄を詰めて半角スペース区切りで結合する
export function buildAddress(row: Record<string, any>): string | null {
  const parts = [row['現在住所(住所1)'], row['現在住所(住所2)'], row['現在住所(住所3)']]
    .map(v => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(v => v.length > 0)
  return parts.length > 0 ? parts.join(' ') : null
}

export function readExcelBuffer(buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

export type StaffImportRecord = {
  employee_number: string
  name: string | null
  name_kana: string | null
  dept_no: number | null
  contract_type: string | null
  hired_at: string | null
  birthday: string | null
  retired_at: string | null
  retirement_scheduled_at: string | null
  address: string | null
  email: string
  crew_code: string | null
}

// 1行分のスタッフマスタ行を変換する。スキップ対象（社員番号なし・8/9始まり・外注/役員/ログイン専用）は
// nullを返す。
// 【テスト運用中の暫定対応】メールアドレスは誤送信防止のため ito@appart.co.jp に固定している。
// 本番運用前には row['メールアドレス１'] を使うよう解除が必要（6章に明記済み）。
export function buildStaffRecord(row: Record<string, any>): StaffImportRecord | null {
  const rawStaffNo = String(row['スタッフNO'] || '').trim()
  const employeeNumber = padEmployeeNumber(row['スタッフNO'])
  if (!employeeNumber) return null
  if (rawStaffNo.startsWith('8') || rawStaffNo.startsWith('9')) return null

  const contractCode = normalizeContractCode(row['雇用形態'])
  if (contractCode && SKIP_CONTRACT_CODES.includes(contractCode)) return null
  const contractType = contractCode ? CONTRACT_TYPE_MAP[contractCode] ?? null : null

  return {
    employee_number: employeeNumber,
    name: row['スタッフ氏名'] || null,
    name_kana: row['スタッフカナ'] || null,
    dept_no: (row['所属部門'] !== null && row['所属部門'] !== undefined) ? Number(row['所属部門']) : null,
    contract_type: contractType,
    hired_at: excelDateToISO(row['入社年月日']),
    birthday: excelDateToISO(row['生年月日']),
    retired_at: excelDateToISO(row['退職年月日']),
    retirement_scheduled_at: excelDateToISO(row['退職予定日']),
    address: buildAddress(row),
    email: 'ito@appart.co.jp',
    crew_code: row['SBクルーコード'] || null,
  }
}

