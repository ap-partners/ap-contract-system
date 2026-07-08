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
  getAgreementLaborText, getConflictDateText, getDispatchFeeAvgText,
} from './documentText'
import { sharedStyles, LabeledRow, SplitLines, BoxedSplitRow, PersonGridRow } from './pdfShared'

export interface EmploymentConditionsPdfProps {
  documentLabel: string
  contractType: string
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
  dispatchFeeOfficeName?: string
  dispatchFeeAmount?: number | null
  dispatchFeeFiscalYear?: string
}

export const EmploymentConditionsPdf = (p: EmploymentConditionsPdfProps) => {
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther)
  const flexTimeNote = getFlexTimeNote(p.flexTime)

  return (
    <Document>
      {/* 2026-07-08修正：パターンBは項目数が多く、標準のsharedStyles.pageのままだと
          会社情報欄（署名不要のため印影も無く本来短いブロック）だけが2ページ目に
          はみ出してしまう視覚バグがあったため、このページに限りフォントサイズ・
          行間・余白をわずかに詰めて1ページに収まるよう調整する
          （パターンA・Cのレイアウトはベース資料と厳密に一致させているため触らない）。 */}
      <Page size="A4" style={[sharedStyles.page, { fontSize: 7.4, lineHeight: 1.13, padding: 15 }]}>
        <Text style={[sharedStyles.title, { fontSize: 13, marginBottom: 7 }]}>{p.documentLabel}</Text>
        <Text style={sharedStyles.intro}>
          株式会社ＡＰパートナーズは、　{p.employeeName}　との合意に基づき、以下の就業条件により労働者派遣を行うことを明示する。
        </Text>

        <View style={sharedStyles.table}>
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

          {/* 2026-07-08修正：以前は「(事業所単位)　値」を単なる1文として表示していたが、
              Excel実物では(事業所単位)/(組織単位)がそれぞれ罫線で区切られたラベル・値のペアの行になっており、
              下の通知文もさらに罫線で区切られた別行になっている。就業場所と同じ罫線構造で再現する
              （伊藤さん指摘・2026-07-08）。 */}
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

          <LabeledRow label="業務内容">
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

          <LabeledRow label="指揮命令者" redundantBorder>
            <PersonGridRow dept={p.cmdDept} role={p.cmdRole} name={p.cmdName} tel={p.cmdTel} />
          </LabeledRow>

          <LabeledRow label="派遣先責任者" redundantBorder>
            <PersonGridRow dept={p.respDept} role={p.respRole} name={p.respName} tel={p.respTel} />
          </LabeledRow>

          <LabeledRow label="派遣元責任者" redundantBorder>
            <PersonGridRow dept={p.mgrDept} role={p.mgrRole} name={p.mgrName} tel={p.mgrTel} />
          </LabeledRow>

          <LabeledRow label="苦情処理申出先" redundantBorder>
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

          <LabeledRow label="協定対象派遣労働者であるか否か">
            <Text style={sharedStyles.freeText}>{getAgreementLaborText(p.dispatchEnd)}</Text>
          </LabeledRow>

          {/* 2026-07-08修正：「当該事業所における労働者派遣料金額の平均額」は独立した項目行ではなく、
              Excel実物では備考・その他セルの2行目に続けて表示される文言だったため、
              項目行を新設せず備考・その他の本文に改行して連結する形に修正（伊藤さん指摘） */}
          <LabeledRow label={'備考\nその他'} last>
            <Text style={sharedStyles.freeText}>
              上記以外の事項については、当社就業規則及び賃金規定による。{'\n'}
              {getDispatchFeeAvgText(p.dispatchFeeOfficeName, p.dispatchFeeAmount, p.dispatchFeeFiscalYear)}
            </Text>
          </LabeledRow>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text>会社</Text>
          {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
          <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
          {/* 2026-07-08再修正：余白の追加位置を誤り、住所欄と会社名の間に入れていた。
              正しくは会社名（株式会社APパートナーズ）と代表者名（代表取締役 山田 昌）の間 */}
          <Text style={{ marginTop: 6 }}>代表取締役　山田　昌</Text>
        </View>
      </Page>
    </Document>
  )
}
