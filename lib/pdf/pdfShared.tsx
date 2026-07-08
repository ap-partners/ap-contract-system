// ===== 帳票PDF共通部品（フォント・罫線スタイル・共通レイアウトコンポーネント）=====
// 雇用契約書（パターンA）・就業条件明示書（パターンB）・兼用版（パターンC）の
// 3テンプレートで共通して使う部分をここに集約する（2026-07-08追加）。
// 元々はlib/pdf/EmploymentContractPdf.tsxに個別定義していたが、パターンB・C追加にあたり
// 重複を避けるためこちらへ切り出した。フォント登録はプロセス内で一度だけ行われれば良いため、
// 各テンプレートファイルはこのモジュールをimportするだけでよい（直接Font.registerしない）。
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import { formatYen, OVERTIME_RATE_TEXT, formatSalaryType } from './documentText'

// 日本語フォント登録（詳細な選定理由は10章2026-07-07の記録を参照）。
// MS P明朝相当としてIPAex明朝（本文）＋Noto Serif JP Bold（太字）を使用。
Font.register({
  family: 'BodyFont',
  fonts: [
    { src: path.join(process.cwd(), 'assets', 'fonts', 'ipaexm.ttf'), fontWeight: 'normal' },
    { src: path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifJP-Bold.ttf'), fontWeight: 'bold' },
  ],
})

// ハイフネーション無効化（2026-07-07決定：素人には「-」の意味が分からないため）
Font.registerHyphenationCallback(word => [word])

// 会社印影（社印）画像。承認後の最終版のみ印字（showSealで制御）。
export const COMPANY_SEAL_PATH = path.join(process.cwd(), 'assets', 'images', 'company-seal.png')

export const BORDER = '#000000'
export const LABEL_COL_WIDTH = '17%'
export const THICK = 1
export const THIN = 0.6

export const sharedStyles = StyleSheet.create({
  page: {
    fontFamily: 'BodyFont',
    fontSize: 8.3,
    lineHeight: 1.32,
    padding: 26,
    color: '#000000',
  },
  title: {
    fontSize: 15,
    lineHeight: 1.4,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 26,
    fontWeight: 'bold',
  },
  intro: {
    marginBottom: 8,
  },
  table: {
    borderWidth: THICK,
    borderColor: BORDER,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: THICK,
    borderColor: BORDER,
  },
  rowLast: {
    flexDirection: 'row',
  },
  labelCell: {
    width: LABEL_COL_WIDTH,
    padding: '3 4',
    borderRightWidth: THICK,
    borderColor: BORDER,
    justifyContent: 'center',
  },
  labelText: {
    fontWeight: 'bold',
  },
  valueCell: {
    width: `${100 - 17}%`,
    padding: 0,
  },
  splitLine: {
    flexDirection: 'row',
  },
  splitLineWithBorder: {
    flexDirection: 'row',
    borderBottomWidth: THIN,
    borderColor: BORDER,
  },
  splitSubLabel: {
    width: 78,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRightWidth: THIN,
    borderColor: BORDER,
    fontWeight: 'bold',
    justifyContent: 'center',
  },
  splitSubValue: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  wageGridRow: {
    flexDirection: 'row',
    borderBottomWidth: THIN,
    borderColor: BORDER,
  },
  wageGridRowLast: {
    flexDirection: 'row',
  },
  wageCellLabel: {
    width: '22%',
    padding: '3 4',
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  wageCellValue: {
    width: '28%',
    padding: '3 4',
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: 'center',
  },
  wageCellValueLast: {
    width: '28%',
    padding: '3 4',
    justifyContent: 'center',
  },
  freeText: {
    padding: '4 5',
  },
  footerText: {
    marginTop: 8,
    marginBottom: 12,
  },
  signatureRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  signatureCol: {
    width: '50%',
    position: 'relative',
  },
  companySeal: {
    width: 44,
    height: 44,
    position: 'absolute',
    top: 6,
    left: 128,
  },
  signatureImage: {
    width: 90,
    height: 34,
    position: 'absolute',
    top: 14,
    left: 128,
  },
  boxedSplitRow: {
    flexDirection: 'row',
  },
  boxedSplitMain: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  boxedSplitBox: {
    width: 116,
    borderLeftWidth: THIN,
    borderColor: BORDER,
    padding: '3 6',
    justifyContent: 'center',
  },
  boxedSplitBoxLabel: {
    fontSize: 6.6,
    marginBottom: 1,
    fontWeight: 'bold',
  },
  flexTimeNote: {
    fontSize: 7.3,
  },
})

export const LabeledRow = ({
  label, children, last, minHeight,
}: { label: string; children: React.ReactNode; last?: boolean; minHeight?: number }) => (
  <View style={minHeight ? [last ? sharedStyles.rowLast : sharedStyles.row, { minHeight }] : (last ? sharedStyles.rowLast : sharedStyles.row)}>
    <View style={sharedStyles.labelCell}><Text style={sharedStyles.labelText}>{label}</Text></View>
    <View style={sharedStyles.valueCell}>{children}</View>
  </View>
)

export const SplitLines = ({ lines }: { lines: { label: string; value: React.ReactNode }[] }) => (
  <>
    {lines.map((l, i) => (
      <View key={i} style={i < lines.length - 1 ? sharedStyles.splitLineWithBorder : sharedStyles.splitLine}>
        <View style={sharedStyles.splitSubLabel}><Text>{l.label}</Text></View>
        <View style={sharedStyles.splitSubValue}>
          {typeof l.value === 'string' ? <Text>{l.value}</Text> : l.value}
        </View>
      </View>
    ))}
  </>
)

export const BoxedSplitRow = ({
  main, boxLabel, boxValue,
}: { main: React.ReactNode; boxLabel: string; boxValue: React.ReactNode }) => (
  <View style={sharedStyles.boxedSplitRow}>
    <View style={sharedStyles.boxedSplitMain}>{typeof main === 'string' ? <Text>{main}</Text> : main}</View>
    <View style={sharedStyles.boxedSplitBox}>
      <Text style={sharedStyles.boxedSplitBoxLabel}>{boxLabel}</Text>
      {typeof boxValue === 'string' ? <Text>{boxValue}</Text> : boxValue}
    </View>
  </View>
)

// 担当者情報（部署名・役職／氏名・電話番号）の共通表示部品。
// 2026-07-08修正：以前は1行にまとめて表示しており、値の長さによって折り返し位置が
// 不揃いになっていた（特に苦情処理申出先の「［派遣先］」等の接頭辞が付く行で、
// 氏名の途中で改行される等、見た目が崩れていた）。「部署名・役職」と「氏名・電話番号」の
// 間で必ず改行するよう固定し、指揮命令者・派遣先責任者・派遣元責任者・苦情処理申出先の
// すべての行で統一した見た目になるようにした（伊藤さん指摘・2026-07-08）。
export const PersonRow = ({
  dept, role, name, tel, prefix,
}: { dept: string; role: string; name: string; tel: string; prefix?: string }) => (
  <>
    <Text>{prefix || ''}部署名：{dept || '―'}　役職：{role || '―'}</Text>
    <Text>氏名：{name || '―'}　電話番号：{tel || '―'}</Text>
  </>
)

// 賃金グリッド（パターンA・C共通。パターンBには賃金欄自体が無いため未使用）
export type WageGridInput = {
  salaryType: string
  basicSalary: string | number
  skillPay: string | number
  rolePay: string | number
  salesPay: string | number
  housingPay: string | number
  overtimePay: string | number
}
export const WageGrid = ({ p, overtimeHoursNote }: { p: WageGridInput; overtimeHoursNote: string }) => {
  const overtimePayValue: React.ReactNode = overtimeHoursNote
    ? <>
        <Text>{formatYen(p.overtimePay)}</Text>
        <Text>{overtimeHoursNote}</Text>
      </>
    : formatYen(p.overtimePay)
  const rows: [string, React.ReactNode, string, React.ReactNode][] = [
    ['給与の種類', formatSalaryType(p.salaryType), '役職手当', formatYen(p.rolePay)],
    ['基本給', formatYen(p.basicSalary), '営業手当', formatYen(p.salesPay)],
    ['職能給', formatYen(p.skillPay), '住宅手当', formatYen(p.housingPay)],
    ['定額残業手当', overtimePayValue, '割増賃金率', OVERTIME_RATE_TEXT],
  ]
  return (
    <>
      {rows.map(([l1, v1, l2, v2], i) => (
        <View key={i} style={i < rows.length - 1 ? sharedStyles.wageGridRow : sharedStyles.wageGridRowLast}>
          <View style={sharedStyles.wageCellLabel}><Text>{l1}</Text></View>
          <View style={sharedStyles.wageCellValue}>{typeof v1 === 'string' ? <Text>{v1}</Text> : v1}</View>
          <View style={sharedStyles.wageCellLabel}><Text>{l2}</Text></View>
          <View style={sharedStyles.wageCellValueLast}><Text>{v2}</Text></View>
        </View>
      ))}
    </>
  )
}
