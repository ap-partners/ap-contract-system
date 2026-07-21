// 退職済み・退職予定のスタッフをクエリ段階で除外するための共通ヘルパー。
//
// 【背景・タスク④（2026-07-21）】
// 従来は下記3箇所で「退職年月日・退職予定日が今日より前かどうか」の日付比較ロジックが
// それぞれ個別に実装されていた（DB移行前の状態）：
//   1. app/apply/page.tsx STEP1スタッフ検索（handleSearch）
//   2. app/dashboard/_shared/useRenewalCandidates.ts のsyncCandidates（更新候補の登録時チェック）
//   3. app/dashboard/_shared/useRenewalCandidates.ts のfetchCandidates（一覧表示直前の再チェック）
// いずれも「一旦staffを全件取得 → JS側でretired_at/retirement_scheduled_atを比較 → 除外」
// という同じロジックをコピーしており、修正漏れ・実装差異のリスクがあった。
//
// この関数は、その日付比較条件をSupabaseクエリのWHERE条件（DB側）として適用するための
// フィルタ文字列を返す。呼び出し側は取得したstaffクエリに対して
//   query.or(retiredAtOk).or(retirementScheduledOk)
// のように2回 .or() を連結して使う（PostgRESTでは同名パラメータの繰り返しはAND結合されるため、
// 「(retired_at が null または未来) AND (retirement_scheduled_at が null または未来)」＝
// 「退職済み・退職予定を除外した現役スタッフのみ」という条件になる）。
//
// これにより、退職者はDBから返ってきた時点で除外され、アプリ側で全件取得してから
// 日付を比較するコード（重複ロジック）を書く必要がなくなる。
export function excludeRetiredStaffOr(): [retiredAtOk: string, retirementScheduledOk: string] {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD（呼び出した瞬間の日付）
  return [
    `retired_at.is.null,retired_at.gte.${today}`,
    `retirement_scheduled_at.is.null,retirement_scheduled_at.gte.${today}`,
  ]
}
