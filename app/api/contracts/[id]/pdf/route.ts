// ===== 帳票PDF生成API =====
// /api/contracts/[id]/pdf にGETすると、該当契約のPDFをその場で生成して返す。
// 2026-07-07実装（第1弾：雇用契約書・パターンAのみ対応）。
// 2026-07-08：就業条件明示書（パターンB）、兼用版（パターンC）を追加。全パターン対応完了。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractPdf } from '@/lib/pdf/EmploymentContractPdf'
import { EmploymentConditionsPdf } from '@/lib/pdf/EmploymentConditionsPdf'
import { EmploymentContractAndConditionsPdf } from '@/lib/pdf/EmploymentContractAndConditionsPdf'

// app/apply/page.tsxのgetDocumentTypes()が保存するdocument_typeの生値（'\n'を含む）に合わせる。
const PATTERN_C_DOCUMENT_TYPE = '雇用契約書 兼\n就業条件明示書'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${documentType}${suffix}`
}

const shouldShowSeal = (status: string): boolean => {
  return !['申請中', '差し戻し中', '取り下げ'].includes(status)
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !contract) {
    return NextResponse.json({ error: '契約データが見つかりませんでした。' }, { status: 404 })
  }

  const f = contract.input_data?.fields || {}
  const staffSnapshot = contract.input_data?.staff || {}

  let buffer: Buffer

  if (contract.document_type === '雇用契約書') {
    buffer = await renderToBuffer(
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
      })
    )
  } else if (contract.document_type === '就業条件明示書') {
    buffer = await renderToBuffer(
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
      })
    )
  } else if (contract.document_type === PATTERN_C_DOCUMENT_TYPE) {
    buffer = await renderToBuffer(
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
      })
    )
  } else {
    return NextResponse.json(
      { error: 'この書類種別のPDF生成は未対応です。現在対応しているのは雇用契約書・就業条件明示書・兼用版のみです。' },
      { status: 501 }
    )
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="contract.pdf"',
    },
  })
}
