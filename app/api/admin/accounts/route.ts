// ===== アカウント管理：管理部ダッシュボード「アカウント管理」タブ用API =====
// 2026-07-24新設。ログインアカウント（担当営業／SSC／管理部。Supabase Auth本体を使う）の
// 一覧表示・新規作成（招待メール）・編集（氏名／役割／部門／権限）・凍結／凍結解除を行う。
//
// 【設計メモ】
// ・ログイン用の資格情報はSupabase Auth（auth.users）、実際の権限判定はstaff_roles、
//   画面の入り口チェックはuser_metadataという3か所に分かれている（詳細はdocs/SYSTEM_DESIGN.md参照）。
//   このAPIで書き込みを行う際は、staff_rolesとuser_metadataの両方を必ず同時に更新し、
//   両者がズレる（画面の入り口チェックだけ古い情報のまま、等）事故を防ぐ。
// ・凍結は「削除」ではなくログイン不可化。staff_roles.is_active=falseに加え、
//   Supabase Auth本体のban_durationも設定し、既に発行済みのログイントークンが残っていても
//   即座に全操作を拒否できるようにする（apiAuth.tsのgetAuthenticatedStaff側でも二重チェック）。
// ・自己ロックアウト防止：自分自身の凍結・自分自身のアカウント管理権限の剥奪は禁止。
//   また「アカウント管理」権限を持つ有効なアカウントが1件も無くなる操作も禁止する。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedStaff } from '@/lib/apiAuth'
import { sendAccountSetupMail } from '@/lib/mail'
import {
  generateAccountSetupCode,
  computeAccountSetupCodeExpiry,
  ACCOUNT_SETUP_REISSUE_COOLDOWN_MINUTES,
} from '@/lib/accountSetupCode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_ROLES = ['担当営業', 'SSC', '管理部'] as const
type Role = typeof VALID_ROLES[number]

// フリーズ用のban_duration。Supabase側の仕様上「未来永劫」は指定できないため、
// 実運用上十分に長い期間（約100年）を「凍結中」として扱う。
const FREEZE_BAN_DURATION = '876000h'

async function requireAccountAdmin(req: NextRequest) {
  const auth = await getAuthenticatedStaff(req)
  if (!auth) return { error: NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 }) }
  if (!auth.isAccountAdmin) return { error: NextResponse.json({ error: 'この操作には「アカウント管理」権限が必要です。' }, { status: 403 }) }
  return { auth }
}

// ===== GET：アカウント一覧 =====
export async function GET(req: NextRequest) {
  const check = await requireAccountAdmin(req)
  if (check.error) return check.error

  const [{ data: roleRows, error: roleErr }, { data: departments }, listResult] = await Promise.all([
    supabaseAdmin.from('staff_roles').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('department_master').select('dept_no, dept_name'),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (roleErr) return NextResponse.json({ error: 'アカウント一覧の取得に失敗しました：' + roleErr.message }, { status: 500 })
  if (listResult.error) return NextResponse.json({ error: 'アカウント一覧の取得に失敗しました：' + listResult.error.message }, { status: 500 })

  const deptNameByNo = new Map((departments || []).map(d => [d.dept_no, d.dept_name]))
  const userById = new Map(listResult.data.users.map(u => [u.id, u]))

  const accounts = (roleRows || []).map(r => {
    const authUser = userById.get(r.id)
    const deptLabel = r.role === '担当営業'
      ? (r.dept_no !== null ? deptNameByNo.get(r.dept_no) || `部門番号${r.dept_no}` : '未設定')
      : r.role
    return {
      id: r.id,
      name: r.name,
      email: authUser?.email || '(不明)',
      role: r.role,
      deptNo: r.dept_no,
      deptLabel,
      isInternalApprover: r.is_internal_approver,
      isAccountAdmin: r.is_account_admin,
      isActive: r.is_active,
      frozenAt: r.frozen_at,
      needsPasswordSetup: r.needs_password_setup,
      createdAt: r.created_at,
    }
  })

  const departmentOptions = (departments || []).map(d => ({ deptNo: d.dept_no, deptName: d.dept_name }))
  return NextResponse.json({ accounts, departmentOptions })
}

// ===== POST：新規作成・編集・凍結・凍結解除・認証コード再送（actionで分岐） =====
export async function POST(req: NextRequest) {
  const check = await requireAccountAdmin(req)
  if (check.error) return check.error
  const auth = check.auth!

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト内容を読み取れませんでした。' }, { status: 400 })
  }
  const { action, payload } = body || {}

  try {
    switch (action) {
      case 'create': {
        const name = String(payload?.name || '').trim()
        const email = String(payload?.email || '').trim()
        const role = String(payload?.role || '') as Role
        const deptNo = payload?.deptNo !== undefined && payload?.deptNo !== null && payload?.deptNo !== '' ? Number(payload.deptNo) : null
        const isInternalApprover = role === '管理部' ? !!payload?.isInternalApprover : false
        const isAccountAdmin = role === '管理部' ? !!payload?.isAccountAdmin : false

        if (!name || !email || !VALID_ROLES.includes(role)) {
          return NextResponse.json({ error: '氏名・メールアドレス・役割を正しく入力してください。' }, { status: 400 })
        }
        if (role === '担当営業' && (deptNo === null || !Number.isFinite(deptNo))) {
          return NextResponse.json({ error: '担当営業には部門を選択してください。' }, { status: 400 })
        }

        // 仮パスワードはユーザーには一切知らせず、メールの認証コードでパスワード設定を必須にする。
        const tempPassword = generateAccountSetupCode() + generateAccountSetupCode() + 'Aa!'
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role, is_internal_approver: isInternalApprover, is_account_admin: isAccountAdmin },
        })
        if (createErr || !created?.user) {
          return NextResponse.json({ error: 'アカウントの作成に失敗しました：' + (createErr?.message || '') }, { status: 500 })
        }

        const code = generateAccountSetupCode()
        const { error: roleInsertErr } = await supabaseAdmin.from('staff_roles').insert({
          id: created.user.id,
          name,
          role,
          dept_no: role === '担当営業' ? deptNo : null,
          is_internal_approver: isInternalApprover,
          is_account_admin: isAccountAdmin,
          is_active: true,
          needs_password_setup: true,
          created_by: auth.userId,
          setup_code: code,
          setup_code_expires_at: computeAccountSetupCodeExpiry(),
          setup_code_issued_at: new Date().toISOString(),
          setup_code_attempts: 0,
        })
        if (roleInsertErr) {
          // ロール登録に失敗した場合、宙に浮いたAuthアカウントを残さないよう削除しておく
          await supabaseAdmin.auth.admin.deleteUser(created.user.id)
          return NextResponse.json({ error: 'アカウント情報の登録に失敗しました：' + roleInsertErr.message }, { status: 500 })
        }

        await sendAccountSetupMail(email, name, role, code, 'initial')
        return NextResponse.json({ ok: true })
      }

      case 'update': {
        const id = String(payload?.id || '')
        const name = String(payload?.name || '').trim()
        const role = String(payload?.role || '') as Role
        const deptNo = payload?.deptNo !== undefined && payload?.deptNo !== null && payload?.deptNo !== '' ? Number(payload.deptNo) : null
        const isInternalApprover = role === '管理部' ? !!payload?.isInternalApprover : false
        const isAccountAdmin = role === '管理部' ? !!payload?.isAccountAdmin : false

        if (!id || !name || !VALID_ROLES.includes(role)) {
          return NextResponse.json({ error: '氏名・役割を正しく入力してください。' }, { status: 400 })
        }
        if (role === '担当営業' && (deptNo === null || !Number.isFinite(deptNo))) {
          return NextResponse.json({ error: '担当営業には部門を選択してください。' }, { status: 400 })
        }

        const { data: target } = await supabaseAdmin.from('staff_roles').select('*').eq('id', id).maybeSingle()
        if (!target) return NextResponse.json({ error: '対象のアカウントが見つかりませんでした。' }, { status: 404 })

        // 自己ロックアウト防止①：自分自身のアカウント管理権限を自分では外せない
        if (id === auth.userId && target.is_account_admin && !isAccountAdmin) {
          return NextResponse.json({ error: '自分自身の「アカウント管理」権限は外せません。他のアカウント管理者に依頼してください。' }, { status: 400 })
        }
        // 自己ロックアウト防止②：アカウント管理権限を持つ有効なアカウントが0件にならないようにする
        if (target.is_account_admin && !isAccountAdmin) {
          const { count } = await supabaseAdmin
            .from('staff_roles')
            .select('id', { count: 'exact', head: true })
            .eq('is_account_admin', true)
            .eq('is_active', true)
            .neq('id', id)
          if (!count || count === 0) {
            return NextResponse.json({ error: '「アカウント管理」権限を持つアカウントが1件も無くなるため、この変更はできません。' }, { status: 400 })
          }
        }

        const { error: updateErr } = await supabaseAdmin.from('staff_roles').update({
          name,
          role,
          dept_no: role === '担当営業' ? deptNo : null,
          is_internal_approver: isInternalApprover,
          is_account_admin: isAccountAdmin,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (updateErr) return NextResponse.json({ error: '更新に失敗しました：' + updateErr.message }, { status: 500 })

        // 画面の入り口チェック用（user_metadata）も必ず同時に更新し、DB側の権限とのズレを防ぐ
        await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: { role, is_internal_approver: isInternalApprover, is_account_admin: isAccountAdmin },
        })

        return NextResponse.json({ ok: true })
      }

      case 'freeze': {
        const id = String(payload?.id || '')
        if (!id) return NextResponse.json({ error: '対象を特定できませんでした。' }, { status: 400 })
        if (id === auth.userId) return NextResponse.json({ error: '自分自身のアカウントは凍結できません。他のアカウント管理者に依頼してください。' }, { status: 400 })

        const { data: target } = await supabaseAdmin.from('staff_roles').select('*').eq('id', id).maybeSingle()
        if (!target) return NextResponse.json({ error: '対象のアカウントが見つかりませんでした。' }, { status: 404 })

        if (target.is_account_admin) {
          const { count } = await supabaseAdmin
            .from('staff_roles')
            .select('id', { count: 'exact', head: true })
            .eq('is_account_admin', true)
            .eq('is_active', true)
            .neq('id', id)
          if (!count || count === 0) {
            return NextResponse.json({ error: '「アカウント管理」権限を持つアカウントが1件も無くなるため、凍結できません。' }, { status: 400 })
          }
        }

        const { error } = await supabaseAdmin.from('staff_roles').update({
          is_active: false,
          frozen_at: new Date().toISOString(),
          frozen_by: auth.userId,
        }).eq('id', id)
        if (error) return NextResponse.json({ error: '凍結の保存に失敗しました：' + error.message }, { status: 500 })

        await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: FREEZE_BAN_DURATION })
        return NextResponse.json({ ok: true })
      }

      case 'unfreeze': {
        const id = String(payload?.id || '')
        if (!id) return NextResponse.json({ error: '対象を特定できませんでした。' }, { status: 400 })

        const { error } = await supabaseAdmin.from('staff_roles').update({
          is_active: true,
          frozen_at: null,
          frozen_by: null,
        }).eq('id', id)
        if (error) return NextResponse.json({ error: '凍結解除の保存に失敗しました：' + error.message }, { status: 500 })

        await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' })
        return NextResponse.json({ ok: true })
      }

      case 'resend_code': {
        const id = String(payload?.id || '')
        if (!id) return NextResponse.json({ error: '対象を特定できませんでした。' }, { status: 400 })

        const { data: target } = await supabaseAdmin.from('staff_roles').select('*').eq('id', id).maybeSingle()
        if (!target) return NextResponse.json({ error: '対象のアカウントが見つかりませんでした。' }, { status: 404 })

        if (target.setup_code_issued_at) {
          const issuedAt = new Date(target.setup_code_issued_at).getTime()
          const cooldownMs = ACCOUNT_SETUP_REISSUE_COOLDOWN_MINUTES * 60 * 1000
          if (Date.now() - issuedAt < cooldownMs) {
            return NextResponse.json({ error: `再発行は前回の発行から${ACCOUNT_SETUP_REISSUE_COOLDOWN_MINUTES}分以上あけて行ってください。` }, { status: 429 })
          }
        }

        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id)
        const email = authUser?.user?.email
        if (!email) return NextResponse.json({ error: '対象アカウントのメールアドレスが取得できませんでした。' }, { status: 500 })

        const code = generateAccountSetupCode()
        const { error } = await supabaseAdmin.from('staff_roles').update({
          needs_password_setup: true,
          setup_code: code,
          setup_code_expires_at: computeAccountSetupCodeExpiry(),
          setup_code_issued_at: new Date().toISOString(),
          setup_code_attempts: 0,
        }).eq('id', id)
        if (error) return NextResponse.json({ error: '認証コードの発行に失敗しました：' + error.message }, { status: 500 })

        await sendAccountSetupMail(email, target.name, target.role, code, target.needs_password_setup ? 'initial' : 'reset')
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: '不明な操作です。' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: '処理中にエラーが発生しました：' + (e?.message || '') }, { status: 500 })
  }
}
