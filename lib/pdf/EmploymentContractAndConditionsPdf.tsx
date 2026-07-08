// ===== 雇用契約書 兼 就業条件明示書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章・4-1章の確定仕様に基づく。パターンC（兼用版・8STEP）。
// パターンA（雇用契約書）とパターンB（就業条件明示書）の全項目を1つの帳票に統合したもの。
// 2026-07-08実装（契約書関連フォルダの「雇用契約書(兼)就業条件明示書_有期.xlsx」
// 「雇用契約書(兼)就業条件明示書_無期.xlsx」のセル内容から書き起こし。
// 有期・無期どちらもテンプレート構成は同一のため、雇用期間行のみ契約種別で出し分ける
// （EmploymentContractPdf.tsxのEmploymentPeriodRowと同じロジック）。
// A4縦・react-pdfの自動改ページに任せて2ページ構成になる。
//
// 署名機能（フェーズ5）上の扱い：パターンCは実署名が必要な帳票のため（雇用契約書を含む）、
// パターンA同様、従業員の手書き署名欄・会社印影欄を設ける（docs/SYSTEM_DESIGN.md 10章2026-07-08参照）。
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import {
  toJpDate, getRetirementClause, HOLIDAY_CLAUSE_LINES_FIXED, getHolidayClauseLine1,
  WAGE_PAYMENT_TEXT, getDeductionText, getInsuranceLine, getTrialText, getRemarksText,
  getTransportText, getTransportSecondaryNote, getWorkDaysText, getFlexTimeText, getFlexTimeNote,
  COMPANY_HQ_ADDRESS_LINES, formatHoursMinutes, formatMinutes,
  CONFLICT_DATE_NOTICE_TEXT, COMPLAINT_HANDLING_TEXT, DISPATCH_CANCEL_MEASURES_TEXT,
  getAgreementLaborText, CONTRACT_RENEWAL_TEXT, getDispatchFeeAvgText, getConflictDateText,
} from './documentText'
import {
  sharedStyles, LabeledRow, SplitLines, BoxedSplitRow, WageGrid, PersonGridRow,
  COMPANY_SEAL_PATH,
} from './pdfShared'

export interface EmploymentContractAndConditionsPdfProps {
  // ----- パターンA由来（雇用契約に関する項目）-----
  contractType: string
  documentLabel: string
  employeeName: string
  employeeAddress?: string
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
  signatureImageDataUrl?: string
  // ----- パターンB由来（派遣契約に関する項目）-----
  workLocationName: string
  workLocationAddress: string
  workLocationTel: string
  organizationUnit: string
  conflictDate: string
  conflictDateOrg: string
  responsibility: string
  dispatchStart: string
  dispatchEnd: string
  cmdDept: string
  cmdRole: string
  cmdName: string
  cmdTel: string
  respDept: string
  respRole: string
  respName: string
  respTel: string
  mgrDept: string
  mgrRole: string
  mgrName: string
  mgrTel: string
  compDept: string
  compRole: string
  compName: string
  compTel: string
  cmpDept: string
  cmpRole: string
  cmpName: string
  cmpTel: string
  welfare: string
  safetyText: string
  conflictText: string
  // ----- 当該事業所における労働者派遣料金額の平均額（B・C共通。route.ts側でマスタから算出）-----
  dispatchFeeOfficeName?: string
  dispatchFeeAmount?: number | null
  dispatchFeeFiscalYear?: string
}

const EmploymentPeriodRow = ({ p }: { p: EmploymentContractAndConditionsPdfProps }) => {
  const isIndefinite = p.contractType === '無期契約' || p.contractType === '正社員'
  const mainText = isIndefinite ? '期間の定めなし' : `自　${toJpDate(p.employStart)}　　至　${toJpDate(p.employEnd)}`
  return (
    <View wrap={false} style={sharedStyles.row}>
      <View style={sharedStyles.labelCell}><Text style={sharedStyles.labelText}>雇用期間</Text></View>
      <View style={sharedStyles.valueCell}>
        {isIndefinite ? (
          <BoxedSplitRow
            main={mainText}
            boxLabel="契約条件適用開始日"
            boxValue={toJpDate(p.contractStartDate)}
          />
        ) : (
          <Text style={sharedStyles.freeText}>{mainText}</Text>
        )}
      </View>
    </View>
  )
}

export const EmploymentContractAndConditionsPdf = (p: EmploymentContractAndConditionsPdfProps) => {
  const retirementClause = getRetirementClause(p.contractType)
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther)
  const overtimeHoursNote = Number(p.overtimeHours) > 0 ? `※定額残業時間：${p.overtimeHours}時間` : ''
  const deductionText = getDeductionText(p.hasEmployInsurance, p.hasSocialInsurance)
  const transportSecondaryNote = getTransportSecondaryNote(p.transportType)
  const flexTimeNote = getFlexTimeNote(p.flexTime)

  return (
    <Document>
      <Page size="A4" style={sharedStyles.page} wrap>
        <Text style={sharedStyles.title}>{p.documentLabel}</Text>
        <Text style={sharedStyles.intro}>
          株式会社ＡＰパートナーズ(以下「甲」という)と　{p.employeeName}　(以下「乙」という)は、下記のとおり雇用契約を締結する。
        </Text>

        <View style={sharedStyles.table}>
          <EmploymentPeriodRow p={p} />

          <View wrap={false} style={sharedStyles.row}>
            <View style={sharedStyles.labelCell}><Text style={sharedStyles.labelText}>派遣期間</Text></View>
            <View style={sharedStyles.valueCell}>
              <Text style={sharedStyles.freeText}>自　{toJpDate(p.dispatchStart)}　　至　{toJpDate(p.dispatchEnd)}</Text>
            </View>
          </View>

          <LabeledRow label="派遣先事業者名">
            <Text style={sharedStyles.freeText}>{p.workLocationName}</Text>
          </LabeledRow>

          <LabeledRow label="就業場所">
            <SplitLines lines={[
              {
                label: '(雇入れ時)',
                value: `${p.workLocationName}　${p.workLocationAddress}${p.workLocationTel ? `　TEL\u00A0${p.workLocationTel}` : ''}`,
              },
              { label: '(変更の範囲)', value: '会社の定める事業所' },
            ]} />
          </LabeledRow>

          <LabeledRow label="組織単位"><Text style={sharedStyles.freeText}>{p.organizationUnit || '―'}</Text></LabeledRow>

          {/* 2026-07-08修正：Excel実物では(事業所単位)/(組織単位)がそれぞれ罫線で区切られた
              ラベル・値のペアの行で、下の通知文もさらに罫線で区切られた別行になっている。
              就業場所と同じ罫線構造で再現する（伊藤さん指摘・2026-07-08）。 */}
          <LabeledRow label="抵触日">
            <View>
              <View wrap={false} style={sharedStyles.splitLineWithBorder}>
                <View style={sharedStyles.splitSubLabel}><Text>(事業所単位)</Text></View>
                <View style={sharedStyles.splitSubValue}><Text>{getConflictDateText(p.contractType, p.conflictDate)}</Text></View>
              </View>
              <View wrap={false} style={sharedStyles.splitLineWithBorder}>
                <View style={sharedStyles.splitSubLabel}><Text>(組織単位)</Text></View>
                <View style={sharedStyles.splitSubValue}><Text>{getConflictDateText(p.contractType, p.conflictDateOrg)}</Text></View>
              </View>
              <Text style={sharedStyles.freeText}>{CONFLICT_DATE_NOTICE_TEXT}</Text>
            </View>
          </LabeledRow>

          <LabeledRow label={'従事すべき\n業務内容'}>
            <SplitLines lines={[
              { label: '(雇入れ時)', value: p.businessContent },
              { label: '(変更の範囲)', value: '会社が指示する業務' },
            ]} />
          </LabeledRow>

          <LabeledRow label="業務に伴う責任の程度">
            <Text style={sharedStyles.freeText}>{p.responsibility || '付与される権限なし'}</Text>
          </LabeledRow>

          <LabeledRow label="始業・終業時刻">
            <SplitLines lines={[
              { label: '始業', value: p.startTime },
              { label: '終業', value: p.endTime + (p.isShift ? '　※シフトに準ずる' : '') },
            ]} />
          </LabeledRow>

          <View wrap={false} style={sharedStyles.row}>
            <View style={sharedStyles.labelCell}><Text style={sharedStyles.labelText}>{'所定労働日数\n所定労働時間'}</Text></View>
            <View style={sharedStyles.valueCell}>
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
            </View>
          </View>

          <View wrap={false} style={sharedStyles.row}>
            <View style={sharedStyles.labelCell}><Text style={sharedStyles.labelText}>変形労働時間制</Text></View>
            <View style={sharedStyles.valueCell}>
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
            </View>
          </View>

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

          <LabeledRow label="指揮命令者">
            <PersonGridRow dept={p.cmdDept} role={p.cmdRole} name={p.cmdName} tel={p.cmdTel} />
          </LabeledRow>

          <LabeledRow label="派遣先責任者">
            <PersonGridRow dept={p.respDept} role={p.respRole} name={p.respName} tel={p.respTel} />
          </LabeledRow>

          <LabeledRow label="派遣元責任者">
            <PersonGridRow dept={p.mgrDept} role={p.mgrRole} name={p.mgrName} tel={p.mgrTel} />
          </LabeledRow>

          <LabeledRow label="苦情処理申出先">
            <PersonGridRow deptLabel="［派遣先］部署名" deptLabelWidth="16.1%" deptValueWidth="20.3%" dept={p.compDept} role={p.compRole} name={p.compName} tel={p.compTel} withBorder />
            <PersonGridRow deptLabel="［派遣元］部署名" deptLabelWidth="16.1%" deptValueWidth="20.3%" dept={p.cmpDept} role={p.cmpRole} name={p.cmpName} tel={p.cmpTel} />
          </LabeledRow>

          <LabeledRow label="苦情処理内容"><Text style={sharedStyles.freeText}>{COMPLAINT_HANDLING_TEXT}</Text></LabeledRow>

          <LabeledRow label={'福利厚生施設の\n利用等'}><Text style={sharedStyles.freeText}>{p.welfare || '―'}</Text></LabeledRow>

          <LabeledRow label="安全及び衛生"><Text style={sharedStyles.freeText}>{p.safetyText || '―'}</Text></LabeledRow>

          <LabeledRow label={'派遣契約解除の\n場合の措置'}><Text style={sharedStyles.freeText}>{DISPATCH_CANCEL_MEASURES_TEXT}</Text></LabeledRow>

          {/* 2026-07-08再修正：ラベル欄を24%に広げる対応は、この行だけ縦罫線の位置が
              ずれて見た目に違和感が出るため取りやめ（伊藤さん指摘）。標準の17%幅は維持したまま、
              ラベルのフォントサイズだけを落とし、Excel実物と同じ2行
              （「…雇用する場」／「合の…措置」で改行）に収める。 */}
          <View wrap={false} style={sharedStyles.row}>
            <View style={sharedStyles.labelCell}>
              <Text style={[sharedStyles.labelText, { fontSize: 5.3, lineHeight: 1.15 }]}>{'派遣先が派遣労働者を雇用する場\n合の紛争防止措置'}</Text>
            </View>
            <View style={sharedStyles.valueCell}>
              <Text style={sharedStyles.freeText}>{p.conflictText || '―'}</Text>
            </View>
          </View>

          {retirementClause && (
            <LabeledRow label="退職・解雇"><Text style={sharedStyles.freeText}>{retirementClause}</Text></LabeledRow>
          )}

          <LabeledRow label="各種保険"><Text style={sharedStyles.freeText}>{getInsuranceLine(p.hasEmployInsurance, p.hasSocialInsurance)}</Text></LabeledRow>

          <LabeledRow label={'契約更新の有無・\n基準・無期転換'}>
            <Text style={sharedStyles.freeText}>{CONTRACT_RENEWAL_TEXT}</Text>
          </LabeledRow>

          <LabeledRow label="協定対象派遣労働者であるか否か">
            <Text style={sharedStyles.freeText}>{getAgreementLaborText(p.dispatchEnd)}</Text>
          </LabeledRow>

          <LabeledRow label="試用期間" minHeight={62}>
            <Text style={sharedStyles.freeText}>{getTrialText(p.trialPeriod, p.trialStart, p.trialEnd)}</Text>
          </LabeledRow>

          {/* 2026-07-08修正：「当該事業所における労働者派遣料金額の平均額」は独立した項目行ではなく、
              Excel実物では備考・その他セルの2行目に続けて表示される文言だったため、
              項目行を新設せず備考・その他の本文に改行して連結する形に修正（伊藤さん指摘） */}
          <LabeledRow label={'備考\nその他'} last>
            <Text style={sharedStyles.freeText}>
              {getRemarksText(p.pattern, p.contractType, p.bonusType)}{'\n'}
              {getDispatchFeeAvgText(p.dispatchFeeOfficeName, p.dispatchFeeAmount, p.dispatchFeeFiscalYear)}
            </Text>
          </LabeledRow>
        </View>

        <Text style={sharedStyles.footerText}>
          株式会社APパートナーズは本書にて提示した内容に相違ないことを保証し、従業員は上記提示内容を承諾する。
        </Text>

        <View style={sharedStyles.signatureRow}>
          <View style={sharedStyles.signatureCol}>
            <Text>会社</Text>
            {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
            {/* 2026-07-08修正：自社住所欄と会社名・代表者名の間隔が狭すぎるとの指摘のため余白を追加（パターンB同様） */}
            <Text style={{ fontWeight: 'bold', marginTop: 6 }}>株式会社APパートナーズ</Text>
            <Text>代表取締役　山田　昌</Text>
            {p.showSeal && <Image src={COMPANY_SEAL_PATH} style={sharedStyles.companySeal} />}
          </View>
          <View style={sharedStyles.signatureCol}>
            <Text>従業員</Text>
            <Text>住所：{p.employeeAddress || ''}</Text>
            <Text>氏名：{p.employeeName}</Text>
            {p.signatureImageDataUrl && <Image src={p.signatureImageDataUrl} style={sharedStyles.signatureImage} />}
          </View>
        </View>
      </Page>
    </Document>
  )
}
