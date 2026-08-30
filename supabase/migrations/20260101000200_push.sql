-- =============================================================================
-- SOCIAL SPY - プッシュ通知の購読情報
-- =============================================================================
-- 端末ごとの購読エンドポイントを保持する。
-- 参加者はSupabase Authのユーザーではないため、読み書きはすべて
-- Next.jsのサーバー側（署名済みセッションを検証したあと）で行う。
-- RLS は有効化したうえでポリシーを作らない = anon / authenticated からは完全に不可視。
-- =============================================================================

create table if not exists public.push_subscriptions (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  participant_id uuid        not null references public.participants(id) on delete cascade,
  endpoint       text        not null,
  p256dh         text        not null,
  auth           text        not null,
  created_at     timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists push_subscriptions_event_idx
  on public.push_subscriptions (event_id);
create index if not exists push_subscriptions_participant_idx
  on public.push_subscriptions (participant_id);

alter table public.push_subscriptions enable row level security;

-- ポリシーを定義しないことで、service role 以外からのアクセスを全面的に拒否する。
-- （購読エンドポイントは他人に知られると通知を送りつけられるため機密として扱う）

comment on table public.push_subscriptions is
  'Web Push の購読情報。サーバー（service role）からのみ読み書きする。';
