# MLB Watch — CLAUDE.md

## このプロジェクトについて
日本にいながらMLBの試合結果・順位表を「日本語」「日本時間(JST)」でチェックできるPWA（Progressive Web App）。
フレームワーク・ビルドツールなしの素のHTML/CSS/JS（ES Modules）で構成し、GitHub Pagesでの静的ホスティングを前提にしている。

- 対象ユーザー：日本語話者のMLBファン
- データソース：MLB Stats API（`statsapi.mlb.com`）— 非公式・無認証の公開API

## 技術スタックと制約（新機能追加時も踏襲すること）
- **ビルドステップなし**。`<script type="module">` でブラウザがそのままES Modulesを読む構成。webpack/viteのようなバンドラーは導入していない。複雑さが本当に必要になるまでビルドツールを持ち込まない方針。ルートの`package.json`はGitHub Actions（Web Push送信スクリプト）専用のCI依存関係で、クライアント（`js/*.js`）のビルドには一切関与しない。
- **状態管理ライブラリなし**。各画面モジュール（`home.js`, `standings.js`など）が文字列テンプレート（`innerHTML`）でDOMを描画する素朴な方式。
- **永続化はIndexedDB**（`js/db.js`）。APIレスポンスのキャッシュと、お気に入り（チーム/選手）の保存に使用。
- **オフライン対応はService Worker**（`service-worker.js`）でアプリシェル（HTML/CSS/JS/アイコン）のみをキャッシュ。試合・順位表データのキャッシュはSW側ではなく`api.js`の`cachedFetch`（IndexedDB経由）で行う。この役割分担を崩さないこと。

## 重要な設計方針（変更時に必ず守ること）
1. **MLB Stats APIへの節度あるアクセス**：非公式・無ドキュメントAPIのため、同一キャッシュキーへの連続アクセスは最低60秒間隔（`api.js`の`MIN_REFETCH_INTERVAL_MS`）。新しいAPI呼び出しを追加する場合も`cachedFetch`のパターン（キャッシュ優先・失敗時は直近キャッシュにフォールバック）を踏襲する。
2. **JST（日本時間）基準の日付処理**：MLBの試合はアメリカの日付でグルーピングされるため、JST日付をまたぐ分を前後1日取得してフィルタするロジックが`api.js`にある（`getGamesForJstDate`, `jstDayRangeUtc`, `toJstDateString`など）。日付・時刻を扱う新機能は既存のJSTユーティリティを再利用し、独自に日付計算を書き直さない。
3. **球団ロゴ・商標は不使用**：著作権配慮のため、チームは色（`teams.js`の`color`）とテキストのみで表現する。ロゴ画像や公式マークは追加しない。
4. **GitHub Pagesのサブパス運用**：リポジトリ名のサブパス配下で公開されるため、`manifest.json`の`start_url`/`scope`やアセット参照はすべて相対パス。絶対パスに変更しない。
5. **Web Push通知はGitHub Actions + Supabaseで完結させる**：静的サイトだけではPush送信をトリガーできないため、購読情報（Push endpoint・お気に入りチームID）はSupabase（無料枠）に保存し、送信は`.github/workflows/notify.yml`の毎日09:00 UTC（=18:00 JST）実行が担う。クライアント（`js/notifications.js`）はSupabaseへの書き込みまでしか行わない。送信ロジック（`scripts/send-notifications.mjs`）はNode専用でIndexedDB依存の`js/db.js`とは分離し、`js/teams.js`など純粋なデータ/関数モジュールのみ再利用する。

## ディレクトリ構成
```
index.html
manifest.json
service-worker.js
package.json        … GitHub Actions専用のCI依存関係（web-push）。クライアントには影響しない
css/style.css
js/
  app.js          … ルーティング・時計・SW登録
  api.js          … MLB Stats APIラッパー、JST日付処理、キャッシュ制御
  db.js           … IndexedDBラッパー（APIキャッシュ・お気に入り）
  teams.js        … 30球団メタデータ（日本語名・地区・カラー）
  home.js         … 表紙画面
  standings.js    … 順位表画面
  team-sheet.js   … チーム試合カレンダーのボトムシート
  team-search.js  … チーム検索画面（地図プロット・地区別リスト）
  player-search.js … 選手検索画面（名前検索・お気に入り選手一覧）
  player-sheet.js … 選手詳細ボトムシート（プロフィール・当該シーズン成績）
  my-players.js   … マイ成績画面（お気に入り選手の成績まとめ）
  trivia.js       … 豆知識コンテンツ集（ルール・記録/歴史・用語）とランダム抽出
  notifications.js … Web Push購読・解除・お気に入りチームIDのSupabase同期
icons/            … オリジナル生成アイコン（商標不使用）
supabase/schema.sql … Push購読テーブルのDDL（Supabase SQL Editorで実行）
scripts/send-notifications.mjs … 毎日18時JSTのPushダイジェスト送信（GitHub Actions専用）
.github/workflows/notify.yml    … 送信スケジュール（cron）と手動テスト送信（workflow_dispatch）
```

## 実装済み
- **表紙**（ロードマップ1）：本日/前日の試合結果をJST基準で表示、お気に入りチーム選択（IndexedDB保存・該当カードをハイライト）、豆知識のランダム表示
- **順位表**（ロードマップ1）：ア・リーグ/ナ・リーグタブ、地区別テーブル（勝敗・勝率・ゲーム差）、チーム名タップで直近±6日間の試合カレンダー（ボトムシート）
- **PWA基盤**（ロードマップ1）：Service Workerによるアプリシェルのオフラインキャッシュ、IndexedDBによるAPIレスポンスのキャッシュ、manifest.json
- **チーム検索**（ロードマップ2）：簡易US地図プロット・地区別リストからのチーム検索、チームシートに順位サマリーとお気に入りトグルを追加
- **選手検索**（ロードマップ3）：全現役選手からの名前検索（主要な日本人選手は日本語名でも検索可）、選手詳細ボトムシート（プロフィール・当該シーズンの打撃/投手成績）、お気に入り選手登録
- **マイ成績**（ロードマップ4）：お気に入り選手の当該シーズン成績をまとめて一覧表示
- **豆知識コンテンツの拡充**（ロードマップ5）：ルール・記録/歴史・用語のカテゴリで20件に拡充（`js/trivia.js`）、表紙画面に更新ボタンを追加し直前と異なる豆知識をランダム表示
- **Web Push通知**（ロードマップ6）：表紙画面に通知トグルを追加、毎日18時（JST）にお気に入りチームの当日結果と次戦予定をダイジェスト通知。バックエンドはGitHub Actions（`.github/workflows/notify.yml`）+ Supabase（無料枠）。Supabaseプロジェクト作成・GitHub Secrets設定・Android実機でのPush受信まで確認済み（2026-08-20）。

## 未実装（次のロードマップ）
1. MLBルール解説

## デプロイ
GitHub Pages（`main`ブランチ / `/ (root)`）。手順の詳細は`README.md`を参照。

## ローカル動作確認
Service WorkerはHTTPS（またはlocalhost）でのみ動作するため、簡易HTTPサーバーで確認する。
```bash
python3 -m http.server 8080
# http://localhost:8080 をブラウザで開く
```

## コーディングスタイル
- コメントは日本語、関数名・変数名は英語。
- 各画面モジュールは `render〇〇(container)` という命名のasync関数をexportし、`app.js`の`navigate`から呼び出す構成。新しい画面（チーム検索・選手検索など）を追加する場合もこのパターンに合わせる。
