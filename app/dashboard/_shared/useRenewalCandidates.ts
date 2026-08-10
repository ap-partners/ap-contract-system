// ===== 更新期限管理タブの共通データ取得・操作ロジック =====
// 管理部・担当営業ダッシュボードで共有する（docs/SYSTEM_DESIGN.md 10章 2026-07-14
// 「更新期限管理タブの仕様を確定」参照）。
//
// スコープ：
// ①現場契約（work_place='現場'）・社内契約（work_place='社内'。2026-07-31追加。RLSで管理部
//   〔is_internal_approver〕のみ閲覧可）のうち雇用期間終了日が45日以内（超過含む）の最新契約を
//   検知し、renewal_candidatesへ登録する。②CSV対象は新しい派遣期間を自動検索して差異表示、
//   CSV非対象（または「派遣先変更」で手入力に切替た場合）は派遣期間を手入力→雇用期間へコピー。
// ③CSVインポート依頼（requestsテーブル）。
// 2026-07-31追加：一覧の見せ方を5タブ（renewal_tab。unassigned/csv_auto/period_only/edit/
// import_wait）に再設計。triage_mode（undecided/bulk/individual）は廃止せず、タブ内での
// 実行単位フラグ（一括対象へのチェック・個別申請の進行中表示）としての役割に narrowing した。
// 2026-07-16（意思決定ログ「更新期限管理タブの改修方針を確定」チャットA）：スタッフ意向・
// クライアント意向のトグルと、それに連動する「送付準備完了」への一括更新は廃止した。理由は
// 営業担当が手動で都度更新する自己申告データであり、実際の更新申請という確実な行動が発生する
// 新フロー（チャットC・D）では価値が薄いため。ステータスは pending（未対応）→
// not_renewing（更新しない・確定）の2つに単純化（チャットC・Dで「申請済み」を追加予定）。
// 対象外（次回以降）：チャットB（差異確認拡張・原契約confirmation画面・安全チェック）、
// チャットC（一括申請の実装）、チャットD（`/apply`プリフィル・個別申請の実装）。
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase, getAuthHeader } from '@/lib/supabase'
import { extractCsvFields } from '@/app/apply/_lib/helpers'
import { buildMergedFields } from './renewalFieldMap'
import { runAutoChecks, MinimumWageRow } from '@/lib/autoChecks'
import { excludeRetiredStaffOr } from '@/lib/staffFilters'
import { useToast } from '@/app/_shared/ui/ToastProvider'

// 2026-07-31追加（更新期限管理タブの情報設計見直し・5タブ化）：
// unassigned=仕分け待ち、csv_auto=CSV自動反映、period_only=期間のみ更新、
// edit=修正更新、import_wait=CSVインポート待ち。csv_auto・import_waitの遷移は
// 原則システムが自動判定し（searchCsvRenewal成功時／requestCsvImport実行時）、
// それ以外はユーザーの振り分け操作（setRenewalTab）で確定する。
// docs/SYSTEM_DESIGN.md 10章 2026-07-31「更新期限管理タブの情報設計見直し」参照。
export type RenewalTab = 'unassigned' | 'csv_auto' | 'period_only' | 'edit' | 'import_wait'

export const RENEWAL_ALERT_WINDOW_DAYS = 45

// 2026-07-16追加（チャットB・④差異確認の表示範囲拡大）：指揮命令者・派遣先責任者・
// 苦情処理申出先の3グループ×(部署/役職/氏名/TEL)＝12項目。前回契約の値（previous）と
// 新しいCSVで見つかった値（new）を保持し、RenewalManagementTab側で変更有無を比較・表示する。
export type ContactFieldGroup = {
  dept: string | null
  role: string | null
  name: string | null
  tel: string | null
}
export type ContactFields = {
  cmd: ContactFieldGroup
  resp: ContactFieldGroup
  comp: ContactFieldGroup
}

export type RenewalCandidate = {
  id: string
  source_contract_id: string
  employee_number: string
  staff_name: string | null
  dept_no: number | null
  work_location_name: string | null
  // 2026-07-31追加：一覧カードに就業場所住所を表示するため。work_location_nameと同じタイミング
  // （syncCandidates実行時）でスナップショットする。既存行は導入時に一度だけバックフィル済み。
  work_location_address: string | null
  employ_start_date: string | null
  employ_end_date: string | null
  // 2026-08-03追加：正社員・無期契約は雇用期間(employ_start_date/employ_end_date)を持たず、
  // 契約条件適用開始日のみを持つ（app/apply/_components/StepPeriod.tsxがこの2パターンを
  // 出し分けて集めているため）。契約一覧（contractDisplay.tsxのgetEmployPeriodLabel）は
  // 既にこの値を使って「期間の定めなし」表示をしているが、更新期限管理タブ側はこれまで
  // この項目自体を持っておらず「雇用期間（現在）」が－表示になっていた（伊藤さん指摘・2026-08-03）。
  contract_start_date: string | null
  dispatch_start_date: string | null
  dispatch_end_date: string | null
  data_source: 'csv' | 'manual'
  csv_system: string | null
  // 2026-07-31追加：元契約のwork_place（現場／社内）。社内は管理部（is_internal_approver）
  // のみRLSで閲覧可（SSC・担当営業は常に不可）。
  work_place: '現場' | '社内'
  // 2026-07-31追加：更新期限管理タブの5分類。
  renewal_tab: RenewalTab
  // 2026-07-16追加：前回契約の書類種別（就業条件明示書／雇用契約書 兼 就業条件明示書 等）。
  // 一覧カードに表示する。書類種別そのものを変える更新はチャットD（新規申請ルート）でのみ対応。
  document_type: string | null
  // 2026-07-16追加（チャットB）：指揮命令者・派遣先責任者・苦情処理申出先の前回値／新値
  previous_contact_fields: ContactFields | null
  new_contact_fields: ContactFields | null
  no_renewal_reason: string | null
  manual_override: boolean
  manual_override_reason: string | null
  new_employ_start: string | null
  new_employ_end: string | null
  // 2026-08-04追加（①正社員の雇用期間バグ修正）：正社員・無期契約（雇用の側面が
  // 「期間の定めなし」の対象者）向け。兼用契約でこの対象者の場合、雇用期間の日付レンジ
  // ではなくこの単一の契約条件適用開始日を編集対象とする（RenewalManagementTab.tsx
  // のrenderPeriodOnlyRow参照）。未編集の間はUI側でcontract_start_date（前回値）を
  // 初期表示し、そのまま実行可能（変更したい場合のみ編集する）。
  new_contract_start_date: string | null
  new_dispatch_start: string | null
  new_dispatch_end: string | null
  new_work_location_name: string | null
  new_work_address: string | null
  new_csv_raw_data_id: string | null
  // 2026-07-17追加：'applied'は一括申請の実行によりcontracts行の作成が完了した状態
  // （このステータスになった行は一覧のKPI・件数集計から除外し、次回syncCandidates()の
  // 「旧契約分の削除」ロジックで自動的にクリーンアップされる想定）。
  status: 'pending' | 'csv_pending' | 'not_renewing' | 'applied'
  // 2026-07-17追加（チャットC・⑤一括申請）：一覧左側の仕分けフラグ。実行に副作用を持たない
  // 純粋なブックキーピング項目（伊藤さん確定・2026-07-17）。「一括申請」に切り替えられるのは
  // 新しい期間データ（雇用・派遣とも）が確定している行のみ（画面側でperiodReady()により制御）。
  triage_mode: 'undecided' | 'bulk' | 'individual'
  created_at: string
  updated_at: string
  // 2026-07-16追加：staffマスタの「今の」所属部署名・雇用形態（申請時点のスナップショットではない。
  // 伊藤さん確定）。DBには保存せず、fetchCandidates()で都度joinして付与するクライアント側のみの項目。
  current_dept_name?: string | null
  current_contract_type?: string | null
}

// 残日数（マイナス＝超過）。基準日は雇用期間終了日を優先し、無ければ派遣期間終了日。
export function remainingDays(c: Pick<RenewalCandidate, 'employ_end_date' | 'dispatch_end_date'>): number | null {
  const target = c.employ_end_date || c.dispatch_end_date
  if (!target) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(target); end.setHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// 2026-08-03追加：書類種別（document_type）を正として「雇用期間／派遣期間のどちらが
// 必要か」を判定する共通関数。RenewalManagementTab.tsxのrenderSecondaryGridが2026-07-31から
// 使っている`docType.includes('雇用契約書')`/`includes('就業条件明示書')`と同じ基準を、
// periodReady()・renderPeriodOnlyRowの入力欄出し分けでも共用する（判定基準が3箇所でズレる
// ことを防ぐ）。document_typeが空（欠落データ等）の場合はresolved=falseを返し、呼び出し側で
// 旧来の「フィールドの有無」による判定にフォールバックできるようにする。
export function getDocumentPeriodFlags(documentType: string | null): { needsEmploy: boolean; needsDispatch: boolean; resolved: boolean } {
  const docType = (documentType || '').replace(/\n/g, ' ').trim()
  if (!docType) return { needsEmploy: false, needsDispatch: false, resolved: false }
  return { needsEmploy: docType.includes('雇用契約書'), needsDispatch: docType.includes('就業条件明示書'), resolved: true }
}

// 2026-08-04追加（①正社員の雇用期間バグ修正）：正社員・無期契約は雇用期間が
// 「期間の定めなし」（契約条件適用開始日のみ）であり、有期契約・アルバイトのような
// 開始日〜終了日の日付レンジという概念を持たない（app/apply/_components/StepPeriod.tsx
// の`period === '無期' || contractType === '正社員'`判定と同じ基準）。
export function isIndefiniteEmployType(contractType: string | null | undefined): boolean {
  return contractType === '正社員' || contractType === '無期契約'
}

// 2026-08-03追加（伊藤さんレビュー：日付は「年月日」表記でないと分かりづらい、との指摘対応）。
// lib/mail.tsの同名ヘルパーとロジックは同じだが、クライアント側コンポーネントのため個別に定義。
// RenewalManagementTab.tsx・RenewalContractConfirmModal.tsxの両方から使う共通ヘルパーのため
// ここに集約する（2026-08-03：従来RenewalManagementTab.tsx内にのみ定義されておりモーダル側は
// 別の生ハイフン表記`formatPeriod()`を使っていたため表記が揃っていなかった不具合を修正）。
export function formatDateJp(dateStr: string | null): string {
  if (!dateStr) return '―'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  return m ? `${m[1]}年${m[2]}月${m[3]}日` : dateStr
}
export function formatPeriodJp(start: string | null, end: string | null): string {
  if (!start && !end) return '―'
  return `${formatDateJp(start)} 〜 ${formatDateJp(end)}`
}

// 2026-08-03追加：正社員・無期契約は雇用期間（employ_start_date/employ_end_date）を持たず、
// 契約条件適用開始日（contract_start_date）のみを持つ。「〜期間の定めなし」という言い回しは
// 伊藤さんレビューにより「契約条件適用開始日　○○年○○月○○日 〜」に変更（2026-08-03再訂正。
// 当初「期間の定めなし」という契約一覧の既存表現を流用していたが、更新期限管理タブでは
// 「契約条件適用開始日」であることを明示した方が分かりやすいとの指摘を受けて再修正）。
export function formatEmployPeriodDisplay(c: Pick<RenewalCandidate, 'employ_start_date' | 'employ_end_date' | 'contract_start_date'>): string {
  if (c.employ_start_date && c.employ_end_date) return formatPeriodJp(c.employ_start_date, c.employ_end_date)
  if (c.contract_start_date) return `契約条件適用開始日　${formatDateJp(c.contract_start_date)} 〜`
  return '―'
}

// 2026-07-31追加（デプロイ後の実機確認で発覚した不具合の修正）：「一括申請／一括更新に含める」
// チェックボックスが有効になる条件。当初は`c.status !== 'pending'`で判定していたが、CSV検索で
// 一度でも「見つからない」（status='csv_pending'）を経験した候補は、その後「期間のみ更新」タブへ
// 手動振り分けし新しい期間を入力しても、statusがcsv_pendingのまま残るためチェックボックスが
// 永久にdisabledになってしまう不具合があった（statusは元々「CSV検索の結果」を表す項目であり、
// 「この案件がまだ有効か（更新しない・申請済みではないか）」とは別の意味を持っていたことが原因）。
// 「更新しない」「申請済み」以外なら期間確定状況のみで判定するよう修正し、
// RenewalManagementTab.tsx（UIのチェックボックス制御）とexecuteBulkApply（実行時の再チェック）の
// 両方でこの1関数を共用することで判定基準のズレを防ぐ。
// 2026-08-03修正（実機確認で発覚：関谷綺菜様・104747＝雇用契約書のみの契約で、前回契約の
// input_data.fields.dispatchStart/dispatchEndにCSV連携時の残骸が残っていたため
// `!c.dispatch_end_date`による判定が「派遣期間が必要」と誤判定し、本来不要な派遣期間の入力を
// 一括更新の条件として要求してしまっていた）。書類種別（document_type）を正とする
// getDocumentPeriodFlags()で判定し、document_typeが欠落している場合のみ旧来の
// フィールド有無判定にフォールバックする。
// 2026-08-03追加：終了日が開始日より前になっていないかのチェック。/apply側STEP3の
// 「終了日は開始日以降の日付にしてください」と同じ考え方だが、この一覧は入力するたび
// 即保存される作りのため、ここでは「両方入力済みで、かつ順番が逆でないか」だけを見る
// 単純な文字列比較（YYYY-MM-DD形式なので文字列比較で日付比較として成立する）。
export function isPeriodOrderValid(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return true
  return start <= end
}

export function periodReady(c: Pick<RenewalCandidate, 'status' | 'document_type' | 'dispatch_end_date' | 'employ_end_date' | 'new_dispatch_start' | 'new_dispatch_end' | 'new_employ_start' | 'new_employ_end' | 'current_contract_type' | 'contract_start_date' | 'new_contract_start_date'>): boolean {
  if (c.status === 'not_renewing' || c.status === 'applied') return false
  if (!isPeriodOrderValid(c.new_dispatch_start, c.new_dispatch_end)) return false
  const isIndefinite = isIndefiniteEmployType(c.current_contract_type)
  // 2026-08-04修正（①）：正社員・無期契約は雇用期間が日付レンジを持たないため、
  // new_employ_start/new_employ_endの前後チェック自体が対象外。
  if (!isIndefinite && !isPeriodOrderValid(c.new_employ_start, c.new_employ_end)) return false
  const flags = getDocumentPeriodFlags(c.document_type)
  const employReady = (): boolean => {
    if (isIndefinite) {
      // 正社員・無期契約：契約条件適用開始日（新規入力 or 前回値の引き継ぎ）があればOK。
      // 前回値がそのまま引き継がれる想定のため、未編集でも「準備完了」として扱う。
      return Boolean(c.new_contract_start_date || c.contract_start_date)
    }
    return Boolean(c.new_employ_start && c.new_employ_end)
  }
  if (flags.resolved) {
    const dispatchOk = !flags.needsDispatch || Boolean(c.new_dispatch_start && c.new_dispatch_end)
    const employOk = !flags.needsEmploy || employReady()
    return dispatchOk && employOk
  }
  // フォールバック（document_type欠落時の旧ロジック）
  if (!c.dispatch_end_date) return employReady()
  const dispatchOk = Boolean(c.new_dispatch_start && c.new_dispatch_end)
  const employOk = c.employ_end_date ? employReady() : true
  return dispatchOk && employOk
}

export function useRenewalCandidates() {
  const [candidates, setCandidates] = useState<RenewalCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  // 2026-08-03修正：以前はこのファイル内2箇所で保存失敗時にブラウザネイティブalert()を
  // 直接呼んでいた（2026-07-22の全体置き換え作業から漏れていた残骸）。実機確認中に日付の
  // 前後チェックのテストで偶然踏んで発覚。他画面と同じ`useToast()`のトースト通知に統一する。
  const { showError } = useToast()

  // ①検知・登録：現場契約のうち、「雇用の側面」「派遣の側面」それぞれの最新契約（アスペクト単位）
  // を対象に、雇用期間終了日が45日以内（超過含む）のものをrenewal_candidatesへupsertする。
  // 既存行のステータス等（担当営業が入力した値）は上書きしない。退職済み・退職予定のスタッフは対象外。
  // 2026-08-04変更（docs/SYSTEM_DESIGN.md 10章 2026-08-04「アスペクト単位への見直し」）：
  // 従来は「社員番号ごとに最新1件」だけを追跡しており、同じスタッフが雇用契約書のみ／
  // 就業条件明示書のみを別々の時期に持つ実例（長谷川様100531・三國様105026・村田様105611）で
  // 片方が更新期限管理から漏れていた。DB関数側がアスペクト単位（雇用の側面・派遣の側面）で
  // 1〜2行を返すようになったため、こちら側も「社員番号ごとに1件」の前提を廃止し、
  // 返された行をそのまま対象として扱う（2つの側面が同じ契約に収束すれば結果的に1行、
  // 異なれば2行のまま処理される）。
  const syncCandidates = useCallback(async () => {
    setSyncing(true)
    try {
      // 総合レビュー指摘31対応（2026-07-15）：以前はcontractsのinput_data（業務内容・住所等の
      // 長文フィールドを含む肥大化したJSON）を全件・全履歴分そのまま取得した上でJS側で
      // 「スタッフごとの最新1件」を絞り込んでいた。件数が増えるほど重くなる作り（3ダッシュボード
      // すべての初期化のたびに全ユーザーが実行）だったため、DB関数
      // `get_latest_genba_contracts_for_renewal()`にDISTINCT ONでの絞り込みを移し、
      // 必要な列だけをテキストとして受け取るように変更。RLSは呼び出しロールのものがそのまま
      // 適用される（関数はSECURITY INVOKERのデフォルトのまま）。
      // 2026-07-31：対象範囲を「現場」のみから「現場」＋「社内」に拡張したことに伴い、
      // RPC関数名も実態に合わせて改称（get_latest_genba_contracts_for_renewal→
      // get_latest_contracts_for_renewal）。社内の閲覧制限はrenewal_candidatesのRLSで担保。
      // 2026-08-04：関数本体をアスペクト単位（雇用の側面／派遣の側面）の探索に全面書き換え
      // 済み（docs/SYSTEM_DESIGN.md 10章参照）。戻り値の形（列構成）自体は変わっていない。
      const { data: contracts, error: contractsError } = await supabase
        .rpc('get_latest_contracts_for_renewal')

      if (contractsError) { console.error('更新候補の同期エラー（contracts取得）:', contractsError); return }
      if (!contracts) return

      // 2026-08-04変更：DB関数が既にアスペクト単位（雇用の側面・派遣の側面）で1〜2行/人を
      // 返すため、ここで社員番号キーのMapに詰め直して1件に潰すことはしない
      // （潰すと従来と同じ「片方の書類種別が消える」バグに逆戻りするため）。
      const latestRows: any[] = contracts.filter((c: any) => c.employee_number)

      // 総合レビュー指摘17対応（2026-07-15）：契約が更新されると、同じスタッフでも新しい
      // contract_idで別行がupsertされる（upsertのonConflictがsource_contract_id単位のため）。
      // 旧契約に紐づく行は削除されずに残り、同じスタッフのカードが2枚並んでしまっていた。
      // 2026-08-04変更：以前は「社員番号ごとの最新1件」とだけ比較していたが、アスペクト単位化に
      // 伴い、1人が最大2件（雇用の側面・派遣の側面）の有効な契約を持ちうるようになったため、
      // 単純な社員番号比較では正しい行まで誤って「旧契約」と判定して消してしまう。ここでは
      // 「その行のsource_contract_idが、今回DB関数が返した“どちらかの側面の最新契約”の
      // 契約ID集合に含まれているか」で判定する（含まれていなければ、その書類種別はもう
      // どちらの側面の最新契約でもなくなった＝古い契約として削除して良い）。
      const empNosAll = Array.from(new Set(latestRows.map(r => r.employee_number)))
      if (empNosAll.length > 0) {
        const validContractIds = new Set(latestRows.map(r => r.id))
        const { data: existingRows, error: existingError } = await supabase
          .from('renewal_candidates')
          .select('id, employee_number, source_contract_id')
          .in('employee_number', empNosAll)
        if (existingError) {
          console.error('更新候補の同期エラー（既存行取得）:', existingError)
        } else if (existingRows && existingRows.length > 0) {
          const staleIds = existingRows
            .filter(r => !validContractIds.has(r.source_contract_id))
            .map(r => r.id)
          if (staleIds.length > 0) {
            const { error: deleteError } = await supabase
              .from('renewal_candidates')
              .delete()
              .in('id', staleIds)
            if (deleteError) console.error('更新候補の同期エラー（旧契約分の削除）:', deleteError)
          }
        }
      }

      // 2026-08-04追加（①正社員の雇用期間バグ）：正社員・無期契約は雇用期間が「期間の定めなし」
      // （契約条件適用開始日のみ）であり、employ_end自体が残骸データで非nullになっているケースも
      // 実データで確認された（関谷綺菜様・104747＝雇用契約書のみで、employ_end_date・
      // dispatch_end_dateの両方に残骸が残っていた）。登録判定でも雇用形態を見て除外できるよう、
      // 対象社員番号の雇用形態をあらかじめ取得しておく。
      const { data: contractTypeRows } = empNosAll.length > 0
        ? await supabase.from('staff').select('employee_number, contract_type').in('employee_number', empNosAll)
        : { data: [] as { employee_number: string; contract_type: string | null }[] }
      const contractTypeByEmpNo = new Map((contractTypeRows || []).map(r => [r.employee_number, r.contract_type]))

      const today = new Date(); today.setHours(0, 0, 0, 0)
      const rows: any[] = []
      for (const c of latestRows) {
        // 2026-08-04修正（①正社員の雇用期間バグ）：書類種別を見ずに`c.employ_end || c.dispatch_end`
        // で判定していたため、「雇用契約書のみ」の契約でもSTEP2のCSV連携時に残った派遣期間の
        // 残骸（dispatchEnd）だけで誤って「更新期限が近い」と登録されてしまう不具合があった
        // （永井優大様・104010＝正社員・雇用契約書のみで発覚。正社員の雇用期間は「期間の定めなし」
        // で本来この一覧に上がる理由が無い）。書類種別が実際に必要とする方の終了日だけを見る。
        // さらに、正社員・無期契約はemploy_end自体が残骸データで非nullなことがあるため
        // （関谷綺菜様・104747で確認）、雇用形態でも重ねてガードする。
        const docFlags = getDocumentPeriodFlags(c.document_type)
        const isIndefiniteEmployee = isIndefiniteEmployType(contractTypeByEmpNo.get(c.employee_number))
        const relevantEmployEnd = ((!docFlags.resolved || docFlags.needsEmploy) && !isIndefiniteEmployee) ? c.employ_end : null
        const relevantDispatchEnd = (!docFlags.resolved || docFlags.needsDispatch) ? c.dispatch_end : null
        const endDate = relevantEmployEnd || relevantDispatchEnd
        if (!endDate) continue
        const end = new Date(endDate); end.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > RENEWAL_ALERT_WINDOW_DAYS) continue

        rows.push({
          source_contract_id: c.id,
          employee_number: c.employee_number,
          staff_name: c.staff_name || null,
          dept_no: c.created_by_dept_no,
          work_location_name: c.work_location_name || null,
          work_location_address: c.work_location_address || null,
          // 開始日（自）も前回値として保存する（伊藤さんご指摘・2026-07-15：自と至は必ずセットで
          // 変わるため、差異表示で至だけでなく自も分かるようにしたい、への対応）
          employ_start_date: c.employ_start || null,
          employ_end_date: c.employ_end || null,
          // 2026-08-03追加：正社員・無期契約の「契約条件適用開始日」スナップショット。
          contract_start_date: c.contract_start_date || null,
          dispatch_start_date: c.dispatch_start || null,
          dispatch_end_date: c.dispatch_end || null,
          data_source: c.csv_mode === 'csv' ? 'csv' : 'manual',
          csv_system: c.csv_system || null,
          // 2026-07-31追加：新規行のみwork_placeを設定する（既存行は上書きしない方針を踏襲）。
          work_place: c.work_place || '現場',
          // 2026-07-16追加：前回契約の書類種別（一覧カード表示用）
          document_type: c.document_type || null,
          // 2026-07-16追加（チャットB）：前回契約の指揮命令者・派遣先責任者・苦情処理申出先
          previous_contact_fields: {
            cmd: { dept: c.cmd_dept || null, role: c.cmd_role || null, name: c.cmd_name || null, tel: c.cmd_tel || null },
            resp: { dept: c.resp_dept || null, role: c.resp_role || null, name: c.resp_name || null, tel: c.resp_tel || null },
            comp: { dept: c.comp_dept || null, role: c.comp_role || null, name: c.comp_name || null, tel: c.comp_tel || null },
          },
        })
      }

      if (rows.length === 0) return

      // 退職済み・退職予定のスタッフを除外する（2026-07-21・タスク④：DBクエリ側の条件で
      // 絞り込む形に変更。staffクエリの時点で現役スタッフのみが返るため、rowsのうち
      // employee_numberがstaffRowsに存在しないものが「退職済み・退職予定で除外対象」となる）
      const empNos = rows.map(r => r.employee_number)
      const [retiredAtOk, retirementScheduledOk] = excludeRetiredStaffOr()
      const { data: staffRows } = await supabase
        .from('staff')
        .select('employee_number')
        .in('employee_number', empNos)
        .or(retiredAtOk).or(retirementScheduledOk)
      const activeEmpNoSet = new Set((staffRows || []).map(s => s.employee_number))
      const targetRows = rows.filter(r => activeEmpNoSet.has(r.employee_number))
      if (targetRows.length === 0) return

      // 既存行（スタッフ入力済みの値）は上書きしないよう、スナップショット項目のみ更新
      const { error: upsertError } = await supabase
        .from('renewal_candidates')
        .upsert(targetRows, { onConflict: 'source_contract_id', ignoreDuplicates: false })
      if (upsertError) console.error('更新候補の同期エラー（upsert）:', upsertError)
    } finally {
      setSyncing(false)
    }
  }, [])

  // ②一覧取得。deptNo指定時はその部門のみ（担当営業用）、nullは全部門（管理部・SSC用）
  // 登録後に退職・退職予定になったスタッフも、表示直前に再チェックして除外する
  // （syncCandidates側は登録時点のみのチェックのため、その後の退職登録には追従できない）。
  // 2026-07-16追加：一覧カードに「今の」所属部署名・雇用形態を出すため、staffマスタから
  // dept_no・contract_typeも取得し、department_masterで部署名に変換して各行に付与する
  // （申請時点のスナップショットではなく現在値を出す、という伊藤さんの確定に基づく）。
  // 2026-07-29変更：在籍スタッフ0名の統括部門（広域本部等）はグループ範囲の複数部門を対象に
  // するため、deptNoは単一の数値だけでなく配列も受け付ける（docs/SYSTEM_DESIGN.md 10章
  // 2026-07-29参照）。
  const fetchCandidates = useCallback(async (deptNo: number | number[] | null) => {
    setLoading(true)
    let q = supabase.from('renewal_candidates').select('*').order('employ_end_date', { ascending: true })
    if (Array.isArray(deptNo)) q = q.in('dept_no', deptNo)
    else if (deptNo !== null) q = q.eq('dept_no', deptNo)
    const { data, error } = await q
    if (error) console.error('更新候補の取得エラー:', error)
    const rows = (data || []) as RenewalCandidate[]

    if (rows.length > 0) {
      // 退職済み・退職予定のスタッフは、DBクエリ側の条件（2026-07-21・タスク④）で除外する。
      // staffクエリが現役スタッフのみを返すため、以降はstaffByEmpNoに存在するかどうかで
      // 「登録後に退職・退職予定になったスタッフ」を判定できる（従来のretiredSetは不要）。
      const empNos = Array.from(new Set(rows.map(r => r.employee_number)))
      const [retiredAtOk, retirementScheduledOk] = excludeRetiredStaffOr()
      const { data: staffRows } = await supabase
        .from('staff')
        .select('employee_number, dept_no, contract_type')
        .in('employee_number', empNos)
        .or(retiredAtOk).or(retirementScheduledOk)

      const deptNosForStaff = Array.from(new Set((staffRows || []).map(s => s.dept_no).filter((n): n is number => n != null)))
      let deptNameByNo = new Map<number, string>()
      if (deptNosForStaff.length > 0) {
        const { data: deptRows } = await supabase
          .from('department_master')
          .select('dept_no, dept_name')
          .in('dept_no', deptNosForStaff)
        deptNameByNo = new Map((deptRows || []).map((d: any) => [d.dept_no, d.dept_name]))
      }
      const staffByEmpNo = new Map((staffRows || []).map(s => [s.employee_number, s]))

      setCandidates(
        rows
          .filter(r => staffByEmpNo.has(r.employee_number))
          .map(r => {
            const s = staffByEmpNo.get(r.employee_number)
            return {
              ...r,
              current_dept_name: s?.dept_no != null ? (deptNameByNo.get(s.dept_no) || null) : null,
              current_contract_type: s?.contract_type || null,
            }
          })
      )
    } else {
      setCandidates(rows)
    }
    setLoading(false)
  }, [])

  // 保存失敗（不正な日付形式・通信エラー等）を握りつぶさない。楽観的更新は行うが、
  // 実際の保存に失敗した場合は画面表示を元に戻し、担当者に必ず知らせる
  // （2026-07-14修正：以前はerrorを一切見ておらず、保存に失敗しても画面上は
  // 成功したように見え、再読み込みで静かに消えるという問題があった）。
  const updateCandidate = useCallback(async (id: string, patch: Partial<RenewalCandidate>) => {
    const prevSnapshot = candidates.find(c => c.id === id)
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    const { error } = await supabase
      .from('renewal_candidates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('更新候補の保存エラー:', error)
      if (prevSnapshot) setCandidates(prev => prev.map(c => c.id === id ? prevSnapshot : c))
      showError('保存に失敗しました。入力内容（特に日付の形式）をご確認のうえ、もう一度お試しください。')
    }
  }, [candidates, showError])

  // ③CSV対象：新しい派遣期間（前回終了日の翌日を基準日として検索）を自動検索し、差異を反映する。
  // 見つからない場合はstatusを'csv_pending'にする（画面側でCSVインポート依頼ボタンを出す）。
  const searchCsvRenewal = useCallback(async (candidate: RenewalCandidate) => {
    if (!candidate.dispatch_end_date && !candidate.employ_end_date) return
    const baseEnd = candidate.dispatch_end_date || candidate.employ_end_date!
    const searchDate = addDays(baseEnd, 1)

    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('crew_code')
      .eq('employee_number', candidate.employee_number)
      .maybeSingle()
    if (staffError) console.error('CSV再検索エラー（staff取得）:', staffError)

    let staffCodeForSearch = candidate.employee_number
    if (candidate.csv_system === 'HRstation') staffCodeForSearch = `F3810${candidate.employee_number}`
    else if (candidate.csv_system === 'winworks') staffCodeForSearch = staffRow?.crew_code || ''

    if (!staffCodeForSearch) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const { data: rowsFound, error: csvError } = await supabase
      .from('csv_raw_data')
      .select('*')
      .eq('system_type', candidate.csv_system || '')
      .eq('staff_code', staffCodeForSearch)
      .lte('dispatch_start', searchDate)
      .gte('dispatch_end', searchDate)
    if (csvError) console.error('CSV再検索エラー（csv_raw_data取得）:', csvError)

    if (!rowsFound || rowsFound.length === 0) {
      await updateCandidate(candidate.id, { status: 'csv_pending' })
      return
    }

    const r = rowsFound[0]
    // 2026-07-16追加（チャットB）：CSVの生データから指揮命令者・派遣先責任者・苦情処理申出先の
    // 新しい値も抽出し、previous_contact_fieldsとの差異表示に使う
    const extracted = extractCsvFields(candidate.csv_system || '', r.raw_data) as Record<string, any>
    const newContactFields: ContactFields = {
      cmd: { dept: extracted.cmdDept || null, role: extracted.cmdRole || null, name: extracted.cmdName || null, tel: extracted.cmdTel || null },
      resp: { dept: extracted.respDept || null, role: extracted.respRole || null, name: extracted.respName || null, tel: extracted.respTel || null },
      comp: { dept: extracted.compDept || null, role: extracted.compRole || null, name: extracted.compName || null, tel: extracted.compTel || null },
    }
    // 2026-07-31追加：CSVで新しい契約が見つかった時点で、まだ「仕分け待ち」または
    // 「CSVインポート待ち」の候補は自動的に「CSV自動反映」タブへ移動する。既に担当営業が
    // 「期間のみ更新」「修正更新」へ手動で振り分け済みの場合は、その選択を尊重し上書きしない。
    const autoPromote = candidate.renewal_tab === 'unassigned' || candidate.renewal_tab === 'import_wait'
    // 2026-08-04修正（①正社員の雇用期間バグ）：従来はここで書類種別・雇用形態を見ずに
    // 派遣期間の日付を無条件で雇用期間にもコピーしていた。正社員・無期契約は雇用期間が
    // 「期間の定めなし」（契約条件適用開始日のみ）で日付レンジという概念自体を持たないため、
    // これらの対象者には雇用期間の日付を一切設定しない（契約条件適用開始日は
    // RenewalManagementTab.tsx側でnew_contract_start_date／前回値からユーザーが編集する）。
    const docFlags = getDocumentPeriodFlags(candidate.document_type)
    const isIndefinite = isIndefiniteEmployType(candidate.current_contract_type)
    const employDates = ((!docFlags.resolved || docFlags.needsEmploy) && !isIndefinite)
      ? { new_employ_start: r.dispatch_start, new_employ_end: r.dispatch_end }
      : {}
    await updateCandidate(candidate.id, {
      new_dispatch_start: r.dispatch_start,
      new_dispatch_end: r.dispatch_end,
      ...employDates,
      new_work_location_name: r.work_location,
      new_work_address: r.work_address,
      new_csv_raw_data_id: r.id,
      new_contact_fields: newContactFields,
      status: 'pending',
      ...(autoPromote ? { renewal_tab: 'csv_auto' as RenewalTab } : {}),
    })
  }, [updateCandidate])

  // 2026-07-31追加：CSV対象の候補が「仕分け待ち」に入った直後、行を展開しなくても
  // 「CSV自動反映」タブの内容・件数が正しく見えるよう、一覧取得のたびにバックグラウンドで
  // 未検索のCSV対象を自動検索する（従来は行を展開するまでsearchCsvRenewalが呼ばれず、
  // CSV有タブが空のまま止まって見えるという不具合があったため）。「まだ検索していない」は
  // new_csv_raw_data_idが無い＋status='pending'（csv_pendingは検索済みで見つからなかった意味
  // なので対象外）で判定する。同じ行を二重に検索しないよう実行済みIDをrefで記録する。
  const autoSearchedIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const targets = candidates.filter(c =>
      c.data_source === 'csv'
      && c.renewal_tab === 'unassigned'
      && c.status === 'pending'
      && !c.new_csv_raw_data_id
      && !autoSearchedIdsRef.current.has(c.id)
    )
    if (targets.length === 0) return
    for (const c of targets) {
      autoSearchedIdsRef.current.add(c.id)
      searchCsvRenewal(c)
    }
  }, [candidates, searchCsvRenewal])

  // ④CSVインポート依頼（既存のrequestsテーブル・STEP2と同じ導線を流用）
  const requestCsvImport = useCallback(async (
    candidate: RenewalCandidate,
    requestedBy: string,
    requestedByDept: string | null
  ) => {
    const baseEnd = candidate.dispatch_end_date || candidate.employ_end_date!
    const { error } = await supabase.from('requests').insert({
      request_type: 'csv_import',
      staff_name: candidate.staff_name,
      staff_code: candidate.employee_number,
      client_name: candidate.work_location_name,
      system_type: candidate.csv_system,
      dispatch_start_date: addDays(baseEnd, 1),
      requested_by: requestedBy,
      requested_by_dept: requestedByDept,
      staff_dept: requestedByDept,
    })
    if (error) {
      console.error('CSVインポート依頼の保存エラー:', error)
      showError('インポート依頼の送信に失敗しました。もう一度お試しください。')
      return
    }
    // 2026-07-31追加：依頼が成功したら「CSVインポート待ち」タブへ移動する。
    await updateCandidate(candidate.id, { renewal_tab: 'import_wait' })
  }, [updateCandidate, showError])

  // ⑤派遣先変更のため手入力に切り替える（例外操作・理由必須）。
  // 2026-07-31追加：切替後は「期間のみ更新」タブへ移動し、自分で新しい期間を入力できるようにする。
  const switchToManualOverride = useCallback(async (id: string, reason: string) => {
    await updateCandidate(id, { manual_override: true, manual_override_reason: reason, status: 'pending', renewal_tab: 'period_only' })
  }, [updateCandidate])

  // 派遣期間を入力した際、雇用期間へコピーする（applyの雇用期間コピー機能と同じ考え方）
  const copyDispatchToEmploy = useCallback(async (id: string, dispatchStart: string, dispatchEnd: string) => {
    await updateCandidate(id, {
      new_dispatch_start: dispatchStart,
      new_dispatch_end: dispatchEnd,
      new_employ_start: dispatchStart,
      new_employ_end: dispatchEnd,
    })
  }, [updateCandidate])

  // 「更新しない」を確定する（担当営業・SSC・管理部の誰でも操作可能。理由入力必須。
  // 2026-07-16：以前は意向トグルの不一致時のみ出る導線だったが、意向トグル廃止に伴い
  // 常時操作可能なボタンに変更）
  // 2026-07-31追加：確定と同時に管理部へメール通知する（他の通知と同じメーリングリスト
  // マスタ優先・個人宛フォールバック方式。/api/renewal-candidates/notify-not-renewing）。
  // メール送信に失敗してもステータス確定自体は既に完了しているため、コンソールに記録するのみで
  // 画面操作は止めない（伊藤さんとの他の通知系実装と同じ考え方）。
  const confirmNotRenewing = useCallback(async (id: string, reason: string) => {
    const candidate = candidates.find(c => c.id === id)
    await updateCandidate(id, { status: 'not_renewing', no_renewal_reason: reason })
    if (!candidate) return
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/renewal-candidates/notify-not-renewing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          staffName: candidate.staff_name,
          employeeNumber: candidate.employee_number,
          deptNo: candidate.dept_no,
          workLocationName: candidate.work_location_name,
          reason,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        console.error('更新しない通知メールの送信エラー:', json?.error)
      }
    } catch (e) {
      console.error('更新しない通知メールの送信エラー:', e)
    }
  }, [candidates, updateCandidate])

  // 2026-07-31追加：更新期限管理タブの5分類（renewal_tab）を手動で切り替える。
  // ①仕分け待ちからの振り分け、②各タブの「他のタブへ移動」、③インポート待ちの
  // 「修正更新へ切替」「期間更新へ切替」、④CSV自動反映・期間のみ更新からの「修正更新へ移動」、
  // すべてこの1関数で統一的に扱う（副作用は一切無い純粋な分類変更。executeBulkApply等の
  // 実行系処理とは独立）。
  const setRenewalTab = useCallback(async (id: string, tab: RenewalTab) => {
    await updateCandidate(id, { renewal_tab: tab })
  }, [updateCandidate])

  // 2026-07-17追加（チャットC・⑤）：仕分けフラグの切り替え。副作用は一切無く、単に
  // triage_modeを保存するだけ。
  const setTriageMode = useCallback(async (id: string, mode: RenewalCandidate['triage_mode']) => {
    await updateCandidate(id, { triage_mode: mode })
  }, [updateCandidate])

  // ⑥一括申請の実行（チャットC・⑤の契約データ生成処理）。「一括申請」に仕分けた行を、
  // /apply の handleSubmitContract() と同じ構造のcontracts行として直接作成する
  // （STEP8の画面自体は経由しない。伊藤さんと確定済みの技術実装イメージ）。
  // 各行につき、前回契約のinput_data.fieldsを土台に、CSVから反映される最新内容
  // （extractCsvFields()。renewalFieldMap.tsの対応表で前回契約側のキー名に変換）で
  // 対応項目のみ上書きし、雇用期間・派遣期間・就業場所名/住所はrenewal_candidatesの
  // 確定済みnew_*カラム（一覧で表示していたものと同じ値）で上書きする。給与・備考など
  // CSVで管理していない項目は前回契約の値をそのまま引き継ぐ。
  // 1件ずつ処理し、失敗した行はスキップして結果に含める（1件の失敗で全体を止めない）。
  const executeBulkApply = useCallback(async (
    targets: RenewalCandidate[],
    submitterUserId: string,
    submitterEmail: string
  ): Promise<{ successIds: string[]; failed: { employeeNumber: string; staffName: string | null; reason: string }[] }> => {
    const successIds: string[] = []
    const failed: { employeeNumber: string; staffName: string | null; reason: string }[] = []

    // B-09対応（2026-08-06）：staff.email検索はC-03によりほぼ機能しないため（実データの
    // staff.emailは全件ito@appart.co.jp固定）、staff_rolesをuid（submitterUserId）で引く
    // 形に統一する。これにより新規作成される契約のcreated_by_dept_noが常にnullになり
    // 部門スコープが壊れていた不具合も解消する。
    const { data: submitterStaffRow } = await supabase
      .from('staff_roles')
      .select('dept_no, name')
      .eq('id', submitterUserId)
      .maybeSingle()

    const { data: minimumWageRows } = await supabase
      .from('minimum_wage_master')
      .select('dept_no, hourly_wage, effective_from')

    for (const c of targets) {
      try {
        // 念のための再チェック（一覧表示後にCSVが再取込まれる等でデータが変わっている
        // 可能性への備え。「一括申請に含める」チェックボックスが有効になる条件と同じ関数を使う
        // ことで判定基準のズレを防ぐ（2026-07-31修正：以前はc.status!=='pending'固定で
        // 判定しており、CSV未検出（csv_pending）を経験した候補が期間のみ更新タブで手動入力しても
        // 永久に実行できない不具合があった）。
        if (!periodReady(c)) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '新しい雇用期間・派遣期間が確定していません' })
          continue
        }

        const { data: prevContract, error: prevError } = await supabase
          .from('contracts')
          .select('staff_id, pattern, contract_type, document_type, work_place, closing_pattern, input_data')
          .eq('id', c.source_contract_id)
          .maybeSingle()
        if (prevError || !prevContract) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '前回契約の取得に失敗しました' })
          continue
        }
        const prevFields = (prevContract.input_data as any)?.fields || {}

        let csvFields: Record<string, any> | null = null
        if (c.new_csv_raw_data_id) {
          const { data: csvRow } = await supabase
            .from('csv_raw_data')
            .select('raw_data')
            .eq('id', c.new_csv_raw_data_id)
            .maybeSingle()
          if (csvRow?.raw_data) {
            csvFields = extractCsvFields(c.csv_system || '', csvRow.raw_data) as Record<string, any>
          }
        }

        // 2026-08-03追加：新しく作成する契約の書類種別（=prevContract.document_type。更新では
        // 書類種別自体は変わらない）に応じて、不要な期間フィールドは明示的にnullへ揃える。
        // 上流（CSV自動反映・過去の手入力等）の経緯を問わず、実際にcontractsへ書き込む直前の
        // この1箇所で整合性を担保することで、periodReady()等の判定基準を今後また個別に
        // 追いかけ直さずに済むようにする（関谷綺菜様・104747の不具合調査を踏まえた恒久対応）。
        const newContractDocFlags = getDocumentPeriodFlags(prevContract.document_type)

        // 明示的にRecord<string, any>と型注釈しておかないと、TypeScriptがスプレッド元
        // （buildMergedFieldsの戻り値）のインデックスシグネチャを無視し、以下で追加している
        // 明示プロパティ（employStart等）だけの狭い型として推論してしまい、salaryType等
        // 他のプロパティへのアクセスがビルド時型エラーになる（2026-07-17 Vercelビルドで発覚）。
        // 2026-08-04追加（①正社員の雇用期間バグ修正）：正社員・無期契約は雇用期間が日付レンジを
        // 持たないため、employStart/employEndは常にnull（StepPeriod.tsxが元々これらを収集しない
        // のと同じ扱い）。契約条件適用開始日はRenewalManagementTab.tsxで編集された値
        // （new_contract_start_date）を優先し、未編集ならbuildMergedFieldsが前回契約から
        // 引き継いだ値（prevFields.contractStartDate由来）をそのまま使う。
        const isIndefiniteEmploy = isIndefiniteEmployType(c.current_contract_type)
        const mergedFields: Record<string, any> = {
          ...buildMergedFields(prevFields, csvFields),
          employStart: (!newContractDocFlags.resolved || newContractDocFlags.needsEmploy) && !isIndefiniteEmploy ? c.new_employ_start : null,
          employEnd: (!newContractDocFlags.resolved || newContractDocFlags.needsEmploy) && !isIndefiniteEmploy ? c.new_employ_end : null,
          dispatchStart: (!newContractDocFlags.resolved || newContractDocFlags.needsDispatch) ? c.new_dispatch_start : null,
          dispatchEnd: (!newContractDocFlags.resolved || newContractDocFlags.needsDispatch) ? c.new_dispatch_end : null,
          workLocationName: c.new_work_location_name || prevFields.workLocationName,
          workLocationAddress: c.new_work_address || prevFields.workLocationAddress,
          // 2026-07-17決定（伊藤さんとの確認）：試用期間は入社時の見極めを目的とした制度のため、
          // 更新のたびに前回の「有」を引き継ぐのは制度趣旨に反する。一括申請で作成する契約は、
          // 前回の値に関わらず必ず「無」にする（例外的に更新時も試用期間を設けたいケースは
          // 個別申請で明示的に入力する運用とする）。
          trialPeriod: '無',
          trialStart: '',
          trialEnd: '',
          // 2026-08-04追加（①）：正社員・無期契約で契約条件適用開始日が編集されていれば
          // その値を優先。未編集ならbuildMergedFields由来（前回契約からの引き継ぎ）のまま。
          ...(isIndefiniteEmploy && c.new_contract_start_date ? { contractStartDate: c.new_contract_start_date } : {}),
        }

        // 2026-07-17 実機テストで判明：staffテーブルに"department"列は存在しない（部署名は
        // department_master(dept_name)の結合で取得する。/apply STEP1検索と同じ形。2026-07-14の
        // handleSearch実装を参照）。存在しない列をSELECTするとエラーになりstaffRow自体がnullに
        // なる、という無言の失敗があったため修正（最初の実機テストでstaff_snapshotが丸ごとnullに
        // なるバグとして発覚）。
        const { data: staffRow } = await supabase
          .from('staff')
          .select('employee_number, name, crew_code, address, dept_no, hired_at, department_master(dept_name)')
          .eq('employee_number', c.employee_number)
          .maybeSingle()

        const staffSnapshot = staffRow ? {
          employee_number: staffRow.employee_number,
          name: staffRow.name,
          department: (staffRow as any).department_master?.dept_name || null,
          crew_code: staffRow.crew_code,
          address: staffRow.address || null,
        } : null

        const { results: autoCheckResults, overallLevel: warningLevel } = runAutoChecks({
          pattern: prevContract.pattern,
          workPlace: prevContract.work_place,
          contractType: prevContract.contract_type,
          salaryType: mergedFields.salaryType || '時給',
          basicSalary: Number(mergedFields.basicSalary) || 0,
          rolePay: Number(mergedFields.rolePay) || 0,
          skillPay: Number(mergedFields.skillPay) || 0,
          salesPay: Number(mergedFields.salesPay) || 0,
          housingPay: Number(mergedFields.housingPay) || 0,
          overtimePay: Number(mergedFields.overtimePay) || 0,
          hasEmployInsurance: Boolean(mergedFields.hasEmployInsurance),
          hasSocialInsurance: Boolean(mergedFields.hasSocialInsurance),
          workingHoursH: Number(mergedFields.workingHoursH) || 0,
          workingHoursM: Number(mergedFields.workingHoursM) || 0,
          monthlyStandardHours: mergedFields.monthlyStandardHours ?? null,
          deptNo: staffRow?.dept_no ?? null,
          staffHiredAt: staffRow?.hired_at ?? null,
          employStart: mergedFields.employStart,
          employEnd: mergedFields.employEnd,
          contractStartDate: mergedFields.contractStartDate || '',
          dispatchStart: mergedFields.dispatchStart,
          dispatchEnd: mergedFields.dispatchEnd,
          trialPeriod: mergedFields.trialPeriod || '',
          minimumWageRowsForDept: (minimumWageRows || []).filter((r: MinimumWageRow) => r.dept_no === staffRow?.dept_no),
        })

        const payload = {
          staff_id: prevContract.staff_id,
          pattern: prevContract.pattern,
          contract_type: prevContract.contract_type,
          document_type: prevContract.document_type,
          work_place: prevContract.work_place,
          status: '申請中',
          closing_pattern: prevContract.closing_pattern,
          created_by_dept_no: submitterStaffRow?.dept_no ?? null,
          created_by_name: submitterStaffRow?.name ?? null,
          csv_raw_data_id: c.new_csv_raw_data_id || null,
          input_data: { staff: staffSnapshot, fields: mergedFields, csvMeta: null },
          search_text: [staffSnapshot?.name, c.employee_number, mergedFields.workLocationName].filter(Boolean).join(' '),
          warning_confirmations: [],
          auto_check_results: autoCheckResults,
          warning_level: warningLevel,
          created_by: submitterUserId,
        }

        const { error: insertError } = await supabase.from('contracts').insert(payload)
        if (insertError) {
          failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '契約データの保存に失敗しました' })
          continue
        }

        // 一覧上は即座に「申請済み」扱いにする（次回syncCandidates()実行時に、最新契約が
        // 入れ替わったことを検知して自動的にクリーンアップされる）
        await updateCandidate(c.id, { status: 'applied', triage_mode: 'undecided' })
        successIds.push(c.id)
      } catch (e) {
        console.error('一括申請の実行エラー:', e)
        failed.push({ employeeNumber: c.employee_number, staffName: c.staff_name, reason: '予期しないエラーが発生しました' })
      }
    }

    return { successIds, failed }
  }, [updateCandidate])

  return {
    candidates,
    loading,
    syncing,
    syncCandidates,
    fetchCandidates,
    updateCandidate,
    searchCsvRenewal,
    requestCsvImport,
    switchToManualOverride,
    confirmNotRenewing,
    copyDispatchToEmploy,
    setTriageMode,
    setRenewalTab,
    executeBulkApply,
  }
}
