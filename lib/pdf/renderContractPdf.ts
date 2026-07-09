// ===== 帳票PDF生成の共通ロジック =====
// 2026-07-09切り出し（フェーズ5・署名機能）：app/api/contracts/[id]/pdf/route.ts に
// あったフィールドマッピング・派遣料金マスタ参照ロジックを、署名完了APIからも呼べるように
// 共通関数化した。route.ts（プレビュー・未署名表示用）と
// app/api/sign/[id]/complete/route.ts（署名完了・Drive保存用）の両方から利用する。
// 挙動は元のroute.tsと完全に同一（切り出しのみ、ロジック変更なし）。
import { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractPdf } from './EmploymentContractPdf'
import { EmploymentConditionsPdf } from './EmploymentConditionsPdf'
import { EmploymentContractAndConditionsPdf } from './EmploymentContractAndConditionsPdf'
import { getOfficeName } from './documentText'

// app/apply/page.tsxのgetDocumentTypes()が保存するdocument_typeの生値（'\n'を含む）に合わせる。
export const PATTERN_C_DOCUMENT_TYPE = '雇用契約書 兼\n就業条件明示書'

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${documentType.replace(/\n/g, ' ')}${suffix}`
}

const shouldShowSeal = (status: string): boolean => {
  return !['申請中', '差し戻し中', '取り下げ'].includes(status)
}

export type RenderContractPdfOptions = {
  // 従業員の手書き署名画像（PNGのdata URL）。パターンA・Cのみ有効（EmploymentConditionsPdfにはこのpropが無い）。
  // /sign/[id]で署名完了した時にのみ渡される。未署名の間はundefinedのまま（欄は空欄で出力）。
  signatureImageDataUrl?: string
}

// 該当契約のPDFをその場で生成しBufferで返す。document_typeで雇用契約書／就業条件明示書／兼用版を判定する。
// 未対応の書類種別の場合は例外を投げる（呼び出し側でエラーレスポンスに変換すること）。
export async function renderContractPdfBuffer(
  contract: any,
  supabaseAdmin: SupabaseClient,
  options: RenderContractPdfOptions = {}
): Promise<Buffer> {
  const f = contract.input_data?.fields || {}
  const staffSnapshot = contract.input_data?.staff || {}

  // ===== 当該事業所における労働者派遣料金額の平均額（B・C共通）=====
  let dispatchFeeOfficeName: string | undefined
  let dispatchFeeAmount: number | null = null
  let dispatchFeeFiscalYear: string | undefined
  if (contract.created_by_dept_no != null) {
    const { data: deptRow } = await supabaseAdmin
      .from('department_master')
      .select('dept_name')
      .eq('dept_no', contract.created_by_dept_no)
      .maybeSingle()
    dispatchFeeOfficeName = getOfficeName(deptRow?.dept_name)
    const { data: feeRow } = await supabaseAdmin
      .from('dispatch_fee_master')
      .select('amount_per_day, fiscal_year_label')
      .eq('office_name', dispatchFeeOfficeName)
      .maybeSingle()
    dispatchFeeAmount = feeRow?.amount_per_day ?? null
    dispatchFeeFiscalYear = feeRow?.fiscal_year_label
  }

  if (contract.document_type === '雇用契約書') {
    return renderToBuffer(
      EmploymentContractPdf({
        contractType: contract.contract_type,
        documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
        employeeName: staffSnapshot.name || '',
        employeeAddress: staffSnapshot.address || '',
        workLocationName: f.workLocationName || '',
        workLocationAddress: f.workLocationAddress || '',
        workLocationTel: f.workLocationTel || '',
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
        pattern: contract.pattern,
        bonusType: f.bonusType || '',
        overtime: f.overtime || '',
        showSeal: shouldShowSeal(contract.status),
        signatureImageDataUrl: options.signatureImageDataUrl,
      })
    )
  }

  if (contract.document_type === '就業条件明示書') {
    return renderToBuffer(
      EmploymentConditionsPdf({
        documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
        contractType: contract.contract_type,
        employeeName: staffSnapshot.name || '',
        workLocationName: f.workLocationName || '',
        workLocationAddress: f.workLocationAddress || '',
        workLocationTel: f.workLocationTel || '',
        organizationUnit: f.organizationUnit || '',
        conflictDate: f.conflictDate || '',
        conflictDateOrg: f.conflictDateOrg || '',
        businessContent: f.businessContent || '',
        responsibility: f.responsibility || '',
        startTime: f.startTime || '',
        endTime: f.endTime || '',
        isShift: !!f.isShift,
        workDays: f.workDays || '',
        workDaysOther: f.workDaysOther || '',
        flexTime: f.flexTime || '',
        workingHoursH: f.workingHoursH || 0,
        workingHoursM: f.workingHoursM || 0,
        breakTime: f.breakTime || 0,
        overtime: f.overtime || '',
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
        dispatchFeeOfficeName,
        dispatchFeeAmount,
        dispatchFeeFiscalYear,
      })
    )
  }

  if (contract.document_type === PATTERN_C_DOCUMENT_TYPE) {
    return renderToBuffer(
      EmploymentContractAndConditionsPdf({
        contractType: contract.contract_type,
        documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
        employeeName: staffSnapshot.name || '',
        employeeAddress: staffSnapshot.address || '',
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
        pattern: contract.pattern,
        bonusType: f.bonusType || '',
        overtime: f.overtime || '',
        showSeal: shouldShowSeal(contract.status),
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
        dispatchFeeOfficeName,
        dispatchFeeAmount,
        dispatchFeeFiscalYear,
        signatureImageDataUrl: options.signatureImageDataUrl,
      })
    )
  }

  throw new Error(
    'この書類種別のPDF生成は未対応です。現在対応しているのは雇用契約書・就業条件明示書・兼用版のみです。'
  )
}
