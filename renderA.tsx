import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractPdf } from './lib/pdf/EmploymentContractPdf'
import fs from 'fs'

async function main() {
  const buf = await renderToBuffer(
    EmploymentContractPdf({
      contractType: '有期契約',
      documentLabel: '雇用契約書',
      employeeName: '山田 太郎',
      employeeAddress: '東京都新宿区西新宿1-1-1',
      workLocationName: 'ソフトバンク（SB） 量販 ヤマダ電機 ソフトバンクステージＬＡＢＩ上大岡',
      workLocationAddress: '神奈川県横浜市港南区上大岡西１丁目１８‐５',
      workLocationTel: '045‐752‐7715',
      businessContent: '携帯電話販売促進、ブロードバンド回線獲得及び、家庭用電気機械器具販売促進',
      startTime: '09:00',
      endTime: '23:00',
      isShift: true,
      workDays: '週5日',
      workDaysOther: '',
      flexTime: '有',
      workingHoursH: 8,
      workingHoursM: 0,
      breakTime: 60,
      employStart: '2026-04-01',
      employEnd: '2026-06-30',
      contractStartDate: '',
      salaryType: '時給',
      basicSalary: 1500,
      skillPay: 0,
      rolePay: 0,
      salesPay: 0,
      housingPay: 0,
      overtimePay: 0,
      overtimeHours: 0,
      hasEmployInsurance: true,
      hasSocialInsurance: true,
      transportType: 'default',
      trialPeriod: '有',
      trialStart: '2026-04-01',
      trialEnd: '2026-05-31',
      pattern: 'A',
      bonusType: 'なし',
      overtime: '有',
      showSeal: false,
    })
  )
  fs.mkdirSync('/tmp/pdftest', { recursive: true })
  fs.writeFileSync('/tmp/pdftest/patternA.pdf', buf)
  console.log('wrote patternA.pdf', buf.length, 'bytes')
}
main()
