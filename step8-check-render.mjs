import { EmploymentContractPdf } from './step8-check-bundle.mjs';
import { renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';
const props = {
  contractType: '有期契約', documentLabel: '雇用契約書（有期）', employeeName: '猪野正明',
  employeeAddress: '', workLocationName: '本社', workLocationAddress: '東京都新宿区新宿2-16-20', workLocationTel: '',
  businessContent: '一般事務業務全般を担当し、来客対応や電話応対を行う。',
  startTime: '9:00', endTime: '18:00', isShift: true,
  workDays: '週5日', workDaysOther: '', flexTime: '有',
  workingHoursH: 8, workingHoursM: 0, breakTime: 60,
  employStart: '2026-07-01', employEnd: '2027-06-30', contractStartDate: '2026-07-01',
  salaryType: '月給', basicSalary: 190000, skillPay: 0, rolePay: 0, salesPay: 0, housingPay: 0,
  overtimePay: 0, overtimeHours: 0,
  hasEmployInsurance: false, hasSocialInsurance: false,
  transportType: 'default', trialPeriod: '無', trialStart: '', trialEnd: '',
  pattern: 'A', bonusType: 'なし', overtime: '有', showSeal: false,
};
const buf = await renderToBuffer(EmploymentContractPdf(props));
fs.writeFileSync('/tmp/step8_check.pdf', buf);
console.log('rendered ok');
