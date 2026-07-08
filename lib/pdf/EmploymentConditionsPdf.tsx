// ===== 就業条件明示書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章・4-1章の確定仕様に基づく。パターンB（就業条件明示書のみ・6STEP）。
// 雇用契約に関する項目（雇用期間・賃金・退職解雇・各種保険・試用期間等）は含まず、
// 派遣契約の内容（派遣期間・就業場所・指揮命令者・苦情処理・紛争防止措置等）のみで構成される。
// A4縦・1ページ固定。2026-07-08実装（契約書関連フォルダの「就業条件明示書_有期.xlsx」の
// セル内容から書き起こし。雇用契約書と共通のスタイル・部品はlib/pdf/pdfShared.tsxを使用）。
//
// 署名機能（フェーズ5）上の扱い：パターンBは実署名ではなく「内容確認ボタン」のみで完結する
// 設計のため（docs/SYSTEM_DESIGN.md 10章2026-07-08参照）、従業員の手書き署名欄は設けない
// （Excelテンプレート自体にも従業員署名欄が無く、末尾は会社情報のみ）。
import { Document, Page, Text, View } from '@react-pdf/renderer'
import {
  toJpDate, HOLIDAY_CLAUSE_LINES_FIXED, getHolidayClauseLine1,
  getWorkDaysText, getFlexTimeText, getFlexTimeNote, COMPANY_HQ_ADDRESS_LINES,
  formatHoursMinutes, formatMinutes,
  CONFLICT_DATE_NOTICE_TEXT, COMPLAINT_HANDLING_TEXT, DISPATCH_CANCEL_MEASURES_TEXT,
  getAgreementLaborText,
} from './documentText'
import { sharedStyles, LabeledRow, SplitLines, BoxedSplitRow } from './pdfShared'

export interface EmploymentConditionsPdfProps {
  documentLabel: string
  employeeName: string
  workLocationName: string
  workLocationAddress: string
  workLocationTel: string
  organizationUnit: string
  conflictDate: string
  conflictDateOrg: string
  businessContent: string
  responsibility: string
  startTime: string
  endTime: string
  isShift: boolean
  workDays: string
  workDaysOther: string
  flexTime: string
  workingHoursH: string | number
  workingHoursM: string | number
  breakTime: string | number
  overtime: string
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
}

const PersonRow = ({ dept, role, name, tel }: { dept: string; role: string; name: string; tel: string }) => (
  <Text>部署名：{dept || '―'}　役職：{role || '―'}　氏名：{name || '―'}　電話番号：{tel || '―'}</Text>
)

export const EmploymentConditionsPdf = (p: EmploymentConditionsPdfProps) => {
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther)
  const flexTimeNote = getFlexTimeNote(p.flexTime)

  return (
    <Document>
      <Page size="A4" style={sharedStyles.page}>
        <Text style={sharedStyles.title}>{p.documentLabel}</Text>
        <Text style={sharedStyles.intro}>
          株式会社ＡＰパートナーズは、　{p.workLocationName}　との合意に基づき、以下の就業条件により労働者派遣を行うことを明示する。
        </Text>

        <View style={sharedStyles.table}>
          <View style={sharedStyles.row}>
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
                value: `${p.workLocationName}　${p.workLocationAddress}${p.workLocationTel ? `　TEL ${p.workLocationTel}` : ''}`,
              },
              { label: '(変更の範囲)', value: '会社の定める事業所' },
            ]} />
          </LabeledRow>

          <LabeledRow label="組織単位"><Text style={sharedStyles.freeText}>{p.organizationUnit || '―'}</Text></LabeledRow>

          <LabeledRow label="抵触日">
            <View style={sharedStyles.freeText}>
              <Text>(事業所単位)　{toJpDate(p.conflictDate) || '―'}</Text>
              <Text>(組織単位)　{toJpDate(p.conflictDateOrg) || '―'}</Text>
              <Text>{CONFLICT_DATE_NOTICE_TEXT}</Text>
            </View>
          </LabeledRow>

          <LabeledRow label="業務内容">
            <SplitLines lines={[
              { label: '(雇入れ時)', value: p.businessContent },
              { label: '(変更の範囲)', value: '会社が指示する業務' },
            ]} />
          </LabeledRow>

          <LabeledRow label={'業務に伴う\n責任の程度'}>
            <Text style={sharedStyles.freeText}>{p.responsibility || '付与される権限なし'}</Text>
          </LabeledRow>

          <LabeledRow label="始業・終業時刻">
            <SplitLines lines={[
              { label: '始業', value: p.startTime },
              { label: '終業', value: p.endTime + (p.isShift ? '　※シフトに準ずる' : '') },
            ]} />
          </LabeledRow>

          <View style={sharedStyles.row}>
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

          <View style={sharedStyles.row}>
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

          <LabeledRow label="指揮命令者">
            <Text style={sharedStyles.freeText}><PersonRow dept={p.cmdDept} role={p.cmdRole} name={p.cmdName} tel={p.cmdTel} /></Text>
          </LabeledRow>

          <LabeledRow label="派遣先責任者">
            <Text style={sharedStyles.freeText}><PersonRow dept={p.respDept} role={p.respRole} name={p.respName} tel={p.respTel} /></Text>
          </LabeledRow>

          <LabeledRow label="派遣元責任者">
            <Text style={sharedStyles.freeText}><PersonRow dept={p.mgrDept} role={p.mgrRole} name={p.mgrName} tel={p.mgrTel} /></Text>
          </LabeledRow>

          <LabeledRow label="苦情処理申出先">
            <View style={sharedStyles.freeText}>
              <Text>［派遣先］<PersonRow dept={p.compDept} role={p.compRole} name={p.compName} tel={p.compTel} /></Text>
              <Text>［派遣元］<PersonRow dept={p.cmpDept} role={p.cmpRole} name={p.cmpName} tel={p.cmpTel} /></Text>
            </View>
          </LabeledRow>

          <LabeledRow label="苦情処理内容"><Text style={sharedStyles.freeText}>{COMPLAINT_HANDLING_TEXT}</Text></LabeledRow>

          <LabeledRow label={'福利厚生施設の\n利用等'}><Text style={sharedStyles.freeText}>{p.welfare || '―'}</Text></LabeledRow>

          <LabeledRow label="安全及び衛生"><Text style={sharedStyles.freeText}>{p.safetyText || '―'}</Text></LabeledRow>

          <LabeledRow label={'派遣契約解除の\n場合の措置'}><Text style={sharedStyles.freeText}>{DISPATCH_CANCEL_MEASURES_TEXT}</Text></LabeledRow>

          <LabeledRow label="派遣先が派遣労働者を雇用する場合の紛争防止措置">
            <Text style={sharedStyles.freeText}>{p.conflictText || '―'}</Text>
          </LabeledRow>

          <LabeledRow label="協定対象派遣労働者であるか否か">
            <Text style={sharedStyles.freeText}>{getAgreementLaborText(p.dispatchEnd)}</Text>
          </LabeledRow>

          <LabeledRow label={'備考\nその他'} last>
            <Text style={sharedStyles.freeText}>上記以外の事項については、当社就業規則及び賃金規定による。</Text>
          </LabeledRow>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text>会社</Text>
          {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
          <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
          <Text>代表取締役　山田　昌</Text>
        </View>
      </Page>
    </Document>
  )
}
