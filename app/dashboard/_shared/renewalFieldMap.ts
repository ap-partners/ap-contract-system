// ===== 更新期限管理：前回契約⇔CSV反映内容のフィールド対応表（共通） =====
// 2026-07-17新設（チャットB・⑥とチャットC・⑤の契約データ生成処理で同じ対応表を使うために
// RenewalContractConfirmModal.tsxから切り出した）。
//
// 前回契約（contracts.input_data.fields）のキーと、CSVから反映される最新内容
// （extractCsvFields()の戻り値）のキーは、項目によって命名規則が異なる（STEP3の指揮命令者等は
// snake_case、それ以外はcamelCaseという実データの混在をそのまま踏襲している）。この対応表は
// 両者を突き合わせるためのもの。csvKeyが無い項目（給与・備考など）はCSVでは管理しておらず、
// 更新申請でも前回値をそのまま引き継ぐ。
export type RenewalFieldDef = { label: string; prevKey: string; csvKey?: string; multiline?: boolean }

export const RENEWAL_SECTIONS: { title: string; fields: RenewalFieldDef[] }[] = [
  {
    title: '雇用期間・派遣期間',
    fields: [], // 専用ロジックで別途処理（renewal_candidatesの既存カラムを使うため）
  },
  {
    title: '就業場所',
    fields: [
      { label: '就業場所名', prevKey: 'workLocationName' },
      { label: '住所', prevKey: 'workLocationAddress' },
      { label: '電話番号', prevKey: 'workLocationTel' },
    ],
  },
  {
    title: '業務内容・勤務条件',
    fields: [
      { label: '業務内容', prevKey: 'businessContent', csvKey: 'business', multiline: true },
      { label: '始業時刻', prevKey: 'startTime', csvKey: 'startTime' },
      { label: '終業時刻', prevKey: 'endTime', csvKey: 'endTime' },
      { label: '休憩時間（分）', prevKey: 'breakTime', csvKey: 'breakTime' },
      // 所定労働日数：extractCsvFields()はCSVの「勤務日」「就業日」列から生テキストを返すが、
      // /apply の実際のSTEP3では所定労働日数はプルダウン選択（週5日・週4日・シフト制・その他等）の
      // 手入力項目であり、このCSV生テキストをその選択肢に反映する処理はSTEP2/3のどこにも無い
      // （2026-07-17伊藤さんご指摘で発覚。実データ・実コード再検証済み：app/apply/page.tsxの
      // CSV反映ブロックにsetWorkDays(fields.workDays)の呼び出しが存在しないことを確認）。
      // つまりCSVの生テキストは実際の申請では一度も使われたことがない値であり、前回契約の
      // workDays（手入力値）と比較しても意味のある差異にならない。csvKeyを持たせず、他の
      // 手入力項目（給与・備考等）と同じく前回値をそのまま引き継ぐ扱いにする。
      { label: '所定労働日数', prevKey: 'workDays' },
      { label: '業務に伴う責任の程度', prevKey: 'responsibility', csvKey: 'responsibility' },
      { label: '組織単位', prevKey: 'organizationUnit', csvKey: 'org' },
      { label: '抵触日（事業所単位）', prevKey: 'conflictDate', csvKey: 'conflictDate' },
      { label: '抵触日（組織単位）', prevKey: 'conflictDateOrg', csvKey: 'conflictDateOrg' },
      { label: '変形労働時間制', prevKey: 'flexTime', csvKey: 'flexTime' },
      { label: '所定労働時間外労働', prevKey: 'overtime', csvKey: 'overtime' },
      { label: '福利厚生施設の利用等', prevKey: 'welfare', csvKey: 'welfare', multiline: true },
    ],
  },
  {
    title: '指揮命令者',
    fields: [
      { label: '部署', prevKey: 'cmd_dept', csvKey: 'cmdDept' },
      { label: '役職', prevKey: 'cmd_role', csvKey: 'cmdRole' },
      { label: '氏名', prevKey: 'cmd_name', csvKey: 'cmdName' },
      { label: '電話番号', prevKey: 'cmd_tel', csvKey: 'cmdTel' },
    ],
  },
  {
    title: '派遣先責任者',
    fields: [
      { label: '部署', prevKey: 'resp_dept', csvKey: 'respDept' },
      { label: '役職', prevKey: 'resp_role', csvKey: 'respRole' },
      { label: '氏名', prevKey: 'resp_name', csvKey: 'respName' },
      { label: '電話番号', prevKey: 'resp_tel', csvKey: 'respTel' },
    ],
  },
  {
    title: '苦情処理申出先（派遣先）',
    fields: [
      { label: '部署', prevKey: 'comp_dept', csvKey: 'compDept' },
      { label: '役職', prevKey: 'comp_role', csvKey: 'compRole' },
      { label: '氏名', prevKey: 'comp_name', csvKey: 'compName' },
      { label: '電話番号', prevKey: 'comp_tel', csvKey: 'compTel' },
    ],
  },
  {
    title: '派遣元責任者',
    fields: [
      { label: '部署', prevKey: 'mgr_dept', csvKey: 'mgrDept' },
      { label: '役職', prevKey: 'mgr_role', csvKey: 'mgrRole' },
      { label: '氏名', prevKey: 'mgr_name', csvKey: 'mgrName' },
      { label: '電話番号', prevKey: 'mgr_tel', csvKey: 'mgrTel' },
    ],
  },
  {
    title: '苦情処理申出先（派遣元）',
    fields: [
      { label: '部署', prevKey: 'cmp_dept', csvKey: 'cmpDept' },
      { label: '役職', prevKey: 'cmp_role', csvKey: 'cmpRole' },
      { label: '氏名', prevKey: 'cmp_name', csvKey: 'cmpName' },
      { label: '電話番号', prevKey: 'cmp_tel', csvKey: 'cmpTel' },
    ],
  },
  {
    title: '給与',
    fields: [
      { label: '給与の種類', prevKey: 'salaryType' },
      { label: '基本給', prevKey: 'basicSalary' },
      { label: '役職手当', prevKey: 'rolePay' },
      { label: '職能給', prevKey: 'skillPay' },
      { label: '営業手当', prevKey: 'salesPay' },
      { label: '定額残業手当', prevKey: 'overtimePay' },
      { label: '住宅手当', prevKey: 'housingPay' },
    ],
  },
  {
    title: '備考',
    fields: [
      { label: '安全及び衛生', prevKey: 'safetyText', multiline: true },
      { label: '紛争防止措置', prevKey: 'conflictText', multiline: true },
    ],
  },
]

// 前回契約のfields（prevFields）を土台に、CSVから反映される最新内容（csvFields。無ければnull）で
// 対応表にある項目だけを上書きしたfieldsオブジェクトを作る。
// - csvFieldsがnull（CSV対象外／CSV未マッチ）の場合は、prevFieldsをそのまま複製して返す。
// - 対応表に無い項目（trialPeriod・monthlyStandardHours・hasEmployInsurance等）はprevFieldsの値を
//   無条件でそのまま引き継ぐ（更新申請の一括作成では変更しない）。
// - 就業場所（就業場所名・住所）と雇用期間・派遣期間は、この関数では扱わない
//   （呼び出し側がrenewal_candidatesの確定済みnew_*カラムで別途上書きする）。
export function buildMergedFields(
  prevFields: Record<string, any>,
  csvFields: Record<string, any> | null
): Record<string, any> {
  const merged = { ...prevFields }
  if (!csvFields) return merged
  for (const section of RENEWAL_SECTIONS) {
    for (const def of section.fields) {
      if (!def.csvKey) continue
      const csvVal = csvFields[def.csvKey]
      if (csvVal !== undefined && csvVal !== null && csvVal !== '') {
        // 2026-07-17実機テストで判明：extractCsvFields()の一部の項目（例：Staffiaの休憩時間＝
        // breakTime）はCSV側の実装で数値のまま返ってくる。fields.*は元々すべて文字列を想定した
        // 項目（STEP画面のテキスト入力・buildCurrentFields()の保存形式と同じ）のため、数値のまま
        // 個別申請プリフィル（/apply?renewal=）に渡すと、文字列専用の.replace()等を呼ぶ箇所で
        // 「(e || "").replace is not a function」という実行時エラーになり画面が真っ白になる不具合
        // があった。ここで必ず文字列化してから代入することで、一括申請・個別申請どちらの経路でも
        // 同じ安全な形にする。
        merged[def.prevKey] = String(csvVal)
      }
    }
  }
  return merged
}
