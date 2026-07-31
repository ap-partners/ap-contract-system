// ===== 依頼（スタッフマスタ登録・CSVインポート）の手動完了・取消API（2026-07-31新設） =====
// 管理部ダッシュボード「依頼管理」タブから呼ばれる。従来「取消」はブラウザから直接
// supabase.update()していたが、取消・完了とも依頼元（担当営業）へのメール通知を
// 新設するにあたり、メール送信はサーバー側（service role）で行う必要があるため、
// 状態更新とメール送信をまとめてこのAPIに統一した。
// - action='complete'：手動完了操作自体がこれまで存在しなかった（自動マッチ成立時のみ
//   completedになる仕組みだった）ため、今回新設。既存の自動マッチ完了メールと同じ
//   テンプレート（sendStaffRegisterMatchedMail/sendCsvImportMatchedMail）を再利用する。
// - action='cancel'：既存の取消操作にメール通知を追加。
// 依頼元への通知先は、依頼元の所属部署のメーリングリスト優先・未登録なら本人個人宛に
// フォールバック（resolveRequesterNotifyEmail。他の通知と同じ考え方）。
// メール送信に失敗しても、状態更新自体（保存済みの業務記録）はロールバックしない
// （既存の自動マッチ完了処理も同じ設計：notifyErrorsとして記録するのみ）。
// 認可：管理部ロールのみ（依頼管理タブ自体が管理部専用のため）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCsvImportMatchedMail, sendStaffRegisterMatchedMail, sendRequestCancelledMail } from '@/lib/mail'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { resolveRequesterNotifyEmail } from '@/lib/mailingList'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type StatusField = 'staff_register_status' | 'csv_import_status'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await getAuthenticatedStaff(req)
  if (!staffAuth || staffAuth.role !== '管理部') {
    return NextResponse.json({ error: '管理部ロールでのログインが必要です。' }, { status: 401 })
  }

  const { id: requestId } = await params
  const body = await req.json()
  const { statusField, action, reason } = body as {
    statusField: StatusField
    action: 'complete' | 'cancel'
    reason?: string
  }

  if (statusField !== 'staff_register_status' && statusField !== 'csv_import_status') {
    return NextResponse.json({ error: '不正な指定です（statusField）。' }, { status: 400 })
  }
  if (action !== 'complete' && action !== 'cancel') {
    return NextResponse.json({ error: '不正な指定です（action）。' }, { status: 400 })
  }
  if (action === 'cancel' && !reason?.trim()) {
    return NextResponse.json({ error: '取消理由を入力してください。' }, { status: 400 })
  }

  // 2026-07-31：完了・取消メールの項目網羅（伊藤さん指摘）のため、フォームの入力項目一式を追加。
  const { data: request, error: fetchError } = await supabaseAdmin
    .from('requests')
    .select('id, request_type, staff_name, staff_code, staff_dept, staff_hire_date, client_name, system_type, dispatch_start_date, requested_by, requested_by_name, requested_by_dept, staff_register_status, csv_import_status')
    .eq('id', requestId)
    .maybeSingle()

  if (fetchError || !request) {
    return NextResponse.json({ error: '依頼が見つかりませんでした。' }, { status: 404 })
  }
  if (request[statusField] !== 'pending') {
    return NextResponse.json({ error: 'この依頼は既に処理済みです。画面を更新してご確認ください。' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const updatePayload =
    action === 'complete'
      ? statusField === 'staff_register_status'
        ? { staff_register_status: 'completed', staff_register_completed_at: now, staff_register_completed_by: staffAuth.userId }
        : { csv_import_status: 'completed', csv_import_completed_at: now, csv_import_completed_by: staffAuth.userId }
      : statusField === 'staff_register_status'
        ? { staff_register_status: 'cancelled', staff_register_cancel_reason: reason!.trim() }
        : { csv_import_status: 'cancelled', csv_import_cancel_reason: reason!.trim() }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('requests')
    .update(updatePayload)
    .eq('id', requestId)
    .eq(statusField, 'pending') // 二重操作防止の条件付き更新
    .select('id')

  if (updateError || !updated || updated.length === 0) {
    return NextResponse.json({ error: 'この依頼は既に処理済みです（他の操作と競合した可能性があります）。' }, { status: 409 })
  }

  let notifyError: string | undefined
  if (request.requested_by) {
    try {
      const toEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || await resolveRequesterNotifyEmail(request.requested_by)
      if (toEmail) {
        if (action === 'complete') {
          if (statusField === 'staff_register_status') {
            await sendStaffRegisterMatchedMail(toEmail, {
              staffName: request.staff_name,
              staffCode: request.staff_code,
              staffDept: request.staff_dept,
              staffHireDate: request.staff_hire_date,
              requestedByName: request.requested_by_name,
              requestedByDept: request.requested_by_dept,
            }, true)
          } else {
            await sendCsvImportMatchedMail(toEmail, {
              staffName: request.staff_name,
              staffCode: request.staff_code,
              staffDept: request.staff_dept,
              workLocationName: request.client_name,
              systemType: request.system_type,
              dispatchStartDate: request.dispatch_start_date,
              requestedByName: request.requested_by_name,
              requestedByDept: request.requested_by_dept,
            }, true)
          }
        } else {
          const requestType = statusField === 'staff_register_status' ? 'staff_register' : 'csv_import'
          await sendRequestCancelledMail(toEmail, {
            requestType,
            staffName: request.staff_name,
            staffCode: request.staff_code,
            staffDept: request.staff_dept,
            staffHireDate: request.staff_hire_date,
            clientName: request.client_name,
            systemType: request.system_type,
            dispatchStartDate: request.dispatch_start_date,
            // staff_register依頼で、CSVインポートも同時依頼されていた場合のみtrue
            csvAlsoRequested: requestType === 'staff_register' && request.csv_import_status === 'pending',
            requestedByName: request.requested_by_name,
            requestedByDept: request.requested_by_dept,
            reason: reason!.trim(),
          })
        }
      } else {
        notifyError = '依頼元の通知先メールアドレスが見つかりませんでした。'
      }
    } catch (e: any) {
      notifyError = '通知メール送信に失敗しました: ' + (e?.message || '')
    }
  }

  return NextResponse.json({ success: true, notifyError })
}
