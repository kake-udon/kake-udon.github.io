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
  teams.js        … 30球団メタデータ（「地名・チーム名」表記・地区・カラー）
  home.js         … ホーム画面（お気に入りチームの試合を先頭に並べ替え、選手の今日の成績コーナーを含む）
  today-stats.js  … ホーム画面の「お気に入り選手の今日の成績」コーナー（打席結果・投球成績）
  standings.js    … 順位表画面
  team-sheet.js   … チーム詳細ボトムシート（順位サマリー・試合カレンダー・選手一覧）
  sheet-stack.js  … ボトムシートの戻り先スタック（シートからシートを開いた際の close 挙動を管理）
  team-search.js  … チーム検索画面（地図プロット・地区別リスト）
  player-search.js … 選手検索画面（名前検索・お気に入り選手一覧・日本語/カタカナ検索）
  player-sheet.js … 選手詳細ボトムシート（プロフィール・当該シーズン成績）
  kana.js         … 英語表記の選手名から検索用のカタカナ近似を生成する簡易変換ユーティリティ
  alerts.js       … お知らせ画面（お気に入り投手の先発予定・野手の本塁打・チームの試合予定）
  game-sheet.js   … 試合詳細ボトムシート（ラインスコア・出場選手の成績・打席ごとの結果を日本語で表示）
  trivia.js       … 豆知識コンテンツ集（ルール・記録/歴史・用語）とランダム抽出
  rules.js        … MLBルール解説画面（カテゴリ別の折りたたみ静的コンテンツ）
  notifications.js … Web Push購読・解除・お気に入りチームIDのSupabase同期
icons/            … オリジナル生成アイコン（商標不使用）
supabase/schema.sql … Push購読テーブルのDDL（Supabase SQL Editorで実行）
scripts/send-notifications.mjs … 毎日18時JSTのPushダイジェスト送信（GitHub Actions専用）
.github/workflows/notify.yml    … 送信スケジュール（cron）と手動テスト送信（workflow_dispatch）
```

## 実装済み
- **ホーム**（ロードマップ1、旧称「表紙」）：本日/前日の試合結果をJST基準で表示（お気に入りチームの試合を先頭に並べ替え）、お気に入りチーム選択（IndexedDB保存・該当カードをハイライト）、お気に入り選手の今日の成績コーナー（`js/today-stats.js`）、豆知識のランダム表示
- **順位表**（ロードマップ1）：ア・リーグ/ナ・リーグタブ、地区別テーブル（勝敗・勝率・ゲーム差）、チーム名タップで直近±6日間の試合カレンダー（ボトムシート）
- **PWA基盤**（ロードマップ1）：Service Workerによるアプリシェルのオフラインキャッシュ、IndexedDBによるAPIレスポンスのキャッシュ、manifest.json
- **試合詳細**：ラインスコアに加え、試合に出場した選手全員の成績（打者は打席ごとの結果・打点、投手は登板イニング・球数・被安打・自責点・奪三振・与四死球）、勝敗投手・セーブ・本塁打のサマリー、打席ごとの結果を日本語の説明文で表示（`js/game-sheet.js`）。会場名はGoogleマップへのリンクになっている。
- **チーム検索**（ロードマップ2）：簡易US地図プロット・地区別リストからのチーム検索、チームシートに順位サマリー・試合カレンダー・選手一覧（アクティブロースター、タップで選手詳細シートを開いてお気に入り登録可）とお気に入りトグルを追加
- **ボトムシートの戻り先スタック**（`js/sheet-stack.js`）：あるシート（チーム詳細など）から別のシート（試合詳細・選手詳細）を開いた場合、閉じると呼び出し元のシートへ戻る。新しくシートを開く箇所を追加する際は`pushSheetBack`で呼び出し元の再表示関数を積み、close処理は`closeSheet(root)`を使うこと。
- **選手検索**（ロードマップ3）：全現役選手からの名前検索（日本人選手は日本語名・その他の選手も英語名から生成したカタカナ近似で検索可、`js/kana.js`）、選手詳細ボトムシート（プロフィール・当該シーズンの打撃/投手成績）、お気に入り選手登録。お気に入り選手の成績確認はこの画面から選手をタップする一本の導線に統一（旧「マイ成績」画面は廃止）。
- **お知らせ**（ロードマップ4）：お気に入り投手の次回先発予定、お気に入り野手の直近の本塁打、お気に入りチームの試合予定・開始時間をまとめて表示
- **豆知識コンテンツの拡充**（ロードマップ5）：ルール・記録/歴史・用語のカテゴリで20件に拡充（`js/trivia.js`）、ホーム画面に更新ボタンを追加し直前と異なる豆知識をランダム表示
- **Web Push通知**（ロードマップ6）：お知らせ画面に通知トグルを追加、毎日18時（JST）にお気に入りチームの当日結果と次戦予定をダイジェスト通知。バックエンドはGitHub Actions（`.github/workflows/notify.yml`）+ Supabase（無料枠）。Supabaseプロジェクト作成・GitHub Secrets設定・Android実機でのPush受信まで確認済み（2026-08-20）。
- **MLBルール解説**（ロードマップ7）：基本ルール・投球・打撃走塁・ポジション/守備・シーズン構成・用語集の6カテゴリ、計20項目を折りたたみ形式で表示（`js/rules.js`）。API通信なしの静的コンテンツ。

## 未実装（次のロードマップ）
現時点でロードマップに残っている項目はありません。

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
