// ===== Postgres/Supabaseエラーの日本語化ユーティリティ =====
// 総合レビュー指摘18対応（2026-07-27）。管理系API（app/api/admin/accounts、master-data、
// csv-import）で、Supabaseから返るエラーの`error.message`（Postgresの内部エラー文言。
// 例：'column "xxx" does not exist'）がそのままJSONレスポンスとして画面に表示されていた。
// CLAUDE.mdの前提（伊藤さんはプログラミング知識ゼロ）に反するため、主要なPostgresエラー
// コード（SQLSTATE）だけを分かりやすい日本語にマッピングし、該当しないものは原因不明の
// 汎用メッセージに丸める。
const PG_ERROR_MESSAGES: Record<string, string> = {
  '23505': '同じ内容のデータが既に登録されています。',
  '23503': '関連する他のデータが参照しているため処理できませんでした。',
  '23502': '必須項目が入力されていません。',
  '22001': '入力内容が長すぎます。文字数をご確認ください。',
  '22P02': '入力内容の形式が正しくありません。',
}

// マッピングされた理由文言のみを返す（呼び出し元が独自の接頭辞を組み立てる場合に使う）
export function friendlyDbReason(error: { code?: string; message?: string } | null | undefined): string {
  return (error?.code && PG_ERROR_MESSAGES[error.code]) || '予期しないエラーが発生しました。時間をおいて再度お試しください。'
}

export function friendlyDbError(error: { code?: string; message?: string } | null | undefined, action: string): string {
  return `${action}に失敗しました：${friendlyDbReason(error)}`
}
