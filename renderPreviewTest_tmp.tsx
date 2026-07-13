import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractAndConditionsPdf } from './lib/pdf/EmploymentContractAndConditionsPdf'
import { getOfficeName } from './lib/pdf/documentText'
import fs from 'fs'

const staffSnapshot = {"name":"山﨑　怜菜","crew_code":null,"department":"東北営業所","employee_number":"105180"}
const f: any = {"cmd_tel":"070-4358-7529","cmp_tel":"06-6343-8411","endTime":"18:00","isShift":false,"mgr_tel":"022-399-7421","rolePay":"2000","welfare":"休憩室 ロッカー（執務エリアに私物が持ち込めない場合） 派遣先が設置する福利厚生設備 ※利用時間については就業時間内とする","cmd_dept":"EP）第五サービス部","cmd_name":"北野 薫","cmd_role":"担当","cmp_dept":"西日本営業部","cmp_name":"丸目 修平","cmp_role":"部長","comp_tel":"050-3163-8400","flexTime":"無","mgr_dept":"北日本営業部　東北営業所","mgr_name":"小澤 大雅","mgr_role":"担当営業","overtime":"有","resp_tel":"070-4358-7529","salesPay":"2000","skillPay":"5000","trialEnd":"","workDays":"週5日","bonusType":"あり","breakTime":"60","comp_dept":"SDSC支援サービスグループ","comp_name":"大園 理","comp_role":"担当","employEnd":"","resp_dept":"EP）第五サービス部","resp_name":"北野 薫","resp_role":"担当","startTime":"09:00","workPlace":"現場","housingPay":"3000","safetyMode":"default","safetyText":"派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。","salaryType":"月給","trialStart":"","basicSalary":"260000","dispatchEnd":"2026-06-30","employStart":"","overtimePay":"20000","trialPeriod":"無","conflictDate":"","conflictMode":"default","conflictText":"派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。","contractType":"正社員","documentType":"雇用契約書 兼\n就業条件明示書","dispatchStart":"2026-04-01","overtimeHours":"5","transportType":"default","workDaysOther":"","workingHoursH":"08","workingHoursM":"00","closingPattern":"auto","responsibility":"無","businessContent":"各種電話対応、またはそれに付随する業務(RMSCC業務）","conflictDateOrg":"","workLocationTel":null,"organizationUnit":"ビジネス本部 エンタープライズ統括部 第五サービス部 楽天（SDSC）","workLocationName":"PERSOLコミュニケーション SDSC","contractStartDate":"2026-04-01","hasEmployInsurance":true,"hasSocialInsurance":true,"workLocationAddress":"宮城県仙台市青葉区中央3-4-7 メットライフ仙台ビル","monthlyStandardHours":168}

async function main() {
  const bufNoSeal = await renderToBuffer(
    EmploymentContractAndConditionsPdf({
      contractType: '正社員',
      documentLabel: '雇用契約書 兼 就業条件明示書',
      employeeName: staffSnapshot.name || '',
      employeeAddress: '',
      businessContent: f.businessContent || '',
      startTime: f.startTime || '',
      endTime: f.endTime || '',
      isShift: !!f.isShift,
      workDays: f.workDays || '',
      workDaysOther: f.workDaysOther || '',
      flexTime: f.flexTime || '',
      workingHoursH: f.workingHoursH || 0,
      workingHoursM: f.workingHoursM || 0,
      breakTime: f.breakTime || 0,
      employStart: f.employStart || '',
      employEnd: f.employEnd || '',
      contractStartDate: f.contractStartDate || '',
      salaryType: f.salaryType || '',
      basicSalary: f.basicSalary || 0,
      skillPay: f.skillPay || 0,
      rolePay: f.rolePay || 0,
      salesPay: f.salesPay || 0,
      housingPay: f.housingPay || 0,
      overtimePay: f.overtimePay || 0,
      overtimeHours: f.overtimeHours || 0,
      hasEmployInsurance: !!f.hasEmployInsurance,
      hasSocialInsurance: !!f.hasSocialInsurance,
      transportType: f.transportType || 'default',
      trialPeriod: f.trialPeriod || '',
      trialStart: f.trialStart || '',
      trialEnd: f.trialEnd || '',
      pattern: 'C' as any,
      bonusType: f.bonusType || '',
      overtime: f.overtime || '',
      showSeal: true,
      workLocationName: f.workLocationName || '',
      workLocationAddress: f.workLocationAddress || '',
      workLocationTel: f.workLocationTel || '',
      organizationUnit: f.organizationUnit || '',
      conflictDate: f.conflictDate || '',
      conflictDateOrg: f.conflictDateOrg || '',
      responsibility: f.responsibility || '',
      dispatchStart: f.dispatchStart || '',
      dispatchEnd: f.dispatchEnd || '',
      cmdDept: f.cmd_dept || '',
      cmdRole: f.cmd_role || '',
      cmdName: f.cmd_name || '',
      cmdTel: f.cmd_tel || '',
      respDept: f.resp_dept || '',
      respRole: f.resp_role || '',
      respName: f.resp_name || '',
      respTel: f.resp_tel || '',
      mgrDept: f.mgr_dept || '',
      mgrRole: f.mgr_role || '',
      mgrName: f.mgr_name || '',
      mgrTel: f.mgr_tel || '',
      compDept: f.comp_dept || '',
      compRole: f.comp_role || '',
      compName: f.comp_name || '',
      compTel: f.comp_tel || '',
      cmpDept: f.cmp_dept || '',
      cmpRole: f.cmp_role || '',
      cmpName: f.cmp_name || '',
      cmpTel: f.cmp_tel || '',
      welfare: f.welfare || '',
      safetyText: f.safetyText || '',
      conflictText: f.conflictText || '',
      dispatchFeeOfficeName: '本社',
      dispatchFeeAmount: 20318,
      dispatchFeeFiscalYear: 'R6年度実績',
      // signatureImageDataUrl は渡さない（＝プレビューエンドポイントと同じ状態）
    })
  )
  fs.writeFileSync('/tmp/pdftest2/preview_no_seal.pdf', bufNoSeal)
  console.log('wrote preview_no_seal.pdf', bufNoSeal.length, 'bytes')
}
main()
