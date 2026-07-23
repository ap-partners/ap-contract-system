// ===== マイページ：ログイン中の従業員情報＋書類一覧を返す =====
// 2026-07-17新設。マイページホーム画面（/staff/mypage）が表示する内容をまとめて返す。
//  ・pendingDocuments：署名待ちの書類（確定仕様A。雇用開始日が近い場合は残り日数も返す）
//  ・signedDocuments：署名済み・確認済みの書類（確定仕様B。日付の新しい順）
//    クエリ ?all=1 を付けると全件、付けない場合は直近3件のみ返す
//    （マイページの「過去の書類を見る」ボタン用）。
// 2026-07-23追加：アルバイト誓約書（pledges）署名フロー接続に伴い、contractsに加えpledgesも
// マージして返すよう拡張。各書類には`kind`（'contract'|'pledge'）を付与し、詳細画面
// （/staff/mypage/documents/[id]）がどちらのテーブル・APIを使うか判定できるようにする。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStaffIdFromRequest } from '@/lib/staffAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const getDocumentLabel = (documentType: string, contractType: string): string => {
  const suffix = contractType === 'アルバイト' ? '（アルバイト）' : contractType === '無期契約' ? '（無期）' : ''
  return `${(documentType || '').replace(/\n/g, ' ')}${suffix}`
}

const PLEDGE_DOCUMENT_LABEL = 'アルバイト誓約書'

// 雇用開始日（無ければ派遣開始日）から、対応期限までの残り日数を計算する
// （過去のトーク履歴の確定仕様⑨：万が一対応が遅れると雇用開始日を過ぎてしまうことへの警告表示）。
function computeRemainingDays(contract: any): number | null {
  const fields = contract.input_data?.fields || {}
  const dateStr = fields.employStart || fields.dispatchStart
  if (!dateStr) return null
  const target = new Date(dateStr)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

export async function GET(req: NextRequest) {
  const staffId = await getStaffIdFromRequest(req)
  if (!staffId) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('staff')
    .select('id, name, employee_number')
    .eq('id', staffId)
    .maybeSingle()

  if (staffError || !staff) {
    return NextResponse.json({ error: 'アカウント情報が見つかりませんでした。' }, { status: 404 })
  }

  const { data: pendingContractRows } = await supabaseAdmin
    .from('contracts')
    .select('id, document_type, contract_type, sign_action_type, input_data, sign_requested_at')
    .eq('staff_id', staffId)
    .eq('status', '署名待ち')
    .order('sign_requested_at', { ascending: true })

  const { data: pendingPledgeRows } = await supabaseAdmin
    .from('pledges')
    .select('id, sign_action_type, sign_requested_at')
    .eq('staff_id', staffId)
    .eq('status', '署名待ち')
    .order('sign_requested_at', { ascending: true })

  const pendingDocuments = [
    ...(pendingContractRows || []).map(c => ({
      id: c.id,
      kind: 'contract' as const,
      documentLabel: getDocumentLabel(c.document_type, c.contract_type),
      signAction: c.sign_action_type || 'confirmation',
      remainingDays: computeRemainingDays(c),
    })),
    ...(pendingPledgeRows || []).map(p => ({
      id: p.id,
      kind: 'pledge' as const,
      documentLabel: PLEDGE_DOCUMENT_LABEL,
      signAction: p.sign_action_type || 'signature',
      remainingDays: null,
    })),
  ].sort((a, b) => a.documentLabel.localeCompare(b.documentLabel))

  const all = req.nextUrl.searchParams.get('all') === '1'
  let signedContractQuery = supabaseAdmin
    .from('contracts')
    .select('id, document_type, contract_type, sign_action_type, signed_at', { count: 'exact' })
    .eq('staff_id', staffId)
    .in('status', ['署名済み', '完了'])
    .order('signed_at', { ascending: false })
  let signedPledgeQuery = supabaseAdmin
    .from('pledges')
    .select('id, sign_action_type, signed_at', { count: 'exact' })
    .eq('staff_id', staffId)
    .eq('status', '署名済み')
    .order('signed_at', { ascending: false })

  if (!all) {
    signedContractQuery = signedContractQuery.limit(3)
    signedPledgeQuery = signedPledgeQuery.limit(3)
  }

  const [{ data: signedContractRows, count: signedContractCount }, { data: signedPledgeRows, count: signedPledgeCount }] =
    await Promise.all([signedContractQuery, signedPledgeQuery])

  const signedDocuments = [
    ...(signedContractRows || []).map(c => ({
      id: c.id,
      kind: 'contract' as const,
      documentLabel: getDocumentLabel(c.document_type, c.contract_type),
      signAction: c.sign_action_type || 'confirmation',
      signedAt: c.signed_at,
    })),
    ...(signedPledgeRows || []).map(p => ({
      id: p.id,
      kind: 'pledge' as const,
      documentLabel: PLEDGE_DOCUMENT_LABEL,
      signAction: p.sign_action_type || 'signature',
      signedAt: p.signed_at,
    })),
  ].sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1)).slice(0, all ? undefined : 3)

  return NextResponse.json({
    staffName: staff.name,
    employeeNumber: staff.employee_number,
    pendingDocuments,
    signedDocuments,
    signedDocumentsTotalCount: (signedContractCount ?? 0) + (signedPledgeCount ?? 0),
  })
}
