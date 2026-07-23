// ===== アルバイト誓約書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 10章2026-07-23「アルバイト誓約書PDFレイアウト最終案（v5）」に基づく。
// 原本Excel（契約書関連/アルバイト誓約書(AP・CL研修/CP・SPOT).xlsx）の罫線・ラベル配置を踏襲し、
// 「雇用期間」と「所定労働時間及び休憩時間」を1つの表（scheduleRows）に統合する点が
// 雇用契約書PDF（EmploymentContractPdf.tsx）と最も異なる部分。A4縦・1ページを基本とする。
// 2026-07-23実装。表題・冒頭文・末尾文は伊藤さん確認済み（documentText.tsのPLEDGE_*参照）。
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import {
  PLEDGE_DOCUMENT_TITLE, PLEDGE_INTRO_TEXT, PLEDGE_CLOSING_TEXT, formatYen,
} from './documentText'
import {
  sharedStyles, LabeledRow, AutoFitFreeText,
  COMPANY_SEAL_PATH, SealSideBySide, BORDER, THIN,
} from './pdfShared'

export type PledgeScheduleRow = { label: string; start: string; end: string; breakMinutes: string; contractHours: string }

export interface PledgePdfProps {
  employeeName: string
  employeeAddress: string
  // 就業場所（就業先情報。work_place_typeにより「クライアント先」または「自社拠点」のいずれか）
  workLocationName: string
  workLocationPostalCode: string
  workLocationAddress: string
  workLocationTel: string
  businessContent: string
  scheduleRows: PledgeScheduleRow[]
  salaryType: string
  basicSalary: string | number
  rolePay: string | number
  skillPay: string | number
  salesPay: string | number
  wagePaymentText: string
  deductionText: string
  transportText: string
  // 会社側署名欄（申請対象スタッフの所属部門から逆引きした拠点。department_master.office_id経由）
  companyOfficePostalCode: string
  companyOfficeAddress: string
  showSeal: boolean
  // 従業員の丸印鑑（PNGのdata URL）。署名フロー（次の作業項目）実装後、署名完了時にのみ渡す想定。
  signatureImageDataUrl?: string
}

// v5仕様：「就業日程」表は行ごとに別テーブルにすると罫線が二重になるため、1つの表にまとめる。
// 外枠のみ太枠（外側のLabeledRow.valueCellが担当）、内部は下端・右端の線のみを引く方式。
const scheduleStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: THIN,
    borderColor: BORDER,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: THIN,
    borderColor: BORDER,
  },
  dataRowLast: {
    flexDirection: 'row',
  },
  colDate: { width: '32%', padding: '3 5', borderRightWidth: THIN, borderColor: BORDER, justifyContent: 'center' },
  colTime: { width: '30%', padding: '3 5', borderRightWidth: THIN, borderColor: BORDER, justifyContent: 'center' },
  colBreak: { width: '18%', padding: '3 5', borderRightWidth: THIN, borderColor: BORDER, justifyContent: 'center' },
  colHours: { width: '20%', padding: '3 5', justifyContent: 'center' },
  headerText: { fontWeight: 'bold' },
})

const ScheduleTable = ({ rows }: { rows: PledgeScheduleRow[] }) => (
  <View>
    <View style={scheduleStyles.headerRow} wrap={false}>
      <View style={scheduleStyles.colDate}><Text style={scheduleStyles.headerText}>年月日</Text></View>
      <View style={scheduleStyles.colTime}><Text style={scheduleStyles.headerText}>就業時間</Text></View>
      <View style={scheduleStyles.colBreak}><Text style={scheduleStyles.headerText}>休憩時間</Text></View>
      <View style={scheduleStyles.colHours}><Text style={scheduleStyles.headerText}>契約時間</Text></View>
    </View>
    {rows.map((r, i) => (
      <View key={i} wrap={false} style={i < rows.length - 1 ? scheduleStyles.dataRow : scheduleStyles.dataRowLast}>
        <View style={scheduleStyles.colDate}><Text>{r.label}</Text></View>
        <View style={scheduleStyles.colTime}><Text>{r.start && r.end ? `${r.start}〜${r.end}` : '―'}</Text></View>
        <View style={scheduleStyles.colBreak}><Text>{r.breakMinutes ? `${r.breakMinutes}分` : '―'}</Text></View>
        <View style={scheduleStyles.colHours}><Text>{r.contractHours ? `${r.contractHours}時間` : '―'}</Text></View>
      </View>
    ))}
  </View>
)

// 賃金ブロック（v5仕様：時間帯別レート表は使わず、実際のSTEP5入力項目で構成し直す。
// 定額残業手当・住宅手当・割増賃金率は無いため、雇用契約書のWageGrid（4行×2列固定）は使わず、
// このファイル専用の3行×2列グリッドを組む。列幅はWageGridと揃え、罫線二重化を避けるため
// 各行の下端のみ罫線を持つ（最終行は持たない＝外側のvalueCellの下罫線に任せる）。
const pledgeWageStyles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: THIN, borderColor: BORDER },
  rowLast: { flexDirection: 'row' },
  cellLabel: { width: '22%', padding: '3 4', borderRightWidth: THIN, borderColor: BORDER, justifyContent: 'center', fontWeight: 'bold' },
  cellValue: { width: '28%', padding: '3 4', borderRightWidth: THIN, borderColor: BORDER, justifyContent: 'center' },
  cellValueLast: { width: '28%', padding: '3 4', justifyContent: 'center' },
})

const PledgeWageGrid = ({ p }: { p: PledgePdfProps }) => {
  const rows: [string, string, string, string][] = [
    ['給与の種類', p.salaryType ? `${p.salaryType}制` : '―', '役職手当', formatYen(p.rolePay)],
    ['基本給', formatYen(p.basicSalary), '職能給', formatYen(p.skillPay)],
    ['営業手当', formatYen(p.salesPay), '', ''],
  ]
  return (
    <>
      {rows.map(([l1, v1, l2, v2], i) => (
        <View key={i} wrap={false} style={i < rows.length - 1 ? pledgeWageStyles.row : pledgeWageStyles.rowLast}>
          <View style={pledgeWageStyles.cellLabel}><Text>{l1}</Text></View>
          <View style={pledgeWageStyles.cellValue}><Text>{v1}</Text></View>
          {l2 ? (
            <>
              <View style={pledgeWageStyles.cellLabel}><Text>{l2}</Text></View>
              <View style={pledgeWageStyles.cellValueLast}><Text>{v2}</Text></View>
            </>
          ) : (
            <View style={[pledgeWageStyles.cellValueLast, { width: '50%' }]} />
          )}
        </View>
      ))}
    </>
  )
}

export const PledgePdf = (p: PledgePdfProps) => {
  return (
    <Document>
      <Page size="A4" style={sharedStyles.page}>
        <Text style={[sharedStyles.title, { marginBottom: 8 }]}>{PLEDGE_DOCUMENT_TITLE}</Text>
        <Text style={[sharedStyles.intro, { marginBottom: 4 }]}>{PLEDGE_INTRO_TEXT}</Text>

        <View style={sharedStyles.table}>
          <LabeledRow label="就業場所">
            <View style={sharedStyles.freeText}>
              <Text>{p.workLocationName || '―'}</Text>
              <Text>{p.workLocationPostalCode ? `〒${p.workLocationPostalCode}　` : ''}{p.workLocationAddress || ''}</Text>
              {p.workLocationTel ? <Text>TEL：{p.workLocationTel}</Text> : null}
            </View>
          </LabeledRow>

          <LabeledRow label={'雇用期間\n所定労働時間\n及び休憩時間'}>
            <ScheduleTable rows={p.scheduleRows} />
          </LabeledRow>

          <LabeledRow label={'従事すべき\n業務内容'}>
            <AutoFitFreeText text={p.businessContent} maxLines={4} widthPt={420} sizes={[8.3, 7.6, 6.9, 6.2, 5.6]} lineHeight={1.2} />
          </LabeledRow>

          <LabeledRow label="賃金">
            <PledgeWageGrid p={p} />
          </LabeledRow>

          <LabeledRow label={'賃金支払方法\n\n支払時の控除'}>
            <View style={sharedStyles.freeText}>
              <Text>{p.wagePaymentText}</Text>
              <Text>賃金支払時の控除：{p.deductionText || 'なし'}</Text>
            </View>
          </LabeledRow>

          <LabeledRow label="交通費" last>
            <Text style={sharedStyles.freeText}>{p.transportText}</Text>
          </LabeledRow>
        </View>

        <Text style={[sharedStyles.footerText, { marginTop: 8, marginBottom: 6 }]}>{PLEDGE_CLOSING_TEXT}</Text>

        <View style={[sharedStyles.signatureRow, { marginTop: 0 }]}>
          <View style={sharedStyles.signatureCol}>
            <SealSideBySide showSeal={p.showSeal} sealSrc={COMPANY_SEAL_PATH} textColWidth={98} gap={-12}>
              <Text>会社</Text>
              <Text>{p.companyOfficePostalCode ? `〒${p.companyOfficePostalCode}` : ''}</Text>
              <Text>{p.companyOfficeAddress || ''}</Text>
              <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
              <Text style={{ marginTop: 6 }}>代表取締役　山田　昌</Text>
            </SealSideBySide>
          </View>
          <View style={sharedStyles.signatureCol}>
            <SealSideBySide showSeal={!!p.signatureImageDataUrl} sealSrc={p.signatureImageDataUrl || ''}>
              <Text>従業員</Text>
              <Text>住所：{p.employeeAddress || ''}</Text>
              <Text>氏名：{p.employeeName}</Text>
            </SealSideBySide>
          </View>
        </View>
      </Page>
    </Document>
  )
}
