/**
 * 【診断用・読み取り専用】アルバイト誓約書STEP2の自社拠点プルダウンが
 * 指定した部門番号に対して実際にどの拠点を表示するかを確認するスクリプト。
 *
 * 2026-07-30実装の「STEP2拠点プルダウンの部門絞り込み」（app/pledge/apply/page.tsx）
 * が使っているロジック（getDeptSearchScope → department_master.office_id →
 * office_master）を、本番データに対してそのまま再現して結果を表示する。
 * DBを更新する処理は一切なく、SELECTのみ。
 *
 * 【実行方法】（VSCodeのターミナルから）
 * node scripts/check-office-scope.js <部門番号>
 *
 * 例：広域本部（部門番号7）が実際にどの拠点を表示するか確認する場合
 * node scripts/check-office-scope.js 7
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// app/apply/_lib/helpers.ts の DEPT_GROUP_SCOPE をそのまま複製（診断専用・本番コードとは別物）
const DEPT_GROUP_SCOPE = {
  3: [3, 6, 46],
  7: [7, 9, 10, 12, 13, 14, 15, 48],
  8: [8, 9, 10],
  11: [11, 12, 13, 14, 15, 48],
}

const getDeptSearchScope = (deptNo) => {
  if (deptNo === null || deptNo === undefined) return []
  return DEPT_GROUP_SCOPE[deptNo] || [deptNo]
}

async function main() {
  const deptNoArg = process.argv[2]
  if (!deptNoArg) {
    console.error('使い方: node scripts/check-office-scope.js <部門番号>')
    process.exit(1)
  }
  const deptNo = Number(deptNoArg)

  const scopeDeptNos = getDeptSearchScope(deptNo)
  console.log('対象の部門番号:', deptNo)
  console.log('展開後のスコープ（getDeptSearchScope）:', scopeDeptNos)

  const { data: depts, error: deptError } = await supabaseAdmin
    .from('department_master')
    .select('dept_no, dept_name, office_id')
    .in('dept_no', scopeDeptNos)

  if (deptError) {
    console.error('department_masterの取得に失敗しました:', deptError.message)
    process.exit(1)
  }

  console.log('\n--- スコープ内の部門とoffice_id ---')
  depts.forEach((d) => {
    console.log(`  部門番号${d.dept_no}（${d.dept_name}）: office_id = ${d.office_id ?? '(null)'}`)
  })

  const officeIds = [...new Set(depts.map((d) => d.office_id).filter(Boolean))]

  if (officeIds.length === 0) {
    console.log('\n該当する拠点が1件もありません（この場合、画面側は保険として全拠点を表示します）。')
    return
  }

  const { data: offices, error: officeError } = await supabaseAdmin
    .from('office_master')
    .select('office_name, sort_order')
    .in('id', officeIds)
    .order('sort_order', { ascending: true })

  if (officeError) {
    console.error('office_masterの取得に失敗しました:', officeError.message)
    process.exit(1)
  }

  console.log('\n--- STEP2の拠点プルダウンに実際に表示される拠点（' + offices.length + '件） ---')
  offices.forEach((o) => console.log('  ・' + o.office_name))
}

main()
