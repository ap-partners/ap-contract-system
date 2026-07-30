// ===== アカウント管理・メーリングリストマスタ共通：実運用で使う20部門の絞り込みリスト =====
// 2026-07-29にapp/api/admin/accounts/route.tsで新設。department_master自体は51部門
// （社内管理用の広域部門・使われない部門等を含む）を持つが、ログインアカウントに実際に
// 割り当てる可能性がある部門だけを厳選した固定順のリスト。
// 2026-07-30：メーリングリストマスタ（app/api/admin/master-data/route.ts）でも同じ
// 部門リストを使うため、二重管理を避けるためこのファイルへ切り出した
// （accounts/route.tsもこちらを参照するよう変更）。
// ※このリストの並び順・対象部門を変更する場合は、docs/SYSTEM_DESIGN.md 10章
//   「2026-07-29：アカウント管理の部門選択肢を絞り込み・並び替え」の決定内容も忘れずに更新すること。
export const CURATED_DEPT_ORDER = [4, 5, 3, 6, 46, 7, 8, 9, 10, 11, 12, 13, 14, 15, 48, 16, 18, 19, 21, 22]
export const CURATED_DEPT_LABEL_OVERRIDE: Record<number, string> = { 22: '法務部' }
