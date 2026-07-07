import { EmploymentContractPdf } from './nbsp-fix-bundle.mjs';
import { renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';
const props = {
  contractType: '有期契約', documentLabel: '雇用契約書', employeeName: '長谷川将之',
  employeeAddress: '', workLocationName: 'ティーガイア本社 DS東金店', workLocationAddress: '千葉県東金市押堀６６３－１', workLocationTel: '047-222-6541',
  businessContent: '携帯電話及びサービスの販売応援及び販売補助業務',
  startTime: '9:30', endTime: '18:30', isShift: true,
  workDays: '週5日', workDaysOther: '', flexTime: '無',
  workingHoursH: 8, workingHoursM: 0, breakTime: 60,
  employStart: '2026-03-01', employEnd: '2026-06-30', contractStartDate: '',
  salaryType: '月給', basicSalary: 190000, skillPay: 5000, rolePay: 2000, salesPay: 3000, housingPay: 2000,
  overtimePay: 50000, overtimeHours: 10,
  hasEmployInsurance: false, hasSocialInsurance: false,
  transportType: 'pass-gas', trialPeriod: '有', trialStart: '2026-03-01', trialEnd: '2026-04-30',
  pattern: 'A', bonusType: 'なし', overtime: '有', showSeal: false,
};
const buf = await renderToBuffer(EmploymentContractPdf(props));
fs.writeFileSync('/tmp/nbsp_fix.pdf', buf);
console.log('rendered ok');
