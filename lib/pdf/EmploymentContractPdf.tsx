// ===== 雇用契約書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章の確定仕様に基づく。パターンA（雇用契約書のみ・6STEP）。
// 有期契約／無期契約／正社員／アルバイトの4区分に対応。A4縦・1ページ固定。
// 2026-07-07実装。同日、ベース資料（実物の無期雇用契約書PDF）と突き合わせてレイアウトを
// 精密化（列比率・罫線・賃金グリッド・始業終業の2行分割・交通費補足注記・自社住所欄等）。
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer'
import path from 'path'
import {
  toJpDate, getRetirementClause, HOLIDAY_CLAUSE_LINES_FIXED, getHolidayClauseLine1,
  WAGE_PAYMENT_TEXT, OVERTIME_RATE_TEXT,
  getDeductionText, getInsuranceLine, getTrialText, getRemarksText, getTransportText,
  getTransportSecondaryNote, getWorkDaysText, getFlexTimeText, COMPANY_HQ_ADDRESS_LINES,
  formatHoursMinutes, formatMinutes, formatSalaryType, formatYen,
} from './documentText'

// 日本語フォント登録。
// ベース資料（実物の雇用契約書PDF）の埋め込みフォントを実際に抽出・解析した結果、
// 本文フォントは「MS P明朝」であることを確認済み（2026-07-07）。
// MS P明朝は同梱・再配布不可のため、metric互換のフリーフォント「IPAex明朝」を採用。
// 太字はIPAex明朝に太字ウェイトが無いため、「Noto Serif JP Bold」を組み合わせて
// 同一ファミリー名（BodyFont）に登録し、fontWeight: 'bold' 指定だけで自動的に
// 太字側が使われるようにしている。
Font.register({
  family: 'BodyFont',
  fonts: [
    { src: path.join(process.cwd(), 'assets', 'fonts', 'ipaexm.ttf'), fontWeight: 'normal' },
    { src: path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifJP-Bold.ttf'), fontWeight: 'bold' },
  ],
})

// 2026-07-07：長い単語が行末で自動的に「-」区切りされる（ハイフネーション）機能を無効化。
// 素人には意味が分からないため不要、という伊藤さんの指摘により、単語をそのまま1つの塊として扱う。
Font.registerHyphenationCallback(word => [word])

// 会社印影（社印）画像。契約書関連フォルダのExcelテンプレートに埋め込まれていたものを流用。
// 2026-07-07決定：SSC承認前の下書き段階では表示せず、承認後の最終版のみに印字する（showSealで制御）。
const COMPANY_SEAL_PATH = path.join(process.cwd(), 'assets', 'images', 'company-seal.png')

// ベース資料（実物の雇用契約書PDF）に合わせた罫線・比率の定数
const BORDER = '#000000'
const LABEL_COL_WIDTH = '17%'
const THICK = 1
const THIN = 0.6

const styles = StyleSheet.create({
  page: {
    fontFamily: 'BodyFont',
    fontSize: 8.3,
    lineHeight: 1.32,
    padding: 26,
    color: '#000000',
  },
  title: {
    fontSize: 15,
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
  boxedSplitRow: {
    flexDirection: 'row',
  },
  boxedSplitMain: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  boxedSplitBox: {
    width: 132,
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
})

export interface EmploymentContractPdfProps {
  contractType: string
  documentLabel: string
  employeeName: string
  employeeAddress?: string
  workLocationName: string
  workLocationAddress: string
  workLocationTel: string
  businessContent: string
  startTime: string
  endTime: string
  isShift: boolean
  workDays: string
  workDaysOther: string
  flexTime: string
  workingHoursH: string | number
  workingHoursM: string | number
  breakTime: string | number
  employStart: string
  employEnd: string
  contractStartDate: string
  salaryType: string
  basicSalary: string | number
  skillPay: string | number
  rolePay: string | number
  salesPay: string | number
  housingPay: string | number
  overtimePay: string | number
  overtimeHours: string | number
  hasEmployInsurance: boolean
  hasSocialInsurance: boolean
  transportType: string
  trialPeriod: string
  trialStart: string
  trialEnd: string
  pattern: string
  bonusType: string
  overtime: string
  showSeal: boolean
}

const BoxedSplitRow = ({ main, boxLabel, boxValue }: { main: React.ReactNode; boxLabel: string; boxValue: React.ReactNode }) => (
  <View style={styles.boxedSplitRow}>
    <View style={styles.boxedSplitMain}>{typeof main === 'string' ? <Text>{main}</Text> : main}</View>
    <View style={styles.boxedSplitBox}>
      <Text style={styles.boxedSplitBoxLabel}>{boxLabel}</Text>
      {typeof boxValue === 'string' ? <Text>{boxValue}</Text> : boxValue}
    </View>
  </View>
)

const EmploymentPeriodRow = ({ p }: { p: EmploymentContractPdfProps }) => {
  const isIndefinite = p.contractType === '無期契約' || p.contractType === '正社員'
  const mainText = isIndefinite ? '期間の定めなし' : `自　${toJpDate(p.employStart)}　　至　${toJpDate(p.employEnd)}`
  return (
    <View style={styles.row}>
      <View style={styles.labelCell}><Text style={styles.labelText}>雇用期間</Text></View>
      <View style={styles.valueCell}>
        {/* 2026-07-07修正：契約条件適用開始日は無期契約・正社員のみ意味を持つ欄のため、
            有期契約・アルバイトでは欄自体を表示しない（空欄のまま出すのではなく非表示にする）。 */}
        {isIndefinite ? (
          <BoxedSplitRow
            main={mainText}
            boxLabel="契約条件適用開始日"
            boxValue={toJpDate(p.contractStartDate)}
          />
        ) : (
          <Text style={styles.freeText}>{mainText}</Text>
        )}
      </View>
    </View>
  )
}

const LabeledRow = ({ label, children, last, minHeight }: { label: string; children: React.ReactNode; last?: boolean; minHeight?: number }) => (
  <View style={minHeight ? [last ? styles.rowLast : styles.row, { minHeight }] : (last ? styles.rowLast : styles.row)}>
    <View style={styles.labelCell}><Text style={styles.labelText}>{label}</Text></View>
    <View style={styles.valueCell}>{children}</View>
  </View>
)

const SplitLines = ({ lines }: { lines: { label: string; value: React.ReactNode }[] }) => (
  <>
    {lines.map((l, i) => (
      <View key={i} style={i < lines.length - 1 ? styles.splitLineWithBorder : styles.splitLine}>
        {/* 2026-07-07：labelをTextのまま罫線を付けると、太字フォントの行高計算により
            右の値側より縦罫線が短く見えることがあったため、labelCellと同様にViewで
            囲んで罫線を持たせる形に変更（Viewはflexの高さ揃えが効くため隣と揃う）。 */}
        <View style={styles.splitSubLabel}><Text>{l.label}</Text></View>
        <View style={styles.splitSubValue}>
          {typeof l.value === 'string' ? <Text>{l.value}</Text> : l.value}
        </View>
      </View>
    ))}
  </>
)

const WageGrid = ({ p, overtimeHoursNote }: { p: EmploymentContractPdfProps; overtimeHoursNote: string }) => {
  // 2026-07-07修正：「50,000円　※定額残業時間：10時間」のように1行が長くなると、
  // 数字と「円」の間で不格好に改行されることがあったため、金額と注記を明示的に別行にする。
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
        <View key={i} style={i < rows.length - 1 ? styles.wageGridRow : styles.wageGridRowLast}>
          <View style={styles.wageCellLabel}><Text>{l1}</Text></View>
          <View style={styles.wageCellValue}>{typeof v1 === 'string' ? <Text>{v1}</Text> : v1}</View>
          <View style={styles.wageCellLabel}><Text>{l2}</Text></View>
          <View style={styles.wageCellValueLast}><Text>{v2}</Text></View>
        </View>
      ))}
    </>
  )
}

export const EmploymentContractPdf = (p: EmploymentContractPdfProps) => {
  const retirementClause = getRetirementClause(p.contractType)
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther)
  const overtimeHoursNote = Number(p.overtimeHours) > 0 ? `※定額残業時間：${p.overtimeHours}時間` : ''
  const deductionText = getDeductionText(p.hasEmployInsurance, p.hasSocialInsurance)
  const transportSecondaryNote = getTransportSecondaryNote(p.transportType)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{p.documentLabel}</Text>
        <Text style={styles.intro}>
          株式会社ＡＰパートナーズ(以下「甲」という)と　{p.employeeName}　(以下「乙」という)は、下記のとおり雇用契約を締結する。
        </Text>

        <View style={styles.table}>
          <EmploymentPeriodRow p={p} />

          <LabeledRow label="就業場所">
            <SplitLines lines={[
              {
                label: '(雇入れ時)',
                value: `${p.workLocationName}　${p.workLocationAddress}${p.workLocationTel ? `　TEL ${p.workLocationTel}` : ''}`,
              },
              { label: '(変更の範囲)', value: '会社の定める事業所' },
            ]} />
          </LabeledRow>

          <LabeledRow label={'従事すべき\n業務内容'}>
            <SplitLines lines={[
              { label: '(雇入れ時)', value: p.businessContent },
              { label: '(変更の範囲)', value: '会社が指示する業務' },
            ]} />
          </LabeledRow>

          <LabeledRow label="始業・終業時刻">
            <SplitLines lines={[
              { label: '始業', value: p.startTime },
              { label: '終業', value: p.endTime + (p.isShift ? '　※シフトに準ずる' : '') },
            ]} />
          </LabeledRow>

          {/* 2026-07-07：伊藤さんの指示により、所定労働日数を「所定労働時間を超える労働」の左側（同じ行）に、
              変形労働時間制の有無を「所定労働時間を超える労働」の下・休憩時間の右側（次の行）に配置。 */}
          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>{'所定労働日数\n所定労働時間'}</Text></View>
            <View style={styles.valueCell}>
              <BoxedSplitRow
                main={
                  <>
                    <Text>{workDaysText}</Text>
                    <Text>{formatHoursMinutes(p.workingHoursH, p.workingHoursM)}</Text>
                  </>
                }
                boxLabel="所定労働時間を超える労働"
                boxValue={p.overtime || '―'}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.labelCell}><Text style={styles.labelText}>休憩時間</Text></View>
            <View style={styles.valueCell}>
              <BoxedSplitRow
                main={formatMinutes(p.breakTime)}
                boxLabel="変形労働時間制"
                boxValue={getFlexTimeText(p.flexTime)}
              />
            </View>
          </View>

          <LabeledRow label={'休日又は勤務\n休暇'}>
            <View style={styles.freeText}>
              <Text>{getHolidayClauseLine1(p.workDays, p.workDaysOther, p.isShift)}</Text>
              {HOLIDAY_CLAUSE_LINES_FIXED.map((line, i) => <Text key={i}>{line}</Text>)}
            </View>
          </LabeledRow>

          <LabeledRow label="賃金">
            <WageGrid p={p} overtimeHoursNote={overtimeHoursNote} />
          </LabeledRow>

          <LabeledRow label={'賃金支払方法\n\n支払時の控除'}>
            <View style={styles.freeText}>
              <Text>{WAGE_PAYMENT_TEXT}</Text>
              <Text>賃金支払時の控除：{deductionText || 'なし'}</Text>
            </View>
          </LabeledRow>

          <LabeledRow label="交通費">
            <View style={styles.freeText}>
              <Text>{getTransportText(p.transportType)}</Text>
              {transportSecondaryNote ? <Text>{transportSecondaryNote}</Text> : null}
            </View>
          </LabeledRow>

          {retirementClause && (
            <LabeledRow label="退職・解雇"><Text style={styles.freeText}>{retirementClause}</Text></LabeledRow>
          )}

          <LabeledRow label="各種保険"><Text style={styles.freeText}>{getInsuranceLine(p.hasEmployInsurance, p.hasSocialInsurance)}</Text></LabeledRow>

          <LabeledRow label="試用期間" minHeight={62}>
            <Text style={styles.freeText}>{getTrialText(p.trialPeriod, p.trialStart, p.trialEnd)}</Text>
          </LabeledRow>

          <LabeledRow label={'備考\nその他'} last>
            <Text style={styles.freeText}>{getRemarksText(p.pattern, p.contractType, p.bonusType)}</Text>
          </LabeledRow>
        </View>

        <Text style={styles.footerText}>
          株式会社APパートナーズは本書にて提示した内容に相違ないことを保証し、従業員は上記提示内容を承諾する。
        </Text>

        <View style={styles.signatureRow}>
          <View style={styles.signatureCol}>
            <Text>会社</Text>
            {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
            <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
            <Text>代表取締役　山田　昌</Text>
            {p.showSeal && <Image src={COMPANY_SEAL_PATH} style={styles.companySeal} />}
          </View>
          <View style={styles.signatureCol}>
            <Text>従業員</Text>
            {/* 2026-07-07：住所データは現時点でstaffテーブルに存在しないため空欄運用。
                将来データが入った際、住所が長くて2行になっても崩れないよう、
                固定高さを設けず自然に折り返す構造に最初からしておく（骨格のみ先行対応）。 */}
            <Text>住所：{p.employeeAddress || ''}</Text>
            <Text>氏名：{p.employeeName}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
