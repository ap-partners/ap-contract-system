// ===== 更新期限管理フェーズ2：残日数しきい値の自動メール通知 =====
// Vercel Cron（vercel.json）から1日1回呼び出される想定。
//
// 仕様（2026-07-15 伊藤さん決定）：
// ・通知の粒度＝担当営業ごとに1日1通のダイジェスト（候補・しきい値ごとの個別メールではない）
// ・宛先＝TO: 担当営業（該当部門）／CC: SSC・管理部（全員）
// ・対象しきい値＝残日数45/30/20/14/7日（RenewalCandidate.status が pending/csv_pending の
//   ものだけ。ready（送付準備完了）・not_renewing（更新しない確定）は対象外）
// ・重複送信防止＝renewal_candidates.notified_thresholds に送信済みしきい値を記録し、
//   同じしきい値では二度と送らない。しきい値をまたいで一気に進んだ場合（cron停止等）は、
//   最も近い（＝最も緊急度が高い）しきい値でまとめて1回通知し、飛ばした分もすべて
//   notified_thresholds に記録して後から重複通知しないようにする。
// ・期限超過（残日数<0）の案件は、しきい値を使い切った後も未解決である限り毎日ダイジェストに
//   含め続ける（サイレントに放置されないようにするため）。
// ・本番稼働前の現状（実アカウントが未整備）を踏まえ、RENEWAL_NOTIFY_OVERRIDE_EMAIL を設定すると
//   実際の宛先の代わりにそのアドレス（伊藤さんのメールアドレスを想定）へ送り、本文に本来の
//   宛先を注記する。本番切替時はこの環境変数を削除するだけでよい（docs/SYSTEM_DESIGN.md
//   9-2章「本番前に解除必須」リストに追加済み）。
// ・RENEWAL_NOTIFY_ENABLED を明示的に 'false' にすると送信自体を完全に止められる（緊急停止用）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRenewalDigestMail, type RenewalDigestItem } from '@/lib/mail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const THRESHOLDS = [45, 30, 20, 14, 7] as const

function remainingDays(employEnd: string | null, dispatchEnd: string | null): number | null {
  const target = employEnd || dispatchEnd
  if (!target) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(target); end.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(req: NextRequest) {
  // Vercel Cronは環境変数名がCRON_SECRETの場合、Authorization: Bearer <値>を自動付与する。
  // 手動実行や外部からの不正実行を防ぐため必須チェックとする。
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (process.env.RENEWAL_NOTIFY_ENABLED === 'false') {
    return NextResponse.json({ skipped: true, reason: 'RENEWAL_NOTIFY_ENABLED=false' })
  }

  const overrideEmail = process.env.RENEWAL_NOTIFY_OVERRIDE_EMAIL || null

  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from('renewal_candidates')
    .select('*')
    .in('status', ['pending', 'csv_pending'])

  if (candidatesError) {
    return NextResponse.json({ error: '更新候補の取得に失敗しました: ' + candidatesError.message }, { status: 500 })
  }

  // しきい値到達判定。newlyCrossedのどれかがあれば今日のダイジェストに含める。
  type Targeted = { candidate: any; item: RenewalDigestItem; newlyCrossed: number[] }
  const targeted: Targeted[] = []

  for (const c of (candidates || [])) {
    const days = remainingDays(c.employ_end_date, c.dispatch_end_date)
    if (days === null) continue
    const notified: number[] = c.notified_thresholds || []

    const newlyCrossed = THRESHOLDS.filter(t => days <= t && !notified.includes(t))
    const alreadyFullyNotified = THRESHOLDS.every(t => notified.includes(t))
    const isOverdueStillUnresolved = days < 0 && alreadyFullyNotified

    if (newlyCrossed.length === 0 && !isOverdueStillUnresolved) continue

    targeted.push({
      candidate: c,
      item: {
        staffName: c.staff_name,
        workLocationName: c.work_location_name,
        remainingDays: days,
        employEndDate: c.employ_end_date,
      },
      newlyCrossed,
    })
  }

  if (targeted.length === 0) {
    return NextResponse.json({ sent: 0, message: '本日対象の更新候補はありませんでした。' })
  }

  // 部門ごとにグルーピング
  const byDept = new Map<number | null, Targeted[]>()
  for (const t of targeted) {
    const key = t.candidate.dept_no ?? null
    if (!byDept.has(key)) byDept.set(key, [])
    byDept.get(key)!.push(t)
  }

  // 部門マスタ・宛先（staff_roles＋auth.usersのメール）をまとめて取得
  const { data: deptRows } = await supabaseAdmin.from('department_master').select('dept_no, dept_name')
  const deptNameByNo = new Map<number, string>((deptRows || []).map((d: any) => [d.dept_no, d.dept_name]))

  const { data: roleRows } = await supabaseAdmin.from('staff_roles').select('id, role, dept_no')
  const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
  const emailById = new Map<string, string>((usersList?.users || []).map(u => [u.id, u.email || '']))

  const ccEmails = Array.from(new Set(
    (roleRows || [])
      .filter((r: any) => r.role === 'SSC' || r.role === '管理部')
      .map((r: any) => emailById.get(r.id))
      .filter((e): e is string => !!e)
  ))

  let sentCount = 0
  const results: any[] = []

  for (const [deptNo, items] of byDept.entries()) {
    const deptName = deptNo !== null ? (deptNameByNo.get(deptNo) || `部門No.${deptNo}`) : '部門未設定'
    const toEmails = deptNo !== null
      ? Array.from(new Set(
          (roleRows || [])
            .filter((r: any) => r.role === '担当営業' && r.dept_no === deptNo)
            .map((r: any) => emailById.get(r.id))
            .filter((e): e is string => !!e)
        ))
      : []

    const realTo = toEmails
    const realCc = ccEmails
    let finalTo = toEmails
    let finalCc = ccEmails
    let overrideNotice: string | undefined

    if (overrideEmail) {
      finalTo = [overrideEmail]
      finalCc = []
      overrideNotice = `※現在テスト運用中のため、本来の宛先ではなくこのアドレスに届いています。\n　本来のTO：${realTo.join(', ') || '(該当する担当営業アカウントなし)'}\n　本来のCC：${realCc.join(', ') || '(なし)'}`
    }

    if (finalTo.length === 0) {
      results.push({ deptNo, deptName, sent: false, reason: '送信先メールアドレスが見つかりませんでした（担当営業アカウント未登録の可能性）' })
      continue
    }

    try {
      await sendRenewalDigestMail(finalTo, finalCc, deptName, items.map(t => t.item), overrideNotice)
      sentCount++
      results.push({ deptNo, deptName, sent: true, count: items.length })

      const now = new Date().toISOString()
      await Promise.all(items.map(t => {
        const notified: number[] = t.candidate.notified_thresholds || []
        const merged = Array.from(new Set([...notified, ...t.newlyCrossed]))
        return supabaseAdmin
          .from('renewal_candidates')
          .update({ notified_thresholds: merged, last_notified_at: now })
          .eq('id', t.candidate.id)
      }))
    } catch (e: any) {
      results.push({ deptNo, deptName, sent: false, reason: 'メール送信エラー: ' + (e?.message || '') })
    }
  }

  return NextResponse.json({ sent: sentCount, totalDepts: byDept.size, results })
}
