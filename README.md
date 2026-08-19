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

- チーム検索（地図プロット・チーム詳細） … ロードマップ2
- 選手検索機能 … ロードマップ3
- お気に入り選手の個人結果まとめ … ロードマップ4
- 豆知識コンテンツの拡充 … ロードマップ5
- Web Push通知（Android優先） … ロードマップ6

## ファイル構成

```
index.html
manifest.json
service-worker.js
css/style.css
js/
  app.js        … ルーティング・時計・SW登録
  api.js        … MLB Stats API ラッパー、JST日付処理、キャッシュ制御
  db.js         … IndexedDBラッパー（APIキャッシュ・お気に入り）
  teams.js      … 30球団のメタデータ（日本語名・地区・カラー）
  home.js       … 表紙画面
  standings.js  … 順位表画面
  team-sheet.js … チーム試合カレンダーのボトムシート
icons/          … オリジナル生成したアプリアイコン（商標不使用）
```

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
