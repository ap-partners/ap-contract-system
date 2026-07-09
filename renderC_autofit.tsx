import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractAndConditionsPdf } from './lib/pdf/EmploymentContractAndConditionsPdf'
import fs from 'fs'

// 2026-07-09追加：AutoFitFreeText（安全及び衛生・紛争防止措置の自動フォント縮小）が
// 実際に機能するかを検証するためのストレステスト用スクリプト。既定文言よりかなり
// 長い文章を入れても、行の高さ（2行）を保ったままフォントサイズが縮小されることを確認する。
async function main() {
  const longSafety = '派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。加えて、健康診断の結果に基づく就業上の配慮、ストレスチェックの実施、及び労働災害発生時の速やかな報告体制についても、派遣先・派遣元双方が責任をもって対応するものとする。'
  const buf = await renderToBuffer(
    EmploymentContractAndConditionsPdf({
      contractType: '有期契約',
      documentLabel: '雇用契約書 兼\n就業条件明示書',
      employeeName: '山田 太郎',
      employeeAddress: '東京都新宿区西新宿1-1-1',
      businessContent: '派遣先　ソフトバンク 業務内容　携帯電話販売促進',
      startTime: '09:00', endTime: '23:00', isShift: true,
      workDays: '週5日', workDaysOther: '', flexTime: '有',
      workingHoursH: 8, workingHoursM: 0, breakTime: 60,
      employStart: '2026-04-01', employEnd: '2026-06-30', contractStartDate: '',
      salaryType: '月給', basicSalary: 220000, skillPay: 10000, rolePay: 0, salesPay: 0, housingPay: 0,
      overtimePay: 0, overtimeHours: 0, hasEmployInsurance: true, hasSocialInsurance: true,
      transportType: 'default', trialPeriod: '有', trialStart: '2026-04-01', trialEnd: '2026-05-31',
      pattern: 'C', bonusType: '', overtime: '有', showSeal: true,
      workLocationName: 'ソフトバンク（SB） 量販', workLocationAddress: '神奈川県横浜市港南区上大岡西1-18-5',
      workLocationTel: '045-752-7715', organizationUnit: '東日本エリア営業本部',
      conflictDate: '2027-10-01', conflictDateOrg: '2028-10-21', responsibility: '無',
      dispatchStart: '2026-04-01', dispatchEnd: '2026-06-30',
      cmdDept: '東日本エリア営業本部', cmdRole: 'SV', cmdName: '堀込 美帆', cmdTel: '045-752-7715',
      respDept: '東日本エリア営業本部', respRole: 'エリアマネージャー', respName: '井上 勇生', respTel: '080-9171-3849',
      mgrDept: 'SP営業部SP1課', mgrRole: '課長', mgrName: '高橋 正輝', mgrTel: '03-5369-2230',
      compDept: 'コンシューマ事業統括', compRole: '課長', compName: '松中 康博', compTel: '03-6889-1276',
      cmpDept: '管理部', cmpRole: '部長', cmpName: '吉田 昌弘', cmpTel: '03-5369-2230',
      welfare: '休憩室 ロッカー', safetyText: longSafety,
      conflictText: '派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。',
      dispatchFeeOfficeName: undefined, dispatchFeeAmount: null, dispatchFeeFiscalYear: undefined,
    })
  )
  fs.mkdirSync('/tmp/pdftest', { recursive: true })
  fs.writeFileSync('/tmp/pdftest/patternC_autofit.pdf', buf)
  console.log('wrote patternC_autofit.pdf', buf.length, 'bytes')
}
main()
