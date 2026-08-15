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

// ===== L-17対応（2026-08-14）：所属部門NOの空欄がNumber('')=>0で「0番部門」として
// 誤って登録されてしまうバグの修正 =====
// JavaScriptの仕様上 Number('') は NaN ではなく 0 になる（Number(null)やNumber(undefined)は
// それぞれ0・NaNになる等、空値の扱いが型ごとにバラバラで直感的でない）。従来の実装は
// null/undefinedだけをガードしていたため、Excel側で所属部門セルが「空文字列」の行
// （欠損とは違う意味を持つケースも含め、単純な未入力行）が「所属部門0（＝実在しない
// ダミー部門）」としてそのままstaffテーブルへ書き込まれてしまう不具合があった。
// 空文字列（前後空白のみを含む）・NaNになる値はすべてnullとして扱う。
export function parseDeptNo(value: any): number | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (str === '') return null
  const n = Number(str)
  return Number.isFinite(n) ? n : null
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

// ===== B-12対応（2026-08-12）：StaffExpress取込の必須列検証 =====
// sheet_to_json({defval:null})で行オブジェクトに変換すると、シートに列が丸ごと存在しない場合と
// 列は存在するが該当行が空欄な場合の区別がつかなくなる（どちらもrow[列名]がnull/undefinedになる）。
// buildStaffRecordはこの区別なくnullをそのままupsertするため、列が丸ごと欠けたファイルを
// 取り込むと該当列が全スタッフ分NULLで上書きされる実害があった（退職年月日列の削除で
// 退職者が一斉復活する等）。取込処理を始める前に、実際のヘッダー行（1行目）を独立して読み取り、
// 必須列がすべて揃っているかを検証できるようにする。
export function readExcelHeaders(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
  const headerRow = rows[0] || []
  return headerRow.map(h => String(h ?? '').trim()).filter(h => h.length > 0)
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

// ===== C-08対応：社員番号の再利用（退職者番号を新入社員へ再割当）検知用 =====
// 全角/半角スペース・前後の空白の違いだけで「別人」と誤判定しないよう、
// 比較前に空白文字をすべて除去して正規化する（表記ゆれの吸収。厳密な同一性チェックは
// 目的が「別人か同一人物か」の大雑把な仕分けのため、これで十分。旧字体・外国人表記等の
// 揺れは伊藤さん・管理部が「要確認」一覧を見て目視判断する前提）。
export function normalizeStaffNameForCompare(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/[\s　]+/g, '')
}

// 退避（アーカイブ）した旧行に付け直す、衝突しない新しいemployee_number値を生成する。
// employee_numberはUNIQUE制約のみ（桁数・書式のCHECK制約は無い）ため、この形式でも問題ない。
export function buildArchivedEmployeeNumber(originalEmployeeNumber: string): string {
  return `${originalEmployeeNumber}__ARCHIVED__${Date.now()}`
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
    dept_no: parseDeptNo(row['所属部門']),
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

