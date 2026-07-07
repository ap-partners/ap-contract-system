// ===== 帳票PDF生成API =====
// /api/contracts/[id]/pdf にGETすると、該当契約のPDFをその場で生成して返す。
// 2026-07-07実装（第1弾：雇用契約書・パターンAのみ対応。就業条件明示書・兼用版等は今後追加）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { EmploymentContractPdf } from '@/lib/pdf/EmploymentContractPdf'

// service role keyを使い、RLSを経由せずサーバー側で直接contractsを読む
// （現フェーズはRLSを緩めに維持中のためanonキーでも読めるが、帳票生成は
// ユーザーのログインセッションに依存させたくないためservice roleを使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : contractType === '正社員' ? '' : '（有期）'
  return `${documentType}${suffix}`
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

  // 第1弾は「雇用契約書」（パターンA相当）のみ対応。それ以外は未対応であることを明示する。
  if (contract.document_type !== '雇用契約書') {
    return NextResponse.json(
      { error: `この書類種別（${contract.document_type}）のPDF生成は未対応です。現在対応しているのは「雇用契約書」のみです。` },
      { status: 501 }
    )
  }

  const f = contract.input_data?.fields || {}
  const staffSnapshot = contract.input_data?.staff || {}

  const buffer = await renderToBuffer(
    EmploymentContractPdf({
      contractType: contract.contract_type,
      documentLabel: getDocumentLabel(contract.document_type, contract.contract_type),
      employeeName: staffSnapshot.name || '',
      workLocationName: f.workLocationName || '',
      workLocationAddress: f.workLocationAddress || '',
      workLocationTel: f.workLocationTel || '',
      businessContent: f.businessContent || '',
      startTime: f.startTime || '',
      endTime: f.endTime || '',
      isShift: !!f.isShift,
      workDays: f.workDays || '',
      workDaysOther: f.workDaysOther || '',
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
    })
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contract_${id}.pdf"`,
    },
  })
}
