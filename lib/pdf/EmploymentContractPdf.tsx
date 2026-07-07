// ===== 雇用契約書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章の確定仕様に基づく。パターンA（雇用契約書のみ・6STEP）。
// 有期契約／無期契約／正社員／アルバイトの4区分に対応。A4縦・1ページ固定。
// 2026-07-07実装（第1弾：雇用契約書のみ。就業条件明示書・兼用版・AP版・アルバイト誓約書は別途対応）。
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import {
  toJpDate, getRetirementClause, HOLIDAY_CLAUSE_LINES, WAGE_PAYMENT_TEXT, OVERTIME_RATE_TEXT,
  getDeductionText, getInsuranceLine, getTrialText, getRemarksText, getTransportText,
  formatHoursMinutes, formatMinutes, formatSalaryType, formatYen,
} from './documentText'

// 日本語フォント登録。IPAexゴシック（ipaexg.ttf）を assets/fonts に配置する運用（README参照）。
// react-pdfはNode実行時、ローカルファイルパスを直接読み込める。
Font.register({
  family: 'IPAexGothic',
  src: path.join(process.cwd(), 'assets', 'fonts', 'ipaexg.ttf'),
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'IPAexGothic',
    fontSize: 8,
    lineHeight: 1.35,
    padding: 24,
    color: '#111111',
  },
  title: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  intro: {
    marginBottom: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: '#000000',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000000',
  },
  rowLast: {
    flexDirection: 'row',
  },
  labelCell: {
    width: '16%',
    padding: 3,
    borderRightWidth: 1,
    borderColor: '#000000',
    justifyContent: 'center',
  },
  valueCell: {
    width: '84%',
    padding: 3,
  },
  subLine: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  subLabel: {
    width: 70,
  },
  subValue: {
    flex: 1,
  },
  footerText: {
    marginTop: 6,
    marginBottom: 10,
  },
  signatureRow: {
    flexDirection: 'row',
  },
  signatureCol: {
    width: '50%',
  },
})

export interface EmploymentContractPdfProps {
  contractType: string // '有期契約' | '無期契約' | '正社員' | 'アルバイト'
  documentLabel: string // 画面表示用の帳票名（例：雇用契約書（有期））
  employeeName: string
  workLocationName: string
  workLocationAddress: string
  workLocationTel: string
  businessContent: string
  startTime: string
  endTime: string
  isShift: boolean
  workDays: string
  workDaysOther: string
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
}

const EmploymentPeriodValue = ({ p }: { p: EmploymentContractPdfProps }) => {
  if (p.contractType === '無期契約' || p.contractType === '正社員') {
    return <Text>自　{toJpDate(p.contractStartDate)}　　至　定めなし</Text>
  }
  return <Text>自　{toJpDate(p.employStart)}　　至　{toJpDate(p.employEnd)}</Text>
}

const LabeledRow = ({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) => (
  <View style={last ? styles.rowLast : styles.row}>
    <View style={styles.labelCell}><Text>{label}</Text></View>
    <View style={styles.valueCell}>{children}</View>
  </View>
)

export const EmploymentContractPdf = (p: EmploymentContractPdfProps) => {
  const retirementClause = getRetirementClause(p.contractType)
  const workDaysText = p.workDays === 'other' ? p.workDaysOther : p.workDays
  const overtimeHoursNote = Number(p.overtimeHours) > 0 ? `　※定額残業時間：${p.overtimeHours}時間` : ''
  const deductionText = getDeductionText(p.hasEmployInsurance, p.hasSocialInsurance)

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>
        <Text style={styles.title}>{p.documentLabel}</Text>
        <Text style={styles.intro}>
          株式会社ＡＰパートナーズ(以下「甲」という)と　{p.employeeName}　(以下「乙」という)は、下記のとおり雇用契約を締結する。
        </Text>

        <View style={styles.table}>
          <LabeledRow label="雇用期間"><EmploymentPeriodValue p={p} /></LabeledRow>

          <LabeledRow label="就業場所">
            <Text>(雇入れ時)　{p.workLocationName}　{p.workLocationAddress}　TEL {p.workLocationTel}</Text>
            <Text>(変更の範囲)　会社の定める事業所</Text>
          </LabeledRow>

          <LabeledRow label="従事すべき業務内容">
            <Text>(雇入れ時)　{p.businessContent}</Text>
            <Text>(変更の範囲)　会社が指示する業務</Text>
          </LabeledRow>

          <LabeledRow label="始業・終業時刻">
            <Text>始業　{p.startTime}　　終業　{p.endTime}{p.isShift ? '　（シフト制）' : ''}</Text>
          </LabeledRow>

          <LabeledRow label="所定労働日数"><Text>{workDaysText || '―'}</Text></LabeledRow>
          <LabeledRow label="所定労働時間"><Text>{formatHoursMinutes(p.workingHoursH, p.workingHoursM)}</Text></LabeledRow>
          <LabeledRow label="休憩時間"><Text>{formatMinutes(p.breakTime)}</Text></LabeledRow>

          <LabeledRow label={'休日又は勤務\n休暇'}>
            {HOLIDAY_CLAUSE_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
          </LabeledRow>

          <LabeledRow label="賃金">
            <View style={styles.subLine}><Text style={styles.subLabel}>給与の種類</Text><Text style={styles.subValue}>{formatSalaryType(p.salaryType)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>基本給</Text><Text style={styles.subValue}>{formatYen(p.basicSalary)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>職能給</Text><Text style={styles.subValue}>{formatYen(p.skillPay)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>役職手当</Text><Text style={styles.subValue}>{formatYen(p.rolePay)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>営業手当</Text><Text style={styles.subValue}>{formatYen(p.salesPay)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>住宅手当</Text><Text style={styles.subValue}>{formatYen(p.housingPay)}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>定額残業手当</Text><Text style={styles.subValue}>{formatYen(p.overtimePay)}{overtimeHoursNote}</Text></View>
            <View style={styles.subLine}><Text style={styles.subLabel}>割増賃金率</Text><Text style={styles.subValue}>{OVERTIME_RATE_TEXT}</Text></View>
          </LabeledRow>

          <LabeledRow label={'賃金支払方法\n\n支払時の控除'}>
            <Text>{WAGE_PAYMENT_TEXT}</Text>
            <Text>賃金支払時の控除：{deductionText || 'なし'}</Text>
          </LabeledRow>

          <LabeledRow label="交通費"><Text>{getTransportText(p.transportType)}</Text></LabeledRow>

          {retirementClause && (
            <LabeledRow label="退職・解雇"><Text>{retirementClause}</Text></LabeledRow>
          )}

          <LabeledRow label="各種保険"><Text>{getInsuranceLine(p.hasEmployInsurance, p.hasSocialInsurance)}</Text></LabeledRow>

          <LabeledRow label="試用期間"><Text>{getTrialText(p.trialPeriod, p.trialStart, p.trialEnd)}</Text></LabeledRow>

          <LabeledRow label={'備考\nその他'} last>
            <Text>{getRemarksText(p.pattern, p.contractType, p.bonusType)}</Text>
          </LabeledRow>
        </View>

        <Text style={styles.footerText}>
          株式会社APパートナーズは本書にて提示した内容に相違ないことを保証し、従業員は上記提示内容を承諾する。
        </Text>

        <View style={styles.signatureRow}>
          <View style={styles.signatureCol}>
            <Text>会社</Text>
            <Text>株式会社APパートナーズ</Text>
            <Text>代表取締役　山田　昌</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text>従業員</Text>
            <Text>住所：</Text>
            <Text>氏名：{p.employeeName}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
