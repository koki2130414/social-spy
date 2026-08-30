# SOCIAL SPY

> 交流を、ゲームにする。
> 交流会は、すでに諜報戦になっている。

交流会を舞台にした「スパイ探し × 交流ゲーム」のスマートフォン向けWEBアプリ（MVP）です。
参加者は全員「情報員（INFORMATION AGENT）」として MISSION を遂行しながら人と話し、
後半に公開される SPY MISSION を手がかりに、紛れ込んだ SPY を推理して投票します。

**スマホを見る時間より、人と話す時間を長くする** ことを最優先に設計しています。

---

## クイックスタート（デモモード）

外部サービスの設定は不要です。

```bash
npm install
npm run dev
# → http://localhost:3000
```

ブラウザで **http://localhost:3000/demo** を開くと、次の3つの視点を切り替えられます。

| 視点 | 内容 |
| --- | --- |
| 一般参加者として確認 | 佐藤 悠真（AGENT）。SPY情報は公開されるまで見えません |
| SPYとして確認 | 鈴木 玲奈（SPY）。自分専用の SPY MISSION が見えます |
| 管理者として確認 | フェーズ進行・参加者管理・投票結果を操作できます |

デモイベント: **CROSS TALK NIGHT vol.7** / イベントコード **`SPY2026`** / 参加者12名 / SPY 2名

### 管理者デモログイン

`/admin/login` からログインできます。

```
メールアドレス: admin@socialspy.demo
パスワード    : spy-demo-2026
```

（`.env.local` の `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` で変更できます）

### おすすめの確認手順（ゲーム全体の流れ）

ブラウザのタブを2つ（または通常ウィンドウ + シークレットウィンドウ）用意すると分かりやすいです。

1. タブA: `/demo` →「管理者として確認」→ ダッシュボードで **ゲーム開始 / OPERATION START**
2. タブB: `/demo` →「一般参加者として確認」→ `/game/missions` で **MISSION COMPLETE**
3. タブA: **SPY MISSION公開** → タブBの `INTEL` が `CLASSIFIED` から `SPY MISSION REVEALED` に自動で切り替わる
4. タブA: **投票開始** → タブBの `VOTE` が有効になり、FINAL VOTE を実行（1回のみ・変更不可）
5. タブA: **正体公開** → タブBの `RESULT` に SPY の正体と得票結果が表示される
6. `/demo` の「デモデータをリセット」でいつでも初期状態に戻せます

> 参加者画面はポーリング（4秒間隔）で自動的に追従します。Supabase 接続時は Realtime も併用します。
> タブBは「一般参加者」の代わりに「SPYとして確認」でも試せます（見え方の違いが確認できます）。

### 新規参加も試せます

`/join` でイベントコード `SPY2026` を入力すると、デモイベントに新しい参加者として登録され、
MISSION が3件自動配布されます（QRコード経由の場合はコードが自動入力されます）。

---

## 主な機能

### 参加者側

| ルート | 内容 |
| --- | --- |
| `/join` | イベントコード／QRコードから参加登録（表示名・所属は任意） |
| `/game` | 自分の役割、現在のフェーズ、残り時間、通知、達成数、次に行う操作 |
| `/game/missions` | 自分の MISSION 3件（自己申告で達成／取り消し）。SPY本人には専用MISSIONも表示 |
| `/game/intel` | 公開前は `CLASSIFIED`。公開後は SPY MISSION の内容のみ（誰がSPYかは非表示） |
| `/game/vote` | `VOTING` フェーズのみ。1人だけ選択 → 確認 → 確定（変更不可・二重投票不可） |
| `/game/result` | `IDENTITY REVEAL`。SPYの正体、自分の投票と正誤、得票数ランキング |

- 現在のフェーズで使えない導線は、理由が分かる状態で無効化されます
- 自分の役割は周囲の視線が気になるときにワンタップで非表示にできます

### 運営側

| ルート | 内容 |
| --- | --- |
| `/admin/login` | 運営者ログイン（未認証は管理ページへ入れません） |
| `/admin` | ダッシュボード。人数・SPY人数・達成数・投票済み・残り時間・最新通知・ゲーム操作 |
| `/admin/events` | イベント作成・編集、参加用URL、QRコード表示／ダウンロード |
| `/admin/participants` | 参加者一覧（検索・役割/投票フィルター）、SPY自動選出・手動設定、詳細 |
| `/admin/missions` | 一般／SPY MISSION の作成・編集・削除、有効切替、未配布者への一括配布 |
| `/admin/notifications` | 全体通知の送信（テンプレート付き）と送信履歴 |
| `/admin/results` | 投票済み／未投票者、得票数、SPYへ投票できた人数、投票結果一覧 |

フェーズ変更のような重大操作には確認ダイアログが表示されます。

### ゲームフェーズ

```
LOBBY → ACTIVE → SPY_MISSION_REVEALED → VOTING → IDENTITY_REVEALED → FINISHED
```

- 1段階ずつ前進のみ（巻き戻し不可）。`FINISHED` へはいつでも移行できます
- `ACTIVE` へ進むときに SPY が未設定なら、設定人数ぶん自動選出されます
- フェーズ変更時に対応する全体通知が自動送信されます

---

## 技術構成

| 領域 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 15（App Router） / React 19 |
| 言語 | TypeScript（strict） |
| スタイル | Tailwind CSS 3 + shadcn/ui 相当のコンポーネント（Radix UI ベース） |
| アイコン | Lucide Icons |
| フォーム / 検証 | React Hook Form + Zod |
| 日付 | date-fns |
| QRコード | `qrcode` |
| バックエンド | Supabase（PostgreSQL / Authentication / Realtime） |
| テスト | Vitest + Testing Library（jsdom） |
| 品質 | ESLint（next/core-web-vitals + typescript）/ Prettier |

パッケージマネージャーは **npm** です。

### ディレクトリ構成

```
src/
  app/                  ルーティング（App Router）
    api/                Route Handlers（すべてサーバー側で権限チェック）
    game/               参加者画面
    admin/(dashboard)/  管理画面（認証必須のルートグループ）
    demo/               デモ視点の切り替え
  components/
    ui/                 汎用UI（button, card, dialog, table ...）
    spy/                SOCIAL SPY 固有UI（GameShell, AdminShell, PhaseBadge ...）
  hooks/                状態取得・ポーリング・Realtime購読
  lib/
    core/               ゲームのドメインロジック（純粋関数・テスト対象）
    types.ts            ドメイン型（Participant と PublicParticipant を型で分離）
    validation.ts       Zod スキーマ
  server/
    repo/               データアクセス抽象（demo-repo / supabase-repo）
    service/            権限チェックとユースケース（participant / admin）
    auth/               参加者・管理者のセッション（HMAC署名Cookie）
    demo/               デモ用シードデータ
supabase/
  migrations/           スキーマ + RLS
  seed.sql              初期データ
```

### データアクセスの二重化

`Repo` インターフェースを `DemoRepo`（サーバー内メモリ）と `SupabaseRepo`（PostgreSQL）が実装し、
Supabase の環境変数が揃っていれば自動的に Supabase モードになります。
ゲームのルール（MISSION配布・投票検証・SPY情報の可視性・フェーズ権限）は
`src/lib/core/` の純粋関数に集約されており、どちらのモードでも同じロジックが使われます。

---

## セキュリティ設計

### SPY情報の秘匿

- 型レベルで分離: 参加者向けレスポンスは `PublicParticipant`（`role` を持たない型）のみ
- 参加者一覧APIは `role` を返しません（`/api/participant/vote/candidates`）
- 他参加者の MISSION 割り当ては参加者向けAPIに存在しません
- SPY MISSION は「SPY本人」または「公開フェーズ以降」でのみ返されます（`visibleSpyMissions()`）
- SPY の氏名は `IDENTITY_REVEALED` 以降のみ（`/api/participant/result`）

### 認証・権限

- 参加者: Supabase Auth のユーザーではなく、**サーバーが HMAC-SHA256 で署名した httpOnly Cookie** で識別（12時間有効）
- 運営者: Supabase Authentication でログインし、`users.is_admin` と `event_admins` を確認
- すべての管理APIはサーバー側で `requireAdmin()` → イベント権限チェックを実施
- `middleware.ts` は Cookie の有無による一次ゲートのみ。署名検証と権限判定は必ずサーバー側で行います
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー専用モジュール（`src/server/supabase/clients.ts`）からのみ参照し、クライアントバンドルには含まれません

### ルールの二重防御（フロントだけに依存しない）

| ルール | サーバー | データベース |
| --- | --- | --- |
| 1イベント1人1票 | `validateVote()` | `UNIQUE (event_id, voter_participant_id)` |
| 自分自身への投票禁止 | `validateVote()` | `CHECK (voter <> target)` |
| 投票後の変更・削除禁止 | 既存投票があれば拒否 | `BEFORE UPDATE/DELETE` トリガで例外 |
| 投票フェーズ以外の投票禁止 | `canVoteInPhase()` | `BEFORE INSERT` トリガでフェーズ確認 |
| MISSION の重複配布防止 | 配布時に除外 | `UNIQUE (participant_id, mission_id)` |
| role のクライアント改ざん | 管理APIのみ更新可 | `participants` に anon 向けポリシーを作らない |

### Row Level Security

全テーブルで RLS を有効化しています（`supabase/migrations/20260101000100_rls.sql`）。

- `participants` / `participant_missions` / `votes` … anon からは**一切参照不可**（管理者のみ）
- `missions` … 一般MISSIONは参照可、SPY MISSION は公開フェーズ以降のみ
- `events` / `notifications` … 参照のみ可（Realtime のため）。更新は `event_admins` のみ
- `participants_public` ビュー … `role` を含まない参加者情報のみを公開

---

## Supabase のセットアップ

1. Supabase プロジェクトを作成します。
2. SQL Editor で以下を順に実行します（`supabase` CLI を使う場合は `supabase db reset` でも可）。
   ```
   supabase/migrations/20260101000000_init.sql
   supabase/migrations/20260101000100_rls.sql
   supabase/seed.sql
   ```
3. Authentication > Users で運営者アカウントを作成します。
4. `supabase/seed.sql` 末尾のコメントを参考に、`public.users`（`is_admin = true`）と
   `public.event_admins` へ運営者を登録します。
5. `.env.local` に以下を設定します。
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
   SUPABASE_SERVICE_ROLE_KEY=xxxx     # NEXT_PUBLIC_ を付けないこと
   SPY_SESSION_SECRET=$(openssl rand -hex 32)
   NEXT_PUBLIC_APP_URL=https://your-domain.example
   ```
6. Database > Replication で `events` / `notifications` の Realtime が有効になっていることを確認します
   （マイグレーションで `supabase_realtime` パブリケーションに追加済みです）。

3つの Supabase 環境変数が揃うと、**デモモードは自動的に無効**になります。

### 環境変数

`.env.example` を参照してください。`.env.local` にコピーして使います（`.env.local` はコミットされません）。

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `SPY_SESSION_SECRET` | 本番で必須 | 参加者セッションCookieの署名鍵（16文字以上） |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase利用時 | プロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase利用時 | anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase利用時 | service role キー（サーバー専用） |
| `NEXT_PUBLIC_APP_URL` | 任意 | 参加用URL/QRコードのベースURL |
| `NEXT_PUBLIC_DEMO_MODE` | 任意 | `false` で明示的にデモモードを無効化 |
| `SPY_ALLOW_DEMO_IN_PRODUCTION` | 任意 | 本番デプロイでデモを許可する場合のみ `true` |
| `SPY_ENV` | 任意 | `production` を指定すると本番デプロイとして扱う |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | 任意 | デモ管理者の資格情報 |

---

## 開発コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # 本番ビルド
npm run start        # 本番サーバー
npm run typecheck    # 型チェック（tsc --noEmit）
npm run lint         # ESLint
npm run test         # Vitest
npm run format       # Prettier
npm run verify       # typecheck + lint + test + build をまとめて実行
```

### テスト

`npm run test` で実行されます。主な検証内容:

- MISSION が参加者へ3件配布される／重複配布されない
- MISSION を達成済みに変更できる／フェーズ外では変更できない
- 一般参加者が SPY 情報を取得できない（公開前・レスポンスに `role` を含まない）
- 公開前の SPY MISSION が一般参加者に表示されない／公開後は表示される
- SPY 本人は公開前でも自分の SPY MISSION を確認できる
- 自分自身へ投票できない／二重投票できない／投票後に変更できない／フェーズ外で投票できない
- 管理者以外がフェーズを変更できない（未認証・参加者セッションのみ）
- 複数SPYの正体を表示できる
- モバイル幅（360px）で MISSION の主要操作が利用でき、タップ領域が44px以上ある

---

## デザイン方針

- 黒基調のダークUI、警告色に赤、情報アクセントにライムグリーン／アンバー
- 見出しはモノスペースの機密文書調（`CLASSIFIED` スタンプ、控えめな走査線とグリッド）
- 1画面あたりの情報量を抑え、重要操作は大きなボタン（最小44px／主要操作は56px）
- 360px幅でも崩れないレイアウト、管理画面はデスクトップの表形式に最適化
- 過剰なアニメーションは使用しません（読みやすさと操作の分かりやすさを優先）

---

## 置いた仮定

仕様に明記されていなかった点は、以下のように仮定して実装しています。

1. **リポジトリは空だった** ため、`social-spy/` として新規に構築しました。
2. **参加者の識別**は、アカウント作成を避けるためサーバー署名付き httpOnly Cookie（12時間）としました。
   同一イベント内では**表示名を一意**とし、重複参加のエラー判定に利用しています。
3. **フェーズは1段階ずつ前進のみ**とし、巻き戻しは投票・MISSIONの整合性が壊れるため禁止しました
   （`FINISHED` への終了だけは常に可能）。
4. **SPY MISSION は全SPYに共通で全件付与**します（MVPのため個別配布は行いません）。
5. **SPY MISSION 公開タイミング**（`spy_reveal_offset_minutes`）は運営の目安表示であり、
   実際の公開は運営の手動操作で行います（自動公開は行いません）。
6. **残り時間**は `OPERATION START` を押した時刻 + ゲーム時間で計算します。
7. **リアルタイム反映**は 4 秒間隔のポーリングを基本とし、Supabase 接続時のみ Realtime を併用します。
   これによりデモモードでも同じ体験になります。
8. **デモモードのサンプル投票**は、`VOTING` に入った時点で NPC 参加者ぶんを自動生成します
   （実際に操作している参加者は対象外なので、自分で投票できます）。
9. **デモモードの既定値**は「Supabase 未設定かつ本番デプロイでない場合は有効」としました。
   `.env.local` が無くてもすぐデモを確認できる一方、Supabase 設定時・本番デプロイ時は自動的に無効になります。
10. **デモモードのデータはプロセスメモリ**に保持します。サーバーを再起動すると初期状態に戻ります。

---

## MVPに含めていない機能

複雑な役職、特殊能力、第三勢力、個人チャット、ポイント／ランキング、GPS、SNS連携、
複雑なMISSION承認フロー、ネイティブアプリ、過度なアニメーション。

## 本番公開前に確認すべき事項

- `SPY_SESSION_SECRET` を十分にランダムな値で設定する（未設定だと本番デプロイでは起動時にエラーになります）
- `SUPABASE_SERVICE_ROLE_KEY` が `NEXT_PUBLIC_` になっていないこと
- マイグレーションと RLS が適用され、anon キーで `participants` / `votes` が読めないことを実機で確認する
- `SPY_ALLOW_DEMO_IN_PRODUCTION` が `true` になっていないこと（`/demo` と `/api/demo/*` が 404/403 になること）
- `NEXT_PUBLIC_APP_URL` を本番ドメインに設定し、QRコードのリンク先を確認する
- 運営者アカウントの `is_admin` と `event_admins` の紐付け
- 会場のネットワーク（Wi-Fi/回線）で、ポーリングとRealtimeが安定して届くかの事前確認

## 今後追加すると良い機能

- 参加者セッションの再発行（機種変更・ブラウザ変更時の復帰）
- MISSION の個別配布・難易度バランス調整、SPY MISSION の個別割り当て
- ゲーム時間に応じた SPY MISSION の自動公開スケジューリング
- 投票の同数時の扱い（決選投票／運営裁定）の明示
- 結果のCSV／画像エクスポート、イベント終了後の振り返り画面
- Web Push による全体通知、オフライン時の再送
- 運営者の複数人運用（権限ロール、操作ログの可視化）
- 多言語対応（英語UI）
