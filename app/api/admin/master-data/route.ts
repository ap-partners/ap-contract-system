// ===== マスタ管理：管理部ダッシュボード「マスタ管理」タブ用API =====
// 2026-07-17新設。CLAUDE.md残タスク5番（部門マスタ・最低賃金/所定労働時間マスタ・
// 労働者派遣料金額マスタの管理画面）に対応。
//
// 【確定仕様（2026-07-17・伊藤さんとの相談で確定）】
// ① 部門マスタ：新規追加のみ画面から可能。既存行の部門名変更・削除は事故リスクが高いため
//   画面からは不可（従来通りSupabase管理画面での直接対応）。
// ② 最低賃金マスタ・所定労働時間マスタ：新規追加に加え、直近レコード（最新の適用開始日／
//   最新更新）の修正も可能。過去の履歴レコードは編集不可（履歴の正確性を守るため）。
// ③ 労働者派遣料金額マスタ：伊藤さんのご要望により「あらかじめ必要な営業所を全件表示し、
//   金額を入力する」表形式（office_nameはUNIQUE制約があるためupsert）。営業所名は自由入力を
//   許可せず、department_master.dept_nameから機械的に導出される候補（getOfficeName()と同じ
//   ロジック）に固定する。
// ④ 4テーブルとも書き込みは管理部ロールのみ（RLSに加えてAPI側でも二重チェック）。
//   dispatch_fee_masterはそもそもRLSポリシーが無い（supabaseAdmin経由のサーバーアクセス
//   専用という既存設計。10章2026-07-14参照）ため、このAPI経由でのみ読み書きする。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { getOfficeName } from '@/lib/pdf/documentText'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ===== GET：4マスタの一覧＋派遣料金額マスタ用の営業所候補をまとめて返す =====
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const [{ data: departments, error: deptErr }, { data: minimumWages, error: mwErr }, { data: workingHours, error: whErr }, { data: dispatchFees, error: dfErr }, { data: staffDeptRows, error: staffErr }] = await Promise.all([
    supabaseAdmin.from('department_master').select('id, dept_no, dept_name, created_at').order('dept_no', { ascending: true }),
    supabaseAdmin.from('minimum_wage_master').select('id, dept_no, hourly_wage, effective_from, created_at, updated_at').order('dept_no', { ascending: true }).order('effective_from', { ascending: false }),
    supabaseAdmin.from('standard_working_hours_master').select('id, work_place, contract_type, pattern_name, monthly_hours, created_at, updated_at').order('work_place', { ascending: true }).order('contract_type', { ascending: true }),
    supabaseAdmin.from('dispatch_fee_master').select('id, office_name, fiscal_year_label, amount_per_day, updated_at'),
    // 2026-07-17追加：部門ごとの在籍スタッフ数（「実際に使われている部門か」の目安として
    // マスタ管理画面に表示する。伊藤さんより「51部門のうち実際に使わないものもある」との
    // ご指摘を受け、過去のトーク履歴・実データを調査した結果、部門マスタはHRシステム側の
    // 部門コード一覧をそのまま機械的に取り込んだもので、上位の「まとめ部署」（例：SP営業部）は
    // スタッフが直接所属せず、実際は下位の「SP1課」等にスタッフが紐付く構造と判明。
    // staff_countが0の部門＝実質未使用の可能性が高い部門、として画面上で可視化する。
    supabaseAdmin.from('staff').select('dept_no'),
  ])

  if (deptErr || mwErr || whErr || dfErr || staffErr) {
    return NextResponse.json({ error: 'マスタデータの取得に失敗しました：' + (deptErr?.message || mwErr?.message || whErr?.message || dfErr?.message || staffErr?.message || '') }, { status: 500 })
  }

  const staffCountByDept: Record<number, number> = {}
  for (const row of staffDeptRows || []) {
    if (row.dept_no === null || row.dept_no === undefined) continue
    staffCountByDept[row.dept_no] = (staffCountByDept[row.dept_no] || 0) + 1
  }

  // 派遣料金額マスタの「営業所名」候補：部門マスタの全dept_nameにgetOfficeName()と同じロジックを
  // かけて重複除去したもの。ここに無い名前はPDF側のロジックでも生成され得ないため候補から外す。
  const officeNameSet = new Set<string>()
  for (const d of departments || []) officeNameSet.add(getOfficeName(d.dept_name))
  const officeNames = Array.from(officeNameSet).sort((a, b) => (a === '本社' ? -1 : b === '本社' ? 1 : a.localeCompare(b, 'ja')))

  return NextResponse.json({ departments, minimumWages, workingHours, dispatchFees, officeNames, staffCountByDept })
}

// ===== POST：新規追加・修正（actionで分岐） =====
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const { action, payload } = body || {}

  try {
    switch (action) {
      case 'add_department': {
        const deptNo = Number(payload?.deptNo)
        const deptName = String(payload?.deptName || '').trim()
        if (!Number.isFinite(deptNo) || deptNo < 0 || !deptName) {
          return NextResponse.json({ error: '部門番号（0以上の数値）と部門名を入力してください。' }, { status: 400 })
        }
        const { data: existing } = await supabaseAdmin.from('department_master').select('id').eq('dept_no', deptNo).maybeSingle()
        if (existing) return NextResponse.json({ error: `部門番号${deptNo}は既に使用されています。` }, { status: 400 })
        const { error } = await supabaseAdmin.from('department_master').insert({ dept_no: deptNo, dept_name: deptName })
        if (error) return NextResponse.json({ error: '登録に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'add_minimum_wage': {
        const deptNo = Number(payload?.deptNo)
        const hourlyWage = Number(payload?.hourlyWage)
        const effectiveFrom = String(payload?.effectiveFrom || '')
        if (!Number.isFinite(deptNo) || !Number.isFinite(hourlyWage) || hourlyWage <= 0 || !effectiveFrom) {
          return NextResponse.json({ error: '部門・時給額・適用開始日を正しく入力してください。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('minimum_wage_master').insert({ dept_no: deptNo, hourly_wage: hourlyWage, effective_from: effectiveFrom })
        if (error) return NextResponse.json({ error: '登録に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'update_minimum_wage': {
        const id = String(payload?.id || '')
        const hourlyWage = Number(payload?.hourlyWage)
        const effectiveFrom = String(payload?.effectiveFrom || '')
        if (!id || !Number.isFinite(hourlyWage) || hourlyWage <= 0 || !effectiveFrom) {
          return NextResponse.json({ error: '時給額・適用開始日を正しく入力してください。' }, { status: 400 })
        }
        // 対象行がその部門の「最新」レコードであることをサーバー側でも確認し、
        // 過去の履歴レコードを誤って編集できないようにする（意図的な二重ガード）。
        const { data: target } = await supabaseAdmin.from('minimum_wage_master').select('id, dept_no').eq('id', id).maybeSingle()
        if (!target) return NextResponse.json({ error: '対象のレコードが見つかりませんでした。' }, { status: 404 })
        const { data: latest } = await supabaseAdmin
          .from('minimum_wage_master')
          .select('id')
          .eq('dept_no', target.dept_no)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!latest || latest.id !== id) {
          return NextResponse.json({ error: '過去の履歴レコードは編集できません。最新のレコードのみ修正可能です。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('minimum_wage_master').update({ hourly_wage: hourlyWage, effective_from: effectiveFrom }).eq('id', id)
        if (error) return NextResponse.json({ error: '更新に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'add_working_hours': {
        const workPlace = String(payload?.workPlace || '')
        const contractType = String(payload?.contractType || '')
        const patternName = String(payload?.patternName || '').trim()
        const monthlyHours = Number(payload?.monthlyHours)
        if (!['現場', '社内'].includes(workPlace) || !['有期契約', '無期契約', '正社員', 'アルバイト'].includes(contractType) || !patternName || !Number.isFinite(monthlyHours) || monthlyHours <= 0) {
          return NextResponse.json({ error: '就業場所・雇用区分・パターン名・所定労働時間（月間）を正しく入力してください。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('standard_working_hours_master').insert({ work_place: workPlace, contract_type: contractType, pattern_name: patternName, monthly_hours: monthlyHours })
        if (error) return NextResponse.json({ error: '登録に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'update_working_hours': {
        const id = String(payload?.id || '')
        const patternName = String(payload?.patternName || '').trim()
        const monthlyHours = Number(payload?.monthlyHours)
        if (!id || !patternName || !Number.isFinite(monthlyHours) || monthlyHours <= 0) {
          return NextResponse.json({ error: 'パターン名・所定労働時間（月間）を正しく入力してください。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('standard_working_hours_master').update({ pattern_name: patternName, monthly_hours: monthlyHours }).eq('id', id)
        if (error) return NextResponse.json({ error: '更新に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'upsert_dispatch_fee': {
        const officeName = String(payload?.officeName || '').trim()
        const fiscalYearLabel = String(payload?.fiscalYearLabel || '').trim()
        const amountPerDay = Number(payload?.amountPerDay)
        if (!officeName || !fiscalYearLabel || !Number.isFinite(amountPerDay) || amountPerDay <= 0) {
          return NextResponse.json({ error: '年度・金額を正しく入力してください。' }, { status: 400 })
        }
        // 営業所名は department_master から機械的に導出される候補以外を弾く（帳票表示漏れ防止）。
        const { data: departments } = await supabaseAdmin.from('department_master').select('dept_name')
        const allowed = new Set((departments || []).map(d => getOfficeName(d.dept_name)))
        if (!allowed.has(officeName)) {
          return NextResponse.json({ error: '不正な営業所名です。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('dispatch_fee_master').upsert(
          { office_name: officeName, fiscal_year_label: fiscalYearLabel, amount_per_day: amountPerDay, updated_at: new Date().toISOString() },
          { onConflict: 'office_name' }
        )
        if (error) return NextResponse.json({ error: '更新に失敗しました：' + error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: '不明な操作です。' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: '処理中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
  }
}
