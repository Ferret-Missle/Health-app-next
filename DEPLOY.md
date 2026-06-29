# Vercel デプロイ手順

このアプリ (`health-app-next/`) を Vercel に GitHub 連携でデプロイする手順。
許可リスト方式のマルチユーザ対応（許可した複数アカウントが各自別データを持つ）。
本番公開すると Google OAuth のテストモード制約 (refresh token 7日失効) が解消できる。

---

## 0. 前提: リポジトリ構成

`health-app-next/` は独自の `.git` を持つ単独リポジトリとして扱う（親ディレクトリ
`design_handoff_health_app` はデザイン資料・旧Vite版を含む作業場で、デプロイ対象外）。

```bash
cd health-app-next
git remote -v          # remote 未設定なら GitHub に新規リポジトリを作って add する
git remote add origin git@github.com:<you>/<repo>.git   # 例
git add -A && git commit -m "..."   # 未コミット作業をコミット
git push -u origin master
```

Vercel の **New Project → Import** でこのリポジトリを選ぶ。Root Directory は
リポジトリ直下（`health-app-next` が単独リポなので `./`）。Framework は Next.js
が自動検出される。

---

## 1. 環境変数 (Vercel → Project → Settings → Environment Variables)

ローカルの `.env.local` の値をすべて Production (必要なら Preview にも) に登録する。
`NEXT_PUBLIC_*` はクライアントに露出してよいもの。それ以外はサーバー専用。

| 変数 | 用途 | 備考 |
|---|---|---|
| `DATABASE_URL` | Neon 接続文字列 | Pooled 接続推奨 |
| `NEXT_PUBLIC_APP_URL` | 本番URL | **`https://<your-app>.vercel.app`** を明示設定。OAuthリダイレクトの基点 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | |
| `GOOGLE_REDIRECT_URI` | Google コールバック | **`https://<your-app>.vercel.app/api/auth/google/callback`**。Console登録値と完全一致必須 |
| `FATSECRET_CONSUMER_KEY` / `FATSECRET_CONSUMER_SECRET` | FatSecret OAuth1 | |
| `GROQ_API_KEY` | LLM (Groq) | |
| `GROQ_MODEL` / `GROQ_TPD_LIMIT` / `GROQ_BOOTSTRAP_TOKENS` | LLM 調整 | 任意。未設定で既定値 |
| `TOKEN_ENCRYPTION_KEY` | トークン暗号化鍵 | **ローカルと同じ値**にしないと既存暗号化行を復号できない |
| `FIREBASE_SERVICE_ACCOUNT` | Admin SDK 鍵JSON | サービスアカウントJSONの中身まるごと。`private_key`の改行はコード側で復元 |
| `ALLOWED_EMAILS` | 許可するユーザのGmail（カンマ区切り） | 例 `me@gmail.com, wife@gmail.com`。ここに無いアカウントは403。`email_verified` 必須 |
| `ALLOWED_UIDS` | 許可するFirebase UID（カンマ区切り、任意） | email の代わりに UID で許可したい場合 |
| `ALLOWED_UID` | （旧）単一オーナーUID | 後方互換で引き続き許可リストに加算される。新規は `ALLOWED_EMAILS` を推奨 |
| `LEGACY_OWNER_UID` | 既存データの所有UID（移行時のみ） | 単一ユーザDBを移行する際、既存行の `user_id` をこの値で埋める（未設定時は `ALLOWED_UID` を使用） |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase client | |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase client | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase client | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase client | |

> `NEXT_PUBLIC_APP_URL` 未設定時はコードが `VERCEL_URL` (デプロイ毎に変わる) に
> フォールバックするが、OAuth の redirect_uri は固定値一致が必要なので、本番は
> 必ず `NEXT_PUBLIC_APP_URL` と `GOOGLE_REDIRECT_URI` を明示設定すること。

---

## 2. 外部サービス側の本番設定

### Google Cloud (OAuth)
- 承認済みリダイレクトURIに **`https://<your-app>.vercel.app/api/auth/google/callback`** を追加
- OAuth同意画面を **「公開 (本番)」に切り替え** → これで refresh token の7日失効が解消
  （審査が要る場合あり。個人利用なら test ユーザー継続でも可だが7日再連携が必要なまま）

### FatSecret
- ダッシュボードの IP allowlist に **Vercel の出力IP** を登録する必要がある。
  Vercel のサーバーレスIPは固定でないため、Hobbyでは難しい。回避策:
  - 当面は手元(固定IP)からの同期に留める、または
  - FatSecret の IP制限を緩める／プロキシ経由にする（要検討）。
  ⚠️ ここはデプロイ後の既知の課題。Google同期は影響なし。

### Firebase
- Authentication → Settings → 承認済みドメインに **`<your-app>.vercel.app`** を追加

---

## 3. デプロイ後の確認

1. `https://<your-app>.vercel.app` で Google サインイン
2. 設定タブ → データ連携で Google 連携（state往復・コールバック確認）
3. 同期ボタン → daily_data 取得
4. ホームの AI アドバイザー（週次自動 + 手動）
5. 目標達成日の DatePicker 保存・残り日数表示

---

## 4. DB マイグレーション

本番が新しい Neon DB を使う場合は、一度だけスキーマ適用:

```bash
# .env.local の DATABASE_URL を本番用にして
node scripts/migrate.mjs
```

**単一ユーザ版から移行する場合（既存データを残す）**: 全テーブルに `user_id` を追加し、
既存行を従来オーナーのUIDで埋めてから主キー/一意制約を貼り替える。移行前に
`LEGACY_OWNER_UID`（=従来の `ALLOWED_UID`）を設定してから実行する:

```bash
# .env.local に LEGACY_OWNER_UID=<従来オーナーのFirebase UID> を入れて
node scripts/migrate.mjs
```

移行は冪等（再実行可）。既存行が残っているのに `LEGACY_OWNER_UID`/`ALLOWED_UID` が
未設定だと、空のオーナーで埋めないよう明示エラーで停止する。
移行後は `ALLOWED_EMAILS` に利用者のGmailを追加すれば、その人が自分専用データで使える。
