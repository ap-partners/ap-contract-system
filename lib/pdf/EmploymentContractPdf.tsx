// ===== 雇用契約書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章の確定仕様に基づく。パターンA（雇用契約書のみ・6STEP）。
// 有期契約／無期契約／正社員／アルバイトの4区分に対応。A4縦・1ページ固定。
// 2026-07-07実装。同日、ベース資料（実物の無期雇用契約書PDF）と突き合わせてレイアウトを
// 精密化（列比率・罫線・賃金グリッド・始業終業の2行分割・交通費補足注記・自社住所欄等）。
// 2026-07-08：フォント登録・共通スタイル・LabeledRow等はlib/pdf/pdfShared.tsxへ切り出し
// （就業条件明示書・兼用版と共通化するため）。
import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  toJpDate, getRetirementClause, HOLIDAY_CLAUSE_LINES_FIXED, getHolidayClauseLine1,
  WAGE_PAYMENT_TEXT,
  getDeductionText, getInsuranceLine, getTrialText, getRemarksText, getTransportText,
  getTransportSecondaryNote, getWorkDaysText, getFlexTimeText, getFlexTimeNote, COMPANY_HQ_ADDRESS_LINES,
  formatHoursMinutes, formatMinutes,
} from './documentText'
import {
  sharedStyles, LabeledRow, SplitLines, BoxedSplitRow, WageGrid,
  COMPANY_SEAL_PATH, SealSideBySide,
} from './pdfShared'

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
  // 2026-07-08追加（フェーズ5・署名機能）：従業員の手書き署名画像（PNGのdata URL）。
  // /sign/[id]で署名完了した時にのみ渡される。未署名の間はundefinedのまま（欄は空欄で出力）。
  signatureImageDataUrl?: string
}

const EmploymentPeriodRow = ({ p }: { p: EmploymentContractPdfProps }) => {
  const isIndefinite = p.contractType === '無期契約' || p.contractType === '正社員'
  const mainText = isIndefinite ? '期間の定めなし' : `自　${toJpDate(p.employStart)}　　至　${toJpDate(p.employEnd)}`
  return (
    <LabeledRow label="雇用期間">
      {/* 2026-07-07修正：契約条件適用開始日は無期契約・正社員のみ意味を持つ欄のため、
          有期契約・アルバイトでは欄自体を表示しない（空欄のまま出すのではなく非表示にする）。 */}
      {isIndefinite ? (
        <BoxedSplitRow
          main={mainText}
          boxLabel="契約条件適用開始日"
          boxValue={toJpDate(p.contractStartDate)}
        />
      ) : (
        <Text style={sharedStyles.freeText}>{mainText}</Text>
      )}
    </LabeledRow>
  )
}

export const EmploymentContractPdf = (p: EmploymentContractPdfProps) => {
  const retirementClause = getRetirementClause(p.contractType)
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther)
  const overtimeHoursNote = Number(p.overtimeHours) > 0 ? `※定額残業時間：${p.overtimeHours}時間` : ''
  const deductionText = getDeductionText(p.hasEmployInsurance, p.hasSocialInsurance)
  const transportSecondaryNote = getTransportSecondaryNote(p.transportType)
  const flexTimeNote = getFlexTimeNote(p.flexTime)

  return (
    <Document>
      <Page size="A4" style={sharedStyles.page}>
        <Text style={sharedStyles.title}>{p.documentLabel}</Text>
        <Text style={sharedStyles.intro}>
          株式会社ＡＰパートナーズ(以下「甲」という)と　{p.employeeName}　(以下「乙」という)は、下記のとおり雇用契約を締結する。
        </Text>

        <View style={sharedStyles.table}>
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

          <LabeledRow label={'所定労働日数\n所定労働時間'}>
            <BoxedSplitRow
              main={
                <>
                  <Text>{workDaysText}</Text>
                  <Text>{formatHoursMinutes(p.workingHoursH, p.workingHoursM)}</Text>
                </>
              }
              boxLabel="休憩時間"
              boxValue={formatMinutes(p.breakTime)}
            />
          </LabeledRow>

          <LabeledRow label="変形労働時間制">
            <BoxedSplitRow
              main={
                flexTimeNote ? (
                  <Text>{getFlexTimeText(p.flexTime)}　<Text style={sharedStyles.flexTimeNote}>{flexTimeNote}</Text></Text>
                ) : (
                  getFlexTimeText(p.flexTime)
                )
              }
              boxLabel="所定労働時間を超える労働"
              boxValue={p.overtime || '―'}
            />
          </LabeledRow>

          <LabeledRow label={'休日又は勤務\n休暇'}>
            <View style={sharedStyles.freeText}>
              <Text>{getHolidayClauseLine1(p.workDays, p.workDaysOther, p.isShift)}</Text>
              {HOLIDAY_CLAUSE_LINES_FIXED.map((line, i) => <Text key={i}>{line}</Text>)}
            </View>
          </LabeledRow>

          <LabeledRow label="賃金">
            <WageGrid p={p} overtimeHoursNote={overtimeHoursNote} />
          </LabeledRow>

          <LabeledRow label={'賃金支払方法\n\n支払時の控除'}>
            <View style={sharedStyles.freeText}>
              <Text>{WAGE_PAYMENT_TEXT}</Text>
              <Text>賃金支払時の控除：{deductionText || 'なし'}</Text>
            </View>
          </LabeledRow>

          <LabeledRow label="交通費">
            <View style={sharedStyles.freeText}>
              <Text>{getTransportText(p.transportType)}</Text>
              {transportSecondaryNote ? <Text>{transportSecondaryNote}</Text> : null}
            </View>
          </LabeledRow>

          {retirementClause && (
            <LabeledRow label="退職・解雇"><Text style={sharedStyles.freeText}>{retirementClause}</Text></LabeledRow>
          )}

          <LabeledRow label="各種保険"><Text style={sharedStyles.freeText}>{getInsuranceLine(p.hasEmployInsurance, p.hasSocialInsurance)}</Text></LabeledRow>

          <LabeledRow label="試用期間" minHeight={62}>
            <Text style={sharedStyles.freeText}>{getTrialText(p.trialPeriod, p.trialStart, p.trialEnd)}</Text>
          </LabeledRow>

          <LabeledRow label={'備考\nその他'} last>
            <Text style={sharedStyles.freeText}>{getRemarksText(p.pattern, p.contractType, p.bonusType)}</Text>
          </LabeledRow>
        </View>

        <Text style={sharedStyles.footerText}>
          株式会社APパートナーズは本書にて提示した内容に相違ないことを保証し、従業員は上記提示内容を承諾する。
        </Text>

        <View style={sharedStyles.signatureRow}>
          <View style={sharedStyles.signatureCol}>
            <SealSideBySide showSeal={p.showSeal} sealSrc={COMPANY_SEAL_PATH} textColWidth={98} gap={-12}>
              <Text>会社</Text>
              {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
              <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
              <Text style={{ marginTop: 6 }}>代表取締役　山田　昌</Text>
            </SealSideBySide>
          </View>
          <View style={sharedStyles.signatureCol}>
            <SealSideBySide showSeal={!!p.signatureImageDataUrl} sealSrc={p.signatureImageDataUrl || ''}>
              <Text>従業員</Text>
              {/* 2026-07-07：住所データは現時点でstaffテーブルに存在しないため空欄運用。
                  将来データが入った際、住所が長くて2行になっても崩れないよう、
                  固定高さを設けず自然に折り返す構造に最初からしておく（骨格のみ先行対応）。
                  2026-07-09：住所データの反映バグを別途修正済み（申請保存時のスナップショット漏れ）。
                  2026-07-09再々修正：印の配置を「氏名の行に重ねる」方式から、伊藤さんのサンプル
                  画像に基づく「テキストブロック全体の右側に固定配置」方式（SealSideBySide）に
                  変更。住所・氏名がどれだけ長くても、左列（flex:1）の中で自然に折り返すだけで、
                  右側の印の位置・サイズには一切影響しない。 */}
              <Text>住所：{p.employeeAddress || ''}</Text>
              <Text>氏名：{p.employeeName}</Text>
            </SealSideBySide>
          </View>
        </View>
      </Page>
    </Document>
  )
}
