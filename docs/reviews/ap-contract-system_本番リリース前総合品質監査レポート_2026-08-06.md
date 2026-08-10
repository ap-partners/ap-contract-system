# ap-contract-system 本番リリース前 総合品質監査レポート

**監査日**：2026年08月06日
**対象**：`C:\Users\ito\Desktop\ap-contract-system`（Next.js 16.2.7 / React 19 / TypeScript / Tailwind v4）
**対象DB**：Supabase プロジェクト `ap-contract-system`（`argpiiznuzxmmqraynfo` / ap-northeast-1 / PostgreSQL 17.6）
**監査観点**：QA・ソフトウェアアーキテクチャ・SRE・DBA・セキュリティ・プロダクト品質

---

## 0. エグゼクティブサマリ

### リリース判定

# 🔴 **公開禁止**（現状のままでの本番公開は不可）

理由は3点です。

1. **DBの行レベルセキュリティ（RLS）に、全従業員1,801名の個人情報とパスワードハッシュを、社内アカウント1つで全件読み書きできる穴が開いています**（指摘 C-01）。これはアプリの画面を経由せず、ブラウザのコンソールから数行で実行できます。個人情報保護法上の「安全管理措置」を満たしていません。

2. **スタッフマスタ取込を1回実行するだけで、全従業員のメールアドレスが `ito@appart.co.jp` に上書きされます**（指摘 A-01）。テスト用のハードコードがコードに残ったままで、本番切替の順序を1つ間違えると全社の署名フローが停止します。

3. **法的文書（アルバイト誓約書）で、就業日の最終行がPDFから無言で消えます**（指摘 A-03）。誰も気づけない形で、記載漏れのある契約書が原本として保存されます。

これに加え、**署名依頼メールの再送手段が存在しない**（指摘 A-05）、**個別承認時のメール送信失敗が「送信しました」と表示される**（指摘 A-06）といった、業務が静かに止まる欠陥が複数あります。数十人が日常的に使う運用には耐えません。

### 集計

| 重要度 | 件数 | 内容 |
|---|---|---|
| ★★★★★ 致命的 | 8件 | 個人情報漏えい・データ破壊・法的文書の欠落・業務の恒久停止 |
| ★★★★☆ 重大 | 17件 | 権限の穴・サイレント障害・回復不能な状態遷移 |
| ★★★☆☆ 中 | 26件 | 誤操作誘発・通知漏れ・性能・UX |
| ★★☆☆☆ 軽微 | 21件 | 表記ゆれ・エラーハンドリング・保守性 |
| ★☆☆☆☆ 改善 | 12件 | 体裁・整理 |
| **合計** | **84件** | |

### 最短リリースまでの見積り

| フェーズ | 対象 | 工数目安 |
|---|---|---|
| Phase 0（公開ブロッカー） | ★5 全8件 | **4〜6人日** |
| Phase 1（重大） | ★4 全17件 | 8〜12人日 |
| Phase 2（中） | ★3 の主要15件 | 10〜15人日 |
| 回帰テスト・実機確認 | 全フロー×5ロール | 3〜5人日 |
| **合計** | | **25〜38人日** |

Phase 0 のみ完了させれば「限定リリース（1部門・10名程度でのパイロット）」は可能ですが、**全社展開はPhase 1完了が最低条件**です。

---

## 1. 監査範囲と手法

### 実施したこと

| 対象 | 範囲 | 手法 |
|---|---|---|
| フロントエンド | `app/` 配下 全66ファイル / 約22,000行 | 全文精読 |
| APIルート | `app/api/**` 全33ルート | 全文精読・認証認可の追跡 |
| 共通ライブラリ | `lib/` 全35ファイル / 約9,000行 | 全文精読 |
| PDF生成 | `lib/pdf/**` 全8ファイル | 全文精読 |
| メール | `lib/mail.ts` 1,545行 | 全文精読 |
| CSV取込 | `csv-import` 系＋`scripts/` | 全文精読・実CSVサンプル参照 |
| Supabase DB | 21テーブル / 44 RLSポリシー / 15 DB関数 | **本番DBに直接接続して実査** |
| セキュリティ | Supabase Security Advisor / Performance Advisor | 実行 |
| 設計書 | `CLAUDE.md`（195KB）/ `docs/SYSTEM_DESIGN.md`（1MB）/ 過去レビュー | 突合 |

### 実施できなかったこと（明記）

- **実機でのブラウザ操作確認**（レスポンシブの実描画、印刷プレビュー、実際のメール受信）。本レポートのUI指摘はコード読解に基づく静的分析です。
- **assets/フォントファイルの実体検証**（グリフ被覆の指摘 D-04 は静的推定）。
- **`.env.local` / Vercel環境変数の実値**（秘匿情報のため内容は参照していません。設定の有無のみコードから推定）。
- **負荷試験**（1,000件/10,000件の実測。性能指摘はクエリ構造とアルゴリズムからの理論値）。

---

## 2. ★★★★★ 致命的（公開ブロッカー）

---

### C-01 ★★★★★ 社内アカウント1つで、全従業員1,801名の個人情報とパスワードハッシュを全件読み書き・削除できる

| 項目 | 内容 |
|---|---|
| **分類** | Supabase / セキュリティ / 権限昇格 |
| **場所** | Supabase RLSポリシー `staff` テーブル「認証ユーザーのみ参照可」 |

**問題内容**

`staff` テーブルのRLSポリシーが以下になっています（本番DBで実査）。

```
tablename : staff
policyname: 認証ユーザーのみ参照可
cmd       : ALL          ← SELECT だけでなく INSERT/UPDATE/DELETE を含む
roles     : {public}
using     : (auth.role() = 'authenticated')
with_check: （なし → USING式が流用される）
```

`cmd = ALL` かつ条件が「ログインしていること」だけなので、**ロール（担当営業／SSC／管理部）も部門も一切問わず、ログイン済みの全アカウントが `staff` テーブル1,801行に対してフルCRUDを実行できます。**

`staff` テーブルの列：

```
employee_number, name, name_kana, dept_no, contract_type, hired_at,
birthday, retired_at, retirement_scheduled_at, email, crew_code,
password_hash,  ← ★ パスワードハッシュ
login_auth_code, login_auth_code_expires_at, login_auth_attempts,
login_password_attempts, address, work_place
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` はブラウザに配布されているため、画面を一切経由せずPostgREST APIを直接叩けます。

**発生条件**

担当営業アカウント（最下位権限）を1つ持っていること。それだけです。

**再現方法**

1. 担当営業アカウントで `/login` からログイン。
2. ブラウザのDevToolsコンソールで以下を実行。

```js
// ① 全従業員の生年月日・住所・パスワードハッシュを取得
const { data } = await supabase.from('staff')
  .select('employee_number,name,birthday,address,email,password_hash')
window.copy(JSON.stringify(data))   // 1,801件が手元に落ちる

// ② 任意の従業員のパスワードを自分の知る値に差し替える
await supabase.from('staff')
  .update({ password_hash: '<自分で生成したsalt:hash>', is_initial_login: false })
  .eq('employee_number', '100001')
// → その従業員のマイページに成りすましログインでき、署名を代行できる

// ③ 退職日を消して復活させる／全件削除する
await supabase.from('staff').update({ retired_at: null }).neq('id','00000000-0000-0000-0000-000000000000')
await supabase.from('staff').delete().neq('id','00000000-0000-0000-0000-000000000000')
```

**原因**

初期構築時に「とりあえず認証済みなら通す」ポリシーを置いたまま、`contracts` / `pledges` のように `current_role_name()` を使った本格的なポリシーへ置き換える作業が `staff` に対してだけ行われていません。加えて、`app/apply/page.tsx:1546` の

```ts
await supabase.from('staff').update({ work_place: workPlace }).eq('id', selectedStaff.id)
```

というクライアント直接UPDATEが1箇所だけ存在するため、UPDATE権限を落とせない状態になっています。

**影響範囲**

- 全従業員1,801名の氏名・生年月日・住所・メール・社員番号の一括流出（個人情報保護法違反）
- 任意の従業員への成りすまし → 電子契約の署名代行 → **電子契約の否認防止性が全面的に崩壊**
- 退職者フラグの改ざん、マスタの全件削除（バックアップからの復旧しか手段なし）

**修正案**

1. `app/apply/page.tsx:1546` の `work_place` 更新をサーバーAPI（service role経由）へ移す。
2. `staff` のポリシーを差し替える。

```sql
drop policy "認証ユーザーのみ参照可" on public.staff;

-- 読み取り：社内3ロールのみ。担当営業は自部門グループのみ
create policy "staff_select_internal" on public.staff for select to authenticated
using (
  current_role_name() in ('管理部','SSC')
  or (current_role_name() = '担当営業' and dept_no = any(current_dept_scope()))
);

-- 書き込みはクライアントから一切許可しない（service role経由のみ）
-- INSERT/UPDATE/DELETE ポリシーは作らない
```

3. `password_hash` を `staff` から分離した別テーブル（RLSでクライアントから完全遮断）へ移す。最低限、PostgRESTの露出から外すためビュー経由に変更する。

**修正優先順位**：**1（最優先・他のすべてに先行）**
**修正工数**：0.5〜1人日（ポリシー差し替え＋work_place更新のAPI化＋回帰確認）

---

### C-02 ★★★★★ 認証済みなら誰でも、全CSV生データ1,382件（派遣先・賃金・就業場所）を全件取得できる

| 項目 | 内容 |
|---|---|
| **分類** | Supabase / セキュリティ / 情報漏えい |
| **場所** | RLSポリシー `csv_raw_data` / `csv_imports` / `master_imports` / `csv_diff_logs` |

**問題内容**

```
csv_raw_data  : SELECT / authenticated / using = true       ← 無条件
csv_imports   : SELECT / authenticated / using = true       ← 無条件
master_imports: ALL    / public        / auth.role()='authenticated'  ← フルCRUD
csv_diff_logs : ALL    / public        / auth.role()='authenticated'  ← フルCRUD
```

`csv_raw_data` は e-staffing / HR STATION / Staffia / winworks から取り込んだ生データ1,382行で、`raw_data` (jsonb) に**CSVの全列がそのまま**入っています。派遣先企業名、就業場所住所、契約金額、派遣料金、就業条件のすべてです。

部門スコープが一切かかっていないため、**北海道営業所の担当営業が、九州の全取引先の契約単価を1クエリで取得できます。**

**発生条件**：任意の社内アカウント1つ。

**再現方法**

```js
const { data } = await supabase.from('csv_raw_data').select('*')  // 上限1,000件
// range() でページングすれば全1,382件

await supabase.from('csv_diff_logs').delete().neq('id','...')     // 監査ログ相当を消去できる
```

**原因**：「社内システムだから認証済み＝信頼できる」という前提。部門間の情報遮断という業務要件がRLSに落ちていない。

**影響範囲**：取引先の契約単価・派遣料金の部門横断流出（営業機密）。`csv_diff_logs`・`master_imports` は改ざん・削除も可能で、CSV取込の追跡可能性が失われる。

**修正案**

```sql
-- csv_raw_data / csv_imports：管理部・SSCのみ全件、担当営業は自部門スタッフ関連のみ
drop policy "認証ユーザーは閲覧のみ" on public.csv_raw_data;
create policy "csv_raw_select" on public.csv_raw_data for select to authenticated
using (current_role_name() in ('管理部','SSC'));
-- 担当営業が必要とする検索は、部門で絞ったSECURITY DEFINER関数を経由させる

-- master_imports / csv_diff_logs：SELECT のみ・管理部限定へ縮小
drop policy "認証ユーザーのみ参照可" on public.master_imports;
create policy "master_imports_select" on public.master_imports for select to authenticated
using (current_role_name() = '管理部');
```

**修正優先順位**：2
**修正工数**：1〜1.5人日（担当営業のCSV検索を関数経由へ切替える改修を含む）

---

### C-03 ★★★★★ スタッフマスタ取込を1回実行すると、全従業員のメールアドレスが `ito@appart.co.jp` に上書きされる

| 項目 | 内容 |
|---|---|
| **分類** | CSV / データ破壊 / リリース手順 |
| **場所** | `lib/staffMasterImportShared.ts:93, 116`、`lib/staffExpressColumns.ts:21` |

**問題内容**

```ts
// lib/staffMasterImportShared.ts:93
// 【テスト運用中の暫定対応】メールアドレスは誤送信防止のため ito@appart.co.jp に固定している。
...
// :116
    email: 'ito@appart.co.jp',
```

実列 `row['メールアドレス１']` を読まず、定数を返しています。この値は `app/api/admin/csv-import/route.ts:268` の

```ts
.upsert(chunk, { onConflict: 'employee_number' })
```

に含まれるため、**既存行のメールアドレスも問答無用で上書き**されます。

**発生条件**：管理部が「CSVインポート」タブでStaffExpressのスタッフマスタをアップロードする（本番運用では月次の定常作業）。

**再現方法**

1. 管理部でログイン → CSVインポートタブ → StaffExpress → スタッフマスタを選択 → 実行
2. `select count(*) from staff where email = 'ito@appart.co.jp'` → 1,801件

**原因**：テスト期間中の誤送信防止措置が、環境変数化されずコードに直接埋め込まれたまま残っている。`CLAUDE.md` の本番前タスク14に記載はあるが、コードは「取込するだけで即破壊」の状態で、リリース手順の順序ミスに耐えない。

**影響範囲**

- 全従業員の署名依頼メール・6桁認証コードが伊藤さん1人の受信箱に集中
- 署名フローが全社停止
- **他人の認証コードが1つの受信箱に集まるため、受信できる人物が全従業員の契約書へアクセス可能**（C-01と組み合わせると完全な成りすましが成立）
- 元のメールアドレスは上書き後に復元不能（StaffExpressから再取込するしかない）

**修正案**

```ts
// lib/staffMasterImportShared.ts
const FORCE_EMAIL = process.env.STAFF_IMPORT_FORCE_EMAIL || null
...
    email: FORCE_EMAIL ?? (String(row['メールアドレス１'] || '').trim() || null),
```

さらに、`crew_code` と同じ「空なら既存値を保持する」ロジック（`csv-import/route.ts:262-266`）を `email` にも適用する。本番Vercelでは `STAFF_IMPORT_FORCE_EMAIL` を**設定しない**。

**リリース手順への追加（必須）**

```sql
-- 取込後に必ず実行して検証する
select email, count(*) from staff where email is not null group by email having count(*) > 1;
-- 0行であること。1行でも返れば maybeSingle() を使う5箇所が壊れる（指摘 B-09）
```

**修正優先順位**：3
**修正工数**：0.5人日

---

### C-04 ★★★★★ CSV取込の「申請済みデータ保護」がDBエラー時に無言で解除され、締結済み契約のスナップショットが破壊される

| 項目 | 内容 |
|---|---|
| **分類** | CSV / データ破壊 / 法的証跡 |
| **場所** | `app/api/admin/csv-import/route.ts:106` |

**問題内容**

```ts
const { data: refRows, error } = await supabaseAdmin
  .from('contracts')
  .select('csv_raw_data_id, status, created_by_name, staff_id')
  .in('csv_raw_data_id', chunk)
  .neq('status', '差し戻し中').neq('status', '取り下げ')
if (error) continue // 保護判定に失敗した場合は安全側（保護しない＝上書き）に倒さず、対象から一旦除外する
```

**コメントの主張と実際の挙動が正反対です。** `continue` すると当該チャンク（最大300件）の既存IDは `protectedByRawId` に登録されません。後段（`:135-141`）で

```ts
const protectedInfo = existingId ? protectedByRawId.get(existingId) : undefined
if (existingId && protectedInfo) { /* 保護してスキップ */ }
```

となるため、`protectedInfo === undefined` = **保護されずそのまま `upsertBatch` に入り上書きされます。**

加えて `.in('csv_raw_data_id', chunk)` は結果件数に上限（PostgREST既定1,000件）があり、超過分が黙って切り捨てられても検知できません。

**発生条件**

1. `contracts` へのSELECTが一時的に失敗（タイムアウト・接続断・PostgREST 5xx・RLS変更）
2. または1チャンク内の参照契約が1,000件を超える

**再現方法**：保護判定クエリを一時的に失敗させる（列名を誤ったものに差し替えてローカル実行）→ 署名済み契約が参照している `csv_raw_data` 行が `pendingProtectedCount: 0` のまま `updatedCount` に計上され上書きされる。画面は「正常に更新しました」と表示。

**原因**：フェイルオープン設計。異常時のデフォルトが「保護しない」になっている。

**影響範囲**：締結済み・申請中契約が参照するCSVスナップショットが書き換わり、SSC確認画面の差分表示・帳票PDFの再生成内容が実際に締結した契約と食い違う。**法的証跡の毀損。** しかも画面上は正常終了に見え、誰も気づけない。

**修正案**

```ts
if (error) {
  throw new Error(`保護判定に失敗したため、安全のためインポートを中止しました：${friendlyDbReason(error)}`)
}
if ((refRows?.length ?? 0) >= 1000) {
  throw new Error('保護判定の結果件数が上限に達しました。CHUNKサイズを下げて再実行してください。')
}
```

呼び出し側（`:520-556`）のcatchで500を返し、**1行も書き込まない**。あわせてCHUNKを300→100に下げるか、保護判定を `EXISTS` 判定のDB関数に移す。

**修正優先順位**：4
**修正工数**：0.5人日

---

### C-05 ★★★★★ アルバイト誓約書PDFで、就業日程の最終行が無言で消える

| 項目 | 内容 |
|---|---|
| **分類** | PDF / 法的文書の欠落 |
| **場所** | `lib/pdf/PledgePdf.tsx:23, 77` ／ `app/pledge/apply/page.tsx:45, 582-596` |

**問題内容**

```ts
// lib/pdf/PledgePdf.tsx:23
const MAX_SCHEDULE_ROWS = 10
// :77
const padded = [...rows, ...Array(Math.max(0, MAX_SCHEDULE_ROWS - rows.length)).fill(null)]
  .slice(0, MAX_SCHEDULE_ROWS)   // ← 11行目以降を切り捨て
```

一方、申請側は **期間行1件 ＋ 単日行 最大10件 ＝ 最大11行** を生成できます。

```ts
// app/pledge/apply/page.tsx:45
const MAX_SINGLE_ENTRIES = 10
// :582-596
if ((periodPattern === 'range' || periodPattern === 'mix') && rangeStart && rangeEnd) { rows.push({...}) }  // 1行
if (periodPattern === 'single_multi' || periodPattern === 'mix') { for (const e of singleEntries) rows.push({...}) }  // 最大10行
```

**発生条件**：MIXパターン（期間指定あり ＋ 単日10件）で申請したとき。

**再現方法**

1. `/pledge/apply` で期間指定を1件、単日を10件登録して申請
2. DB上 `pledges.input_data.scheduleRows` は11要素で保存される
3. PDFには10行しか印字されず、**11行目（最後の単日）が完全に欠落**
4. 画面のSTEP6最終確認では11件表示されるため、申請者・SSC・従業員の誰も気づけない

**原因**：UI側の上限（単日10件）とPDF側の枠数（合計10行）が別々に定義され、期間行の分がカウントされていない。「常に10行の枠を用意する」というレイアウト要望（2026-07-23）が、そのまま切り捨て処理として実装された。

**影響範囲**：法的効力を持つ誓約書に記載されない就業日が発生する。署名済みPDFがGoogle Driveに原本として保存され、それが証拠として扱われる。労務トラブル時に「合意していない日に就業させた」という主張を否定できない。

**修正案**

```ts
const MAX_SCHEDULE_ROWS = 11   // 期間行1 + 単日10
```

に加え、**切り捨てを絶対に起こさないガード**を入れる。

```ts
// lib/pdf/renderPledgePdf.ts
if (rows.length > MAX_SCHEDULE_ROWS) {
  throw new Error(`就業日程が${MAX_SCHEDULE_ROWS}行を超えています（${rows.length}行）。PDFを生成できません。`)
}
```

恒久対応として、申請側でも `期間行 + singleEntries.length <= MAX_SCHEDULE_ROWS` をバリデーションする。

**修正優先順位**：5（定数1つの修正で即座に解消できる。費用対効果が最大）
**修正工数**：0.25人日

---

### C-06 ★★★★★ 署名依頼メールの再送手段が存在せず、メールを紛失した従業員の案件が恒久的に停止する

| 項目 | 内容 |
|---|---|
| **分類** | 業務フロー / 運用 |
| **場所** | `app/api/contracts/[id]/notify-sign-request/route.ts:60`、3ダッシュボード全体 |

**問題内容**

```ts
if (contract.status !== 'SSC承認済み') {
  // 対象外（既に署名待ちに進んでいる／差し戻し中等）。二重送信防止のため何もしない。
  return NextResponse.json({ sent: false })
}
```

すでに `署名待ち` になった契約には、何度APIを叩いても再送されません。そして**3ダッシュボードのどこにも「署名依頼を再送する」ボタンは存在しません**（全文grep済み）。

**発生条件**：メールが迷惑メールに振り分けられた／従業員が誤って削除した／`staff.email` が誤登録だった。実運用で数十人規模なら月に数件は必ず起きます。

**再現方法**

1. 契約をSSC承認 → `署名待ち`、署名依頼メール送信
2. 従業員がメールを削除
3. 担当営業・SSC・管理部いずれの画面にも操作がない
4. 従業員側も `/staff/login` のURLを知らなければ辿り着けない

**原因**：`署名待ち` を「二重送信防止のための終端」として扱い、正常な再送ニーズを想定していない。

**影響範囲**

- 労働基準法15条の労働条件明示が完了しないまま案件が塩漬け
- 担当営業画面には「期日を◯日超過しています」（`sales/contracts/[id]:451`）と表示され続けるだけ
- **超過してもメール通知・エスカレーションは一切ない**（cronは `renewal-notify` / `withdrawn-cleanup` / `csvmeta-cleanup` の3本のみ）
- C-07（承認後に戻せない）と複合し、詰んだ案件を消すこともできない

**修正案**

1. 契約詳細画面（SSC・管理部）に「署名依頼を再送する」ボタンを追加。`notify-sign-request` に `trigger=resend` を追加し、`署名待ち` を許容して `sign_requested_at` を更新のうえ再送する。連投防止のため直近送信から10分のクールダウンを設ける。
2. `署名待ち` が7日を超えた契約を日次で担当営業＋管理部へ通知するcronを追加（`renewal-notify` と同じ構造で実装可能）。

**修正優先順位**：6
**修正工数**：1〜1.5人日

---

### C-07 ★★★★★ 個別承認でメール送信が失敗しても「送信しました」と表示され、案件が静かに止まる

| 項目 | 内容 |
|---|---|
| **分類** | 業務フロー / エラーハンドリング |
| **場所** | `app/dashboard/ssc/contracts/[id]/page.tsx:460-464, 507`、`app/dashboard/ssc/pledges/[id]/page.tsx:172` |

**問題内容**

```tsx
try {
  await fetch(`/api/contracts/${contract.id}/notify-sign-request`, {...})
} catch { /* 通知の失敗は承認をブロックしない（ログのみ・UIには表示しない） */ }
setActionDone('approved')
```

`res.ok` を検査していません。一方サーバーは送信失敗時に `署名待ち` → `SSC承認済み` へ**ロールバック**します（`notify-sign-request:131-141`）。

そして画面は無条件に表示します。

```tsx
// :1042
: 'スタッフへ署名依頼を自動送信しました。'
```

**発生条件**：`staff.email` が null（`:150` で400＋ロールバック）／SMTP障害（`:174` で500＋ロールバック）／Gmail送信レート超過。

**再現方法**

1. `staff.email` を null にした従業員の契約をSSCが**個別承認**
2. 画面：「✅ 承認しました／スタッフへ署名依頼を自動送信しました。」
3. DB：`status = 'SSC承認済み'` のまま（署名待ちに進んでいない）
4. 承認済みタブに紛れ、誰も気づかない

**原因**：一括承認（`ssc/page.tsx:355`）は `notifyFailedCount` を数えて表示するのに、個別承認・強制承認・誓約書承認の3経路だけが握りつぶしている。実装の一貫性の欠如。

**影響範囲**：サイレント停止。C-06（再送手段なし）と複合すると、当該契約は**システム上どうやっても完了できません。**

**修正案**（4箇所・数行ずつ）

```tsx
const res = await fetch(`/api/contracts/${contract.id}/notify-sign-request`, {...})
const json = await res.json().catch(() => null)
if (!res.ok || json?.sent === false) {
  setActionDone('approved_no_mail')   // 「承認しましたが、署名依頼メールを送信できませんでした」
  return
}
setActionDone('approved')
```

対象：`ssc/contracts/[id]:461`、`ssc/contracts/[id]:507`（強制承認）、`ssc/pledges/[id]:172`、`admin/page.tsx` の同等箇所。

**修正優先順位**：7（4行×4箇所。費用対効果が極めて高い）
**修正工数**：0.5人日

---

### C-08 ★★★★★ 社員番号の再利用で、新入社員のマイページに前任者の署名済み契約が全件表示される

| 項目 | 内容 |
|---|---|
| **分類** | データ整合性 / 個人情報漏えい |
| **場所** | `lib/staffMasterImportShared.ts`（upsert by `employee_number`）、`app/api/staff/me/route.ts` |

**問題内容**

`staff.employee_number` は UNIQUE で、StaffExpress取込は `onConflict: 'employee_number'` の全件upsertです。氏名・生年月日の一致検証はありません。

社員番号を再利用（退職者Aの番号を新入社員Bに再割当）すると、**同じ `staff.id`（UUID）を持ったまま中身だけBに置き換わります。** `contracts.staff_id` はこのUUIDを参照しているため、Aの全契約がBに紐づきます。

**発生条件**：人事側で社員番号を再利用する運用がある場合。派遣業では再雇用・番号枯渇による再割当は珍しくありません。

**再現方法**

1. 社員番号 `100123` の従業員Aが退職（署名済み契約5件あり）
2. 新入社員Bに `100123` を割り当て、StaffExpressから取込
3. Bがマイページにログイン → `/api/staff/me` は `staff_id` で契約を引くため、**Aの署名済み契約5件（氏名・住所・給与つき）が全部表示される**

**原因**：業務キー（社員番号）を安定な識別子と仮定している。取込時の同一人物検証がない。

**影響範囲**：他人の労働条件・住所・給与の開示。個人情報保護法上の重大インシデント。

**修正案**

1. 取込時に既存行との整合を検証し、不一致ならエラーにする。

```ts
// 既存の employee_number 行と 氏名 or 生年月日 が両方とも異なる場合は「別人の可能性」として弾く
if (existing && existing.name !== record.name && existing.birthday !== record.birthday) {
  counts.errorDetails.push(`社員番号${employeeNumber}：既存(${existing.name})と別人の可能性があるため取込を中止しました`)
  continue
}
```

2. 中期的には `staff` に `person_id`（真の個人識別子）を追加し、`contracts.staff_id` をそちらに向ける。

**修正優先順位**：8
**修正工数**：0.5人日（検証ガードのみ）／ 3人日（person_id導入まで）

---

## 3. ★★★★☆ 重大

---

### B-01 ★★★★ 署名依頼API・CSV修正通知APIに部門・ロールのスコープチェックがなく、他部門の契約を勝手に進行させられる

**場所**：`app/api/contracts/[id]/notify-sign-request/route.ts:42-45`、`app/api/pledges/[id]/notify-sign-request/route.ts:25-28`、`app/api/contracts/[id]/notify-csv-modified/route.ts:32-35`

```ts
const staffAuth = await getAuthenticatedStaff(req)
if (!staffAuth || !staffAuth.role) {
  return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
}
// 以降 staffAuth は一切参照されない（contract.created_by_dept_no との突合なし）
```

同じ `contracts` を扱うPDF API（`contracts/[id]/pdf/route.ts:48-59`）は `role === '管理部'` / SSC / 担当営業かつ `created_by_dept_no === deptNo` をきちんと判定しているのに、**状態遷移＋メール送信という副作用の大きいこちらが素通し**です。

**再現**

```bash
curl -X POST 'https://.../api/contracts/<B部門の契約UUID>/notify-sign-request?trigger=explain' \
     -H 'Authorization: Bearer <A部門の担当営業のtoken>'
# → {"sent":true} 、status='署名待ち'、対象従業員へ署名依頼メールが実送信される
```

**影響**：①他部門の契約を勝手に「対面説明済み」として署名フェーズへ進め、**対面説明義務を飛ばして従業員に署名させられる** ②任意の従業員へ認証コード付きメールを送りつけられ、`login_auth_code` の再発行で**既存の正規コードを無効化**できる（サービス妨害） ③`notify-csv-modified` は `csv_modified_notified_at` が立つため、**本物の通知が二度と飛ばなくなる**

**修正案**：3ルートに共通ガードを追加。

```ts
const canAct =
  staffAuth.role === '管理部' ||
  (staffAuth.role === 'SSC' && contract.work_place !== '社内') ||
  (staffAuth.role === '担当営業' && contract.created_by_dept_no != null &&
   getDeptSearchScope(staffAuth.deptNo).includes(contract.created_by_dept_no))
if (!canAct) return NextResponse.json({ error: 'この契約を操作する権限がありません。' }, { status: 403 })
```

`trigger` も `if (!['auto_approve','explain'].includes(trigger)) return 400` でホワイトリスト検証する（現状 `'explain'` 以外はすべて `auto_approve` 扱い）。

**優先順位**：9 ／ **工数**：0.5人日

---

### B-02 ★★★★ `staff_roles` に行がない認証ユーザーが一部APIを実行できる（＋Supabase Signupが有効なら外部から到達可能）

**場所**：`lib/apiAuth.ts:39-53`

```ts
const { data: roleRow } = await supabaseAdmin.from('staff_roles').select(...).eq('id', userData.user.id).maybeSingle()
if (roleRow && roleRow.is_active === false) return null   // ← 行が「無い」場合を弾いていない
return { userId: ..., role: roleRow?.role || null, ... }
```

`role: null` のコンテキストが返るため、`if (!auth)` だけで判定しているルートを通過します。

- `app/api/renewal-candidates/notify-not-renewing/route.ts:18-21`
- `app/api/requests/notify-created/route.ts:23-26`

Supabaseプロジェクトでメール Signup が有効（既定は有効）なら、**誰でも anon キーで `/auth/v1/signup` を叩いてJWTを取得できます。**

**再現**

```bash
curl "$SUPABASE_URL/auth/v1/signup" -H "apikey: <anon>" -d '{"email":"x@x.com","password":"..."}'
curl -X POST /api/renewal-candidates/notify-not-renewing -H "Authorization: Bearer <取得token>" \
     -d '{"employeeNumber":"999999","reason":"<任意文言>","staffName":"..."}'
# → 管理部メーリングリスト宛に任意内容の「更新しない」通知が届く
```

**修正案**

```ts
if (!roleRow || roleRow.is_active === false) return null   // 行が無い＝社内ユーザーではない
```

加えて **Supabaseダッシュボードで Email Signup を無効化**（招待フローのみに限定）。`notify-not-renewing` は `renewalCandidateId` を受け取ってDBから実データを読み、部門スコープを照合してから送る形に変更する。

**優先順位**：10（1行修正で効果が大きい） ／ **工数**：0.25人日

---

### B-03 ★★★★ メール本文のHTMLエスケープが全く行われておらず、自社ドメインを踏み台にしたフィッシングが可能

**場所**：`lib/mail.ts` 全体（`escapeHtml` 相当の実装が **0件**。全文grep済み）

代表例：`:895`（`questionText`）、`:898`（`answerText`）、`:1422`、`:1511`、`:1211-1212`、`:120`、`:234`、`:677`、`:1102`

```ts
<td style="...white-space:pre-line;">${questionText}</td>
```

`white-space: pre-line` は改行の扱いを変えるだけで、**タグは通常どおり解釈されます。**

値の出所：①FAQチャットボットの質問文（従業員の自由入力）②`requests.staff_name` / `client_name`（担当営業の自由入力）③`staff.name`（Excel取込）④「更新しない理由」「依頼取消理由」（任意文字列）⑤CSV由来の値

**再現**：FAQに `<a href="https://evil.example/login">こちらから再ログインしてください</a>` を含む質問を投稿 → 管理部が回答 → 送信されるHTMLメールに実リンクとして描画される。差出人は `agency@appart.co.jp`（SPF/DKIM通過）。

**影響**：極めて成功率の高い社内フィッシング。`<style>` によるレイアウト差し替えも可能。

**修正案**：`lib/mail.ts` 先頭に共通ヘルパーを追加し、**html テンプレート内の全変数展開**を置換する（text版は不要）。

```ts
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
```

意図的にHTMLを含む変数（`overrideNotice` / `stepsHtml` / `detailHtml`）だけを明示的に除外する。**特に `detailHtml` は `buildRequestDetailLines`（`:56-86`）の結果＝外部入力を含むため、`<strong>` を付与する前に各行をエスケープすること。**

**優先順位**：11 ／ **工数**：1人日（全箇所の置換＋目視確認）

---

### B-04 ★★★★ `/api/faq/notify-answer` が任意宛先・任意本文の送信口になっている

**場所**：`app/api/faq/notify-answer/route.ts:17-39`

```ts
const body = await req.json()
const { toEmail, questionText, answerText } = body as {...}
...
await sendFaqAnswerMail(toEmail, questionText, answerText)
```

`toEmail` が**クライアント指定のまま**で、`faq_inquiries` から引き直していません。本文もDBと突合しません。宛先・本文とも完全に呼び出し側の自由です。

**再現**

```bash
curl -X POST /api/faq/notify-answer -H 'Authorization: Bearer <管理部token>' \
  -d '{"toEmail":"victim@example.com","questionText":"<a href=\"https://evil\">口座変更のお願い</a>","answerText":"..."}'
```

`agency@appart.co.jp` から任意の**外部アドレス**へ任意本文が届きます。

**修正案**：`inquiryId` のみを受け取り、サーバー側で `faq_inquiries` から `submitted_by_email` / `question_text` / `answer_text` をSELECTして送る。宛先は自社ドメインまたは `staff.email` に一致するもののみを許可するホワイトリストを追加。

**優先順位**：12 ／ **工数**：0.25人日

---

### B-05 ★★★★ マイページログインで社員番号を列挙でき、全従業員を一括でアカウントロックできる

**場所**：`app/api/staff/login/route.ts:34-53`、`app/api/staff/verify-code/route.ts:33-49`

```ts
// 社員番号の存在有無を外部から推測されないよう、同じエラー文言で応答する。
const genericError = '社員番号またはパスワードが正しくありません。'
if (error || !staff) return NextResponse.json({ error: genericError }, { status: 401 })
if (staff.is_initial_login) return NextResponse.json({ ..., reason: 'initial_login_required' }, { status: 400 })
if ((staff.login_password_attempts || 0) >= MAX_PASSWORD_ATTEMPTS)
  return NextResponse.json({ ..., reason: 'locked' }, { status: 423 })
```

**コメントの意図に反し、応答が3分岐しています。** 存在しない社員番号＝401、存在する未設定者＝400+`initial_login_required`、ロック中＝423。社員番号は6桁連番（実データ 100000〜105xxx）で総当たり可能です。

さらに `login_password_attempts` は **10回失敗で永久ロック**、解除は正しいパスワードでのログイン成功かパスワード再設定のみ。**IP単位のレート制限は全ルートに存在しません。**

**再現**

```bash
for n in $(seq 100000 105999); do
  curl -s -o /dev/null -w "$n %{http_code}\n" -X POST /api/staff/login \
    -d "{\"employeeNumber\":\"$n\",\"password\":\"x\"}"
done
# 応答コードで在籍者リストが得られる。10周すれば全員ロック（数分で完了）
```

**影響**：全従業員の署名フロー停止 ＋ 社員番号の一括列挙。

**修正案**

- 応答を完全に統一（存在しない場合も401のgenericを返し、`reason` を返さない。未設定・ロックの案内は「パスワードをお忘れの場合」導線に集約）
- ロックを**時間窓**に変更（`login_locked_until` 列を追加し15〜30分で自動解除）
- `@upstash/ratelimit` 等でIP＋社員番号の複合キーによるレート制限（5回/分、20回/時）を `login` / `request-code` / `verify-code` / `sign/[id]/verify` / `account-setup/*` に導入

**優先順位**：13 ／ **工数**：1.5人日

---

### B-06 ★★★★ 退職者が退職後もマイページにログインでき、自分の契約書PDFを無期限に閲覧できる

**場所**：`app/api/staff/login/route.ts`、`request-code/route.ts`、`verify-code/route.ts`（いずれも `retired_at` チェックなし。grep済み）

`lib/staffFilters.ts` の `excludeRetiredStaffOr()` は検索・更新候補一覧でのみ使われており、**認証系3APIには一切適用されていません。**

さらにセッションCookieは**30日間有効で失効手段がありません**（後述 B-07）。退職手続き後もセッションが生き続けます。

**修正案**

```ts
// 3APIの共通ガード
const today = new Date().toISOString().slice(0,10)
if ((staff.retired_at && staff.retired_at < today) ||
    (staff.retirement_scheduled_at && staff.retirement_scheduled_at < today)) {
  return NextResponse.json({ error: genericError }, { status: 401 })
}
```

加えて、退職登録時に `署名待ち` の契約を洗い出して管理部に提示する画面を用意する（現状は退職すると画面から消え、誰も処理できなくなる）。

**優先順位**：14 ／ **工数**：0.5人日

---

### B-07 ★★★★ セッショントークンが失効不能（30日間）で、パスワード変更・凍結・退職でも無効化されない

**場所**：`lib/staffSession.ts`、`lib/staffAuth.ts`、`middleware.ts`

```ts
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30日間
const payload = `${staffId}.${expiresAt}`
```

トークンは `staffId` + 有効期限のHMACのみ。**サーバー側に発行済みトークンの記録がなく、`/api/staff/logout` はCookieを消すだけです。**

- トークンが1度漏れれば30日間有効（ログアウトしても無効化されない）
- パスワードを変更しても既存セッションは生き続ける
- 退職・凍結しても30日間アクセス可能
- middlewareはHMAC検証のみでDB照会をしないため、DBを更新しても止められない

**修正案**

1. payloadに `token_version` を追加し、`staff.session_token_version`（integer）と突合する。パスワード変更・退職・強制ログアウト時にインクリメントする。

```ts
const payload = `session:${staffId}.${tokenVersion}.${expiresAt}`
```

2. 有効期限を30日→7日に短縮し、アクセスのたびに延長（sliding）する。
3. middlewareは軽量に保ちつつ、**APIルート側（Node Runtime）で必ずDB照会**して `is_active` / `retired_at` / `token_version` を検証する。

**優先順位**：15 ／ **工数**：1人日

---

### B-08 ★★★★ 3種類のトークンが同一鍵・同一フォーマットで、相互に流用できる（ドメイン分離なし）

**場所**：`lib/staffSession.ts:29-40`、`lib/staffResetToken.ts:10-19`、`lib/pdfAccessToken.ts:12-23`

3ファイルとも **鍵（`SUPABASE_SERVICE_ROLE_KEY`）・アルゴリズム（HMAC-SHA256）・payload形式（`${id}.${expiresAt}`）・出力（hex → base64url）が完全に同一**です。用途タグがないため、検証関数は互いのトークンを有効と判定します。

**具体的に成立する経路**：`/api/staff/verify-code` は15分有効の `resetToken` をJSONレスポンスで返します（`:69`）。この文字列をそのまま `staff_session` Cookie に入れると `middleware.ts` と `getStaffIdFromRequest` を通過し、**パスワードを設定せずにマイページへ入れます**（`is_initial_login` を残したまま署名まで到達可能）。

さらに、署名鍵に **DB全権クレデンシャル（service role key）を流用**しているため、キーローテーションで全セッション・全PDFトークンが即死し、逆にセッション互換性を守るためにキーを回せなくなります。

**修正案**

1. payloadに用途を入れる：`session:${staffId}.${exp}` / `pwreset:${staffId}.${exp}` / `pdf:${contractId}.${exp}`。verify側も同じprefixを要求する。
2. 署名鍵を `SESSION_SIGNING_SECRET`（32バイト以上のランダム値）に分離し、`getRequiredServiceRoleKey()` はDB接続専用に戻す。
3. `resetToken` はDBにnonceを保存して**ワンタイム**にする。

**優先順位**：16 ／ **工数**：1人日（＋Vercel環境変数追加）

---

### B-09 ★★★★ `staff` をメールアドレスで引く旧ロジックが9箇所残存し、部門の取り違え・画面ロックを起こす

**場所**

`app/apply/page.tsx:617`（差し戻し再申請の所有者チェック）／`:1700`（スタッフ登録依頼）／`:1766`（CSVインポート依頼）／`app/dashboard/sales/contracts/[id]/page.tsx:337`／`app/dashboard/sales/pledges/[id]/page.tsx:135`／`app/dashboard/_shared/useRenewalCandidates.ts:680`／`app/dashboard/admin/page.tsx:641`／`app/pledge/apply/page.tsx:443, 608`／`app/api/renewal-candidates/notify-not-renewing/route.ts:55`

```ts
const { data: staffRow } = await supabase.from('staff').select('dept_no')
  .eq('email', data.user.email).limit(1).maybeSingle()
...
if (error || !row || !staffRow || row.created_by_dept_no !== staffRow.dept_no) { setNotFound(true) }
```

所属部門の正は 2026-07-29 に `staff_roles`（id一致）へ移行済みですが、上記9箇所は旧方式のままです。

**発火条件**

1. `staff` に行がないアカウント（SSC・管理部・統括部門の担当営業＝広域本部等）→ `staffRow` が常に null
2. `staff.email` が全件 `ito@appart.co.jp` 固定の現状 → `limit(1)` が**任意の1名**を返す
3. 本番切替後にメールが重複した場合 → `maybeSingle()` がエラーを返す

**再現**

- 広域本部の担当営業で契約詳細を開く → 常に「申請が見つかりませんでした」
- SSCアカウントで申請 → 差し戻される → 「再申請する」→ 必ず「再申請する差し戻し案件が見つかりませんでした」
- 一括申請で作成した契約が担当営業ダッシュボード（`in('created_by_dept_no', deptScope)`）に一切出ない

**修正案**：9箇所すべてを共通フックに集約する。

```ts
// lib/useMyDeptScope.ts（新設）
const { data } = await supabase.from('staff_roles')
  .select('dept_no, name, role').eq('id', user.id).maybeSingle()
// 比較は getDeptSearchScope(myDeptNo).includes(row.created_by_dept_no)
```

**優先順位**：17 ／ **工数**：1.5人日

---

### B-10 ★★★★ PDF APIが社内案件を管理部全員に開放している（詳細画面は塞いでいるのにAPIは素通し）

**場所**：`app/api/contracts/[id]/pdf/route.ts:53`

詳細画面（`ssc/contracts/[id]:384`）は `is_internal_approver` がない管理部を「見つかりません」で弾くのに、PDF APIは `staffAuth.role === '管理部'` だけで通します。

**影響**：社内社員（役員を含む）の給与が記載されたPDFを、権限のない管理部メンバーがURL直打ちで取得できます。SYSTEM_DESIGN 1-6章「社内社員の雇用契約書はSSCから閲覧不可（個人情報保護のため）」の趣旨に反します。

**修正案**

```ts
const canView =
  (staffAuth.role === '管理部' && (contract.work_place !== '社内' || staffAuth.isInternalApprover)) ||
  (staffAuth.role === 'SSC' && contract.work_place !== '社内') ||
  (staffAuth.role === '担当営業' && getDeptSearchScope(staffAuth.deptNo).includes(contract.created_by_dept_no))
```

あわせて B-11（グループ範囲未反映）も同時に解消できます。

**優先順位**：18 ／ **工数**：0.25人日

---

### B-11 ★★★★ 社内承認タブの権限判定がクライアント側の `user_metadata` のみ

**場所**：`app/dashboard/admin/page.tsx:762, 794`

```ts
if (user.user_metadata.is_internal_approver !== true) return
```

`user_metadata` はJWTに含まれる値で、画面側で判定しているだけです。DB側の `contracts` SELECT/UPDATEポリシーは `current_is_internal_approver()` を見ているので**RLSが最後の砦になっていますが、`enforce_role_from_staff_roles` トリガーが `raw_user_meta_data` を同期するタイミングと `staff_roles` の実値がずれると、UIとDBの判定が食い違います。**

**修正案**：`useLoggedInUser` と同様に `staff_roles` を直接引いて判定する。承認処理そのものはAPI経由に移し、`getAuthenticatedStaff().isInternalApprover` でサーバー検証する。

**優先順位**：19 ／ **工数**：0.5人日

---

### B-12 ★★★★ StaffExpress取込が「列が欠けたファイル」で人事データを全件NULL化する

**場所**：`app/api/admin/csv-import/route.ts:264-287`、`lib/staffMasterImportShared.ts:95-119`

`buildStaffRecord` は列が存在しなければ `null` を返し、`upsert` はその `null` で既存値を上書きします。`crew_code` だけは既存値保持の特別扱いが入っていますが（2026-07-21に実害が出て追加）、**同じ問題が `retired_at` / `retirement_scheduled_at` / `birthday` / `address` / `name_kana` / `hired_at` に残っています。**

**再現**：`退職年月日` 列を削除したxlsxで取込 → 全対象スタッフの `retired_at` が NULL → **退職者除外ロジックが効かなくなり、退職者が更新期限管理・スタッフ検索に一斉復活する。**

**影響**：1回の誤操作で1,700件超の人事データが破壊され、ロールバック手段がありません（`master_imports` は件数しか持たない）。

**修正案**

1. `readExcelBuffer` の直後に `STAFF_EXPRESS_COLUMNS` の必須ヘッダー存在検証を行い、欠けていたら400で中断する。
2. `buildStaffRecord` を「シートに存在した列だけを含む部分レコード」を返す形にし、欠落列をupsert対象から除く。

**優先順位**：20 ／ **工数**：0.75人日

---

### B-13 ★★★★ CSVのエンコーディングが cp932 決め打ちで、UTF-8ファイルは全行が無言でスキップされる

**場所**：`lib/csvImportShared.ts:127-131`

```ts
export function parseCsvBuffer(buffer: Buffer): Record<string, any>[] {
  const text = iconv.decode(buffer, 'cp932')
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
  return parsed.data as Record<string, any>[]
}
```

エンコーディング判定もBOM除去もありません。UTF-8ファイルをcp932でデコードすると全ヘッダーが文字化けし、`buildUniqueKey` がキーを引けず**全行が `skippedNoKeyCount` に積まれます。それでも `success: true` が返ります。**

**再現**：Excelで開いて「CSV UTF-8」で保存し直したファイルをアップロード → `total: 500, new: 0, updated: 0, error: 0` と表示され、管理部は「取り込んだ」と思い込む。担当営業のSTEP2検索は延々ヒットしない。

**修正案**

```ts
export function parseCsvBuffer(buffer: Buffer): { rows: Record<string, any>[]; errors: Papa.ParseError[] } {
  const hasUtf8Bom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
  const text = hasUtf8Bom ? buffer.subarray(3).toString('utf8')
    : looksLikeUtf8(buffer) ? buffer.toString('utf8')
    : iconv.decode(buffer, 'cp932')
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {
    header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
  })
  return { rows: parsed.data as any[], errors: parsed.errors }
}
```

加えて「ユニークキー列が1つも見つからない場合は400で明示エラー」にする。

**優先順位**：21 ／ **工数**：0.5人日

---

### B-14 ★★★★ CSVパース警告（引用符不整合・列数不一致）を完全に破棄しており、列ずれデータが無音で汚染される

**場所**：`lib/csvImportShared.ts:129-130`（`scripts/import-csv.js:144-148` には警告があるのにWeb版で退化）

`parsed.errors`（`TooFewFields` / `TooManyFields` / `Quotes`）を捨てています。フィールド内に `"` や改行が混入した行は列がずれ、**間違った契約番号で別契約のデータを上書きする**可能性があります。実務では就業先住所のビル名注記などで頻出します。

**修正案**：`parsed.errors` を戻り値に含め、`processSingleFile` で `counts.errorDetails` に行番号付きで積む。エラー行はスキップ扱いにして件数を画面に出す。

**優先順位**：22 ／ **工数**：0.5人日

---

### B-15 ★★★★ 同一ファイル内にユニークキーの重複があると、300件チャンク丸ごとが保存失敗する

**場所**：`app/api/admin/csv-import/route.ts:161-173`

```ts
.upsert(chunk, { onConflict: 'system_type,unique_key' })
```

同一チャンク内に同じ `unique_key` が2回現れると PostgreSQL が `21000: ON CONFLICT DO UPDATE command cannot affect row a second time` を返し、**その300件全部が書き込まれません。** しかも `21000` は `PG_ERROR_MESSAGES` にマップされておらず「予期しないエラーが発生しました」に丸められ、原因追跡が不可能です。

**修正案**：`upsertBatch` を組む前に `Map<uniqueKey, record>` で後勝ちデデュープし、重複件数を `counts` に別途報告する。`21000` を `PG_ERROR_MESSAGES` に追加する。

**優先順位**：23 ／ **工数**：0.25人日

---

### B-16 ★★★★ Staffiaの KEF00103 行は保護対象から完全に漏れている

**場所**：`app/api/admin/csv-import/route.ts:100-104`、`app/apply/page.tsx:1459`

契約は選択したCSV行のIDだけを保存します。

```ts
csv_raw_data_id: (csvMode === 'csv' && csvSelectedId !== null && csvResults[csvSelectedId])
  ? csvResults[csvSelectedId].id : null,
```

Staffiaの検索は `staff_code` でヒットする **KEF00104 行**だけを返し、就業場所名・住所・業務内容は検索時に **103行**から動的に合成しています。保護判定は `contracts.csv_raw_data_id`（＝104行）としか突き合わせないため、**103行は常に無防備で、再インポートのたびに上書きされます。**

**影響**：申請済み契約のCSVスナップショット破壊、SSC差分表示が「変更なし」と誤表示、`notify-csv-modified` の「CSVの情報」欄が営業が見た値と食い違う。

**修正案**：保護判定でStaffiaの場合は104行の `raw_data['個別契約書番号']` から対応する103行のIDも保護集合に加える。または申請時に `csv_raw_data_id` を配列（104と103の両方）で保持する。

**優先順位**：24 ／ **工数**：0.75人日

---

### B-17 ★★★★ 更新期限アラートが「誰かがダッシュボードを開くまで」発火しない

**場所**：`app/dashboard/_shared/useRenewalCandidates.ts:253`（`syncCandidates`）、`app/api/cron/renewal-notify/route.ts:73`

`renewal_candidates` 行を作るのは `syncCandidates()` のみで、これは**3ダッシュボードのクライアント側 `init()` からしか呼ばれません。** cronは既存の `renewal_candidates` をSELECTするだけで同期しません。

**再現**：連休や繁忙で誰もログインしない期間 → 「残45日」で検知されるはずの契約が候補行すら作られず、45日通知が飛ばない。しきい値をまたいで一気に進むと `newlyCrossed` が複数になり最緊急のもの1通にまとめられる（`:97`）ため、**45/30/20日の警告が全部飛ばされて「残7日」で初めて1通**という事態が起こります。

**あわせて**：cronは退職者を除外しません（`:73-77` は `status in (pending, csv_pending)` のみ）。UIは除外するため、**画面上どこにも出ない案件について毎営業日メールが届き続けます。**

**修正案**：cron冒頭にサーバー側（service role）での同期ステップを追加する。cronのSELECTに退職者除外を入れる。`syncCandidates` 側で「退職者になった既存行」を削除する処理を追加する。

**優先順位**：25 ／ **工数**：1.5人日

---

## 4. ★★★☆☆ 中（主要なもの）

| # | 重要度 | 場所 | 問題 | 修正案 | 工数 |
|---|---|---|---|---|---|
| M-01 | ★3 | `useRenewalCandidates.ts` / `dept_no` | **部署異動で更新候補が「担当外」になり見えなくなる**。`renewal_candidates.dept_no` は前回契約の申請者部門のスナップショット。異動後、新担当には見えず、cronの宛先も旧部門 | 帰属を `staff.dept_no`（現在値）基準へ | 1人日 |
| M-02 | ★3 | `app/page.tsx:1-65` | **ルート `/` がNext.jsのスターターテンプレートのまま**。"To get started, edit the page.tsx file." とVercel/Next.jsへの外部リンクが本番で表示される | `redirect('/login')` に置換 | 0.1人日 |
| M-03 | ★3 | `RenewalManagementTab.tsx:879-912` | **「期間のみ更新」で派遣期間が永久に保存されない行がある**。就業条件明示書のみ／兼用×無期の場合、入力欄がローカルstateにしか書かれずコピーボタンも出ない → 一括更新に含められない | 派遣期間欄も `onChange` で `updateCandidate` を直接呼ぶ | 0.5人日 |
| M-04 | ★3 | `app/apply/page.tsx` 全体 / `pledge/apply` | **申請ウィザードに離脱ガードがなく、8STEP分の入力が無警告で消える**。`beforeunload` の登録が全リポジトリで0件、下書き保存も0件 | `beforeunload` 登録 ＋ `sessionStorage` への30秒ごとの下書き保存 | 1人日 |
| M-05 | ★3 | `useContractMonitoring.ts:131-133` | **取得失敗時に「要対応の案件はありません」と誤表示**。`if (error) { console.error(); return }` で `rows=[]` のまま。コンプライアンス目的の画面が障害時に「異常なし」と嘘をつく | `error` state を持ち、赤いエラー＋再読込ボタンを出す | 0.5人日 |
| M-06 | ★3 | `ConfirmDialog.tsx:57-67` | **確認ダイアログが二重に要求されると前のPromiseが永久に解決されない** → UIが「振り分け中…」で固まる | `setPending(prev => { prev?.resolve(false); return next })` | 0.25人日 |
| M-07 | ★3 | `PdfPreviewButton.tsx:17-28` | **PDFプレビューが通信エラー時に無反応**（`catch` なし → Unhandled Rejection）。`window.open` が `await` 後でポップアップブロックに阻まれる。`revokeObjectURL` なしでメモリリーク | `catch` 追加、先に空タブを開く方式、`revokeObjectURL` | 0.25人日 |
| M-08 | ★3 | `admin/page.tsx:840-911`、`apply/page.tsx:1256-1318`、`PledgeListSection.tsx:99-117` | **一覧の再取得に競合防止がなく、古いレスポンスが新しい結果を上書きする**。`AbortController` が全リポジトリで0件 | `let cancelled = false; return () => { cancelled = true }`（`apply/page.tsx:89-99` に既存パターンあり） | 0.5人日 |
| M-09 | ★3 | `sign/[id]/complete/route.ts:31-46, 176-188` | **署名画像が実質未検証、入力氏名（`sealName`）が保存されない**。コメントは「氏名一致検証を追加する」と書いているが実装は空文字チェックのみ。`sealName` はどこにも保存されない。PNG検証は data URL 形式と500KB上限だけ | `sign_seal_name` 列を追加して保存。印影をサーバー側生成に移す。当面はPNGシグネチャ＋寸法チェック | 1.5人日 |
| M-10 | ★3 | `app/sign/[id]/seal.ts:7` | **電子印影のフォントが従業員端末依存**（`"Hiragino Mincho ProN","Yu Mincho",serif`）。Android/Linuxでは別書体、CJK非搭載環境では豆腐 | サーバー側生成（PDFと同じ `ipaexm.ttf`）へ移す。当面はWebFontを同梱し `document.fonts.ready` を待つ | 1人日 |
| M-11 | ★3 | 4ルート（`cron/renewal-notify:127` 他） | **`listUsers({ perPage: 200 })` の1ページ目しか見ない** → アカウントが200を超えると201件目以降が通知先から静かに欠落 | 全件取得ヘルパー `listAllAuthUsers()` を新設して4箇所で共用。理想は `staff_roles` に `email` 列を持たせる | 0.5人日 |
| M-12 | ★3 | `cron/renewal-notify:73-77`、`useWageRevisionCandidates:60-64` | **PostgRESTの1000件上限に抵触**。`.select('*')` に `limit`/`range` なし。1001件目以降は毎日必ず通知対象外 | `.range()` でページング、またはしきい値判定をDB関数へ | 0.5人日 |
| M-13 | ★3 | `notify-created` / `notify-answer` / `contract-monitoring/notify` | **通知APIに冪等性がなく、同じ通知を何度でも再送できる**（`notify-csv-modified` は正しく条件付きUPDATEで防いでいる） | `requests.notified_at` 等を追加し、`.is('notified_at', null)` の条件付きUPDATEが1行返ったときだけ送信 | 0.5人日 |
| M-14 | ★3 | `sign/[id]/reissue/route.ts:75-92` | **認証コード再発行のクールダウンが現行フローの契約で機能しない**。`prevExpiresAt` が常に null のため判定に入らない → メール爆撃が可能 | `sign_auth_last_issued_at` 列を追加して発行時刻を直接持つ | 0.5人日 |
| M-15 | ★3 | `lib/autoChecks.ts:130` | **最賃改定検知が正社員・無期契約を構造的に取りこぼす**。`periodEnd = employEnd \|\| employStart \|\| contractStartDate` で、期間の定めがない契約は過去日が入り、改定行が常に除外される | 期間の定めがない契約は `periodEnd = 今日` で評価 | 0.25人日 |
| M-16 | ★3 | `app/api/admin/master-data/route.ts:264-302` | **メーリングリストのメールアドレスが無検証**。`"a@appart.co.jp, attacker@evil.com"` を入れると `to: toEmails.join(',')` で外部へ複製配送される | `/^[^\s@,;]+@appart\.co\.jp$/i` の形式＋自社ドメイン限定バリデーション | 0.25人日 |
| M-17 | ★3 | `app/api/admin/master-data/route.ts:178-188` | **所定労働時間マスタに「最新レコードのみ修正可」ガードがない**（最低賃金にはある）。API直叩きで過去履歴を書き換えられ、過去契約のPDF再生成内容が変わる | `update_minimum_wage` と同じ最新判定を追加 | 0.25人日 |
| M-18 | ★3 | `useRenewalCandidates.ts:553-567` | **CSV自動検索を候補件数分だけ無制限に並列発火**（1件あたり3クエリ）。50件で150リクエスト同時 → 初期表示が数十秒固まる | 5件ずつの逐次バッチに制限。恒久的にはDB関数側でまとめて解決 | 0.5人日 |
| M-19 | ★3 | `app/apply/page.tsx:1532-1548` | **申請完了後の後処理エラーが `try/catch` では捕まらず黙殺される**。supabase-jsはthrowせず `{ error }` を返すため、この `try/catch` は構造的に一度も機能しない | `const { error } = await ...; if (error) console.error(...)` ＋トースト表示 | 0.25人日 |
| M-20 | ★3 | `admin/page.tsx:1207,1348,1371`、`sales/page.tsx:547`、`apply/page.tsx:2104` | **コンポーネントを描画関数の内側で定義**しており、親の再レンダーごとに全ノードが破棄・再生成される。50件表示で検索欄に1文字打つたびに50枚のカードDOMが作り直される | モジュールトップレベルへ移し props で渡す | 0.75人日 |
| M-21 | ★3 | `app/api/admin/csv-import/route.ts` 全体 | **`maxDuration` の宣言がリポジトリ全体で0件**。1万行CSV＋直列メール送信でVercelタイムアウト（504）。**DBには途中まで書き込み済み**でロールバックなし | `export const maxDuration = 300` を宣言。既存確認/保護判定/upsert を並列化。行数・サイズ上限を設定 | 1人日 |
| M-22 | ★3 | `csv-import/route.ts:325-359, 390-440` | **自動マッチのループ内でメールをレート制限なしに直列送信**。1通1〜2秒 × 溜まった依頼数。しかも `requests.csv_import_status` は送信より前に `completed` に更新されるため、**通知が届かないまま完了扱いになった依頼は二度と通知されない** | 宛先解決を事前一括バッチ化。`Promise.allSettled` で並列度3〜5に制限。`notify_failed_at` を記録して再送可能に | 1人日 |
| M-23 | ★3 | `app/dashboard/_shared/AccountManagementTab.tsx:285-405` | **アカウント作成/編集モーダルだけEsc・フォーカストラップ・入力破棄確認がない**。オーバーレイ誤クリックで入力消失。メール欄が `type="text"` で形式検証なし | `ConfirmProvider` と同じ処理を共通フック化して適用 | 0.5人日 |
| M-24 | ★3 | 5ルート | **`await req.json()` を try で囲っていない** → Content-Type不正・空ボディで未捕捉例外→500。他ルートは400を返しており不統一。加えて body を `as {...}` で型アサートしているだけで実行時検証がない | `await req.json().catch(() => null)` に統一。zod等でスキーマ検証を導入 | 0.5人日 |
| M-25 | ★3 | `app/api/account-setup/complete/route.ts:60-96` | **`setup_code` が `complete` 成功後も消費されず、同じコードで recovery トークンを何度でも発行できる**。`generateLink({type:'recovery'})` の `hashed_token`（パスワード設定できる完全な認可トークン）をレスポンスボディで平文返却 | `complete` 成功時点でコードを消費。`finalize` は冪等に成功を返すだけにする | 0.5人日 |
| M-26 | ★3 | `app/api/admin/accounts/route.ts:307-338` | **`resend_code` がパスワード設定済みの現役アカウントにも新コードを発行する** → アカウント管理権限を持つ1人が他管理者のパスワードを奪取できる経路 | 対象を `frozen` / `needs_password_setup=true` に限定し、実行を監査列に記録 | 0.25人日 |

---

## 5. ★★☆☆☆ 軽微（抜粋）

| # | 場所 | 問題 | 修正案 |
|---|---|---|---|
| L-01 | `app/layout.tsx:29` | `<html lang="en">` のまま（全画面が日本語）。スクリーンリーダーが英語音声、Chromeが毎回翻訳を提案 | `lang="ja"` |
| L-02 | `lib/mail.ts:589-595` | 更新期限ダイジェストの各行だけ日付がハイフン生値（`2026-09-30`）。件名は漢字表記に統一済み | `formatDateJp()` を使用 |
| L-03 | `app/pledge/apply/page.tsx:586,592` | 誓約書PDFの日付だけスラッシュ表記。**保存時に文字列で固定される**ため過去分の遡及修正も不可 | `formatDateJp()` を使用。PDF生成時に生データから整形し直す方式にすれば過去分も救済可 |
| L-04 | `RenewalManagementTab.tsx:1126-1129` | 一括実行プレビューの「新期限」だけハイフン生値 | `formatDateJp()` |
| L-05 | `contracts/[id]/pdf/route.ts:88` | ダウンロードファイル名が `contract.pdf` 固定。複数保存すると区別不能 | `filename*=UTF-8''...` の RFC 5987 形式（`protected-export/route.ts:64` に正しい実装あり） |
| L-06 | `useApprovedAccumulator.ts:94` | 全期間検索が LIKE ワイルドカード（`%` `_`）を素通し → `%` 1文字で全件マッチ | `q.replace(/[%_]/g, ch => '\\' + ch)` |
| L-07 | `useRenewalCandidates.ts:122-128` ほか3箇所 | 日付計算が「UTC解釈のDate＋ローカル setHours」の混在。UTC−側の環境で残日数が1日ずれる | `new Date(str + 'T00:00:00')` に統一 |
| L-08 | `apply/_lib/helpers.ts:389-435`（同一実装が3ファイルにコピー） | 文字差分（LCS）が O(n×m) の全DP行列。2000文字×2000文字＝400万セルを `useMemo` なしで毎レンダー計算 | 閾値超過時は全文並記へフォールバック。3ファイルを1つに統合し `useMemo` |
| L-09 | `StepPeriod.tsx:128`、`StepSalary.tsx:117-185` | 一行入力の文字数上限が未設定（`StepDispatchContact` は対応済み）。金額欄は数字以外もstateに残る | `maxLength` ＋ `replace(/[^0-9]/g,'')` |
| L-10 | `cron/*/route.ts` 3本 | Cron シークレットの比較が非定数時間（`!==`）。`lib/timingSafeEqual.ts` があるのに未使用 | `timingSafeEqualStrings()` に置換 |
| L-11 | `lib/pdfAccessToken.ts:10` | PDFアクセストークンがURLクエリ（`?t=`）に載り、30分・回数無制限。Vercelアクセスログ・Referer・ブラウザ履歴に残る | 有効期限を5分に短縮し、`X-Pdf-Token` ヘッダー渡しへ |
| L-12 | `lib/pdf/pdfShared.tsx:29` | `registerHyphenationCallback(word => word.split(''))` がプロセス全体に効き、英単語が任意位置で分割される（`e-s\ntaffing`） | `word => /^[\x20-\x7E]+$/.test(word) ? [word] : word.split('')` |
| L-13 | `lib/pdf/pdfShared.tsx:459-463` | `AutoFitFreeText` の行数推定が全角1em前提。ASCII主体だと行数を2倍近く過大評価し、不必要に小さいフォントが選ばれる | `[...text].reduce((w,c)=> w + (isHalfWidth(c)?0.5:1), 0)` |
| L-14 | `package.json` | `xlsx@0.18.5` に CVE-2023-30533（Prototype Pollution）/ CVE-2024-22363（ReDoS）。npm版は更新停止 | SheetJS公式CDNの 0.20.x へ、または `exceljs` へ移行 |
| L-15 | `package.json` | `googleapis: "latest"` / `nodemailer: "latest"` / `@types/nodemailer: "latest"` — **バージョン固定なし**。ビルドのたびに別バージョンが入る可能性 | 具体バージョンにピン留め |
| L-16 | `lib/csvImportShared.ts:106-124` | 全角空白（`\u3000`）の正規化が不統一。`unique_key` に混入すると同じ契約が二重登録される | `String(v).replace(/\u3000/g,' ').trim().replace(/\s+/g,' ')` に統一 |
| L-17 | `lib/staffMasterImportShared.ts:109` vs `scripts/import-master.js:233` | Web版とCLI版で `dept_no` の型強制が異なる。`Number('')` → `0` で存在しない部門No.0 に紐付く可能性 | `Number.isFinite` チェック。CLI版を `lib/` の関数を呼ぶ薄いラッパーへ |
| L-18 | `admin/page.tsx:1440` 他2箇所 | ヘッダーの `min-w-max` により、モバイルでページ全体が常時横スクロールする | ヘッダーだけ `flex-wrap` に |
| L-19 | `AccountManagementTab.tsx:131`、`RenewalManagementTab.tsx:233,458` | 凍結解除に確認ダイアログなし。小リンクの実効タップ領域が約16px（推奨44px） | `useConfirm()` を挟む。`py-2 px-2` でヒットエリア確保 |
| L-20 | `MasterManagementTab.tsx` の3セクション | `useState(() => 初期値)` は初回マウント時のみ実行されるため、`reload()` 後の変更が下書きに反映されない | `data` を依存にした `useEffect` で未編集行だけ同期 |
| L-21 | `login/page.tsx:40` | `setTimeout(() => router.push(...), 700)` がアンマウント後に発火しうる。`loading` を `false` に戻さないため遷移失敗時は「ログイン中...」で固定 | `useRef` に保持して `clearTimeout` |

---

## 6. Supabase / DB 層の総括

### 6-1. RLSポリシーの実査結果（21テーブル / 44ポリシー）

| 評価 | テーブル | 内容 |
|---|---|---|
| 🟢 良好 | `contracts` / `pledges` / `renewal_candidates` / `contract_monitoring_actions` | `current_role_name()` + `current_dept_scope()` によるロール×部門の適切な制御。`work_place='社内'` の分離も実装済み |
| 🟢 良好 | 各種マスタ（`office_master` / `minimum_wage_master` / `standard_working_hours_master` / `mailing_list_master` / `department_master`） | SELECT=全認証ユーザー、INSERT/UPDATE=管理部のみ。ただし **DELETEポリシーが全マスタで未定義**（＝クライアントから削除不可。意図的ならOK） |
| 🟢 良好 | `faq_entries` / `faq_inquiries` / `work_description_templates` | 適切 |
| 🔴 **危険** | **`staff`** | `ALL` / `auth.role()='authenticated'` → **指摘 C-01** |
| 🔴 **危険** | **`csv_raw_data` / `csv_imports` / `master_imports` / `csv_diff_logs`** | 無条件 SELECT または ALL → **指摘 C-02** |
| 🟡 注意 | `dispatch_fee_master` | RLS有効・ポリシー0件（Security Advisor の指摘）。service role経由のみで意図どおりだが、**明示的な deny コメント or 空ポリシーの意図をSQLに残すべき** |
| 🟡 注意 | `staff_roles` | SELECT が `id = auth.uid()` のみ。UPDATE/INSERT/DELETE ポリシーなし（service role経由のみ）＝正しい |
| 🟡 注意 | `company_master` | 全認証ユーザーがSELECT可。自社情報なので実害なし |

### 6-2. SECURITY DEFINER 関数（Security Advisor 指摘）

| 関数 | 問題 | 対応 |
|---|---|---|
| `increment_attempt_counter(text,text,uuid)` | **anon から実行可能**。ただし `(p_table, p_column)` のホワイトリスト検証が関数内にあり、`format('%I')` で識別子エスケープされているため**SQLインジェクションは成立しません**（実査で確認）。それでも anon が任意の契約・スタッフの試行回数を勝手にインクリメントし、**ロックアウトを誘発できます** | `revoke execute on function public.increment_attempt_counter(text,text,uuid) from anon, authenticated;`（サーバーからはservice roleで呼ぶため影響なし） |
| `current_dept_scope()` / `get_active_staff_count_by_dept()` | anon から実行可能。`current_dept_scope()` は anon だと `{null}` を返すので実害は小さいが、`get_active_staff_count_by_dept()` は**部門別の在籍者数を未認証で取得できます**（組織規模の推定に使える） | 両者から anon の EXECUTE を revoke |
| `current_dept_no()` / `current_role_name()` / `current_is_internal_approver()` | authenticated から実行可能。自分の値を返すだけなので実害なし | 現状維持で可 |
| `get_contract_monitoring_status()` / `get_latest_contracts_for_renewal()` / `has_active_dispatch_aspect()` | `STABLE`（SECURITY INVOKER）で、内部で `current_role_name()` / `current_dept_scope()` により絞り込み済み。**設計として適切** | 現状維持 |

### 6-3. Auth 設定

- 🔴 **Leaked Password Protection が無効**（Security Advisor）。HaveIBeenPwned 照合を有効にすること。
- 🔴 **Email Signup が有効の可能性**（B-02）。招待フローのみに制限すること。
- 🟡 パスワードポリシー：`isPasswordValid` は8文字以上＋大小英数字。**上限がないため、巨大な文字列で `scryptSync` を走らせるDoSが可能**（`maxLength: 128` を追加すること）。
- 🟡 `scryptSync` はNode既定パラメータ（N=16384）。bcrypt/argon2 相当には及ばないが実用範囲。将来 `N=2^15` への引き上げを推奨。

### 6-4. スキーマ設計上の指摘

| 重要度 | 内容 |
|---|---|
| ★3 | **`contracts.input_data` (jsonb) にすべてが押し込まれている**。`employee_number` / `employStart` / `employEnd` などの重要フィールドがJSONパス（`input_data->'staff'->>'employee_number'`）でしか引けず、**インデックスが効かない**。DB関数 `get_contract_monitoring_status()` / `get_latest_contracts_for_renewal()` は `contracts` 全件を毎回スキャンする構造。現在30件なので問題ないが、年間数百件×数年で確実に劣化する。→ 頻用フィールドを生成列（`GENERATED ALWAYS AS ((input_data->'staff'->>'employee_number')) STORED`）に切り出し、インデックスを張る |
| ★3 | **21件のFKにインデックスがない**（Performance Advisor）。`contracts_csv_raw_data_id_fkey` / `contracts_approved_by_fkey` など。件数が増えるとJOINと参照整合チェックが遅くなる → 全FKに `create index concurrently` |
| ★3 | **`staff.employee_number` 以外に業務キーのUNIQUE制約が乏しい**。`contracts` に「同一スタッフ×同一書類種別×同一期間」の重複防止制約がなく、アプリ側の `申請中` 重複チェック（`apply:1489`）だけが頼り。並列申請で二重契約が作れる → 部分ユニークインデックスを追加 |
| ★3 | **監査ログテーブルが存在しない**。記録されるのは `approved_by/at` / `rejected_by/at` / `withdrawn_by/at` / `force_approve_reason` / `sign_confirmed_ip/user_agent` のみ。**記録されないもの**：閲覧ログ、PDFダウンロードログ、マスタ変更履歴、アカウント権限変更履歴、`renewal_candidates` の全操作、取り下げ契約の物理DELETE（痕跡ゼロ） → 汎用 `audit_logs`（actor / action / target_table / target_id / before / after / at）を新設 |
| ★2 | **RLSポリシーで `auth.role()` / `auth.uid()` が行ごとに再評価される**（8ポリシー。Performance Advisor）→ `(select auth.uid())` にラップする |
| ★2 | **`contract_monitoring_actions` に SELECT の permissive ポリシーが2つ**。全行で両方が評価される → `or` で1つに統合 |
| ★2 | 未使用インデックスが4つ（`idx_csv_diff_logs_action_taken` / `idx_requests_request_type` / `idx_staff_name_kana` / `renewal_candidates_status_idx`）。データが少ないだけの可能性もあるため、本番稼働3か月後に再判定 |
| ★2 | **タイムゾーン**：日付列は `date` 型、日時列は `timestamptz` で適切。ただしアプリ側で `new Date('YYYY-MM-DD')`（UTC解釈）と `setHours`（ローカル解釈）が混在（L-07） |
| ★2 | **`updated_at` トリガー**：`update_updated_at()` が定義されているが、全テーブルに適用されているかは要確認。`contracts` は明示的に `updated_at: now` を渡している箇所があり二重管理になっている |

---

## 7. 業務フロー：ステータス遷移マップと停止箇所

### 7-1. `contracts.status` 遷移マップ

```
                        ┌──────────────────────────────────┐
                        │                                  │
   (新規) ──▶ 申請中 ──▶ SSC承認済み ──▶ 署名待ち ──▶ 署名済み ──▶ (完了：到達不能)
              │  ▲         │                │ ▲
              │  │         │  ロールバック  │ │
              │  │         └────────────────┘ │
              │  │         (メール送信失敗時)  │
              │  │                            │
              │  └── 差し戻し中 ◀─────────────┘（不可）
              │       │  ▲
              │       │  └── SSC/管理部が差し戻し（申請中からのみ）
              │       └── 再申請（担当営業のみ・条件付き）
              │
              └──▶ 取り下げ ──▶ (物理DELETE：30日後 or 手動)
```

**赤信号のポイント**

| 状態 | 問題 | 重要度 |
|---|---|---|
| `SSC承認済み` | **戻す手段が一切ない**。差し戻し・取り下げ・削除はすべて `申請中` / `差し戻し中` からのみ | ★4 |
| `署名待ち` | 同上 ＋ **署名依頼の再送手段がない**（C-06） | ★5 |
| `署名済み` | **訂正・失効の概念なし**。`?wageAmend=` で新契約を作れるが旧契約は `署名済み` のまま残り、どちらが有効か区別できない | ★4 |
| `完了` | **どのコードもこの値をセットしない**（全文grep済み）。`APPROVED_STATUSES`・各バッジ・`sign/complete:106` に存在するが到達不可能。SYSTEM_DESIGN 3-6章はステータス一覧に記載 | ★2 |
| pledges `差し戻し中` | **再申請導線が存在しない**（`/pledge/apply` に `?edit=` モードがない） | ★4 |

### 7-2. 差し戻し→再申請ループの欠落（3系統）

| ケース | 状況 | 重要度 |
|---|---|---|
| 担当営業（通常部門） | ✅ 成立 | — |
| 担当営業（統括部門＝広域本部/北日本/西日本/HRソリューション） | ❌ 一覧には出るが `?edit=` は `staff.dept_no` 完全一致判定のため編集不可（そもそも `staff` 行がない） | ★4（B-09） |
| SSC / 管理部の自己申請 | ❌ 再申請ボタンがない。`ssc/contracts/[id]:1062` は「取り下げて再申請してください」と案内するが、取り下げると入力内容は完全消失 | ★3 |
| アルバイト誓約書（全ロール） | ❌ `?edit=` モードが存在しない | ★4 |

### 7-3. 従業員が署名に到達できないパターン一覧

| パターン | 挙動 | 復旧手段 | 重要度 |
|---|---|---|---|
| `staff.email` が null | 400＋`SSC承認済み` へロールバック。**個別承認では画面に出ない**（C-07） | 管理部がStaffExpress再取込。ただし現状は全件 `ito@appart.co.jp` 固定 | ★5 |
| メールを紛失 | **再送不可**（C-06） | 従業員が自力で `/staff/login` を開き「認証コードでログイン」 | ★5 |
| コード5回誤入力 | 423ロック | `request-code` で新コード（`login_auth_attempts` をリセット）。ただし前コードが有効なら3分クールダウン | ★2 |
| コード期限切れ（2日） | 410 | 同上 | ★1 |
| パスワード10回誤入力 | 423ロック | 「パスワードをお忘れの場合」→`request-code`。**`set-password` まで到達しないと `login_password_attempts` は0に戻らない** | ★3 |
| 退職済みスタッフ | **ログインできてしまう**（B-06） | — | ★4 |

### 7-4. 「動いていると信じられている死にルート」：`/sign/[id]`

**SYSTEM_DESIGN.md 1-2章**：「スタッフ署名画面 | `/sign/[id]` | **実装済み**（本人確認・パターンA/C=丸印鑑生成…）」
**CLAUDE.md 画面一覧**：「`/sign/[id]` … は本番稼働中」

**コード上の事実**（実査）

- `contracts.sign_auth_code` を書く処理は `reissue/route.ts:112` にしか残っていない（2026-07-17のマイページ導入で `notify-sign-request` は契約単位コードの発行をやめた）
- `/sign/[id]` へのリンクを生成するのは `sendSignRequestMail`（`lib/mail.ts:114`）だけで、**その唯一の呼び出し元が `reissue/route.ts:119`**（＝`/sign/[id]` 画面からの再発行）。**循環しており、外部からの入口が存在しません**
- アプリ内リンクも0件（grep済み）
- 結果、`/sign/[id]` をURL直打ちしても `verify:66` の `!contract.sign_auth_code` により**必ず410「有効期限が切れています」**

**重要度 ★4**。「動いていると信じられている死にコード」が最も危険です。

**修正案**：(a) `/sign/[id]` とその3APIを廃止して設計書を訂正する、または (b) `notify-sign-request` で契約単位コードも併発行して実際に使える経路に戻す。**どちらかを明示的に決めること。**

---

## 8. 権限マトリクス（ロール × アクション）

凡例：**S**=サーバー側で強制／**C**=クライアント側のみ／**R**=RLS依存（アプリ層に判定なし）／**―**=不可

| アクション | 担当営業 | SSC | 管理部 | 社内承認者 | 従業員 | 所見 |
|---|---|---|---|---|---|---|
| 契約 一覧閲覧 | 自部門グループ **R** | 社内以外 **C** | 全件 **C** | +社内 **C** | 自分のみ **S** | RLSは適切。UIは補助 |
| 契約 詳細閲覧 | 自部門 **C** | 社内以外 **C** | 全件 **C** | +社内 **C** | ― | ⚠ グループ範囲未対応（B-09） |
| 新規作成 | ✅ **C+R** | ✅ | ✅ | ✅ | ― | RLS の INSERT check が有効 |
| 更新（再申請） | 自部門 **C** | ―（ボタンなし） | ―（ボタンなし） | ― | ― | ⚠ 3系統で断絶（7-2） |
| 更新（更新申請/最賃改定） | ✅ **R** | ✅ **R** | ✅ **R** | ✅ | ― | ⚠ アプリ層に部門チェックなし |
| 削除 | 取り下げ済み **R** | 同左 | 同左 | 同左 | ― | ⚠ 「本人のみ」がRLSにもUIにもない |
| 承認 | ― **C** | ✅ **C** | ✅ **C** | +社内 **C** | ― | ⚠ ロール判定がクライアント側。RLSのUPDATEポリシーが最後の砦 |
| 強制承認 | ― | ✅ **C** 理由必須 | ✅ **C** | ✅ | ― | 誓約書には強制承認の概念なし（赤警告を無言で通せる）★3 |
| 差し戻し | ― | ✅ **C** 理由必須 | ✅ **C** | ✅ | ― | |
| 取り下げ | 自分の申請 **C** | 同左 | 同左 | 同左 | ― | ⚠ `created_by === user.id` はクライアント判定のみ |
| CSV取込 | ― **S** | ― **S** | ✅ **S** | ✅ | ― | 🟢 適切 |
| CSVエクスポート | ― **S** | ― **S** | ✅ **S** | ✅ | ― | 🟢 適切 |
| メール：署名依頼 | ✅ **S（過剰）** | ✅ | ✅ | ✅ | ― | 🔴 **B-01：部門チェックなし** |
| メール：CSV修正通知 | ✅ **S（過剰）** | ✅ | ✅ | ✅ | ― | 🔴 **B-01** |
| メール：確認依頼 | ― **S** | ― **S** | ✅ **S** | ✅ | ― | 🟢 適切 |
| メール：更新しない通知 | ✅ **S** | ✅ | ✅ | ✅ | ― | ⚠ ロール不問（B-02と複合） |
| PDF閲覧（契約） | 自部門 **S** | 社内以外 **S** | **全件 S** | ✅ | 短命トークン **S** | 🔴 **B-10：社内案件が管理部全員に開放** |
| PDF再生成 | ― | ― | ― | ― | 署名時に自動 | 手動再生成の導線なし |
| マスタ編集 | ― **S** | ― **S** | ✅ **S** | ✅ | ― | 🟢 適切（所定労働時間の最新限定は未実装：M-17） |
| アカウント管理 | ― **S** | ― **S** | `is_account_admin` のみ **S** | 同左 | ― | 🟢 適切 |
| 更新期限管理（実行） | ✅ **C** | ―（UIのみ） | ✅ | ✅ | ― | ⚠ SSCの制限がUIのみ。RLSは `ALL` で通してしまう |
| 契約状況モニタリング | 閲覧のみ **C+R** | 閲覧 | 閲覧+対応+依頼 **S** | ✅ | ― | 🟢 RLS適切 |
| **`staff` テーブル直接操作** | **フルCRUD R** | **フルCRUD** | **フルCRUD** | **フルCRUD** | ― | 🔴🔴 **C-01：致命的** |
| **`csv_raw_data` 直接読取** | **全件 R** | 全件 | 全件 | 全件 | ― | 🔴 **C-02** |

---

## 9. 実運用（数十人規模）での考慮漏れ

| # | 論点 | 現状 | リスク | 重要度 |
|---|---|---|---|---|
| 9-1 | **退職者** | 検索・候補一覧では除外。しかし①cronは除外しない ②`/staff/login` で退職者もログイン可 ③退職時に `署名待ち` の契約が残ると誰も処理できない ④`renewal_candidates` 行が残留 | 退職者が給与記載PDFに無期限アクセス。対応不能な通知の恒久発生 | ★4 |
| 9-2 | **部署異動** | `contracts.created_by_dept_no` / `renewal_candidates.dept_no` は申請時のスナップショット。`staff.dept_no` の変更は反映されない | 更新期限が旧部門に留まり、新担当が知らない。最賃は「現在のstaff.dept_no」で判定するため**契約は旧部門基準で作られたのに検知は新部門基準**という混在 | ★4 |
| 9-3 | **兼務** | `staff_roles` は1アカウント1ロール1部門。統括部門は `DEPT_GROUP_SCOPE` のハードコード（`helpers.ts:194-199`） | 部門の新設・統合・兼務のたびにコード修正＋デプロイが必要。非エンジニアでは対応不可 | ★3 |
| 9-4 | **同姓同名** | 一覧・更新期限管理・モニタリングとも氏名が主表示。`staff.name` に UNIQUE なし。署名時の氏名一致チェックは2026-07-24に廃止 | 別人の契約を承認・署名依頼する誤操作。特に一括承認は氏名だけ見て選ぶ運用になりやすい | ★3 |
| 9-5 | **社員番号の再利用** | UNIQUE キーでの全件upsert。同一人物検証なし | **C-08：新入社員のマイページに前任者の契約が全件表示** | ★5 |
| 9-6 | **契約の遡及訂正** | 手段なし。`?wageAmend=` だけが例外だが旧契約を無効化しない | 誤った労働条件が署名済みで確定し、法的に正しい書類が出せない。二重契約状態 | ★4 |
| 9-7 | **年度切替** | 労使協定の有効期間終了日を `documentText.ts` が年度から算出。派遣料金額マスタは年度別だが切替の運用手順・警告なし | 4/1にマスタ更新を忘れると古い派遣料金額が印字された就業条件明示書が出続ける | ★3 |
| 9-8 | **最低賃金改定** | 検知機能あり。ただし①正社員・無期を構造的に取りこぼす（M-15）②1000件上限（M-12）③検知は「サブタブを開いたとき」のみで**cron・メール通知なし** | 10月の改定を誰もタブを開かず見逃す＝最賃法違反 | ★4 |
| 9-9 | **監査ログの不在** | 承認・差し戻し・取り下げ・強制承認理由・署名IP/UAは記録。**閲覧ログ・PDFダウンロードログ・マスタ変更履歴・権限変更履歴・物理DELETEは痕跡ゼロ** | 「誰が最賃マスタを書き換えたか」「誰が取り下げ案件を消したか」が追えない。労基署対応・内部監査で説明できない | ★4 |
| 9-10 | **データ保持期間** | 取り下げ30日で物理削除、`csvMeta` は署名から2年で削除。**契約本体・署名済みPDF・`csv_raw_data`・`requests` は未定義** | 労基法109条の記録保存（雇用契約関係5年）に対する方針が未文書化。Supabase無料枠500MB / Drive 1GB の天井も | ★3 |
| 9-11 | **個人情報の削除・開示請求** | **完全に未対応**。スタッフの全データを串刺しで抽出する手段がない（`contracts.input_data` のJSONB、`renewal_candidates`、`pledges`、`csv_raw_data`、Drive上のPDF、メールログに分散）。削除する手段もない（`staff` のDELETEは `contracts.staff_id` のFKで失敗） | 個人情報保護法の開示・利用停止請求に応答できない | ★3 |
| 9-12 | **社内承認者の後継者不在** | `is_internal_approver` 保持者の凍結時、残数チェックなし（`is_account_admin` のみチェック） | 社内案件が永久に承認不能に | ★3 |
| 9-13 | **休職・待機** | 未実装。`staff.work_place` は現場/社内の2値のみ | 休職中スタッフにも更新期限アラート。復職時の契約再締結漏れを検知できない | ★3 |

---

## 10. 設計書と実装の乖離（要訂正）

| # | 文書 | 記述 | 実装 | 重要度 |
|---|---|---|---|---|
| 10-1 | SYSTEM_DESIGN 1-2章 | 「`/sign/[id]` **実装済み**・本番稼働」 | **入口が存在しない死にルート**（7-4） | ★4 |
| 10-2 | SYSTEM_DESIGN 3-8章 | `staff_roles` は「※設計確定・**未作成**」＋ `staff_id` / `system_role` 列のDDL | 実装は `id`（=`auth.users.id`）を主キーに `role` 列。`staff_id` も `system_role` も存在せず、`staff` とのリレーションがまったくない | ★4 |
| 10-3 | SYSTEM_DESIGN 3-6章 | ステータス一覧に「完了」 | 遷移するコードが存在しない | ★2 |
| 10-4 | SYSTEM_DESIGN 7-4章 | 「全メール本文に個人情報・契約内容・氏名を含めない」 | 社内向け通知の大半が氏名・社員番号・給与差分を含む（例外は `sendCsvModifiedNotifyMail` のみ明記） | ★2 |
| 10-5 | SYSTEM_DESIGN 1-3章 | テーブル一覧に `notifications` / `users` / `clients` 等（削除済み）。稼働中の `pledges` / `office_master` / `faq_*` 等が未記載 | — | ★2 |
| 10-6 | SYSTEM_DESIGN 8章 差分監査表#4 | 「署名画面未実装」 | 署名画面もマイページも実装済み（2026-06-30時点のまま） | ★2 |
| 10-7 | SYSTEM_DESIGN 9-2章 | `RENEWAL_NOTIFY_OVERRIDE_EMAIL` を「更新期限管理用」と説明 | 実際は**7つのAPI**が参照。本番切替時の影響見積りを誤る | ★2 |
| 10-8 | `csv-import/route.ts:106` コメント | 「安全側（保護しない＝上書き）に倒さず」 | **実際は上書きされる**（C-04） | ★5 |
| 10-9 | `sign/[id]/complete/route.ts:31-35` コメント | 「入力されたフルネームとスタッフマスタの氏名が一致することの検証を追加する」 | 実装は空文字チェックのみ（2026-07-24に廃止したがコメントが残置） | ★3 |
| 10-10 | `master-data/route.ts:8-10` コメント | 「最低賃金・所定労働時間とも直近レコードのみ修正可」 | 所定労働時間には最新判定がない（M-17） | ★3 |
| 10-11 | `staff/login/route.ts:34` コメント | 「同じエラー文言で応答する」 | 3分岐している（B-05） | ★4 |
| 10-12 | `ssc/pledges/[id]/page.tsx:7` コメント | 「強制承認の概念も無い＝そもそも自動警告が存在しない」 | 2026-07-24に自動チェックを実装済み。**赤警告でも理由なしで承認できる** | ★3 |
| 10-13 | CLAUDE.md 優先タスク9 | 「**本人の**取り下げ済み申請のみ削除可」 | `withdrawn_by` / `created_by` の条件がコードにもRLSにもない | ★3 |
| 10-14 | `restore-csvmeta/route.ts:9-12` コメント | 「復元前の状態を失うわけではない」 | 復元前の `csvMeta` はどこにも保存されない（Driveのバックアップは署名時点の1世代のみ） | ★3 |

**コメントと実装の乖離は、レビュアーと将来の開発者を誤らせるという意味で、バグそのものと同等に危険です。** 上記14件は修正時に必ずコメントも直してください。

---

## 11. リリース判定

# 🔴 公開禁止

### 判定理由

**1. 個人情報保護法上の安全管理措置を満たしていません（C-01 / C-02）**

`staff` テーブルのRLSが「ログインしていれば全員フルCRUD」になっており、社内アカウント1つで全従業員1,801名の氏名・生年月日・住所・**パスワードハッシュ**を取得でき、パスワードの差し替えによる成りすましも可能です。これは画面のバグではなくDBの設定であり、アプリを直しても塞がりません。**このまま公開すると、初日から漏えいインシデントが成立しうる状態です。**

**2. 電子契約の証拠力が成立していません（C-01 / C-08 / M-09）**

成りすまし署名が可能で、入力氏名（`sealName`）は保存されず、印影は任意画像を送れます。争いになった際に「本人が署名した」ことを立証できません。契約書管理システムとしての本質的な要件が満たされていません。

**3. 法的文書に記載漏れが発生します（C-05）**

アルバイト誓約書のMIXパターンで、就業日の最終行が無言でPDFから消えます。誰も気づけない形で、合意していない日に就業させたことになる書類が原本として保存されます。

**4. 業務が静かに止まり、止まったことに誰も気づけません（C-06 / C-07）**

署名依頼メールが送れなかったのに「送信しました」と表示され、再送手段もありません。数十人が使えば月に数件は必ず発生し、そのたびに人力での状況調査が必要になります。

**5. 1回の誤操作でデータが破壊されます（C-03 / C-04 / B-12）**

CSV取込を1回実行するだけで、全員のメールアドレスが上書きされる／退職フラグが消える／締結済み契約のスナップショットが壊れる、という経路が3つあります。いずれもロールバック手段がありません。

### 一方で、評価すべき点

公平を期して記しておきます。**このシステムの品質は、規模のわりに高い部類です。**

- 二重送信ガードとして**条件付きUPDATE**（`.eq('status', ...)` / `.is('notified_at', null)`）が6箇所以上で一貫して使われており、状態遷移の競合に対する設計思想が明確です
- 試行回数カウンタが**DB側のアトミック加算**（`increment_attempt_counter`）に統一され、認証コードは `crypto.randomInt`、比較は `crypto.timingSafeEqual` と、暗号まわりの基本が守られています
- Cron 3本すべてに `CRON_SECRET` 検証があり、**未設定時も401を返すフェイルクローズ**になっています
- 環境変数のフォールバック文字列を廃してフェイルクローズ化した対応（`lib/requiredEnv.ts`）は、正しい判断です
- Google Drive の孤児ファイル対策（署名失敗時の削除補償）が実装されています
- `contracts` / `pledges` / `renewal_candidates` のRLSは、ロール×部門×社内案件の3軸を正しく表現できています
- 過去4回の総合レビュー指摘に対する修正が、コメント付きで丁寧に追跡されています

**問題は「作り込みが甘い」ことではなく、「守りの網に部分的な穴が残っている」ことです。** 穴の数は多くありませんが、1つ1つが致命的です。

### 段階的リリースの提案

| 段階 | 条件 | 可否 |
|---|---|---|
| **社内デモ・受入テスト** | 現状のまま（テストデータのみ） | ✅ 可 |
| **パイロット（1部門・10名）** | ★5 全8件を修正済み | ⚠ 条件付き可（本番個人情報を入れる場合はC-01/C-02が必須） |
| **限定リリース（3部門・30名）** | ★5 全件 ＋ ★4 のうち B-01/B-02/B-03/B-05/B-06/B-07/B-10 | ⚠ 条件付き可 |
| **全社リリース（数十〜100名）** | ★5 ＋ ★4 全件 ＋ ★3 の主要15件 | ❌ 現状不可 |

---

## 12. さらに品質を高めるための改善提案 30件

前章までの「不具合の修正」とは別に、システムとして次の段階へ進むための提案です。

### 開発プロセス・品質保証

1. **自動テストが1件も存在しません**（`*.test.ts` / `*.spec.ts` が0件）。最低限、`lib/autoChecks.ts`（最賃・金額異常の判定）、`lib/csvImportShared.ts`（キー生成・パース）、`lib/staffPassword.ts`、`lib/pdf/documentText.ts` の純関数に Vitest でユニットテストを入れてください。この4ファイルだけで、変更時の事故のかなりの割合を防げます。
2. **E2Eテスト（Playwright）で「申請→承認→署名→完了」の1本道を自動化**してください。この1本が通り続けることが、リリースの最低条件になります。
3. **CIを設定してください**（GitHub Actions）。現状 `tsc --noEmit` も `eslint` も手動です。`tsc_check.log` / `tsc2.log` が0バイトで残っているのは、手動実行の痕跡です。
4. **型の厳格化**：`tsconfig.json` に `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` を追加。`as {...}` による型アサートが API ルートに多用されており、実行時の型不整合を型システムが検知できていません。
5. **`zod` を導入し、全APIルートのリクエストボディを実行時検証**してください。現状は型アサートのみで、`issues: ContractMonitoringFollowupItem[]` のような配列は要素の型が未検証のままメール本文に入ります。
6. **プレビュー環境（Vercel Preview）を本番DBから切り離す**。現状の構成では、プレビューデプロイが本番Supabaseを参照している可能性があります。Supabase Branching で分離してください。
7. **`patches/` の内容をREADMEに記載**。`patch-package` で何を当てているのかが不明で、依存更新時に失われます。
8. **`docs/SYSTEM_DESIGN.md`（1MB）と `CLAUDE.md`（195KB）が肥大化**しています。「現在の仕様」と「決定の履歴」を分離してください。現状、どちらが現行仕様か読み手が判断できません（10章の乖離14件はこれが原因です）。

### 監視・運用

9. **Sentry（またはVercel Log Drains）を導入**してください。現状、本番でエラーが起きても `console.error` が Vercel のログに流れるだけで、誰も見ていません。C-07 のようなサイレント障害は、監視がなければ永久に発見されません。
10. **メール送信の成否をDBに記録するテーブル**（`mail_logs`：宛先・件名・送信結果・エラー・関連ID）を新設してください。「送ったはずのメールが届いていない」の調査が現状まったくできません。
11. **管理部向けの「システム健全性ダッシュボード」**を用意してください。①署名待ちで7日超過の件数 ②pending のまま14日超過の依頼 ③直近のCSV取込エラー ④メール送信失敗の件数 の4つを1画面に。
12. **Supabaseの日次バックアップ設定と、リストア手順の実地訓練**を行ってください。C-01/C-03 のようなデータ破壊は、バックアップからの復旧が唯一の手段です。「バックアップがある」と「戻せる」は別です。
13. **Google Drive のストレージ使用量アラート**（1GB上限）。署名済みPDFが1件あたり200KB程度なら5,000件で天井です。
14. **Vercel Cron の実行結果の可視化**。現状、cronが失敗しても誰も気づきません。実行結果を `cron_runs` テーブルに記録し、2日連続失敗で管理部へ通知してください。

### セキュリティ

15. **`SUPABASE_SERVICE_ROLE_KEY` の署名鍵流用をやめ、`SESSION_SIGNING_SECRET` を分離**（B-08）。あわせて service role key のローテーション手順を文書化してください。
16. **CSP（Content-Security-Policy）ヘッダーを設定**してください。`next.config.ts` は3行しかなく、セキュリティヘッダーが一切ありません。`Strict-Transport-Security` / `X-Content-Type-Options` / `Referrer-Policy` も同時に。
17. **依存パッケージの脆弱性スキャン**（Dependabot / `npm audit` をCIに組み込む）。`xlsx@0.18.5` の既知CVE（L-14）が放置されています。
18. **`googleapis` / `nodemailer` の `"latest"` 指定をピン留め**（L-15）。ビルド再現性がありません。
19. **ログインの多要素認証**。社内アカウント（特に `is_account_admin`）は Supabase Auth の MFA を有効化してください。1アカウントの漏えいで全従業員データにアクセスできる構造（C-01修正後も管理部は全件見られます）です。
20. **アップロードファイルのウイルススキャン**。管理部が任意のxlsx/csvをサーバーにアップロードし、service role権限のプロセスでパースしています。

### データ・DB

21. **`contracts.input_data` の頻用フィールドを生成列に切り出す**（`employee_number` / `employStart` / `employEnd` / `staff_name`）。JSONBパスでのフィルタはインデックスが効かず、件数増加で確実に劣化します。
22. **21件の未インデックスFKにインデックスを追加**（`create index concurrently`）。
23. **汎用 `audit_logs` テーブルの新設**（9-9）。労基署対応・内部監査の観点から、これは「あったほうがいい」ではなく「ないと説明できない」種類の欠落です。
24. **物理DELETEを論理削除に置き換える**。取り下げ契約の30日後DELETEは、証跡の観点で危険です。`deleted_at` によるソフトデリートに変更してください。
25. **RLSポリシーをリポジトリのマイグレーションファイルとして管理**してください。現状 `docs/sql/` にはFAQのDDLしかなく、44個のRLSポリシーがSupabaseダッシュボード上にしか存在しません。**環境の再構築ができず、レビューもできません。** `supabase db pull` でスキーマをコード化してください。
26. **`renewal_candidates` に「なぜこの候補が消えたか」の履歴**を持たせてください。現状、退職・異動で候補が消えると理由が追えません。

### UX・業務

27. **一括承認の確認ダイアログに社員番号を必ず併記**（9-4）。同姓同名の誤承認は、実際に起きたときの影響が大きい割に、対策コストが極めて低い項目です。
28. **申請ウィザードの下書き自動保存**（M-04）。10〜20分の入力が消える体験は、実運用で最も苦情が出ます。`sessionStorage` への30秒ごとの保存だけでも効果は大きいです。
29. **「困ったときは」への導線を全画面のフッターに常設**。FAQチャットボットは実装されていますが、詰まったユーザーが辿り着けるかは別問題です。特に従業員のマイページ（署名前）に必要です。
30. **`DEPT_GROUP_SCOPE` のマスタ化**（9-3）。部門の統廃合のたびにエンジニアのデプロイが必要な構造は、数年運用すると必ず負債になります。管理部が画面から編集できる形にしてください。
31. **PDFのプレビューと本番出力を完全に同一のコードパスにする**。現状、署名前は動的生成、署名後はDriveから取得と経路が分かれており、「プレビューでは正しかったのに」という事故の余地があります。
32. **印刷用CSS（`@media print`）の整備**。契約書一覧やモニタリング画面を印刷して会議に持ち込む運用は必ず発生します。現状、印刷すると画面のナビゲーションまで出力されます。

---

## 付録A：修正優先順位つきタスクリスト（Phase 0）

| 順 | ID | 内容 | 工数 | 担当想定 |
|---|---|---|---|---|
| 1 | C-01 | `staff` テーブルのRLS差し替え ＋ `work_place` 更新のAPI化 | 1.0人日 | DB＋バックエンド |
| 2 | C-02 | `csv_raw_data` 等4テーブルのRLS縮小 ＋ 担当営業のCSV検索を関数経由へ | 1.5人日 | DB＋バックエンド |
| 3 | C-03 | メールアドレスのハードコード解除（環境変数化） | 0.5人日 | バックエンド |
| 4 | C-04 | CSV保護判定のフェイルクローズ化 | 0.5人日 | バックエンド |
| 5 | C-05 | `MAX_SCHEDULE_ROWS` を11に ＋ 切り捨てガード | 0.25人日 | フロント |
| 6 | C-06 | 署名依頼の再送機能 ＋ 期日超過通知cron | 1.5人日 | フル |
| 7 | C-07 | 個別承認のメール失敗検知（4箇所） | 0.5人日 | フロント |
| 8 | C-08 | 社員番号再利用の検証ガード | 0.5人日 | バックエンド |
| — | — | **Phase 0 小計** | **6.25人日** | |
| — | — | 回帰テスト（5ロール × 全フロー） | 2.0人日 | QA |
| — | — | **Phase 0 合計** | **8.25人日** | |

## 付録B：本番切替時の検証クエリ集

```sql
-- ① メールアドレスの重複がないこと（0行であること）
select email, count(*) from staff where email is not null
group by email having count(*) > 1;

-- ② メールアドレスが未設定のスタッフ（署名依頼が送れない）
select employee_number, name, dept_no from staff
where (email is null or email = '')
  and (retired_at is null or retired_at >= current_date);

-- ③ RLSポリシーが「認証済みなら全部OK」になっているテーブルの検出
select tablename, policyname, cmd, qual from pg_policies
where schemaname='public' and (qual = 'true' or qual like '%auth.role()%');

-- ④ 署名待ちのまま滞留している契約
select id, status, sign_requested_at, now() - sign_requested_at as elapsed
from contracts where status = '署名待ち' and sign_requested_at < now() - interval '7 days';

-- ⑤ 部門マスタに存在しない dept_no を持つスタッフ（孤立データ）
select s.employee_number, s.dept_no from staff s
left join department_master d on d.dept_no = s.dept_no
where s.dept_no is not null and d.dept_no is null;

-- ⑥ 最低賃金マスタが未登録の部門（申請がブロックされる）
select d.dept_no, d.dept_name from department_master d
left join minimum_wage_master m on m.dept_no = d.dept_no
where m.dept_no is null;

-- ⑦ 契約が参照する csv_raw_data が消えていないか（孤立参照）
select c.id, c.csv_raw_data_id from contracts c
left join csv_raw_data r on r.id = c.csv_raw_data_id
where c.csv_raw_data_id is not null and r.id is null;

-- ⑧ 社内承認者の残数（0だと社内案件が承認不能になる）
select count(*) from staff_roles where is_internal_approver = true and is_active = true;
```

---

*本レポートは、コードベース全文（約34,400行）、Supabase本番DBの実査（21テーブル / 44ポリシー / 15関数 / Advisor 2種）、および設計文書（約1.2MB）の突合に基づいて作成しました。実機でのブラウザ操作確認、負荷試験、フォントファイルの実体検証は実施していません（§1参照）。*
