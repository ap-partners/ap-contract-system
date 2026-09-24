# Cowork版 最終スナップショット（2026-09-24）― Claude Code移行基準点

> **この文書の位置づけ**
> Claude Cowork環境での開発を区切り、Claude Codeへ移行するための「移行基準点」。2026-09-24時点の**実装コード・本番DB・外部サービスを実際に調査した結果**を正とし、`CLAUDE.md`・`docs/SYSTEM_DESIGN.md`との食い違いも含めて記録する。
> 今回の作業では**コード・DB・UI・環境変数・本番データは一切変更していない**（監査・記録のみ）。問題を見つけても直さず、優先度付きで下に列挙した。
>
> - Claude Codeで作業を始めるときは、`CLAUDE.md` → この文書 → 必要に応じて `docs/SYSTEM_DESIGN.md` の該当章、の順に読むこと。
> - `docs/SYSTEM_DESIGN.md` の0〜9章（現在仕様）は2026-07上旬の記述が多く残っており、**実態と食い違う箇所がある（本書6章に一覧）**。本書と食い違う場合は本書（＝実コード・実DBの調査結果）を優先する。
> - **2026-09-24追記（確定事項）**：A-2（アルバイト）は伊藤さんの業務判断により「アルバイトは通常の契約書システムでは扱わず、アルバイト誓約書システムを正式ルートとする」と確定した（5章A-2・10-2参照）。
> - 本書の分類・優先度は**Claude（実装担当）による提案**であり確定事項ではない。ChatGPT（設計・品質レビュー）のレビュー、伊藤さん（業務オーナー）の業務判断を経て確定する（CLAUDE.md 0.2〜0.4）。

---

## 1. 識別情報（どの状態を固定したか）

| 項目 | 値 |
|---|---|
| 監査日 | 2026-09-24 |
| Git：ローカル `main` / `origin/main` | どちらも `6309cc93b5fc199a5709f671031c54a35d7cf125`（コミットメッセージ「#30: DEPT_GROUP_SCOPEをdept_group_scopeテーブルへマスタ化」・2026-08-20）。2026-08-20以降、新しいコミットは無い |
| Vercel本番デプロイ | `dpl_Cm3h9NdfJBMeTnH5cbhSCDExe2wF`（上記コミット `6309cc9`・状態READY）。直近7日間のランタイムエラー0件 |
| Supabase | プロジェクト `argpiiznuzxmmqraynfo`（東京・Postgres 17.6）、組織プラン **free**、DB使用量 27MB |
| 推奨Gitタグ名 | `cowork-final-2026-09-24`（作成手順は本書9章。ルール14によりタグ作成・pushは伊藤さんのターミナルから実行する） |

**未コミットの変更（2026-09-24時点・ファイル更新日時と`.git/index`から推定）**：
- `CLAUDE.md`（2026-09-09追加の「🧭 開発・設計の基本方針（0.1〜0.8）」、#30実機確認結果、今回の監査結果）
- `docs/SYSTEM_DESIGN.md`（#30実機確認結果、今回の監査結果）
- `docs/COWORK_FINAL_SNAPSHOT_2026-09-24.md`（本書・新規）
- `CLAUDE_BACKUP.md`（新規・未追跡。2026-09-09に基本方針を追記する前のCLAUDE.mdのバックアップと見られる。コミットに含めるかは伊藤さん判断）

> 注：今回、Claude側のシェル（Linux作業環境）が「2026-09-08のWindows更新の影響でファイルに届かない」エラーで起動できず、`git status`を実行できなかった。上記は`.git`内のファイルを直接読んで推定したもの。
> **【2026-09-24確認済み】** 伊藤さんのターミナルで`git status`を実行した結果、推定どおり「`main`は`origin/main`と一致、modified＝`CLAUDE.md`・`docs/SYSTEM_DESIGN.md`、untracked＝`CLAUDE_BACKUP.md`・`docs/COWORK_FINAL_SNAPSHOT_2026-09-24.md`」のみで、想定外の変更は無いことを確認した。

---

## 2. システム概要

人材派遣会社APパートナーズの**雇用契約書・就業条件明示書・アルバイト誓約書を、Web上で「申請→確認・承認→従業員の署名→保管」まで完結させる社内システム**。担当営業が申請し、SSC（管理部の確認担当）・管理部が承認し、従業員がマイページで署名する。署名済みPDFはGoogle Driveの共有ドライブへ自動保存される。

- 技術：Next.js 16.2.7（App Router）/ React 19.2 / TypeScript / Tailwind CSS v4 / Supabase（Postgres・Auth）/ Vercel（GitHub連携で自動デプロイ）/ @react-pdf/renderer（PDF生成）/ nodemailer＋Gmail（メール）/ googleapis（Drive保存）
- 規模：`app/`・`lib/` 配下のTS/TSXが140ファイル・約38,000行
- 本番URL：https://ap-contract-system.vercel.app/ ／ GitHub：ap-partners/ap-contract-system
- **運用フェーズ：まだ本稼働していない**。本番DBのデータは検証・デモ用（実在スタッフ名義を含むが業務はこのシステムに依存していない）。社内ログインアカウント19件はすべてテスト用。

---

## 3. 本番で実際に動いている機能（A）

### 3-1. 画面（16画面・すべて本番デプロイ済み）

| 画面 | パス | 利用者 | 実際にできること（コードで確認） |
|---|---|---|---|
| トップ | `/` | 全員 | `/login`へリダイレクトのみ |
| 社内ログイン | `/login` | 担当営業・SSC・管理部 | Supabase Auth（メール＋パスワード）。ロールは`staff_roles`で判定しダッシュボードへ振り分け |
| アカウント初期設定 | `/account-setup` | 招待された社内ユーザー | 招待メールの認証コード確認→本人がパスワード設定 |
| 契約書の申請 | `/apply` | 担当営業（SSC・管理部も可） | スタッフ検索（担当営業は部門グループ範囲のみ）→書類種別（雇用契約書6STEP／就業条件明示書6STEP／兼用8STEP）→CSV検索による自動反映（4システム）→最終確認→申請。差し戻し再申請（`?edit=`）・更新申請（`?renewal=`）・最低賃金改定再申請（`?wageAmend=`）モード、下書き自動保存・離脱警告あり |
| アルバイト誓約書の申請 | `/pledge/apply` | 同上 | 6STEP（基本→就業先→就業日程〔単日最大10件／期間指定／MIX〕→業務内容・時間→給与→最終確認） |
| 担当営業ダッシュボード | `/dashboard/sales` | 担当営業 | タブ：進行中／要説明／差し戻し／署名待ち／完了／取り下げ／依頼状況／更新期限管理（仕分け待ち・CSV自動反映・期間のみ更新・期間以外も修正・CSVインポート依頼の5タブ＋最低賃金改定対応＋契約状況モニタリング〔閲覧のみ〕）／アルバイト誓約書。対面・印刷締結の「説明完了」ボタン |
| SSCダッシュボード | `/dashboard/ssc` | SSC | 承認待ち・差し戻し中・承認済み等、一括承認（警告なし案件のみ・氏名＋社員番号の確認付き）、アルバイト誓約書、更新期限管理（閲覧中心） |
| 管理部ダッシュボード | `/dashboard/admin` | 管理部 | サマリー／承認業務（契約一覧・社内承認〔権限者のみ〕・アルバイト誓約書・更新期限管理）／データ登録（依頼管理・CSVインポート〔契約CSV4システム＋StaffExpress部門/スタッフマスタ〕・マスタ管理〔部門・最低賃金・所定労働時間・派遣料金額・自社拠点・業務内容テンプレート・メーリングリスト・部門グループ設定〕）／運用管理（アカウント管理〔権限者のみ〕・FAQ管理・システム状況） |
| 契約詳細（SSC/管理部） | `/dashboard/ssc/contracts/[id]` | SSC・管理部 | 全項目表示・CSV差分表示・自動チェック警告・承認／強制承認（理由必須）／差し戻し・PDFプレビュー・署名依頼再送・強制ログアウト・csvMeta復元・自己申請の取り下げ |
| 契約詳細（担当営業） | `/dashboard/sales/contracts/[id]` | 担当営業 | 閲覧・PDFプレビュー・取り下げ・説明完了 |
| 誓約書詳細（SSC/管理部・担当営業） | `/dashboard/ssc/pledges/[id]`・`/dashboard/sales/pledges/[id]` | 各ロール | 承認・差し戻し・取り下げ・PDFプレビュー |
| 従業員ログイン | `/staff/login` | 従業員 | 社員番号＋パスワード。初回・再設定は社員番号＋メール記載の6桁認証コード。IPレート制限・15分ロック・退職者遮断 |
| マイページ | `/staff/mypage`・`/staff/mypage/documents/[id]` | 従業員 | 署名待ち書類の確認→署名（雇用契約書・兼用・誓約書＝氏名入力で丸印鑑生成）／内容確認（就業条件明示書）、署名済み書類の閲覧。ブックマーク案内、FAQウィジェット |
| 旧・署名画面 | `/sign/[id]` | 従業員 | **旧方式（契約単位の認証コード）の画面が残存**。現在の署名依頼メールはマイページへ誘導しており、このURLは再発行API経由でのみ使われる（5章 A-6参照） |

### 3-2. 裏側の機能
- **PDF生成**：雇用契約書（A4・1枚）／就業条件明示書（1枚）／兼用（2枚）／アルバイト誓約書（1枚）。署名後はGoogle Drive保存版を返す。電子印影はIPAex明朝WebFont
- **メール**（Gmail SMTP・16種類）：署名依頼（認証コード付き／ログイン案内）、依頼受付・完了・取消、更新期限ダイジェスト、CSV修正の管理部通知、FAQ回答、アカウント招待、Cron失敗通知ほか。全送信を`mail_logs`に記録（直近30日152通・失敗0件）
- **Cron（Vercel）**：`renewal-notify`（毎日10:00 JST・土日祝スキップ）、`withdrawn-cleanup`（毎日02:00 JST設定・実行は02:15頃・取り下げ30日後に論理削除）、`csvmeta-cleanup`（毎日03:00 JST設定・実行は4時前後・保持2年超のcsvMeta削除＋ログ1年超削除）。3本とも`cron_runs`に記録され正常稼働中（renewal-notify：success 23／skipped 13、withdrawn-cleanup：success 34／error 1〔9/12 Gateway Timeout・単発〕、csvmeta-cleanup：success 36）
- **自動チェック**（`lib/autoChecks.ts`）：金額異常値・最低賃金（改定またぎ含む）・就業規則整合 → 警告レベル（赤／黄）
- **Google Drive**：署名済みPDFとcsvMetaバックアップを「年月→部署」フォルダに保存
- **FAQチャットボット**：社内向け（ダッシュボード）・従業員向け（マイページ・署名画面）
- **監視**：システム状況タブ、毎朝9時のスケジュールタスク（Vercelランタイムエラー確認・Coworkのスケジュールタスク機能。Claude Code移行後も継続するかは要確認）

---

## 4. 実装済みだが未検証・検証不足（B）

| 項目 | 状況 |
|---|---|
| 更新申請（`/apply?renewal=`）経由での「新しいCSV行の契約番号」反映 | 該当データが無く未検証（2026-07-30から） |
| 更新期限管理の一括申請`executeBulkApply()`の部門保存 | 同一パターンの別経路で確認済みだが、この経路自体の実機確認なし |
| 通知メールの一部（契約状況モニタリング「担当者未特定」時の文言、更新期限ダイジェストの日付表記L-02） | コードレビューのみ |
| M-01（異動時の更新候補の部門追随）のcron経由確認 | **テストデータが復元されていない**：2026-08-14に検証用として岩城蒼太様（104018）の`staff.dept_no`を9→15へ変更したまま。現在`staff`・`renewal_candidates`とも15（追随自体はしている）。**本来の9へ戻す作業が未実施**（今回は変更禁止のため未対応） |
| M-11・M-12（1000件超のページング） | 件数が上限に達しておらずコード確認のみ |
| 最低賃金改定再申請の実データでの最後までの申請 | 画面表示までの確認 |
| Next.js本番ビルドでの型チェック | Claude側`tsc`は#30まで実行済み。以降コード変更なし |
| スマートフォン実機での従業員フロー | 390px幅の確認のみ（実機Android/iOSでの署名は未確認） |

---

## 5. 監査結果：問題・懸念の一覧（優先度付き・今回は修正していない）

凡例：🔴A＝本番リリース前に必ず対応／🟠B＝本番前に対応したい／🟡C＝リリース後でもよい／⚪D＝対応不要と判断できる候補。
**【業務判断】**＝伊藤さんの業務判断が必要（Claudeは確定しない）。

### 🔴 A：本番リリース前に必ず対応すべき

| # | 内容 | 根拠（実際に確認したこと） | 判断が必要な点 |
|---|---|---|---|
| A-1 | **承認・ステータス変更を画面（ブラウザ）から直接DB更新しており、担当営業でも自部門の契約を開発者ツールで「承認済み」「署名済み」等に書き換えられる構造** | `contracts`/`pledges`のUPDATEポリシーは行単位（部門範囲）の制限のみで、列やステータス遷移の制限が無い。`authenticated`ロールは全47列にUPDATE権限あり。承認処理はダッシュボードのクライアントコードが`.update({status:'SSC承認済み'…})`を直接実行（`admin/page.tsx`・`ssc/page.tsx`・`ssc/contracts/[id]/page.tsx`・`PledgeListSection.tsx`等） | 対策方式（承認等をサーバーAPI／DB関数経由に限定する、列権限＋トリガーで遷移を制限する等）はChatGPT設計レビュー対象 |
| A-2 | **「アルバイト」を雇用区分に選ぶと契約書の申請がDBエラーで保存できない**（→**2026-09-24に業務仕様確定**） | `contracts.contract_type`のCHECK制約が`有期契約/無期契約/正社員`の3つのみ。一方`/apply`のSTEP1は「アルバイト」を選択肢に持ち、スタッフマスタがアルバイトの人（在籍53名）は自動で選ばれる | **【確定（伊藤さん判断・2026-09-24）】アルバイトは通常の契約書システムでは扱わず、アルバイト誓約書システム（`/pledge/apply`）を正式ルートとする。そのため通常契約書側でアルバイトを保存可能にする必要はない**（DB制約の修正はしない）。残課題は`/apply`でアルバイトを選べてしまう画面側の仕様のみ。今回はコード・DB・UI・API・RLSとも変更せず、下記10-2の確認項目としてClaude Code初回監査に引き継ぐ。修正方針はChatGPTのレビューで決定 |
| A-3 | **旧・署名方式の認証コードを社内ユーザーが閲覧できる** | `/api/sign/[id]/reissue`（旧方式）が`contracts.sign_auth_code`を発行し、この列は`authenticated`がSELECT可能（RLSの部門範囲内なら担当営業も読める）。現在6件にコードが残存（有効期限切れ）。本人以外がコードを使って署名できる余地があり、署名の真正性に関わる | 旧`/sign/[id]`経路を廃止するか、列を閲覧不可にするか |
| A-4 | **本番切替作業（既存・未着手）** | ①`staff.email`が1,801件中1,788件`ito@appart.co.jp`固定（スタッフマスタ取込のテスト用固定） ②Vercel環境変数`RENEWAL_NOTIFY_OVERRIDE_EMAIL`が有効（更新期限・各種通知が伊藤さん宛に集約） ③Excel過去データの取込 ④実際の社内アカウントの登録（現在19件すべてテスト用、管理部は`admin-test`1件のみ） ⑤テスト・デモデータの整理（例：104018の部門が検証値のまま） | 実施順序・タイミング（伊藤さん指示で「本番リリース直前」に固定済み） |
| A-5 | **Vercel無料プラン（Hobby）は規約上「非商用・個人利用のみ」** | Vercel公式ドキュメント（Hobbyプランのページ、2026-09-14更新）に「Hobby plan restricts users to non-commercial, personal use only」と明記。会社の業務システムの運用は該当しない可能性が高い | **【業務判断】**「完全無料」方針（CLAUDE.md 0.5）と衝突。規約の解釈確認、無料で商用利用できる代替基盤の検討、または有料化の判断 |
| A-6 | **DBのバックアップと復旧手段が無い** | Supabase組織プランが`free`（MCPで確認）。無料プランには利用可能な自動バックアップが無い（過去の調査記録。最新仕様は要再確認）。改善提案#12も未着手 | 無料で実現できる定期バックアップ（例：定期的なDBダンプの取得・保管）と、復旧手順の訓練 |

### 🟠 B：本番リリース前に対応したい

| # | 内容 | 根拠 |
|---|---|---|
| B-1 | SECURITY DEFINER関数の実行権限が広い | Supabase Advisor警告：`increment_attempt_counter`（未ログインでも任意IDの試行回数を加算でき、他人の認証コードを失効させられる余地）、`soft_delete_withdrawn_*`、`get_active_staff_count_by_dept`（部門別人数が未ログインで取得可）、`current_dept_scope`が`anon`で実行可能。さらに`cleanup_old_csvmeta`（INVOKER）は`authenticated`が任意の日付を渡して実行でき、担当営業でも自部門範囲の署名済み契約のcsvMetaを削除できる（Driveにバックアップはある） |
| B-2 | Vercelのプレビュー環境が本番DBを参照 | 環境変数11個すべてがProduction＋Preview共通（改善提案#6） |
| B-3 | DB定義（テーブル・RLS・関数）がリポジトリに無い | マイグレーション履歴はSupabase側に88件あるが、リポジトリには`docs/sql/`のFAQ分のみ。初期テーブル（staff・contracts等）は履歴にも無い。環境を作り直せない（改善提案#25） |
| B-4 | 自動テスト・CIが1件も無い | `*.test.*`・`.github/`とも無し（改善提案#1〜#3） |
| B-5 | 操作の証跡（audit_logs）が無い | 誰がいつ何を承認・変更したかの汎用記録テーブルが無い（改善提案#23）。契約の承認者・日時など一部の列のみ |
| B-6 | 社内アカウントの多要素認証が無い | 管理部1アカウントの漏えいで全従業員データに到達できる（改善提案#19）。Supabase AuthのTOTP方式は無料枠で利用可能とされる（要確認） |
| B-7 | 統括部門アカウントの「依頼状況」だけ部門グループ範囲が効かない | `requests`のRLSは「依頼者の部門名＝自分の部門名」の完全一致で、`current_dept_scope()`（部門グループ設定）を使っていない。契約・誓約書・更新期限は部門グループ範囲で見えるのに依頼だけ見えない不整合 |
| B-8 | 契約書PDFの会社住所が本社固定・マスタと食い違い | 雇用契約書／就業条件明示書／兼用の3帳票は`lib/pdf/documentText.ts`の固定値「新宿通東洋ビル10階」を印字。自社拠点マスタの本社は「9F」。拠点別住所の印字（2026-07-08からの宿題）も未対応。**【業務判断】**正しい本社住所、拠点別住所を印字するか |
| B-9 | ブラウザ側（画面）のエラーを検知できない | Vercel標準の監視はサーバー側のみ。2026-08-14の`/apply`全面クラッシュのような画面側の障害は検知不可（改善提案#9の残り。本番直前に判断する方針で保留中） |
| B-10 | 依存パッケージの脆弱性の定期確認が無い | Dependabot等なし（改善提案#17）。`next`本体の更新（16.2.7→16.3系）も未対応 |
| B-11 | 巨大ファイルによる保守性低下 | `dashboard/admin/page.tsx` 2,642行、`apply/page.tsx` 2,621行、`pledge/apply/page.tsx` 1,806行、`lib/mail.ts` 1,756行、`ssc/contracts/[id]/page.tsx` 1,390行 等 |
| B-12 | UI/デザインの共通基盤が無い | 色・余白が各ファイルにHEX直書き（例：`#2F5FD0`）。デザイントークン・共通コンポーネント集が無く、従業員側（紺ヘッダーのv8デザイン）と社内ダッシュボードで2系統のデザインが並存。CLAUDE.md 0.6の完成度基準に対するレビューが未実施（ChatGPTレビュー対象） |
| B-13 | ドキュメントの肥大・陳腐化 | `SYSTEM_DESIGN.md`約3,470行、`CLAUDE.md`は残タスク一覧が「完了履歴」化。0〜9章に実態と食い違う記述多数（本書6章）（改善提案#8） |
| B-14 | テスト用・一時ファイルがGit管理下に残存 | `renderA.tsx`・`renderB_stress.tsx`・`renderC_autofit.tsx`・`renderC_c22.tsx`・`次チャット用プロンプト_監査対応.md`・`引継ぎ_チャットボットUI改善_2026-07-28.md`・`FAQ品質監査レポート_2026-07-28.docx`等がリポジトリに含まれている。`docs/総合レビュー指摘事項_2026-07-14.md`と`docs/reviews/`配下に同名ファイルが重複 |

### 🟡 C：本番リリース後でもよい
- `contracts.input_data`の頻用項目の列化（改善提案#21）、更新候補が消えた理由の履歴（#26）、PDFプレビューと本番出力の経路統一（#31）、アップロードファイルのウイルススキャン（#20）
- Content-Security-Policyヘッダー（基本的な4ヘッダーは設定済み）
- Next.js 16で非推奨になった`middleware.ts`→`proxy.ts`への移行（`node_modules/next/dist/docs`に「deprecated and has been renamed to proxy」と記載）
- Supabase Advisorの性能警告：RLS内の`auth.uid()`毎行評価（6件）、未使用インデックス（24件）、重複ポリシー
- 未使用テーブル`csv_diff_logs`（0件）・未使用列（`requests.reminder_sent_at`等）の整理
- 所定労働時間マスタの「社内」3行は現在ロジックで未使用（最低賃金チェックは現場のみ）
- スクリプト`scripts/import-master.js`はWeb取込の氏名照合ロジック（C-08）を持たない（使わない運用で担保）
- Google Drive上の検証用孤児PDF数件
- **【業務判断】スタッフ稼働状況管理**（休職・待機・退職・派遣先変更の把握、署名済み契約の急な修正申請の仕組み。2026-07-31に別タスクとして合意済み・未設計）
- **【業務判断】7-3・7-4章に要件として残っているが未実装のもの**：アラート日数マスタ、ログイン時の強制確認モーダル、エスカレーション（マネージャー→管理部）、既読・対応ログ、一括送付のキュー処理（最大400件）。今も必要かの再判断が必要

### ⚪ D：対応不要と判断できる候補（最終判断は伊藤さん）
- #13 Google Driveの容量アラート（伊藤さん回答：共有ドライブは100TB以上あり不要・2026-08-20）
- 独立したヘルプページ`/help/*`（2026-07-22に見送り確定）
- 署名画面の強制スクロール、SMS等の別経路認証、依頼の催促ボタン（いずれも過去に見送り確定）
- Supabase「漏洩パスワード保護」（Pro限定機能のため見送り・2026-07-29）
- DB容量（27MB／無料枠500MB）、メール量（月150通程度）は現状問題なし
- `withdrawn-cleanup`の9/12単発タイムアウト（翌日以降正常。2回連続でないため通知対象外・設計通り）

---

## 6. 設計書・CLAUDE.mdと実装・DBの不一致（突合結果）

| 箇所 | 記述 | 実態（2026-09-24確認） |
|---|---|---|
| CLAUDE.md「システム全体像」テーブル数 | 「テーブル（14）」＋追記 | **25テーブル**（7章の一覧） |
| CLAUDE.md「システム全体像」画面 | `/help/*`のみ未実装 | 16画面稼働（`/account-setup`・`/dashboard/sales/pledges/[id]`・`/staff/login`が記載漏れ） |
| SYSTEM_DESIGN 0章 | 「最終更新2026-07-01」「次にやるべきこと＝フェーズ2〜5」 | フェーズ1〜5はすべて実装済み |
| SYSTEM_DESIGN 1-1 | 認証は`user_metadata.role`、従業員は「マイページ未実装・ログイン画面不要」 | ロールは`staff_roles`（DB）で判定。従業員は`/staff/login`＋マイページ方式 |
| SYSTEM_DESIGN 1-2 | 管理部の「CSVインポート・CSV差異アラートタブのみ未実装」、アルバイト誓約書「未実装」 | CSVインポートは実装済み、CSV差異アラートは専用画面を作らない方針に変更済み。誓約書は実装済み |
| SYSTEM_DESIGN 1-3 | `notifications`・`users`等のテンプレート残骸あり | 2026-07-28に削除済み。以後追加の`pledges`・`office_master`・`faq_*`・`mail_logs`・`cron_runs`・`dept_group_scope`等が未記載 |
| SYSTEM_DESIGN 3-1 | 退職者除外は「クライアント側フィルタ」 | DB側のWHERE条件（`lib/staffFilters.ts`）に移行済み |
| SYSTEM_DESIGN 3-6 `contracts` | 列23個 | 実際は47列（署名・取り下げ・論理削除・csvMeta・派遣終了等） |
| SYSTEM_DESIGN 3-8 `staff_roles` | `staff_id`/`system_role`（4値）の設計・「未作成」 | 実テーブルは`id`（=auth.users.id）/`role`（3値：担当営業/SSC/管理部）/`is_internal_approver`/`is_account_admin`/`is_active`等。作成済み |
| SYSTEM_DESIGN 3-9 `requests` | RLS「認証ユーザーは全件読み書き可」、「完了にする」ボタンは設けない | RLSはロール・部門で制限済み。手動の「完了にする」は2026-07-31に実装済み（`/api/requests/[id]/resolve`） |
| SYSTEM_DESIGN 3-10/3-11 | マスタRLS「認証ユーザーは全件読み書き可」 | 書き込みは管理部のみ |
| SYSTEM_DESIGN 5-4・6章 | 取込はスクリプト、画面は「表示予定」 | 管理部画面からWeb取込（StaffExpress含む） |
| SYSTEM_DESIGN 8章 #4・#6 | 署名画面未実装、`/apply`は担当営業のみ | 実装済み、3ロールとも申請可 |
| SYSTEM_DESIGN 9-1 #6・#16・#17 | CSVインポート未着手、取り下げ表示先なし、部門マスタ管理画面なし | すべて実装済み |
| CLAUDE.md 残タスク「監視・運用グループ」 | `renewal-notify`のcron記録が未確認 | 2026-09-24時点で23回successを記録（確認済み） |
| CLAUDE.md M-01フォローアップ | 「確認後は104018のdept_noを9へ復元すること」 | **未復元**（15のまま） |
| SYSTEM_DESIGN 6-4（アルバイト） | 雇用契約書でアルバイトを選べる（2026-07-02） | DB制約が受け付けない（A-2）。**2026-09-24にアルバイトは誓約書システムを正式ルートとすることが確定**し、DB制約側が確定仕様と一致、`/apply`の選択肢側が食い違う状態 |
| SYSTEM_DESIGN 9-2 | 契約書PDFの住所は「本社10階を暫定表示」、自社拠点マスタは本社9F（2026-07-24「PDFは10階のまま維持」） | 食い違いが継続（B-8） |

---

## 7. DB概要（実DB・2026-09-24）

25テーブル（すべてRLS有効）。件数は概数。

| 区分 | テーブル（件数） |
|---|---|
| 申請・業務データ | `contracts`（30：申請中9・SSC承認済み1・差し戻し中1・署名待ち6・署名済み11・取り下げ2）、`pledges`（6）、`requests`（7）、`renewal_candidates`（13）、`contract_monitoring_actions`（5） |
| マスタ | `staff`（1,801）、`department_master`（51）、`dept_group_scope`（4）、`minimum_wage_master`（35）、`standard_working_hours_master`（8）、`dispatch_fee_master`（8）、`office_master`（8）、`work_description_templates`（3）、`mailing_list_master`（0）、`company_master`（8） |
| CSV連携 | `csv_raw_data`（1,382）、`csv_imports`（17）、`master_imports`（7）、`csv_diff_logs`（0・未使用） |
| 権限・認証 | `staff_roles`（19）、`rate_limit_buckets`（4） |
| FAQ | `faq_entries`（37）、`faq_inquiries`（1） |
| 運用ログ | `mail_logs`（185）、`cron_runs`（107） |

- DB関数19個（権限判定：`current_role_name`・`current_dept_no`・`current_dept_scope`・`current_is_internal_approver`、更新期限・モニタリング用：`get_latest_contracts_for_renewal`・`get_contract_monitoring_status`・`has_active_dispatch_aspect`ほか）
- トリガー：`updated_at`自動更新（contracts・csv_raw_data・requests）、`auth.users`更新時に`staff_roles`のロールを`user_metadata`へ強制反映
- `staff`の機密5列（パスワードハッシュ・認証コード等）は`authenticated`から列権限で遮断済み。`staff`のUPDATEは`work_place`列のみ許可
- 論理削除：`contracts`・`pledges`に`deleted_at`（SELECTポリシーで除外）
- マイグレーション履歴（Supabase側）：88件（2026-07-08〜08-20）。リポジトリには無い（B-3）

---

## 8. 外部連携・環境

| サービス | 用途 | 状態 |
|---|---|---|
| Vercel（Hobby） | ホスティング・Cron3本 | 稼働中。環境変数11個（`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`・`SESSION_SIGNING_SECRET`・`CRON_SECRET`・`RENEWAL_NOTIFY_OVERRIDE_EMAIL`・`GMAIL_USER`・`GMAIL_APP_PASSWORD`・`GOOGLE_SERVICE_ACCOUNT_KEY`・`GOOGLE_DRIVE_ROOT_FOLDER_ID`・`NEXT_PUBLIC_APP_URL`）。コードは`RENEWAL_NOTIFY_ENABLED`も参照するが未設定（未設定時は有効扱い）。規約上の懸念はA-5 |
| Supabase（free） | DB・社内ユーザー認証 | 稼働中。バックアップの懸念はA-6 |
| Gmail（Google Workspace） | メール送信（SMTP・アプリパスワード） | 稼働中 |
| Google Drive（共有ドライブ） | 署名済みPDF・csvMetaバックアップ | 稼働中（サービスアカウント） |
| GitHub | ソース管理・Vercel自動デプロイ | `main`のみ。タグ無し |
| 毎朝のエラーチェック | Coworkのスケジュールタスク`ap-contract-system-error-check` | Cowork側の機能。Claude Code移行後の扱いは要判断 |

**認証・権限の構成**
- 社内：Supabase Auth（メール＋パスワード）。ロール・部門・社内承認者・アカウント管理者・凍結は`staff_roles`が正。DBのRLSとAPI（`lib/apiAuth.ts`）の両方で判定
- 従業員：Supabase Authを使わない独自方式。社員番号＋パスワード（scrypt）、HMAC署名Cookie（7日・スライディング、`SESSION_SIGNING_SECRET`）、世代番号による強制ログアウト
- 部門範囲：担当営業は`current_dept_scope()`（統括部門は`dept_group_scope`の実務部門群）。SSCは社内案件を閲覧不可、管理部の社内案件は社内承認者のみ

---

## 9. Gitで現在地点を固定する手順（伊藤さんが実行）

CLAUDE.mdルール14により、Gitの操作はClaudeではなく伊藤さんのターミナルで行う。

1. VSCodeで`C:\Users\ito\Desktop\ap-contract-system`を開き、メニュー「ターミナル」→「新しいターミナル」
2. 未コミットの変更を確認：`git status`
   - 想定：`CLAUDE.md`・`docs/SYSTEM_DESIGN.md`が「modified」、`docs/COWORK_FINAL_SNAPSHOT_2026-09-24.md`・`CLAUDE_BACKUP.md`が「Untracked」
   - 想定外のファイルがあれば、コミットせずClaudeに内容を共有する
3. ドキュメントをコミット（`CLAUDE_BACKUP.md`を含めない場合は2行目を省略しファイル名を個別指定）
   ```
   git add CLAUDE.md docs/SYSTEM_DESIGN.md docs/COWORK_FINAL_SNAPSHOT_2026-09-24.md
   git commit -m "docs: Cowork最終スナップショット（2026-09-24）"
   git push
   ```
4. タグを作成して送信
   ```
   git tag -a cowork-final-2026-09-24 -m "Cowork版最終地点（Claude Code移行基準点）"
   git push origin cowork-final-2026-09-24
   ```
5. 確認：`git tag -l` に`cowork-final-2026-09-24`が表示されればOK

> ドキュメントのみのコミットのため、Vercelが再デプロイしても画面・動作は変わらない。

---

## 10. Claude Codeへの引き継ぎ

### 10-1. 現在地
申請→承認→署名→保管の中核フローと、更新期限管理・契約状況モニタリング・最低賃金改定対応・アルバイト誓約書・マスタ管理・アカウント管理・FAQ・監視まで、主要機能はすべて本番に載っている。外部品質監査84件（★2〜★5）はすべて対応済み、改善提案32件のうち15件が対応済み（#9・#16は一部のみ）、#13は見送り、残り16件（#1〜#6・#8・#12・#17・#19〜#21・#23・#25・#26・#31）は未着手。**本稼働前**であり、残っているのは「本番切替作業」「セキュリティ・運用基盤の仕上げ」「業務判断待ちの項目」。

### 10-2. Claude Code初回監査で必ず見るべき項目
1. A-1：ステータス遷移をクライアント直接UPDATEに頼っている全箇所の洗い出しと、サーバー側で遷移を守る設計案
2. A-2：アルバイトの扱い。**確定仕様＝アルバイトは通常契約書の対象外、正式ルートはアルバイト誓約書システム（`/pledge/apply`）**。これを前提に次の5点を確認する（修正方針はChatGPTレビューで決定、確認前にコードは変えない）
   - `/apply`でアルバイトを選択できる現在の仕様が、確定仕様と食い違っていないか
   - アルバイトのスタッフが通常契約書フローへ誤って進まない設計になっているか
   - `/pledge/apply`へ自然に誘導できるか
   - staffマスタ上の「アルバイト」区分を、通常契約書システムでどう扱うべきか（STEP1の自動選択・`helpers.ts`等のアルバイト関連ロジックを含む）
   - 既存のアルバイト誓約書システムとの役割分担に矛盾がないか
3. A-3：旧`/sign/[id]`経路と`contracts.sign_auth_code`の扱い
4. B-1：SECURITY DEFINER関数・`cleanup_old_csvmeta`の実行権限
5. B-3：`supabase db pull`等によるスキーマ・RLSのコード化（無料で可能か含め）
6. B-2：Preview環境と本番DBの分離
7. `git status`で未コミット差分とGit管理下の一時ファイル（B-14）の確認
8. `AGENTS.md`の指示どおり、Next.js 16の仕様（`node_modules/next/dist/docs/`）を確認してからコードを書く（`middleware`→`proxy`等）
9. UI/UX・デザイン品質の総点検（CLAUDE.md 0.6基準。ChatGPTレビューと併せて）
10. `SYSTEM_DESIGN.md` 0〜9章の「現在仕様」への書き直し方針（履歴10章と分離）

### 10-3. 絶対に守るルール（要約。詳細はCLAUDE.md）
- **役割**：Claude＝実装担当、ChatGPT＝業務改善責任者／PdM／UI/UX／品質レビュー担当、伊藤さん＝業務オーナー（最終判断）。Claudeは業務判断を確定しない
- **完全無料**が大前提。有料サービスは実装前に伊藤さんへ提示し、無料代替案と併せて判断
- **UI/UX・デザイン品質も完成条件**（Apple・Stripe・Linear・Notion級を意識）
- **実装前に設計方針を提示し、明示的なOKを得てから着手**（ルール16）。見た目の変更はモック付きで確認（ルール12）
- 「推奨・提案」は未確定。伊藤さんが判断したものだけが確定仕様。重要な仕様変更は`SYSTEM_DESIGN.md`と意思決定ログに記録
- 実装コード・実DBを正とし、推測で「ある／ない」を判断しない（ルール3・6・7）
- デプロイ後は自分で本番の実機確認（閲覧だけでなく更新操作も）を行う（ルール13）
- Gitのadd/commit/pushは伊藤さんのターミナルで実行してもらい、毎回3行のコマンドを明示（ルール14）
- CSV・Excel等の個人情報ファイルはGitに入れない（ルール5）
- 画面に内部略称（パターンA等）を出さない（ルール17）、日付は`lib/dateFormat.ts`の3関数に統一（ルール18）、ブラウザ標準のalert/confirmは使わない
- 伊藤さんはプログラミング知識ゼロ。手順は「VSCodeを開く」から省略しない（ルール8）
