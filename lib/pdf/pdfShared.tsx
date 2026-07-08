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
  // 2026-07-08全面改訂：罫線の唯一の描画元（single source of truth）ルールに統一。
  // 「行」を囲むコンテナ自身は一切罫線を持たない（レイアウト専用）。行の下罫線は必ず
  // 末端のセル（labelCell・valueCell）自身が持つ（bottomBorderを参照）。react-pdfの
  // レイアウト計算では「複数の子を横に並べるコンテナ自身の罫線」の描画が非決定的
  // （レンダリングごとに描画されたりされなかったりする）ことが実機検証で判明したため、
  // コンテナに罫線を持たせる設計そのものを廃止した（詳細な経緯は10章2026-07-08参照）。
  row: {
    flexDirection: 'row',
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
  // 行の下罫線の唯一の描画元。最終行以外のlabelCell・valueCellの両方に必ず付与する
  // （LabeledRow参照）。同じスタイルをlabelCell・valueCell双方で共有することで、
  // 見た目上ぴったり1本の連続した線になる。
  bottomBorder: {
    borderBottomWidth: THICK,
    borderColor: BORDER,
  },
  // 2026-07-08追加：react-pdfは、罫線を持つ大きなView（table全体）がページをまたいで
  // 分割される際、そのViewの外枠（borderWidth）を「最初のページの上端」と「最後のページの
  // 下端」にしか描画せず、途中のページの継ぎ目には一切描画しない（伊藤さん指摘・contract13.pdf
  // で発覚：ページ2の先頭行「苦情処理申出先」の上に罫線が無く、表が宙に浮いたように見えていた）。
  // LabeledRowのforceBreakBeforeプロパティを使って明示的にページ区切りを指定した行にのみ、
  // この上罫線を付与する（自動改行に任せた行には付与しない＝二重線になる心配が無い）。
  topBorder: {
    borderTopWidth: THICK,
    borderColor: BORDER,
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

// 2026-07-08修正：react-pdfはデフォルトでは1つの行（View）が長くなった場合、
// ページの継ぎ目で行の途中から強制的に分割してしまうことがある（罫線付きグリッド行を
// 導入したことで顕在化。指揮命令者・派遣先責任者等、部署名が3行に折り返す行で
// 実際に発生を確認）。wrap={false}を指定し、収まらない場合は行ごと次ページへ送るようにする。
//
// 2026-07-08全面改訂（罫線アーキテクチャ統一）：それまで「外側の行(sharedStyles.row)の
// 罫線が非決定的に描画されない」不具合への対策として、一部の行だけラベル欄に冗長罫線を
// 追加する（redundantBorderプロパティ）その場しのぎの対応を重ねていたが、対象範囲の
// 見極めミスにより二重線・太さ不統一が繰り返し発生した（伊藤さん指摘・contract3.pdf／
// contract10.pdf）。根本原因は「複数の子を横に並べるコンテナ自身が持つ罫線の描画が
// react-pdfでは非決定的」という点にあり、対症療法では解決しないと判明したため、
// 「罫線はコンテナが持たず、必ず末端のセル（labelCell・valueCell）自身が持つ」という
// 単一ルールに全面統一した。これにより：
//   ・コンテナ(sharedStyles.row/rowLast)は罫線を一切持たない（レイアウトのみ）
//   ・最終行以外は、labelCell・valueCellの両方に必ずbottomBorderを付与する（redundantBorder
//     プロパティは廃止・全行で自動的に同じ扱いになる）
//   ・値欄の中身（PersonGridRow・SplitLines・WageGrid等）は「内部の仕切り線」だけを持ち、
//     一番最後の要素は罫線を持たない（外側のvalueCellが行末の罫線を担当するため）
// という構成にすることで、罫線が二重になる可能性を構造的に排除した。
export const LabeledRow = ({
  label, labelStyle, children, last, minHeight, forceBreakBefore,
}: {
  label: string; labelStyle?: Record<string, any>; children: React.ReactNode; last?: boolean
  minHeight?: number
  // 2026-07-08追加：trueを指定した行は、react-pdfの自動改ページに任せず必ずこの行の直前で
  // ページを区切る（break）。あわせて上罫線を付与し、新しいページの先頭で表が正しく
  // 囲まれて見えるようにする。データ量によって自動改ページの位置が変わってしまう箇所
  // （指揮命令者〜苦情処理申出先付近）でのみ使う想定。
  forceBreakBefore?: boolean
}) => {
  const labelCellStyle: Record<string, any>[] = [sharedStyles.labelCell]
  const valueCellStyle: Record<string, any>[] = [sharedStyles.valueCell]
  if (!last) {
    labelCellStyle.push(sharedStyles.bottomBorder)
    valueCellStyle.push(sharedStyles.bottomBorder)
  }
  if (forceBreakBefore) {
    labelCellStyle.push(sharedStyles.topBorder)
    valueCellStyle.push(sharedStyles.topBorder)
  }
  // 2026-07-08修正：break propを行自身のView（wrap={false}と同居）に付けても効かない
  // （react-pdfの実機検証で確認：wrap={false}と同じViewにbreakを指定すると無視され、
  // 自動改ページの位置がそのまま優先されてしまう）。react-pdfで実際に確実にページ区切りを
  // 強制する定石どおり、breakだけを持つ空のView（幅0・見た目に影響しないマーカー）を
  // 行の直前に兄弟要素として置く方式に変更した。
  return (
    <>
      {forceBreakBefore && <View break />}
      <View wrap={false} style={minHeight ? [sharedStyles.row, { minHeight }] : sharedStyles.row}>
        <View style={labelCellStyle}>
          <Text style={labelStyle ? [sharedStyles.labelText, labelStyle] as any : sharedStyles.labelText}>{label}</Text>
        </View>
        <View style={valueCellStyle}>{children}</View>
      </View>
    </>
  )
}

export const SplitLines = ({ lines }: { lines: { label: string; value: React.ReactNode }[] }) => (
  <>
    {lines.map((l, i) => (
      <View key={i} wrap={false} style={i < lines.length - 1 ? sharedStyles.splitLineWithBorder : sharedStyles.splitLine}>
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
  <View wrap={false} style={sharedStyles.boxedSplitRow}>
    <View style={sharedStyles.boxedSplitMain}>{typeof main === 'string' ? <Text>{main}</Text> : main}</View>
    <View style={sharedStyles.boxedSplitBox}>
      <Text style={sharedStyles.boxedSplitBoxLabel}>{boxLabel}</Text>
      {typeof boxValue === 'string' ? <Text>{boxValue}</Text> : boxValue}
    </View>
  </View>
)

// 担当者情報（部署名／役職／氏名／電話番号）の共通表示部品。
// 2026-07-08再修正：以前は「部署名：X　役職：Y　氏名：Z　電話番号：W」を1つの文として
// 折り返し表示していたが、伊藤さんの指摘でExcel実物（就業条件明示書_有期.xlsx等の
// 指揮命令者・派遣先責任者・派遣元責任者・苦情処理申出先の各行）を列幅まで含めて再確認したところ、
// 実際は「部署名｜値｜役職｜値｜氏名｜値｜電話番号｜値」を罫線で区切った1行の表（グリッド）で、
// 文章の折り返しではなかったことが判明。列幅の比率もExcelの実列幅（ptで算出）から再現している
// （通常行：11.0%/25.4%/5.1%/12.7%/7.6%/12.7%/10.2%/15.3%。苦情処理申出先は先頭ラベルに
// 「［派遣先］／［派遣元］」が付き列が広がるため16.1%/20.3%/5.1%/12.7%/7.6%/12.7%/10.2%/15.3%）。
export const personGridStyles = StyleSheet.create({
  // 2026-07-08全面改訂（罫線アーキテクチャ統一）：以前はこのrow自身にも下罫線を
  // 持たせていたが（外側のLabeledRowの罫線が非決定的に描画されない対策として）、
  // LabeledRow側を「行末の罫線は必ずvalueCell自身が持つ」方式に統一したことで、
  // PersonGridRowが1つだけ（＝そのLabeledRowの最後かつ唯一の内容）の場合は
  // 外側のvalueCellが行末の罫線を担当するため、rowはもう罫線を持つ必要が無い。
  // rowWithBorder（薄い罫線）は、苦情処理申出先のように複数のPersonGridRowが
  // 縦に並ぶ場合の「内部の仕切り線」としてのみ使う（一番下の要素には使わない）。
  // 2026-07-08再修正：部署名が短い（1行に収まる）行（例：派遣元責任者）だと、
  // ラベル欄（LabeledRowのlabelCell・太字1行分の高さ）の方がこの行自身の自然な高さより
  // わずかに高くなり、外側の行が全体としてはラベル欄の高さに合わせて伸びる一方、
  // この行（内側のグリッド）自身は伸びずに元の高さのまま残ってしまい、結果として
  // 縦の仕切り線が下の横罫線まで届かない隙間ができる不具合があった（伊藤さん指摘）。
  // flex: 1を指定し、親（valueCell）が伸びた分だけこの行も必ず追従して伸びるようにする
  // ことで、縦の仕切り線が常に下の横罫線まで届くようにした。
  row: {
    flexDirection: 'row',
  },
  rowWithBorder: {
    flexDirection: 'row',
    borderBottomWidth: THIN,
    borderColor: BORDER,
  },
  // 2026-07-08再修正：paddingVerticalをLabeledRowのlabelCell（padding: '3 4' -> 上下3ptずつ）と
  // 揃えて3に変更（以前は2）。部署名が短い1行だけの行（例：派遣元責任者）だと、この行自身の
  // 自然な高さがラベル欄（太字1行・上下3pt）より低くなり、外側のvalueCellがラベル欄に
  // 合わせて（stretchで）伸びても、この行の中の縦の仕切り線は自分自身の元の高さまでしか
  // 描画されず、下の横罫線まで届かない隙間ができる不具合があった（伊藤さん指摘）。
  // flexやheight:'100%'によるstretchで後から引き伸ばす対応も試したが、react-pdf/Yogaの
  // 「高さが未確定な親を持つ場合のflex/パーセント指定」は挙動が不安定で、行の高さが
  // 想定外に巨大化したり文字が重なったりする副作用が出た。そのため、そもそも高さが
  // 食い違わないようpaddingの数値をラベル欄と一致させ、単純に自然な高さを揃える方式に
  // 変更した（stretchに頼らない、より確実な対策）。
  cellLabel: {
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  cellValue: {
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  cellValueLast: {
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
})

export const PersonGridRow = ({
  deptLabel = '部署名', dept, role, name, tel,
  deptLabelWidth = '11.0%', deptValueWidth = '25.4%', withBorder,
}: {
  deptLabel?: string; dept: string; role: string; name: string; tel: string
  deptLabelWidth?: string; deptValueWidth?: string; withBorder?: boolean
}) => (
  <View style={withBorder ? personGridStyles.rowWithBorder : personGridStyles.row}>
    <View style={[personGridStyles.cellLabel, { width: deptLabelWidth }]}><Text style={sharedStyles.labelText}>{deptLabel}</Text></View>
    <View style={[personGridStyles.cellValue, { width: deptValueWidth }]}><Text>{dept || '―'}</Text></View>
    <View style={[personGridStyles.cellLabel, { width: '5.1%' }]}><Text style={sharedStyles.labelText}>役職</Text></View>
    <View style={[personGridStyles.cellValue, { width: '12.7%' }]}><Text>{role || '―'}</Text></View>
    <View style={[personGridStyles.cellLabel, { width: '7.6%' }]}><Text style={sharedStyles.labelText}>氏名</Text></View>
    <View style={[personGridStyles.cellValue, { width: '12.7%' }]}><Text>{name || '―'}</Text></View>
    <View style={[personGridStyles.cellLabel, { width: '10.2%' }]}><Text style={sharedStyles.labelText}>電話番号</Text></View>
    <View style={[personGridStyles.cellValueLast, { width: '15.3%' }]}><Text>{tel || '―'}</Text></View>
  </View>
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
        <View key={i} wrap={false} style={i < rows.length - 1 ? sharedStyles.wageGridRow : sharedStyles.wageGridRowLast}>
          <View style={sharedStyles.wageCellLabel}><Text>{l1}</Text></View>
          <View style={sharedStyles.wageCellValue}>{typeof v1 === 'string' ? <Text>{v1}</Text> : v1}</View>
          <View style={sharedStyles.wageCellLabel}><Text>{l2}</Text></View>
          <View style={sharedStyles.wageCellValueLast}><Text>{v2}</Text></View>
        </View>
      ))}
    </>
  )
}
