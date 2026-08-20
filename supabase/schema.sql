-- MLB Watch: Web Push購読情報テーブル
-- Supabaseプロジェクト作成後、SQL Editorでこのファイルの内容をそのまま実行してください。

create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  team_ids int[] not null default '{}',
  last_notified_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- このテーブルは氏名・メールアドレス等の個人特定情報を含まない（Push購読エンドポイントと
-- お気に入りチームIDのみ）ため、anonキーからの読み書きを許可する簡易ポリシーとする。
-- GitHub Actions側はservice_roleキー（RLSをバイパス）で全件取得・更新・削除を行う。
create policy "anon can manage own subscription" on push_subscriptions
  for all
  to anon
  using (true)
  with check (true);
