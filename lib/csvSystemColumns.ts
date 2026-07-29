// ===== CSVインポート：システムごとのサンプルファイル・必須列一覧（表示用） =====
// 2026-07-29新設・同日改訂。
// 【改訂の経緯】当初は「列名・用途・必須/任意」の一覧表で案内していたが、伊藤さんより
// 「必須・任意の意味が分からない」「結局どんな形式のファイルをダウンロードすればいいのか
// 分かるようにしてほしい」との指摘を受けた。あわせて、そもそも各システムのエクスポート画面に
// 出力項目を選ぶ仕組みは無い（伊藤さん確認済み）ことが判明したため、「列を選び間違えるリスク」
// を前提にした説明自体が的外れだった。
// 【新方式】列名の一覧表をやめ、実際のCSV（伊藤さんに送っていただいた本物のファイル）から
// ヘッダー行だけをそのまま使い、内容をすべてダミー値に置き換えた「サンプルCSV」を
// public/csv-samples/ に用意した。管理部はこれをダウンロードし、システムから実際に
// ダウンロードしたファイルと見比べることで、同じ構成のファイルかどうかを目視で確認できる。
// 列の並び順・列数を実物と完全に一致させてあるため、比較の信頼性が高い。
// サンプルCSVの生成手順・生成に使ったスクリプトはこのファイルの末尾コメント参照。
// 唯一、目視確認だけでは防げないのが「取込のキーとなる列が無いとその行が黙ってスキップされる」
// という失敗パターンなので、その列名だけは別途テキストで注意喚起する
// （lib/csvImportShared.ts の UNIQUE_KEY_COLUMNS と必ず一致させること）。
export const CSV_SAMPLE_FILES: Record<'e-staffing' | 'HRstation' | 'winworks' | 'Staffia', {
  fileLabel: string
  href: string
}[]> = {
  'e-staffing': [
    { fileLabel: 'e-staffingサンプル.csv', href: '/csv-samples/e-staffing_sample.csv' },
  ],
  'HRstation': [
    { fileLabel: 'HRstationサンプル.csv', href: '/csv-samples/hrstation_sample.csv' },
  ],
  'winworks': [
    { fileLabel: 'winworksサンプル.csv', href: '/csv-samples/winworks_sample.csv' },
  ],
  'Staffia': [
    { fileLabel: '契約詳細（KEF00103）サンプル.csv', href: '/csv-samples/staffia_103_sample.csv' },
    { fileLabel: 'スタッフ情報（KEF00104）サンプル.csv', href: '/csv-samples/staffia_104_sample.csv' },
  ],
}

// 取込のキーとなる列（無いとその行がスキップされる）。UNIQUE_KEY_COLUMNSと同じ内容を
// 画面表示用の文言として持たせたもの（配列ではなく「、」区切りの表示文字列）。
export const CSV_REQUIRED_COLUMNS_LABEL: Record<'e-staffing' | 'HRstation' | 'winworks' | 'Staffia', string> = {
  'e-staffing': '契約No',
  'HRstation': '契約番号',
  'winworks': '個別契約番号',
  'Staffia': '契約詳細（KEF00103）は「個別契約書番号」、スタッフ情報（KEF00104）は「個別契約書番号」と「氏名コード」',
}

// ===== サンプルCSVの生成方法（参考メモ） =====
// 伊藤さんから送っていただいた実物のCSV（e-staffing.csv・HR STATION.csv・winworks.csv・
// Staffia1.csv・Staffia2.csv）のヘッダー行をそのまま使い、データ行を1行だけ、それも
// 「契約No」「氏名」「就業先名」等の目に見える主要項目のみダミー値（サンプル株式会社／
// サンプル　太郎 等）で埋め、残りの列は空欄にして生成した（Pythonスクリプトで一括生成・
// 2026-07-29）。出力エンコードはlib/csvImportShared.tsのparseCsvBuffer()が
// iconv.decode(buffer, 'cp932') で読む前提に合わせ、cp932で統一している（shift_jisとの
// 微妙な差異による文字化けを避けるため）。生成後、実際にPapaparse＋cp932デコードで
// 5ファイルとも正常にパースできる（parse errors: 0、ユニークキーも正しく生成される）ことを
// Node上で検証済み。実物ファイルに含まれていた実在の社員氏名・電話番号・住所等の個人情報は
// 一切含まれていない。
