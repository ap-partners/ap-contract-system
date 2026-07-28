// ===== CSVインポート：システムごとの必要列一覧（表示用・xlsx依存なし） =====
// 2026-07-29新設。e-staffing・HRstation・winworks・Staffiaは、各システム側のCSVエクスポート画面で
// 出力項目・並び順を選べてしまうため、伊藤さんより「間違った構成のものをダウンロードしてしまう
// 可能性がある。StaffExpressのスタッフマスタ説明のように、事前に確認できるメモを見せたい」との
// 依頼を受けて追加。実際のマッピング定義（lib/csvImportShared.ts の COLUMN_MAP・UNIQUE_KEY_COLUMNS）
// から手作業で書き起こしたものなので、csvImportShared.tsのマッピングを変更した場合はこちらも
// あわせて更新すること。
// 【重要】この一覧は「これらの列名を含んでいれば取り込める」というものであり、StaffExpressと違って
// 列の並び順そのものは問わない（Papaparseがヘッダー名で列を探すため）。ここに無い列が含まれていても
// 無視されるだけで、エラーにはならない。
export type CsvSystemColumn = { label: string; usage: string; required: boolean }

export const CSV_SYSTEM_COLUMNS: Record<'e-staffing' | 'HRstation' | 'winworks' | 'Staffia103' | 'Staffia104', {
  fileLabel: string
  columns: CsvSystemColumn[]
}> = {
  'e-staffing': {
    fileLabel: 'e-staffing 個別契約一覧のCSV',
    columns: [
      { label: '契約No', usage: 'この契約データを特定するキー', required: true },
      { label: 'スタッフコード', usage: 'スタッフの特定に使用', required: false },
      { label: '就業先企業名', usage: '就業先名として使用', required: false },
      { label: '就業先事業所', usage: '就業先企業名と組み合わせて就業場所名に使用', required: false },
      { label: '就業先住所', usage: '就業先住所として使用', required: false },
      { label: '契約開始日', usage: '派遣期間の開始日として使用', required: false },
      { label: '契約終了日', usage: '派遣期間の終了日として使用', required: false },
    ],
  },
  'HRstation': {
    fileLabel: 'HRstation 個別契約一覧のCSV',
    columns: [
      { label: '契約番号', usage: 'この契約データを特定するキー', required: true },
      { label: 'スタッフコード', usage: 'スタッフの特定に使用', required: false },
      { label: '派遣先会社名', usage: '就業先名として使用', required: false },
      { label: '就業先部署名', usage: '派遣先会社名と組み合わせて就業場所名に使用', required: false },
      { label: '就業先住所1', usage: '就業先住所として使用', required: false },
      { label: '契約開始日', usage: '派遣期間の開始日として使用', required: false },
      { label: '契約終了日', usage: '派遣期間の終了日として使用', required: false },
    ],
  },
  'winworks': {
    fileLabel: 'winworks 個別契約一覧のCSV',
    columns: [
      { label: '個別契約番号', usage: 'この契約データを特定するキー', required: true },
      { label: 'スタッフコード', usage: 'スタッフの特定に使用', required: false },
      { label: '派遣先情報（就業場所） 名称', usage: '就業場所名として使用', required: false },
      { label: '派遣先情報（就業場所） 店舗名', usage: '名称と組み合わせて就業場所名に使用', required: false },
      { label: '派遣先情報（就業場所） 所在地', usage: '就業先住所として使用', required: false },
      { label: '派遣先情報（就業場所） 電話番号', usage: '就業先電話番号として使用', required: false },
      { label: '派遣期間 開始日', usage: '派遣期間の開始日として使用', required: false },
      { label: '派遣期間 終了日', usage: '派遣期間の終了日として使用', required: false },
    ],
  },
  'Staffia103': {
    fileLabel: 'Staffia 契約詳細（KEF00103）のCSV',
    columns: [
      { label: '個別契約書番号', usage: 'この契約データを特定するキー', required: true },
      { label: '派遣先会社名', usage: '就業先名として使用', required: false },
      { label: '派遣先事業部名', usage: '派遣先会社名と組み合わせて就業場所名に使用', required: false },
      { label: '就業先住所', usage: '就業先住所として使用', required: false },
      { label: '就業先電話番号', usage: '就業先電話番号として使用', required: false },
    ],
  },
  'Staffia104': {
    fileLabel: 'Staffia スタッフ個人・派遣期間（KEF00104）のCSV',
    columns: [
      { label: '個別契約書番号', usage: '契約詳細（KEF00103）と突き合わせるキーの一部', required: true },
      { label: '氏名コード', usage: '契約詳細（KEF00103）と突き合わせるキーの一部', required: true },
      { label: '雇用元管理コード', usage: 'スタッフの特定に使用', required: false },
      { label: '派遣開始日', usage: '派遣期間の開始日として使用', required: false },
      { label: '派遣終了日', usage: '派遣期間の終了日として使用', required: false },
    ],
  },
}
