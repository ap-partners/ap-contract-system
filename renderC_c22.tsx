import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractAndConditionsPdf } from './lib/pdf/EmploymentContractAndConditionsPdf'
import fs from 'fs'

// 2026-07-09追加：contract22.pdfの実データに近い内容量で再検証するためのスクリプト。
// 紛争防止措置を福利厚生施設の利用等の下に移動した結果、ページ1が「派遣契約解除の場合の措置」で
// 終わり、ページ2が「指揮命令者」から始まるようになったかを確認する。
async function main() {
  const buf = await renderToBuffer(
    EmploymentContractAndConditionsPdf({
      contractType: '無期契約',
      documentLabel: '雇用契約書 兼\n就業条件明示書',
      employeeName: '山﨑 怜菜',
      employeeAddress: '',
      businessContent: '各種電話対応、またはそれに付随する業務(RMSCC業務)',
      startTime: '09:00', endTime: '18:00', isShift: false,
      workDays: '週5日', workDaysOther: '', flexTime: '無',
      workingHoursH: 8, workingHoursM: 0, breakTime: 60,
      employStart: '2026-04-01', employEnd: '2026-06-30', contractStartDate: '2026-04-01',
      salaryType: '月給', basicSalary: 260000, skillPay: 5000, rolePay: 2000, salesPay: 2000, housingPay: 3000,
      overtimePay: 20000, overtimeHours: 5, hasEmployInsurance: true, hasSocialInsurance: true,
      transportType: 'default', trialPeriod: '無', trialStart: '', trialEnd: '',
      pattern: 'C', bonusType: '', overtime: '有', showSeal: true,
      workLocationName: 'PERSOLコミュニケーション SDSC', workLocationAddress: '宮城県仙台市青葉区中央3-4-7 メットライフ仙台ビル',
      workLocationTel: '', organizationUnit: 'ビジネス本部 エンタープライズ統括部 第五サービス部 楽天（SDSC）',
      conflictDate: '', conflictDateOrg: '', responsibility: '無',
      dispatchStart: '2026-04-01', dispatchEnd: '2026-06-30',
      cmdDept: 'EP）第五サービス部', cmdRole: '担当', cmdName: '北野 薫', cmdTel: '070-4358-7529',
      respDept: 'EP）第五サービス部', respRole: '担当', respName: '北野 薫', respTel: '070-4358-7529',
      mgrDept: '北日本営業部 東北営業所', mgrRole: '担当営業', mgrName: '小澤 大雅', mgrTel: '022-399-7421',
      compDept: 'SDSC支援サービスグループ', compRole: '担当', compName: '大園 理', compTel: '050-3163-8400',
      cmpDept: '西日本営業部', cmpRole: '部長', cmpName: '丸目 修平', cmpTel: '06-6343-8411',
      welfare: '休憩室 ロッカー（執務エリアに私物が持ち込めない場合） 派遣先が設置する福利厚生設備\n※利用時間については就業時間内とする',
      safetyText: '派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。',
      conflictText: '派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。',
      dispatchFeeOfficeName: '本社', dispatchFeeAmount: 20318, dispatchFeeFiscalYear: 'R6',
    })
  )
  fs.mkdirSync('/tmp/pdftest', { recursive: true })
  fs.writeFileSync('/tmp/pdftest/patternC_c22.pdf', buf)
  console.log('wrote patternC_c22.pdf', buf.length, 'bytes')
}
main()
