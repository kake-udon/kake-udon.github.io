# MLB Watch（MVP）

日本にいながらMLBの情報を手軽に得られるPWA。プロジェクト知識のロードマップ「1. 表紙 + 順位表」に対応するMVPです。

## 今回実装した範囲

- **表紙（ホーム）**
  - 本日の試合予定・結果を日本時間で表示（アメリカの試合日とJSTの日付ズレを考慮して算出）
  - 前日の試合結果（折りたたみ表示）
  - お気に入りチームの選択（IndexedDBに保存、該当カードをハイライト）
  - 豆知識（ランダム表示、今後コンテンツを拡充可能な構造）
- **順位表**
  - ア・リーグ/ナ・リーグ タブ、地区ごとのテーブル（勝敗・勝率・ゲーム差）
  - チーム名タップで直近±6日間の試合カレンダーをボトムシート表示
- **PWA基盤**
  - Service Workerによるアプリシェルのオフラインキャッシュ
  - IndexedDBによるAPIレスポンスのキャッシュ（オフライン時は直近データにフォールバック）
  - manifest.json（ホーム画面追加、standalone表示）
  - 球団ロゴ・商標は不使用。チームカラー（帯・ドット）とテキストのみで表現

## 未実装（次のロードマップ）

2026シーズンのポストシーズン対応（フェーズA〜E）を進行中です。フェーズごとの内容と進捗は
[`CLAUDE.md`](CLAUDE.md)の「未実装（次のロードマップ：2026ポストシーズン対応）」を参照してください。

## Web Push通知（毎日夕方ダイジェスト）のセットアップ

ロードマップ6として、毎日夕方（18時台、JST）にお気に入りチームの当日結果・次戦予定をプッシュ通知するダイジェスト機能を実装済みです。ただしGitHub Pagesは静的ホスティングのため、購読情報の保存と送信トリガーには外部サービス（Supabase / GitHub Actions）が必要です。**以下の設定は初回のみ、リポジトリのオーナーが手動で行ってください。**

### 1. Supabaseプロジェクトを作成する
1. https://supabase.com で無料アカウント・新規プロジェクトを作成
2. 左メニューの SQL Editor を開き、[`supabase/schema.sql`](supabase/schema.sql) の内容をそのまま実行してテーブルを作成
3. Project Settings → API から以下をコピーしておく
   - Project URL
   - `anon` `public` キー
   - `service_role` `secret` キー（**外部に漏らさないこと**）

### 2. クライアント側にSupabase接続情報を設定する
[`js/notifications.js`](js/notifications.js) 冒頭の以下2行を、上記でコピーした値に書き換える（この2値は公開前提のためコードにそのまま埋め込んでよい）。
```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

### 3. GitHub Secretsを設定する
リポジトリの Settings → Secrets and variables → Actions → New repository secret から、以下4つを登録する。

| Secret名 | 値 |
|---|---|
| `SUPABASE_URL` | 手順1でコピーしたProject URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 手順1でコピーした`service_role`キー |
| `VAPID_PUBLIC_KEY` | `js/notifications.js`に埋め込まれているVAPID公開鍵と同じ値 |
| `VAPID_PRIVATE_KEY` | VAPID秘密鍵（実装時に生成済み。チャットで共有された値。**絶対にリポジトリにコミットしない**） |

### 4. デプロイして実機で確認する
1. 変更をコミットしてGitHub Pagesへpush
2. Android版Chromeでサイトを開き、「ホーム画面に追加」でPWAとしてインストール
3. インストールしたPWAの表紙画面 →「通知設定」のトグルをONにして通知を許可
4. GitHubリポジトリの Actions タブ →「Send push notification digest」→「Run workflow」を`force: true`で実行し、実機に即座にテスト通知が届くか確認
5. 以降は毎日夕方（18時台JST。ポストシーズン中は15時台）に自動送信される

### 注意点
- `push_subscriptions`テーブルは氏名・メールアドレス等の個人情報を含まない（Push購読エンドポイントとお気に入りチームIDのみ）ため、RLSは`anon`キーからの読み書きを許可する簡易な設計にしている。
- GitHub Actionsのcronは60日間リポジトリへの操作がないと自動停止する仕様があるため、長期間コミットが無い場合は再度手動実行や軽微なコミットが必要になることがある。
- **送信時刻について**：GitHub Actionsのスケジュール実行は混雑時に数時間〜半日遅延することがある（実測で深夜〜翌朝に起動した回があった）。そのため送りたい時間帯に1日6回ずつ起動し、`scripts/send-notifications.mjs`がJSTの送信ウィンドウ内かどうかを判定して、ウィンドウ外に遅延した回は送信せずスキップする。ウィンドウを何度も逃した日は通知が届かないが、深夜・翌朝に通知が届いたり、日付をまたいだ実行のせいで翌日分が丸ごとスキップされたりするより望ましいという判断。ウィンドウは環境変数`NOTIFY_WINDOW_START_HOUR`/`NOTIFY_WINDOW_END_HOUR`で変更できる。
- **ポストシーズン中の送信時刻**：ポストシーズンは試合が日本時間の朝〜昼に終わるため、既定の送信ウィンドウを15:00〜17:59（レギュラーシーズンは18:00〜20:59）に前倒しする。切り替えはスクリプトがJSTの月日（9/28〜11/20）で判断し、cronは昼過ぎと夕方の両方の時間帯を年間通して起動しておく（ポストシーズンの開始・終了に合わせてcronを編集しなくて済むようにするため）。また、お気に入りチームに本日の試合も今後の予定も無い場合はその行を出さず、全チームがそうなった購読者にはその日の通知を送らない（敗退後に中身のない通知を毎日送らないため）。
- Push送信時にTTL（4時間）と`urgency: high`を指定しているため、端末がスリープ等で受信できないまま4時間を過ぎた通知は配信されずに破棄される（翌朝に古いダイジェストが届かないようにするため）。

## ファイル構成

詳細は[`CLAUDE.md`](CLAUDE.md)のディレクトリ構成を参照してください。

## GitHub Pagesへのデプロイ手順

1. 新しいリポジトリを作成し、このフォルダの中身一式をルートに配置してpushする
   ```bash
   git init
   git add .
   git commit -m "MLB Watch MVP"
   git branch -M main
   git remote add origin https://github.com/<your-account>/<repo-name>.git
   git push -u origin main
   ```
2. GitHubのリポジトリ設定 → Pages → Source を `main` ブランチ / `/ (root)` に設定
3. 数分後に `https://<your-account>.github.io/<repo-name>/` で公開される
4. スマホでそのURLを開き、ブラウザメニューから「ホーム画面に追加」でPWAとしてインストール可能

**注意:** GitHub Pagesはリポジトリ名のサブパス配下で公開されるため、`manifest.json`の`start_url`/`scope`は相対パス（`./`）にしてあります。パスを変更した場合は動作確認してください。

## データソースについて

- MLB Stats API（`statsapi.mlb.com`）は非公式の公開APIです。ドキュメントが存在しないため、本アプリでは同一データへの連続アクセスを最低1分間隔に制限し、個人利用の範囲で節度をもって利用しています。
- 順位表はシーズン期間外（オフシーズンなど）は空データが返る場合があり、その際は「順位表データがありません」と表示されます。

## ローカルでの動作確認

Service WorkerはHTTPS（またはlocalhost）でのみ動作します。ローカルではシンプルなHTTPサーバーで確認してください。

```bash
cd mlb-app
python3 -m http.server 8080
# http://localhost:8080 をブラウザで開く
```
