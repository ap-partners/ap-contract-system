import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentConditionsPdf } from './lib/pdf/EmploymentConditionsPdf'
import fs from 'fs'

// 2026-07-09追加：伊藤さん指摘（contract20.pdf）「就業条件明示書では、派遣先責任者の
// 部署とか文字数が多いので、高さがもっとでますよね？そうなるとレイアウト崩れませんか？」
// を検証するためのストレステスト用スクリプト。パターンBの1ページ固定フォント設計が、
// 極端に長い部署名でも崩れない（2ページ目にはみ出さない・文字が重ならない）ことを確認する。
async function main() {
  const longDept = '東日本ｴﾘｱ営業本部　関東営業統括部　第1営業部　営業2課　5ﾁｰﾑ　上大岡ｴﾘｱ担当　ｼﾆｱｴﾘｱﾏﾈｰｼﾞｬｰ室　サブグループ'
  const buf = await renderToBuffer(
    EmploymentConditionsPdf({
      documentLabel: '就業条件明示書',
      contractType: '有期契約',
      employeeName: '山田 太郎',
      workLocationName: 'ソフトバンク（SB） 量販 ヤマダ電機 ソフトバンクステージＬＡＢＩ上大岡',
      workLocationAddress: '神奈川県横浜市港南区上大岡西１丁目１８‐５',
      workLocationTel: '045‐752‐7715',
      organizationUnit: '東日本ｴﾘｱ営業本部 関東営業統括部 第1営業部 営業2課 5ﾁｰﾑ(ｴﾘｱﾏﾈｰｼﾞｬｰ)',
      conflictDate: '2027-10-01',
      conflictDateOrg: '2028-10-21',
      businessContent: '派遣先　ソフトバンク 業務内容　携帯電話販売促進、　ブロードバンド回線獲得　及び、家庭用電気機械器具販売促進（ソフトバンクが販売及び販売促進に関する委託を受けたものも含む）1．販売・加入促進 2．契約手続き 3．その他運営業務',
      responsibility: '無',
      startTime: '09:00',
      endTime: '23:00',
      isShift: true,
      workDays: '週5日',
      workDaysOther: '',
      flexTime: '有',
      workingHoursH: 8,
      workingHoursM: 0,
      breakTime: 60,
      overtime: '有',
      dispatchStart: '2026-04-01',
      dispatchEnd: '2026-06-30',
      cmdDept: longDept, cmdRole: 'ｼﾆｱｴﾘｱﾏﾈｰｼﾞｬｰ', cmdName: '堀込　美帆', cmdTel: '045‐752‐7715',
      respDept: longDept, respRole: 'ｴﾘｱﾏﾈｰｼﾞｬｰ', respName: '井上　勇生', respTel: '080‐9171‐3849',
      mgrDept: longDept, mgrRole: '課長', mgrName: '高橋　正輝', mgrTel: '03‐5369‐2230',
      compDept: longDept, compRole: '課長', compName: '松中　康博', compTel: '03‐6889‐1276',
      cmpDept: longDept, cmpRole: '部長', cmpName: '吉田　昌弘', cmpTel: '03‐5369‐2230',
      welfare: '教育訓練(派遣労働者と同種の業務に従事する派遣先に雇用される労働者に対して行う業務の遂行に必要な能力を付与するための研修等) 給食施設 休憩室 更衣室 の施設及び設備について、就業先にあり社員も利用できる場合、利用することができる',
      safetyText: '派遣先の安全衛生に関する規程に従い、必要な措置を講じるものとする。また、派遣元は派遣労働者に対し安全衛生教育を実施する。',
      conflictText: '派遣先が派遣労働者を直接雇用する場合は、派遣元に事前に通知するものとし、紛争防止のため誠実に協議を行うものとする。',
      dispatchFeeOfficeName: '東北営業所',
      dispatchFeeAmount: 17762,
      dispatchFeeFiscalYear: 'R6',
      showSeal: true,
    })
  )
  fs.mkdirSync('/tmp/pdftest', { recursive: true })
  fs.writeFileSync('/tmp/pdftest/patternB_stress.pdf', buf)
  console.log('wrote patternB_stress.pdf', buf.length, 'bytes')
}
main()
