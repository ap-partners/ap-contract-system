// papaparseには型定義が同梱されておらず、@types/papaparseも未導入のため、
// Vercelビルド時のTypeScriptチェックが「型定義ファイルが見つからない」エラーで失敗していた。
// 新規に依存パッケージを追加する（npm install・package-lock更新）よりも影響範囲が小さいため、
// 最小限のアンビエント宣言でモジュールの存在のみを型システムに伝える方式で解消する
// （2026-07-16・Vercelビルドエラー対応）。
declare module 'papaparse'
