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
import { friendlyDbError } from '@/lib/friendlyError'
import { CURATED_DEPT_ORDER, CURATED_DEPT_LABEL_OVERRIDE } from '@/lib/curatedDepartments'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 外部総合品質監査レポートM-16対応（2026-08-14）：メーリングリストのメールアドレス欄が
// 空欄チェックのみで、カンマ区切りで外部ドメインのアドレスを紛れ込ませても（例：
// "a@appart.co.jp, attacker@evil.com"）そのまま保存でき、通知メール送信時に
// `to: メールアドレス`へそのまま渡されるため外部へ複製配送されてしまう問題があった。
// 画面側も「部署ごとに1件のメーリングリストアドレスを登録する」という単一アドレス前提の
// UIのため、複数アドレス対応は行わず、①カンマ・セミコロン・空白を含まない単一の値であること、
// ②@appart.co.jpドメインで終わる形式であること、の2点のみをシンプルに検証する。
const isValidAppartMailingListAddress = (value: string): boolean =>
  /^[^\s,;@]+@appart\.co\.jp$/i.test(value)

// ===== GET：4マスタの一覧＋派遣料金額マスタ用の営業所候補をまとめて返す =====
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  if (auth.role !== '管理部') return NextResponse.json({ error: 'この操作は管理部のみ実行できます。' }, { status: 403 })

  const [{ data: departments, error: deptErr }, { data: minimumWages, error: mwErr }, { data: workingHours, error: whErr }, { data: dispatchFees, error: dfErr }, { data: staffCountRows, error: staffErr }, { data: offices, error: officeErr }, { data: workDescriptionTemplates, error: wdtErr }, { data: mailingLists, error: mlmErr }] = await Promise.all([
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
    //
    // 【2026-07-27修正】従来は staff.select('dept_no') で全件取得しJS側で集計していたが、
    // PostgRESTの既定の最大返却件数（1000件）を超過しており、staffが1795件ある現状では
    // 一部の部門（例：中部営業所205名・関西支社171名）が丸ごと集計から漏れ「未使用の可能性」と
    // 誤表示される不具合があった。DB側でGROUP BY集計するRPC関数（在籍＝退職者除外）に変更し、
    // 件数上限の影響を受けない形にした。
    supabaseAdmin.rpc('get_active_staff_count_by_dept'),
    // 2026-07-22追加：自社拠点マスタ（アルバイト誓約書STEP2「就業先情報」の自社選択時に使用）。
    // 派遣料金額マスタと同じく、営業所候補（officeNames）をあらかじめ全件表示し、
    // 郵便番号・住所・電話番号を入力する表形式で管理する。
    supabaseAdmin.from('office_master').select('id, office_name, postal_code, address, tel, sort_order, updated_at').order('sort_order', { ascending: true }),
    // 2026-07-22追加：アルバイト誓約書STEP3「業務内容」のテンプレート選択機能用マスタ。
    // office_masterと異なり固定候補ではなく自由追加・編集・削除が可能なリスト。
    supabaseAdmin.from('work_description_templates').select('id, template_text, sort_order, updated_at').order('sort_order', { ascending: true }),
    // 2026-07-30追加：メーリングリストマスタ（部門ごと1件・SSC1件・管理部1件）。
    supabaseAdmin.from('mailing_list_master').select('id, scope_type, dept_no, email, updated_at'),
  ])

  if (deptErr || mwErr || whErr || dfErr || staffErr || officeErr || wdtErr || mlmErr) {
    return NextResponse.json({ error: 'マスタデータの取得に失敗しました：' + (deptErr?.message || mwErr?.message || whErr?.message || dfErr?.message || staffErr?.message || officeErr?.message || wdtErr?.message || mlmErr?.message || '') }, { status: 500 })
  }

  const staffCountByDept: Record<number, number> = {}
  for (const row of (staffCountRows as { dept_no: number; staff_count: number }[]) || []) {
    if (row.dept_no === null || row.dept_no === undefined) continue
    staffCountByDept[row.dept_no] = Number(row.staff_count)
  }

  // 派遣料金額マスタの「営業所名」候補：部門マスタの全dept_nameにgetOfficeName()と同じロジックを
  // かけて重複除去したもの。ここに無い名前はPDF側のロジックでも生成され得ないため候補から外す。
  // 2026-07-22伊藤さん指摘④：表示順はoffice_master.sort_orderに準拠した固定順（本社→北海道→…→沖縄）に統一。
  // office_masterにまだ登録されていない候補（新設部門等）は末尾にアイウエオ順で並べるフォールバック。
  const officeNameSet = new Set<string>()
  for (const d of departments || []) officeNameSet.add(getOfficeName(d.dept_name))
  const officeSortOrderByName = new Map((offices || []).map((o: any) => [o.office_name, o.sort_order ?? 999]))
  const officeNames = Array.from(officeNameSet).sort((a, b) => {
    const orderA = officeSortOrderByName.has(a) ? officeSortOrderByName.get(a)! : 999
    const orderB = officeSortOrderByName.has(b) ? officeSortOrderByName.get(b)! : 999
    if (orderA !== orderB) return orderA - orderB
    return a.localeCompare(b, 'ja')
  })

  // 2026-07-30追加：メーリングリストマスタの登録対象部門（担当営業用。アカウント管理と
  // 同じ20部門の絞り込みリストを共通ファイルから参照）。SSC・管理部は部門を問わずロール全体で1件。
  const deptNameByNo = new Map((departments || []).map((d: any) => [d.dept_no, d.dept_name]))
  const mailingListDeptOptions = CURATED_DEPT_ORDER
    .filter(deptNo => deptNameByNo.has(deptNo))
    .map(deptNo => ({ deptNo, deptName: CURATED_DEPT_LABEL_OVERRIDE[deptNo] || (deptNameByNo.get(deptNo) as string) }))

  return NextResponse.json({ departments, minimumWages, workingHours, dispatchFees, officeNames, staffCountByDept, offices, workDescriptionTemplates, mailingLists, mailingListDeptOptions })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '登録') }, { status: 500 })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '登録') }, { status: 500 })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '登録') }, { status: 500 })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
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
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'upsert_office': {
        const officeName = String(payload?.officeName || '').trim()
        const postalCode = String(payload?.postalCode || '').trim()
        const address = String(payload?.address || '').trim()
        const tel = String(payload?.tel || '').trim()
        if (!officeName || !postalCode || !address || !tel) {
          return NextResponse.json({ error: '郵便番号・住所・電話番号をすべて入力してください。' }, { status: 400 })
        }
        // 営業所名は department_master から機械的に導出される候補以外を弾く（dispatch_fee_masterと同じガード）
        const { data: departments } = await supabaseAdmin.from('department_master').select('dept_name')
        const allowed = new Set((departments || []).map(d => getOfficeName(d.dept_name)))
        if (!allowed.has(officeName)) {
          return NextResponse.json({ error: '不正な営業所名です。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('office_master').upsert(
          { office_name: officeName, postal_code: postalCode, address, tel, updated_at: new Date().toISOString() },
          { onConflict: 'office_name' }
        )
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'add_work_description_template': {
        const templateText = String(payload?.templateText || '').trim()
        if (!templateText) {
          return NextResponse.json({ error: 'テンプレート文言を入力してください。' }, { status: 400 })
        }
        const { data: maxRow } = await supabaseAdmin.from('work_description_templates').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
        const nextSortOrder = (maxRow?.sort_order ?? 0) + 1
        const { error } = await supabaseAdmin.from('work_description_templates').insert({ template_text: templateText, sort_order: nextSortOrder })
        if (error) return NextResponse.json({ error: friendlyDbError(error, '登録') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'update_work_description_template': {
        const id = String(payload?.id || '')
        const templateText = String(payload?.templateText || '').trim()
        if (!id || !templateText) {
          return NextResponse.json({ error: 'テンプレート文言を入力してください。' }, { status: 400 })
        }
        const { error } = await supabaseAdmin.from('work_description_templates').update({ template_text: templateText, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'delete_work_description_template': {
        const id = String(payload?.id || '')
        if (!id) return NextResponse.json({ error: '対象を特定できませんでした。' }, { status: 400 })
        const { error } = await supabaseAdmin.from('work_description_templates').delete().eq('id', id)
        if (error) return NextResponse.json({ error: friendlyDbError(error, '削除') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'upsert_mailing_list': {
        // 2026-07-30新設。scopeType='dept'の場合はdeptNo必須、'ssc'・'admin'の場合はロール全体で1件。
        const scopeType = String(payload?.scopeType || '')
        const email = String(payload?.email || '').trim()
        if (!['dept', 'ssc', 'admin'].includes(scopeType)) {
          return NextResponse.json({ error: '不正なスコープです。' }, { status: 400 })
        }
        if (!email) {
          return NextResponse.json({ error: 'メールアドレスを入力してください。' }, { status: 400 })
        }
        if (!isValidAppartMailingListAddress(email)) {
          return NextResponse.json({ error: '@appart.co.jp のメールアドレスを1件のみ入力してください（カンマ区切りでの複数登録はできません）。' }, { status: 400 })
        }
        if (scopeType === 'dept') {
          const deptNo = Number(payload?.deptNo)
          if (!Number.isFinite(deptNo)) {
            return NextResponse.json({ error: '部門を特定できませんでした。' }, { status: 400 })
          }
          // 表示対象（実運用20部門）以外への登録は誤操作防止のため弾く
          if (!CURATED_DEPT_ORDER.includes(deptNo)) {
            return NextResponse.json({ error: '対象外の部門です。' }, { status: 400 })
          }
          const { error } = await supabaseAdmin.from('mailing_list_master').upsert(
            { scope_type: 'dept', dept_no: deptNo, email, updated_at: new Date().toISOString() },
            { onConflict: 'dept_no' }
          )
          if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
          return NextResponse.json({ ok: true })
        }
        // scope_type='ssc'・'admin'はdept_noがNULLの1行のみ。onConflictにdept_noを含む
        // 制約は使えない（部分ユニークインデックスのため）ので、既存行の有無で自前分岐する。
        const { data: existing } = await supabaseAdmin
          .from('mailing_list_master')
          .select('id')
          .eq('scope_type', scopeType)
          .is('dept_no', null)
          .maybeSingle()
        const { error } = existing
          ? await supabaseAdmin.from('mailing_list_master').update({ email, updated_at: new Date().toISOString() }).eq('id', existing.id)
          : await supabaseAdmin.from('mailing_list_master').insert({ scope_type: scopeType, dept_no: null, email })
        if (error) return NextResponse.json({ error: friendlyDbError(error, '更新') }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: '不明な操作です。' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: '処理中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
  }
}
