# patches/ について

`patch-package`（`package.json`の`postinstall`で自動適用）で管理している`node_modules`への当て込みパッチの一覧です。`npm install`のたびに自動で再適用されます。依存パッケージのバージョンを更新する際は、ここに書いてある内容が新バージョンでも必要か確認してください。

## `@react-pdf+textkit+6.3.0.patch`

対象：`@react-pdf/textkit`（`@react-pdf/renderer`が内部で使うテキスト折り返しライブラリ）の`lib/textkit.js`。

**内容**：単語の折り返し判定で、ライブラリ側が自動的に付けようとするハイフネーション用のフラグ（`hyphenated`）を常に`false`に固定する1行の変更です。

**理由**：契約書PDFの本文レイアウトは、`lib/pdf/pdfShared.tsx`に登録した独自の`Font.registerHyphenationCallback`（日本語は1文字ずつ、半角英数字は15文字以下の単語なら分割しない、というアプリ独自のルール。2026-07-10・2026-08-17の一連の調整で確定）で完全に制御している。`@react-pdf/textkit`本体が持つデフォルトのハイフネーション付与ロジックをそのまま生かしておくと、このアプリ独自の折り返しルールと二重に作用してレイアウトが崩れる（メールアドレス等の長い半角文字列が意図せず分割される等）ため、ライブラリ側の自動付与を無効化している。

**バージョン更新時の注意**：`@react-pdf/renderer`（延いては`@react-pdf/textkit`）をアップグレードする際は、この1行のパッチが新しいバージョンの`textkit.js`にもそのまま当たるか（`patch-package`はファイルが変わっていると当て込みに失敗して`postinstall`がエラーになる）を確認し、失敗する場合は`npx patch-package @react-pdf/textkit`で当て直してください。
