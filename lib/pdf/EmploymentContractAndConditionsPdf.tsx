// ===== 雇用契約書 兼 就業条件明示書 PDF（react-pdf）=====
// docs/SYSTEM_DESIGN.md 7-1章・4-1章の確定仕様に基づく。パターンC（兼用版・8STEP）。
// パターンA（雇用契約書）とパターンB（就業条件明示書）の全項目を1つの帳票に統合したもの。
// 2026-07-08実装（契約書関連フォルダの「雇用契約書(兼)就業条件明示書_有期.xlsx」
// 「雇用契約書(兼)就業条件明示書_無期.xlsx」のセル内容から書き起こし。
// 有期・無期どちらもテンプレート構成は同一のため、雇用期間行のみ契約種別で出し分ける
// （EmploymentContractPdf.tsxのEmploymentPeriodRowと同じロジック）。
//
// 2026-07-09全面改訂：ページ1・ページ2を1つの<Page>・1つの<View style={table}>に
// react-pdfの自動改ページで任せる構成から、明示的に2つの<Page>（それぞれ独立した
// <View style={table}>）に分割する構成へ変更した。react-pdfは、罫線を持つ大きなView
// （table全体）がページをまたいで自動的に分割される際、そのViewの外枠（borderWidth）を
// 「実際の最初のページの上端」と「実際の最後のページの下端」にしか描画せず、途中の
// ページの継ぎ目には一切描画しないという仕様上の制約があり、これはwrap={false}での
// グルーピングなど今までのどの対策でも解消できない（伊藤さん指摘・contract22.pdfで
// 再発。詳細はdocs/SYSTEM_DESIGN.md 10章2026-07-09参照）。
// この帳票は「安全及び衛生」の直後で必ずページを区切ると意図的に決め打ちし
// （交通費までの項目＋安全及び衛生でページ1、指揮命令者以降でページ2）、それぞれを
// 独立した<Page>・独立した<View style={table}>として実装することで、両ページとも
// 罫線が自分自身で完結して閉じるようにした。もし雇用期間〜安全及び衛生までの内容が
// 極端に長く1ページに収まらない場合は、react-pdfの<Page>自身が持つ自動改ページ機能に
// より、その部分だけがさらにもう1ページ追加される（2ページ→3ページに増える）形で
// 安全側にフォールバックする（内容が欠落したり罫線が壊れたりすることはない）。
import { Document, Page, Text, View } from '@react-pdf/renderer'
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
  COMPANY_SEAL_PATH, AutoFitFreeText, SealSideBySide,
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
    <LabeledRow label="雇用期間">
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

          <LabeledRow label="派遣期間">
            <Text style={sharedStyles.freeText}>自　{toJpDate(p.dispatchStart)}　　至　{toJpDate(p.dispatchEnd)}</Text>
          </LabeledRow>

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

          {/* 2026-07-09修正：「業務に伴う責任の程度」は値が「無」等の短い1語のみのことが
              多く、独立した1行を丸ごと使うと行の使い方がもったいないという指摘があった
              （伊藤さん・contract20.pdf）。「従事すべき業務内容」の(変更の範囲)行の右側に
              ボックス表示する形に統合し、独立行は廃止する。 */}
          <LabeledRow label={'従事すべき\n業務内容'}>
            <View wrap={false} style={sharedStyles.splitLineWithBorder}>
              <View style={sharedStyles.splitSubLabel}><Text>(雇入れ時)</Text></View>
              <View style={sharedStyles.splitSubValue}><Text>{p.businessContent}</Text></View>
            </View>
            <View wrap={false} style={sharedStyles.splitLine}>
              <View style={sharedStyles.splitSubLabel}><Text>(変更の範囲)</Text></View>
              <View style={sharedStyles.splitSubValue}><Text>会社が指示する業務</Text></View>
              <View style={sharedStyles.boxedSplitBox}>
                <Text style={sharedStyles.boxedSplitBoxLabel}>業務に伴う責任の程度</Text>
                <Text>{p.responsibility || '付与される権限なし'}</Text>
              </View>
            </View>
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

          {/* 2026-07-09再修正：「安全及び衛生」をページ1の最終行とし、必ずこの行の直後で
              ページを区切る（下のPage2を参照）。以前は「派遣契約解除の場合の措置」も
              このページ1側に置いていたが、業務内容等の他の自由記述欄が長い場合にこの行
              自体がページ1に収まりきらずページ2にずれ込むリスクがあったため、
              「派遣契約解除の場合の措置」はページ2側（福利厚生施設の利用等の下）に移動した
              （伊藤さんとの合意・2026-07-09）。これによりページ1は必ず「安全及び衛生」で
              終わり、最終行なのでlastを付与して下罫線を持たせない（table自体の外枠が
              下端を閉じる）。 */}
          <LabeledRow label="安全及び衛生" last>
            <AutoFitFreeText text={p.safetyText} maxLines={2} widthPt={441} sizes={[8.3, 7.6, 6.9]} />
          </LabeledRow>
        </View>
      </Page>

      <Page size="A4" style={sharedStyles.page} wrap>
        <View style={sharedStyles.table}>
          {/* 2026-07-08修正：以前は指揮命令者・派遣先責任者・派遣元責任者・苦情処理申出先の
              4行がそれぞれ個別にreact-pdfの自動改ページ判定を受けていたため、部署名の
              文字数次第でこの4行の途中の意図しない位置に改ページが入ってしまい、
              一部の行だけがページ2の先頭に取り残されて上に大きな空白ができる・その行の
              上罫線が表示されない、という不具合があった（伊藤さん指摘・contract13.pdf）。
              4行をまとめて1つのwrap={false}ブロックにすることで、この4行が必ず
              「まとめてページ2に収まる」か「まとめてページ3に送られる」かのどちらかになり、
              一部だけが取り残される不自然な分割を防ぐ（2026-07-09：ページ1・2を明示的に
              分割したことで、通常はこの4行がページ2の先頭に来るため実質的にこの対策が
              効く場面は稀だが、業務内容等が極端に長くページ1が2枚に増えた場合の保険として
              残している）。 */}
          <View wrap={false}>
            <LabeledRow label="指揮命令者">
              <PersonGridRow dept={p.cmdDept} role={p.cmdRole} name={p.cmdName} tel={p.cmdTel} />
            </LabeledRow>

            <LabeledRow label="派遣先責任者">
              <PersonGridRow dept={p.respDept} role={p.respRole} name={p.respName} tel={p.respTel} />
            </LabeledRow>

            <LabeledRow label="派遣元責任者">
              <PersonGridRow dept={p.mgrDept} role={p.mgrRole} name={p.mgrName} tel={p.mgrTel} />
            </LabeledRow>

            {/* 2026-07-09再修正：以前は「［派遣先］部署名」を'［派遣先］\n部署名'のように
                明示的に2行へ改行して表示していたが、伊藤さんの意向により1行表示に戻した。
                欄の幅ぎりぎりで自動改行に任せると不自然な位置（「［」の1文字だけ）で
                折り返ってしまうため、改行ではなくフォントサイズを下げることで1行に収める
                （deptLabelFontSize。通常の部署名ラベルと同じ8.3ptではなく6.3ptに縮小）。 */}
            <LabeledRow label="苦情処理申出先">
              <PersonGridRow deptLabel="［派遣先］部署名" deptLabelFontSize={6.3} deptLabelWidth="16.1%" deptValueWidth="20.3%" dept={p.compDept} role={p.compRole} name={p.compName} tel={p.compTel} withBorder />
              <PersonGridRow deptLabel="［派遣元］部署名" deptLabelFontSize={6.3} deptLabelWidth="16.1%" deptValueWidth="20.3%" dept={p.cmpDept} role={p.cmpRole} name={p.cmpName} tel={p.cmpTel} />
            </LabeledRow>
          </View>

          <LabeledRow label="苦情処理内容"><Text style={sharedStyles.freeText}>{COMPLAINT_HANDLING_TEXT}</Text></LabeledRow>

          <LabeledRow label={'福利厚生施設の\n利用等'}><Text style={sharedStyles.freeText}>{p.welfare || '―'}</Text></LabeledRow>

          {/* 2026-07-08再修正：ラベル欄を24%に広げる対応は、この行だけ縦罫線の位置が
              ずれて見た目に違和感が出るため取りやめ（伊藤さん指摘）。標準の17%幅は維持したまま、
              ラベルのフォントサイズだけを落とし、Excel実物と同じ2行
              （「…雇用する場」／「合の…措置」で改行）に収める。 */}
          <LabeledRow label={'派遣先が派遣労働者を雇用する場\n合の紛争防止措置'} labelStyle={{ fontSize: 5.3, lineHeight: 1.15 }}>
            <AutoFitFreeText text={p.conflictText} maxLines={2} widthPt={441} sizes={[8.3, 7.6, 6.9]} />
          </LabeledRow>

          {/* 2026-07-09再修正：業務内容等が長い場合にページ1へ収まりきらないリスクを
              避けるため、「派遣契約解除の場合の措置」をページ1（安全及び衛生の前）から
              ページ2側（福利厚生施設の利用等・紛争防止措置の下）へ移動した
              （伊藤さんとの合意・2026-07-09）。 */}
          <LabeledRow label={'派遣契約解除の\n場合の措置'}><Text style={sharedStyles.freeText}>{DISPATCH_CANCEL_MEASURES_TEXT}</Text></LabeledRow>

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
            <SealSideBySide showSeal={p.showSeal} sealSrc={COMPANY_SEAL_PATH} textColWidth={98} gap={-12}>
              <Text>会社</Text>
              {COMPANY_HQ_ADDRESS_LINES.map((line, i) => <Text key={i}>{line}</Text>)}
              <Text style={{ fontWeight: 'bold' }}>株式会社APパートナーズ</Text>
              {/* 2026-07-08再修正：余白の追加位置を誤り、住所欄と会社名の間に入れていた。
                  正しくは会社名（株式会社APパートナーズ）と代表者名（代表取締役 山田 昌）の間（パターンB同様） */}
              <Text style={{ marginTop: 6 }}>代表取締役　山田　昌</Text>
            </SealSideBySide>
          </View>
          <View style={sharedStyles.signatureCol}>
            {/* 2026-07-09再々修正：印の配置を「氏名の行に重ねる」方式から、伊藤さんのサンプル
                画像に基づく「テキストブロック全体の右側に固定配置」方式（SealSideBySide）に
                変更。住所・氏名の長さに関わらず印の位置・サイズが変わらない。 */}
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
