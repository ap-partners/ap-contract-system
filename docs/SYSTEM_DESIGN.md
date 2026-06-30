# SYSTEM_DESIGN.md ― APパートナーズ 契約書管理システム 詳細設計書

> **このファイルの位置づけ**
> リポジトリ直下の `CLAUDE.md`（常時オンの薄い層・運用ルールと全体像）から参照される**詳細仕様の本体**です。DBやCSV等を触るときに、必要な章だけ読んでください。運用ルール（1チャット1機能／差分のみ追記／コードを正／監査は節目だけ 等）は `CLAUDE.md` に記載。
>
> 新規チャットへ移行したとき、また新任のシステム担当者が参加したときに、**まず冒頭から読めば「続きから作業を開始できる」**ことを目的とした統合ドキュメントです。
> 「経緯（なぜそうしたか）」と「確定した現在仕様（いま何がどうなっているか）」を分離しています。最新仕様を知りたいだけなら 0〜7章 を、判断の理由を知りたいなら 10章（意思決定ログ）を見てください。
>
> **正本ルール**：実装コード（`page.tsx` ほか本番反映済みコード）を「正」とします。設計書（旧ドキュメントA/B・要件定義書）と実装が食い違う場合は、本書では**実装の挙動を現在仕様として記載**し、差分は第8章の監査表に残します。
>
> 最終更新：2026-06-30 ／ 旧ドキュメントA（設計書 1n3Bv…）・B（マスター 1KCS-…）・要件定義書を統合・再構成。

---

## 0章 クイックスタート（最初にこれだけ読む）

**何のシステムか**
人材派遣会社 APパートナーズ の **担当営業が、雇用契約書・就業条件明示書をWebで発行申請する**システム。StaffExpress（旧運用）の発行・署名管理を廃止し、クライアントCSVを活用してオンライン完結させる。発行→SSC承認→従業員署名→保管までをWeb上で完結し、月額費用¥0で永続運用する。

**いま動いているもの（本番）**
- 申請ウィザード（`/apply`）が本番稼働。担当営業がスタッフを検索→書類種別を選択→各STEPを入力→申請（`contracts`テーブルに保存）まで実装済み。
- スタッフ／部門マスタ、5システム分の個別契約CSVは本番DBに投入済み。
- CSV検索→STEP2/STEP3の自動反映ロジックは実装済み（e-staffingのみ実機確認済み、他3+Staffiaは未テスト）。

**次にやるべきこと（フェーズ別・確定）**
1. **【フェーズ1・最優先】SSCダッシュボード一覧＋SSC確認・承認・差し戻し画面**
2. **【フェーズ2】担当営業ダッシュボードの中身・差し戻し再申請フロー**
3. **【フェーズ3】管理部ダッシュボード**
4. **【フェーズ4】RLSポリシーの厳格化**（全ダッシュボード完成後にまとめて実施）
5. **【フェーズ5】スタッフ向け**（署名画面・マイページ・ログイン認証・署名依頼メール）
→ 全PENDINGは第9章に一元化。

**触る前の鉄則（過去に事故った教訓）**
- テーブル／ファイルを「無いはず」と判断する前に、**必ず実環境（Supabaseのテーブル一覧、GitHubのファイル一覧）を確認**する。過去に「未作成」と思い込んでゼロから設計し、既存テーブルと衝突した事故あり。
- 「マッピングできてる？」等の確認質問には即答せず、**実データ・実コードを再検証してから回答**する。
- キャッシュを疑う前に、**まず実コードが正しいか確認**する。
- CSV・Excel等の機密ファイルは**`.gitignore`が機能しているか毎回確認**（GitHubへの誤アップロード事故が2回発生済み）。

---

## 1章 システム全体マップ

### 1-1. ロール（利用者）
| ロール | 主な役割 | 認証 |
|---|---|---|
| 担当営業 | 契約書の発行申請、締結方法の指定、更新確認回答 | Supabase Auth（`user_metadata.role === '担当営業'`）。`/login`経由 |
| SSC（管理部の確認担当） | 申請内容の確認・承認／差し戻し（自動チェック結果を参照） | Supabase Auth（ロール別） |
| 管理部 | CSV取込・マスタ更新、更新期限管理、署名済み書類管理、アラート日数マスタ管理 | Supabase Auth（ロール別） |
| 従業員（スタッフ） | マイページ閲覧、契約書の手書き署名 | 社員番号＋生年月日（一次）＋メール確認コード（二次）。アプリ不要・ブラウザ完結 |

> テストユーザー：`sales-test@appart.co.jp` / `ssc-test@appart.co.jp` / `admin-test@appart.co.jp`（全て `Test1234!`）。管理者ユーザーID：`258c9249-4c5f-4f35-855c-317fcdbe11e7`。

### 1-2. 画面一覧
| 画面 | パス | 状態 |
|---|---|---|
| 申請ウィザード | `/apply` | **実装済み・本番稼働** |
| ログイン | `/login` | **実装済み**（Supabase Auth・ロール別ダッシュボードへ振り分け） |
| 担当営業ダッシュボード | `/dashboard/sales` | 骨組みのみ（中身未実装） |
| SSCダッシュボード | `/dashboard/ssc` | 骨組みのみ（中身未実装） |
| 管理部ダッシュボード | `/dashboard/admin` | 骨組みのみ（中身未実装） |
| SSC確認画面 | `/dashboard/ssc/contracts/[id]` | 未実装 |
| ヘルプ | `/help/step1`〜`step8` | 未実装 |
| スタッフ署名画面 | `/sign/[id]` | 未実装 |
| スタッフマイページ | `/staff/mypage` | 未実装 |
| アルバイト誓約書システム | （別システム） | 未実装 |

### 1-3. データベース（Supabase）テーブル一覧
| テーブル | 用途 | 状態 |
|---|---|---|
| `staff` | スタッフマスタ（StaffExpress由来、1873件中1748件投入） | 作成済み・投入済み |
| `department_master` | 部門マスタ（51件） | 作成済み・投入済み |
| `master_imports` | スタッフ／部門マスタの取込履歴 | 作成済み |
| `csv_imports` | 個別契約CSV（4システム）の取込履歴 | 作成済み |
| `csv_raw_data` | 個別契約CSVの生データ（JSONB＋検索用カラム） | 作成済み・全件投入済み |
| `contracts` | 申請データ本体 | **実装で使用中（page.tsxがinsert）。※旧設計書では「未実装」扱いだった ⇒ 第8章参照** |
| `company_master` | 派遣元担当者・苦情処理申出先（派遣元）のkey-value設定 | **実装で使用中。※旧設計書に記載なし ⇒ 第8章参照** |

### 1-4. 外部連携（CSVソース＝5ファイル）
e-staffing / HRstation / winworks / Staffia(KEF00103) / Staffia(KEF00104)。全て cp932 エンコード。詳細は第5章。

### 1-5. 技術構成
- Next.js（App Router）/ TypeScript / Tailwind CSS / Supabase / Vercel（自動デプロイ）
- 本番 Node.js v24、ローカルは Next.js 16.2.7（Turbopack）
- 本番URL：https://ap-contract-system.vercel.app/ （申請画面は `/apply`）
- GitHub：https://github.com/ap-partners/ap-contract-system
- Supabase：https://argpiiznuzxmmqraynfo.supabase.co （東京リージョン）
- ローカル：`C:\Users\ito\Desktop\ap-contract-system`
- **月額費用¥0**（GSuiteは会社契約済みのため署名PDF保管も追加費用ゼロ）

---

## 2章 環境・運用手順（プログラミング知識ゼロ前提）

> ユーザー（伊藤さん）はプログラミング知識ゼロ。手順は「VSCodeを開く」から省略せず全手順を明記すること。

**ローカル確認手順**
1. VSCodeでフォルダ `C:\Users\ito\Desktop\ap-contract-system` を開く
2. ターミナル →「新しいターミナル」
3. `npm run dev`
4. ブラウザで `http://localhost:3000/apply`（ポート使用中なら3001等に自動切替）
   - ※古いサーバーがPIDで残っていると新ポートに切り替わるだけで表示されないことがある。`Ctrl+C` で一度完全終了してから再起動が確実。

**デプロイ手順**
1. `page.tsx` を `C:\Users\ito\Desktop\ap-contract-system\app\apply\page.tsx` に上書き保存
2. VSCodeターミナルで `cd`（プロジェクト直下）→ `git add .` → `git commit -m "..."` → `git push`
3. Vercelが自動デプロイ（1〜2分）
4. 確認：https://vercel.com → プロジェクト「ap-contract-system」→ Deployments → 最新が緑「Ready」
5. 本番確認時は `Ctrl+Shift+R` でキャッシュクリア。**ただしキャッシュを疑う前に必ず実コードを再確認**。

**役割分担**：業務的な正しさ（社労士的判断）は伊藤さんが判断、システム構造はClaudeが判断。

---

## 3章 データベース設計（実装準拠）

### 3-1. staff（スタッフマスタ）
```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number TEXT NOT NULL UNIQUE,      -- 社員番号（半角数字6桁、6桁未満は前に0を付与）
  name TEXT NOT NULL,                        -- 氏名（漢字）
  name_kana TEXT,                            -- 氏名（カナ）
  dept_no INTEGER REFERENCES department_master(dept_no), -- 部門NO（部門名は表示時に結合取得）
  contract_type TEXT CHECK (contract_type IN ('有期契約','無期契約','正社員','アルバイト')),
  hired_at DATE,                             -- 入社日
  birthday DATE,                             -- 生年月日（スタッフログイン用）
  retired_at DATE,                           -- 退職年月日
  retirement_scheduled_at DATE,              -- 退職予定日（退職届未回収ケース用）
  email TEXT,                                -- メールアドレス（※テスト中はito@appart.co.jpに固定）
  crew_code TEXT,                            -- winworksの10桁スタッフコード。対象外は空欄
  password_hash TEXT,
  is_initial_login BOOLEAN NOT NULL DEFAULT TRUE,
  work_place TEXT CHECK (work_place IN ('現場','社内')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS：認証ユーザーのみ参照可。INDEX：employee_number / name / name_kana / crew_code / dept_no
```
- **dept_noは「部門名(文字列)」ではなく部門マスタ参照に変更済み**（部門名変更に強くするため。表示時に `department_master` と結合）。
- **退職者除外ルール**：`retired_at` または `retirement_scheduled_at` が**検索した瞬間の日付**より前のスタッフは検索結果から除外。実装は **Supabaseクエリではなくクライアント側フィルタ**（PostgRESTの `.or()` 複数チェーンの信頼性懸念を回避するため）。

### 3-2. department_master（部門マスタ）
`id, dept_no(UNIQUE), dept_name, created_at`。項目は**部門NO・部門名1の2項目のみ**。51件投入済み。

### 3-3. master_imports（マスタ取込履歴）
`id, master_type CHECK IN('staff','department'), file_name, total_rows, new_rows, updated_rows, skipped_rows, error_rows, uploaded_by, uploaded_at`。個別契約CSV履歴（`csv_imports`）とは別テーブル。

### 3-4. csv_imports（個別契約CSV取込履歴・4システム）
`id, system_type CHECK IN('e-staffing','HRstation','winworks','Staffia'), file_name, total_rows, new_rows, skipped_rows, pending_rows, error_rows, uploaded_by, uploaded_at`。

### 3-5. csv_raw_data（個別契約CSV生データ）
検索用カラムのみマッピングし、詳細はJSONBに全列保存する設計。
- 主要カラム：`id, import_id, system_type, unique_key, staff_code, client_name, work_location, work_address, work_tel, dispatch_start, dispatch_end, raw_data(JSONB), is_overwrite_pending`
- STEP2/3の詳細項目は検索結果選択時に `raw_data` から `extractCsvFields` で取り出す。

### 3-6. contracts（申請データ本体）※2026-06-30 Supabase実テーブル定義より正式化

| カラム | 型 | NULL | デフォルト | 用途 |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | 主キー |
| `staff_id` | uuid | NO | — | 対象スタッフ（`staff.id`） |
| `pattern` | text | NO | — | 'A' / 'B' / 'C' |
| `contract_type` | text | NO | — | 有期契約／無期契約／正社員／アルバイト |
| `document_type` | text | NO | — | 雇用契約書／就業条件明示書／雇用契約書 兼 就業条件明示書 |
| `work_place` | text | NO | — | 現場／社内 |
| `status` | text | NO | `'申請中'` | 申請中／SSC承認済み／差し戻し中／署名待ち／署名済み／完了／取り下げ |
| `closing_pattern` | text | YES | null | パターンA・Cのみ。締結方法。B時はnull |
| `input_data` | jsonb | NO | `'{}'` | `{ staff, fields, csvMeta }` 全入力スナップショット |
| `csv_raw_data_id` | uuid | YES | null | CSV利用時、選択した `csv_raw_data.id`（配列indexではなく実ID） |
| `rejection_reason` | text | YES | null | 差し戻し理由 |
| `rejected_by` | uuid | YES | null | 差し戻したSSCのユーザーID |
| `rejected_at` | timestamptz | YES | null | 差し戻し日時 |
| `signature_url` | text | YES | null | スタッフ署名用URL |
| `signature_url_sent_at` | timestamptz | YES | null | 署名依頼送信日時 |
| `signed_at` | timestamptz | YES | null | 署名完了日時 |
| `auto_check_results` | jsonb | YES | `'[]'` | 自動チェック結果（現状は空配列。自動チェック機能は別タスク） |
| `warning_confirmations` | jsonb | YES | `'[]'` | 上長承認が必要な警告への確認状況 |
| `created_by` | uuid | NO | — | 申請した担当営業のユーザーID |
| `approved_by` | uuid | YES | null | 承認したSSCのユーザーID |
| `approved_at` | timestamptz | YES | null | 承認日時 |
| `created_at` | timestamptz | NO | now() | 申請日時 |
| `updated_at` | timestamptz | NO | now() | 最終更新日時 |

> RLS：現在「認証ユーザーなら誰でも全件読み書き可」を意図的に維持中。
> ロールごとの厳格化はSSC確認画面・管理部ダッシュボード完成後にまとめて実施する方針。

### 3-7. company_master（派遣元設定・key-value）※2026-06-30 Supabase実テーブル定義より正式化

| カラム | 型 | NULL | デフォルト | 用途 |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | 主キー |
| `key` | text | NO | — | 設定キー名 |
| `value` | text | NO | — | 設定値 |

参照キー（`loadCompanyMaster()`で読み込む8キー）：
`dispatch_manager_dept` / `dispatch_manager_role` / `dispatch_manager_name` / `dispatch_manager_tel`
`complaint_dept` / `complaint_role` / `complaint_name` / `complaint_tel`

---

## 4章 申請ウィザード仕様（実装準拠）

### 4-1. 書類種別（パターン）とSTEP構成 ★旧設計書から訂正
書類種別は `work_place`（現場／社内）で選べる範囲が変わる。

| 就業場所 | 選べる書類 | パターン | STEP数 |
|---|---|---|---|
| 社内 | 雇用契約書のみ | A | 6STEP |
| 現場 | 雇用契約書 | A | 6STEP |
| 現場 | 就業条件明示書 | B | 6STEP（給与記載なし） |
| 現場 | 雇用契約書 兼 就業条件明示書 | C | 8STEP |

> **重要**：STEP数は固定8ではなく**パターン依存**。旧ドキュメントAは「STEP1〜8」と一律記載、要件定義書は「5STEP」と記載していたが、いずれも実装と不一致（第8章）。実装の配列定義は以下：
> - `STEPS_A = [基本情報, 就業先情報, 期間・労働条件, 契約条件, 給与・保険, 最終確認]`（6）
> - `STEPS_B = [基本情報, 就業先情報, 派遣先担当者, 派遣元担当者, 期間・労働条件, 最終確認]`（6）
> - `STEPS_C = [基本情報, 就業先情報, 派遣先担当者, 派遣元担当者, 期間・労働条件, 契約条件, 給与・保険, 最終確認]`（8）

### 4-2. 各STEPの中身
- **基本情報**：対象スタッフの検索・選択、書類種別の選択。
- **就業先情報（STEP2）**：就業場所・業務内容・労働時間など。CSVデータからの自動入力に対応。
- **派遣先担当者**：指揮命令者・派遣先責任者・苦情処理申出先等（パターンB・Cのみ）。
- **派遣元担当者**：`company_master` から初期表示（パターンB・Cのみ）。
- **期間・労働条件**：雇用期間・派遣期間・残業の有無。抵触日（事業所単位）→抵触日（組織単位）→組織単位 の順で配置。
- **契約条件**：締結パターン・備考文言（パターンA・Cのみ）。
- **給与・保険**：（パターンA・Cのみ）。
- **最終確認（STEP8相当）**：全STEP内容を折りたたみ表示。差し戻しバナー、同内容警告（2段階クリック）、申請ボタン。

### 4-3. 確定済みの実装挙動（COMPLETED）
- **STEP移動時に自動保存**＋下書き保存ボタンあり。ブラウザバックはSTEPを戻るのみ（データ保持）。
- **備考文言**：`getRemarksText(pattern, contractType, bonusType)` で自動決定。`needsBonusSelection()` で **正社員×パターンA/C のみ「賞与あり/なし」2択UI**を表示（初期値未選択・必須バリデーション）。
- **日付前後チェック**（`isDateBefore`・onChangeリアルタイム）：抵触日（事業所単位・組織単位）＜派遣期間終了日 → エラー。契約条件適用開始日＜派遣期間開始日 → エラー。
  - ※抵触日チェックは当初「今日基準」だったが**「派遣期間終了日基準」に一本化**（`isDateBefore`）。
- **所定労働時間のゼロ埋め**：`padTwoDigits()`（onBlurで「9」→「09」）。
- **全角数字対応**：`toHalfWidthDigits()`。
- **CSVバッジ／必須バッジの位置統一**：ラベル行とCSVバッジを常に縦分離（`FormRow`＋個別8箇所を修正）。
- **バグ修正一式**（外部レビュー対応・修正済み）：`employee_number`統一（旧`staff_code`誤り）、`name?.[0]||'?'`でnullクラッシュ対策、Tooltipのstyle重複解消、抵触日判定を `isConflictDateExempt`（無期契約・正社員は対象外）に統一、書類種別変更時のstateリセット、ほか。

### 4-4. 締結（CLOSING_PATTERNS）
締結方法はパターンA・Cのみ指定。`closing_pattern` に保存。例：`auto`（指定しない＝SSC承認後にシステムが従業員へ確認用URLを自動送信）、対面 ほか。

---

## 5章 CSV連携仕様（実装準拠・実データ検証済み）

### 5-1. 対応5システム
| システム | ファイル | 列数 | 件数 |
|---|---|---|---|
| e-staffing | e-staffing.csv | 222列 | 308件 |
| HRstation | HR_STATION.csv | 191列 | 46件 |
| winworks | winworks.csv | 73列 | 395件 |
| Staffia(KEF00103) | Staffia1.csv | 835列 | 131件 |
| Staffia(KEF00104) | Staffia2.csv | 28列 | 141件 |

全て cp932。本番 `csv_raw_data` に全件投入済み。Staffiaは KEF00103＝契約詳細、KEF00104＝個人別の契約期間、の2ファイルに分かれる。

### 5-2. 検索キー対応表
STEP2の検索は「使用システム＋派遣開始日＋スタッフ社員番号」。
| システム | 使用する値 |
|---|---|
| e-staffing | `staff.employee_number` をそのまま |
| HRstation | 社員番号の前に `F3810` を付けて比較（CSV側がF3810+6桁形式） |
| winworks | `staff.crew_code`（10桁）と照合（CSVの`staff_code`は使わない） |
| Staffia | `staff.employee_number` をそのまま（雇用元管理コードと一致） |
- 派遣開始日は**範囲内検索**（`dispatch_start ≦ 検索日 ≦ dispatch_end`、イコール含む）。
- **Staffia 2段階検索**：KEF00104を `staff_code` で検索 → ヒット行の `raw_data` から「個別契約書番号」取得 → それを `unique_key` としてKEF00103を再検索 → 両 `raw_data` を合成して `extractCsvFields` に渡す。

### 5-3. 項目マッピング（確定）
| 項目 | e-staffing | HRstation | winworks | Staffia(KEF00103) |
|---|---|---|---|---|
| 就業場所名 | 就業先企業名＋就業先事業所（半角スペース結合） | 就業先事業所名 | 名称＋店舗名 結合 | 派遣先会社名＋派遣先事業部名 結合 |
| 就業場所住所 | 就業先住所 | 就業先住所1+2 | 派遣先情報所在地 | 就業先住所 |
| 電話番号 | ✕ | ✕ | あり | あり |
| 業務内容 | あり | あり | あり | 業務内容1〜21を半角スペース連結（改行なし） |
| 始業・終業時刻 | コロン区切り `09:00` | 4桁数値 `945→09:45` | テキスト埋め込み（正規表現抽出） | コロン区切り（ゼロ埋めなし）`8:45` |
| 業務に伴う責任の程度 | ✕ | ✕ | 「諸措置」列末尾を正規表現抽出（`責任の程度：◯◯`、役職無し→「無」） | 専用列あり |
| 指揮命令者 | あり | あり | 氏名・役職は専用列、部署・電話は就業場所情報を代用 | 1セット目のみ使用 |
| 派遣先責任者 | あり | あり | あり | 1セット目のみ使用 |
| 苦情処理申出先（派遣先・派遣元） | あり | あり | あり | あり |
| 福利厚生施設の利用等 | 0/1フラグ＋自由記述→`buildWelfareTextFromEstaffing()` | 0/1フラグ＋その他→`buildWelfareTextFromHRstation()` | 長文そのまま | その他福利厚生等 そのまま |
| 変形労働時間制 | ✕ | ✕ | ✕ | 「無/有」そのまま |
| 所定労働時間外労働 | 0/1→`numToYesNo()`変換 | ✕ | 長文のため反映しない | 「無/有」そのまま |
| 派遣期間 | 契約開始日/終了日 | 契約開始日/終了日 | 派遣期間 開始日/終了日 | 派遣開始日/終了日（KEF00104側） |
| 紛争防止措置 | （デフォルト維持） | （デフォルト維持） | **自動反映しない（デフォルト文言維持）** | あり |

- 始業終業の形式差は `normalizeTimeStr` で統一。複数パターン時は `calcEarliestLatest()` で始業＝最早・終業＝最遅・シフト制(`isShift`)を自動設定（HRstationに複数パターン実例4件確認済み）。

### 5-4. 取込スクリプト
- `import-csv.js`：5種対応（e-staffing/HRstation/winworks/Staffia103/Staffia104）。cp932デコード、Papa.parse、unique_key生成（Staffia104のみ複合キー：個別契約書番号+氏名コード）。
- `import-master.js`：スタッフ・部門マスタ用。dept_no方式・頭文字8/9除外・メール固定対応済み。

---

## 6章 スタッフマスタ取込仕様（StaffExpressエクスポート）

> 管理部ダッシュボードに常時参照できる形（アコーディオン）で表示予定。注記「⚠️項目の順番が違うと正しく取り込まれません」付き。

### 6-1. 項目順序（1〜15・確定）
| # | StaffExpress項目 | 取込先 | 変換 |
|---|---|---|---|
| 1 | スタッフNO | employee_number | 6桁未満は前に0付与 |
| 2 | スタッフ氏名 | name | そのまま |
| 3 | スタッフカナ | name_kana | そのまま |
| 4 | 所属部門 | dept_no | 部門マスタの部門NOをそのまま格納（変換しない） |
| 5 | 雇用形態 | contract_type | 区分マスタNOから変換（下表） |
| 6 | 性別区分 | 対象外 | 使用しない |
| 7 | 入社年月日 | hired_at | そのまま |
| 8 | 生年月日 | birthday | そのまま |
| 9 | 退職年月日 | retired_at | そのまま |
| 10 | 退職予定日 | retirement_scheduled_at | そのまま |
| 11〜13 | 現在住所1〜3 | 対象外 | 使用しない |
| 14 | メールアドレス１ | email | **テスト中は ito@appart.co.jp に固定（本番前に解除要・コード内コメントあり）** |
| 15 | クルーコード | crew_code | winworksの10桁。対象外は空欄 |

### 6-2. 雇用形態 区分マスタNO → contract_type
0001/0008→正社員、0002/0009→有期契約、0003/0010→無期契約、0004→アルバイト、0005外注・0006役員・0007ログイン専用→**インポート対象外**、-1→NULL（雇用形態不明）。

### 6-3. 追加除外ルール
社員番号の**頭文字が「8」（ログイン専用）または「9」（社外・外注）**は、雇用形態コードに関わらず頭文字だけで判定し**対象外**（実データで125件該当、再インポート済み）。

### 6-4. アルバイト区分の特別ルール
発行帳票は**雇用契約書（パターンA）のみ**。試用期間不要（有期契約と同扱い）。アルバイト誓約書システム（別システム）の対象にもなる。※STEP1のUIに「アルバイト」選択肢追加は**未実装**。

---

## 7章 帳票・電子署名・通知・監視（要件定義準拠／未実装中心）

### 7-1. 帳票
雇用契約書／就業条件明示書／兼用版の3種。有期／無期、就業先AP の差分あり。兼用版のみ追加項目（契約更新の有無・基準4項目＝固定文言、30日前通知＝固定文言、更新上限＝デフォルト「無」営業修正可、無期転換申込権＝固定文言 等）。テンプレートExcelはフォルダ内に各種あり（雇用契約書／就業条件明示書／兼用、有期・無期・AP版、アルバイト誓約書）。

### 7-2. 電子署名（要件）
- **手書きサイン方式**：従業員がスマホ/タブレットに直筆サインを書き、PDF署名欄に埋め込み（紙と同じ見た目）。
- 本人確認：一次＝社員番号＋生年月日、二次＝署名ボタン押下時にメールへ確認コード。
- 証跡管理：厚労省の電子化要件（本人確認＋記録）を満たす設計。保管はGSuite（追加費用ゼロ）。

### 7-3. 締結の3パターン・更新フロー
- 締結：①SSC承認後システムが自動送付（指定しない）②対面 ほか。
- 更新：パターンA＝CSVシステムあり（派遣＋e-staffing/winworks/HRstation/Staffia使用）、パターンB＝CSVなし（業務委託、またはCSV未使用の派遣）。CSVシステム設定から自動判定。一括処理は最大400件、キュー方式で1件ずつバックグラウンド処理、完了分から「送付済み」、全件完了後に管理部へ通知。

### 7-4. 通知・監視（要件）
- 全メール本文に**個人情報・契約内容・氏名を含めない**（件名＋システムURLのみ。WEB上でのみ確認）。
- 各種アラート送信タイミングは「アラート日数マスタ」で管理部が随時変更可能。
- 見落とし防止：ダッシュボード未対応バッジ／ログイン時の強制確認モーダル／エスカレーション（マネージャー→管理部）。既読・対応ログを管理部が閲覧可能。

### 7-5. 入力内容自動チェック（要件・未実装）
申請内容をシステムが自動チェックし、SSC確認画面に警告表示。警告レベル分け、金額異常値検出、最低賃金チェック（部門×雇用区分単位、月給者は雇用区分別の月所定労働時間で時給換算）、就業規則整合チェック。`contracts.auto_check_results` は現状空配列で、本機能実装時に格納予定。

---

## 8章 設計書 vs 実装コード 差分監査表（実装を正とする）

| # | 項目 | 旧ドキュメントの記述 | 実装（正） | 対応方針 |
|---|---|---|---|---|
| 1 | STEP数 | 要件定義書「5STEP」、ドキュメントA「STEP1〜8」一律 | パターン依存（A/B=6、C=8） | 本書4-1を正とする。旧記述は破棄 |
| 2 | `contracts`テーブル | ドキュメントB「次に実施予定（未実装）」 | `page.tsx`がinsert済み・稼働中 | 本書3-6に実装準拠で記載。正式DDL文書化をTODO化（9章） |
| 3 | `company_master`テーブル | A/Bともに**記載なし** | `loadCompanyMaster()`で使用中 | 本書3-7に追加。正式DDL・全キー定義をTODO化（9章） |
| 4 | スタッフ署名画面/ログイン | 「従業員機能」として要件あり | `/login`はリダイレクト先参照のみ、署名画面未実装 | 未実装として9章に集約 |
| 5 | 抵触日チェック基準 | 当初「今日基準」記述あり | 「派遣期間終了日基準」に一本化（`isDateBefore`） | 本書4-3を正とする |
| 6 | 申請者ロール | 要件は「従業員機能」中心の記述 | `/apply`は`role==='担当営業'`のみ許可 | 本書1-1を正とする |
| 7 | ドキュメント自体の構造 | 経緯（時系列）と現在仕様が混在 | — | 本書で「確定仕様(0-7章)」と「意思決定ログ(10章)」を分離 |

> ⚠️ 監査で確認した範囲は構造・テーブル・STEP・主要ロジック。**`contracts`/`company_master`の正式DDLは未取得**（Supabase実テーブル定義の確認が必要）。次回、Supabaseのテーブル定義をエクスポートして3-6/3-7を正式化すること。

---

## 9章 PENDING・未確定事項（一元TODO）

> 旧・要件定義書「14章」、ドキュメントB「PENDING優先順」「既知の未確定事項」、要件定義の未実装を統合。

### 9-1. 実装PENDING（優先順）
1. **【最優先】4システム動作確認テスト**：e-staffing済。HRstation・winworks・Staffia 未テスト。新項目（指揮命令者・福利厚生・変形労働時間制・派遣期間、Staffia 2段階検索）含めて実機確認。各システムで実際にヒットするテストデータ（社員番号×派遣開始日）を探す必要あり。
2. **派遣元情報（STEP4：mgr_*・cmp_*）のCSV優先表示**：CSVにあれば優先（CSV反映バッジ）、なければ`company_master`反映（マスタ反映バッジ）、「手動入力」選択時は最初からマスタ反映。※派遣先側（CSVバッジのみ）と仕組みが異なり条件分岐が必要なため別タスク化で合意済み。
3. **CSV反映項目を担当営業が修正した場合の特別対応**：「個別契約書の情報が修正されています。管理部へ個別に修正依頼を…」注意文＋チェックボックス（未チェックで申請不可）。対象はCSV反映バッジが付く全項目（STEP2・3、福利厚生・変形労働時間制含む）。STEP8でSSC/管理部に「元の値→今の値」を差分表示（STEP8のみでよい）。
4. **STEP1 UIに「アルバイト」選択肢追加**（contract_type）。
5. CSVバッジの将来拡張：選択システムに該当項目がある場合のみバッジ表示。別タスク。
6. **管理部ダッシュボード**：CSVインポート、スタッフマスタ項目一覧（1〜15）アコーディオン（順序注記付き）、取込結果確認、更新期限管理、署名済み書類管理、アラート日数マスタ。
7. その他画面：SSC通知機能、ヘルプ（/help/step1-8）、各ダッシュボード（/dashboard, /ssc, /admin）、ログイン画面、スタッフ署名画面、アルバイト誓約書システム。
8. **自動チェック機能**：金額異常値、最低賃金（部門×雇用区分）、就業規則整合 → `contracts.auto_check_results`へ格納。

### 9-2. 既知の未確定事項（旧9-3）
- `staff.work_place`：スタッフマスタに対応項目がなく取込時NULL。運用で設定する方針だが要検討。
- winworks「諸措置」列：苦情処理・中途解除・紛争防止・責任程度が1列混在。責任程度のみ抽出成功、紛争防止措置は分離せず反映しない方針で確定。
- Staffia KEF00104側項目（派遣期間等）の2段階検索取得は実装済みだが**動作確認未実施**（9-1の1で確認）。

---

## 10章 意思決定ログ（経緯・追記専用）

> 「なぜそうなったか」を時系列で残す領域。確定仕様は0〜7章を参照。新しい決定は末尾に追記。

- **[DECISION] dept_name→dept_no方式へ変更**：当初staffに部門名(文字列)を持たせたが「将来の部門名変更に弱い」との指摘で、部門マスタ参照＋表示時結合に変更。全レコード書換え不要に。
- **[DECISION] staff社員番号の列名は `employee_number` に確定**（`staff_code`は誤り）。
- **[事故・教訓] 既存staffテーブルの見落とし**：「未作成」と思い込み新規設計→既存（仮設計）テーブルとCREATEが衝突。以後、「無いはず」と判断する前に実環境を必ず確認。
- **[事故・教訓] 機密ファイルのGit誤アップロード2回**：1回目はgit filter-repoで履歴削除、2回目は.gitignore漏れで再発→全文確認＋git rm --cached。以後.gitignoreの機能を都度確認。
- **[DECISION] e-staffing就業場所名を企業名＋事業所の結合に変更**：当初事業所単独→ユーザー指示で結合。DB再インポート済み。
- **[DECISION] 派遣開始日検索を完全一致→範囲内検索に変更**。
- **[DECISION] Staffia 2段階検索**で2ファイル構造を解決（5-2参照）。
- **[DECISION] 抵触日チェックを「今日基準」廃止→「派遣期間終了日基準」一本化**。
- **[DECISION] テスト中の誤送信防止でメールをito@appart.co.jpに固定**（本番前に解除要）。
- **[DECISION] master_importsをcsv_importsと分離**（マスタ取込履歴の独立管理）。
- **[DECISION] 派遣元情報のCSV反映は別タスク化**（派遣先と仕組みが異なるため）。
- **[教訓] CSVマッピングは推測せず必ずpandas等で実データ検証**（winworks2列結合、責任程度の正規表現抽出、Staffia2ファイル分割等は実データ確認で初めて判明）。
- **[DECISION] contractsテーブルRLS**：SSC確認画面・管理部ダッシュボード完成後にまとめて厳格化。それまでは「認証ユーザーなら誰でも全件読み書き可」を意図的に維持（テスト中の時期尚早な厳格化は混乱を招くため）。
- **[DECISION] フェーズ設計確定**：①SSCダッシュボード・確認画面 ②担当営業ダッシュボード ③管理部ダッシュボード ④RLS厳格化 ⑤スタッフ向け（署名・マイページ・ログイン）の順で実装。
- **[DECISION] スタッフ認証方式**：Supabase Authは使わず独自認証（`staff.password_hash` / `is_initial_login`）。初回ログイン＝社員番号＋生年月日、2回目以降＝社員番号＋パスワード。メール全件確認済み（1748件全員あり）、テスト中は`ito@appart.co.jp`に固定。
- **[完了] SYSTEM_DESIGN.md 3-6・3-7正式化**：Supabase実テーブル定義より取得・確定（2026-06-30）。
- **[完了] ログイン画面・各ダッシュボード骨組み**：`/login`・`/dashboard/sales`・`/dashboard/ssc`・`/dashboard/admin`の認証チェック・ログアウト・ロール別振り分けが実装済み。
- **[完了] 申請保存処理**：`contracts`テーブルへのinsert（`input_data`={staff, fields, csvMeta}の3カテゴリ構造、`warning_confirmations`は専用カラム、`csv_raw_data_id`は配列indexではなく実ID）。
- **[完了] 申請確認モーダル**：申請ボタン押下時に対象スタッフ・帳票種類・雇用区分を表示するモーダルを挟む。
- **[完了] 未入力強調機能**：CSVモード時、必須項目が空欄の行を赤く強調し吹き出し表示。派遣元責任者・苦情処理申出先（派遣元）のみCSV・手入力問わず常時強調（誤削除対応）。
- **[完了] 雇用期間・派遣期間コピーボタン**：pattern=C時のみ表示。
- **[DECISION] SYSTEM_DESIGN.md運用ルール**：1チャット＝1機能で短く区切る。DB・CSV・既存仕様に関わる作業前に該当章を読み直す。仕様確定後は即時差分追記（全文再生成しない）。

*本書は実装コードを正とする統合版です。新規チャット移行時は本書全体をコンテキストとして渡し、作業後の新しい決定・仕様は 0〜7章（確定仕様）と10章（経緯）に追記してください。*
