// papaparseには型定義が同梱されておらず、@types/papaparseも未導入のため、
// Vercelビルド時のTypeScriptチェックが「型定義ファイルが見つからない」エラーで失敗していた。
// 新規に依存パッケージを追加する（npm install・package-lock更新）よりも影響範囲が小さいため、
// 最小限のアンビエント宣言でモジュールの存在のみを型システムに伝える方式で解消する
// （2026-07-16・Vercelビルドエラー対応）。
//
// 2026-08-12追記（B-14対応時のビルド事故の修正）：当初は中身が空の`declare module 'papaparse'`
// のみだった。この場合モジュール全体が実質`any`扱いになり、`import Papa from 'papaparse'`自体は
// 問題なく通るが、コード中で型として使っていた`Papa.ParseError`（インポートした値の上のドット
// アクセスを型として使う書き方）は本来のTypeScriptの仕様では解決できない書き方だった。
// ローカルの構文チェック（ts.transpileModuleは型チェックを行わずファイル単体の構文のみ見る）
// では検知できず、Vercel本番ビルドの型チェック工程で初めて検出され、かつその際Next.js内部の
// コードフレーム表示処理（日本語等のマルチバイト文字が絡む行の表示）でツール側のバグにより
// ビルドプロセスごとクラッシュするという分かりにくい壊れ方をした。実際に使っている分だけ
// named exportとして型を明示することで解消する。
declare module 'papaparse' {
  export interface ParseError {
    type: string
    code: string
    message: string
    row?: number
  }

  export interface ParseResult<T = any> {
    data: T[]
    errors: ParseError[]
    meta: Record<string, unknown>
  }

  export interface ParseConfig {
    header?: boolean
    skipEmptyLines?: boolean | 'greedy'
    transformHeader?: (header: string) => string
    [key: string]: unknown
  }

  const Papa: {
    parse: <T = any>(input: string, config?: ParseConfig) => ParseResult<T>
    unparse: (data: unknown, config?: Record<string, unknown>) => string
  }

  export default Papa
}
