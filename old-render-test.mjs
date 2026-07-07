import { EmploymentContractPdf } from './old-bundle-test.mjs';
import { renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';
const props = {
  contractType: '無期契約', documentLabel: '雇用契約書', employeeName: '猪野正明',
  employeeAddress: '', workLocationName: 'aa', workLocationAddress: 'aa', workLocationTel: '',
  businessContent: 'aaa', startTime: '09:00', endTime: '18:00', isShift: false,
  workDays: '週5日', workDaysOther: '',
  workingHoursH: 8, workingHoursM: 0, breakTime: 60,
  employStart: '', employEnd: '', contractStartDate: '2026-07-07',
  salaryType: '月給', basicSalary: 190000, skillPay: 0, rolePay: 0, salesPay: 0, housingPay: 0,
  overtimePay: 0, overtimeHours: 0,
  hasEmployInsurance: true, hasSocialInsurance: true,
  transportType: 'default', trialPeriod: '無', trialStart: '', trialEnd: '',
  pattern: 'A', bonusType: 'なし', overtime: '無', showSeal: false,
};
const buf = await renderToBuffer(EmploymentContractPdf(props));
fs.writeFileSync('/tmp/old_repro.pdf', buf);
console.log('rendered ok');
