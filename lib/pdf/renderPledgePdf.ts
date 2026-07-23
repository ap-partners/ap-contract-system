// ===== アルバイト誓約書PDF生成の共通ロジック =====
// 2026-07-23実装。lib/pdf/renderContractPdf.ts（雇用契約書等）と同じ考え方で、
// app/api/pledges/[id]/pdf/route.ts（プレビュー・未署名表示用）から利用する。
// 署名フロー実装後は、署名完了APIからも同様に呼び出す想定（options.signatureImageDataUrl）。
import { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { PledgePdf, PledgeScheduleRow } from './PledgePdf'

const shouldShowSeal = (status: string): boolean => {
  return !['申請中', '差し戻し中', '取り下げ'].includes(status)
}

export type RenderPledgePdfOptions = {
  signatureImageDataUrl?: string
}

// 該当pledgesのPDFをその場で生成しBufferで返す。
export async function renderPledgePdfBuffer(
  pledge: any,
  supabaseAdmin: SupabaseClient,
  options: RenderPledgePdfOptions = {}
): Promise<Buffer> {
  const inputData = pledge.input_data || {}
  const scheduleRows: PledgeScheduleRow[] = inputData.scheduleRows || []
  const salary = inputData.salary || {}

  // ===== 従業員側：住所は保存時のスナップショット（input_data.staff）に含まれていないため、
  // staffテーブルから都度取得する（雇用契約書PDFのemployeeAddress取得と同じ考え方）。=====
  let employeeAddress = ''
  let staffDeptNo: number | null = null
  if (pledge.staff_id) {
    const { data: staffRow } = await supabaseAdmin
      .from('staff')
      .select('address, dept_no')
      .eq('id', pledge.staff_id)
      .maybeSingle()
    employeeAddress = staffRow?.address || ''
    staffDeptNo = staffRow?.dept_no ?? null
  }

  // ===== 就業場所（STEP2就業先情報）：クライアント先はpledges本体の列、
  // 自社拠点はoffice_id経由でoffice_masterを参照する。=====
  let workLocationName = ''
  let workLocationPostalCode = ''
  let workLocationAddress = ''
  let workLocationTel = ''
  if (pledge.work_place_type === 'client') {
    workLocationName = pledge.client_name || ''
    workLocationPostalCode = pledge.client_postal_code || ''
    workLocationAddress = pledge.client_address || ''
    workLocationTel = pledge.client_tel || ''
  } else if (pledge.work_place_type === 'internal' && pledge.office_id) {
    const { data: officeRow } = await supabaseAdmin
      .from('office_master')
      .select('office_name, postal_code, address, tel')
      .eq('id', pledge.office_id)
      .maybeSingle()
    // 2026-07-23伊藤さん指摘：就業先名は「株式会社APパートナーズ　拠点名」の形式で表示する
    // （例：株式会社APパートナーズ　関西支社）。本社のみ「株式会社APパートナーズ」のみとし
    // 「本社」の文字は入れない。
    workLocationName = officeRow?.office_name && officeRow.office_name !== '本社'
      ? `株式会社APパートナーズ　${officeRow.office_name}`
      : '株式会社APパートナーズ'
    workLocationPostalCode = officeRow?.postal_code || ''
    workLocationAddress = officeRow?.address || ''
    workLocationTel = officeRow?.tel || ''
  }

  // ===== 会社側署名欄の住所：申請対象スタッフの所属部門から拠点（office_master）を逆引き
  // （department_master.office_id経由）。マッピング対象外の部門（広域本部等）や未取得の場合は
  // 本社にフォールバックする（10章2026-07-23「未実装・要スキーマ拡張」の解決版）。=====
  let companyOfficePostalCode = ''
  let companyOfficeAddress = ''
  let companyOfficeId: string | null = null
  if (staffDeptNo !== null) {
    const { data: deptRow } = await supabaseAdmin
      .from('department_master')
      .select('office_id')
      .eq('dept_no', staffDeptNo)
      .maybeSingle()
    companyOfficeId = deptRow?.office_id ?? null
  }
  if (companyOfficeId) {
    const { data: officeRow } = await supabaseAdmin
      .from('office_master')
      .select('postal_code, address')
      .eq('id', companyOfficeId)
      .maybeSingle()
    companyOfficePostalCode = officeRow?.postal_code || ''
    companyOfficeAddress = officeRow?.address || ''
  }
  if (!companyOfficeAddress) {
    const { data: hqRow } = await supabaseAdmin
      .from('office_master')
      .select('postal_code, address')
      .eq('office_name', '本社')
      .maybeSingle()
    companyOfficePostalCode = hqRow?.postal_code || ''
    companyOfficeAddress = hqRow?.address || ''
  }

  return renderToBuffer(
    PledgePdf({
      employeeName: inputData.staff?.name || '',
      employeeAddress,
      workLocationName,
      workLocationPostalCode,
      workLocationAddress,
      workLocationTel,
      businessContent: inputData.workDescription || '',
      scheduleRows,
      salaryType: salary.salaryType || '',
      basicSalary: salary.basicSalary || 0,
      rolePay: salary.rolePay || 0,
      skillPay: salary.skillPay || 0,
      salesPay: salary.salesPay || 0,
      transportType: salary.transportType || 'default',
      companyOfficePostalCode,
      companyOfficeAddress,
      showSeal: shouldShowSeal(pledge.status),
      signatureImageDataUrl: options.signatureImageDataUrl,
    })
  )
}
