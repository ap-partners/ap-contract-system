// ===== StaffExpress取込：列定義（クライアント/サーバー共通・xlsx依存なし） =====
// docs/SYSTEM_DESIGN.md 6章の確定仕様。管理部ダッシュボードのアップロード画面に常時参照できる
// 形（アコーディオン）で表示するための項目一覧。「⚠️項目の順番が違うと正しく取り込まれません」
// という注記とあわせて表示する（6章冒頭に明記されている表示要件）。
// xlsxパッケージに依存しないため、クライアントコンポーネント（app/dashboard/admin/page.tsx）から
// 直接importしてよい（lib/staffMasterImportShared.tsはxlsxに依存するためサーバー専用）。
export const STAFF_EXPRESS_COLUMNS: { no: number; label: string; target: string; note: string }[] = [
  { no: 1, label: 'スタッフNO', target: 'employee_number', note: '6桁未満は前に0付与' },
  { no: 2, label: 'スタッフ氏名', target: 'name', note: 'そのまま' },
  { no: 3, label: 'スタッフカナ', target: 'name_kana', note: 'そのまま' },
  { no: 4, label: '所属部門', target: 'dept_no', note: '部門マスタの部門NOをそのまま格納（変換しない）' },
  { no: 5, label: '雇用形態', target: 'contract_type', note: '区分マスタNOから変換' },
  { no: 6, label: '性別区分', target: '対象外', note: '使用しない' },
  { no: 7, label: '入社年月日', target: 'hired_at', note: 'そのまま' },
  { no: 8, label: '生年月日', target: 'birthday', note: 'そのまま' },
  { no: 9, label: '退職年月日', target: 'retired_at', note: 'そのまま' },
  { no: 10, label: '退職予定日', target: 'retirement_scheduled_at', note: 'そのまま' },
  { no: 11, label: '現在住所(住所1)', target: 'address', note: '住所1〜3を半角スペース結合' },
  { no: 12, label: '現在住所(住所2)', target: 'address', note: '同上（建物名・部屋番号等。空欄多い）' },
  { no: 13, label: '現在住所(住所3)', target: 'address', note: '同上（空欄多い）' },
  { no: 14, label: 'メールアドレス１', target: 'email', note: 'テスト中は ito@appart.co.jp に固定（本番前に解除要）' },
  { no: 15, label: 'SBクルーコード', target: 'crew_code', note: 'winworksの10桁。対象外は空欄' },
]
