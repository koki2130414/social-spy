-- =============================================================================
-- BUZZ BASE - 初期スキーマ
-- =============================================================================
-- 設計方針
--  * すべての主キーは UUID
--  * created_at / updated_at を保持
--  * 複数イベント・複数SPYに対応
--  * 1イベントにつき1人1票、自分自身への投票禁止、投票後の変更禁止をDB側で保証
--  * MISSIONの重複配布をユニーク制約で防止
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------------
do $$ begin
  create type game_phase as enum (
    'LOBBY', 'ACTIVE', 'SPY_MISSION_REVEALED', 'VOTING', 'IDENTITY_REVEALED', 'FINISHED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_role as enum ('AGENT', 'SPY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mission_kind as enum ('GENERAL', 'SPY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum ('INFO', 'PHASE', 'ALERT', 'CLASSIFIED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 共通トリガ関数
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users : 運営者プロフィール（auth.users と 1:1）
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text        not null,
  display_name text        not null default 'ADMIN',
  is_admin     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id                         uuid        primary key default gen_random_uuid(),
  name                       text        not null,
  code                       text        not null,
  starts_at                  timestamptz not null default now(),
  duration_minutes           integer     not null default 90 check (duration_minutes between 5 and 600),
  spy_reveal_offset_minutes  integer     not null default 45 check (spy_reveal_offset_minutes >= 0),
  spy_count                  integer     not null default 2 check (spy_count >= 0),
  registration_open          boolean     not null default true,
  phase                      game_phase  not null default 'LOBBY',
  phase_changed_at           timestamptz not null default now(),
  active_started_at          timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint events_code_format check (code ~ '^[A-Z0-9]{4,16}$')
);

create unique index if not exists events_code_key on public.events (code);
create index if not exists events_phase_idx on public.events (phase);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- event_admins : イベントごとの管理権限
-- ---------------------------------------------------------------------------
create table if not exists public.event_admins (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  user_id    uuid        not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_admins_user_idx on public.event_admins (user_id);

-- ---------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------
create table if not exists public.participants (
  id           uuid             primary key default gen_random_uuid(),
  event_id     uuid             not null references public.events(id) on delete cascade,
  display_name text             not null check (char_length(trim(display_name)) between 1 and 24),
  affiliation  text             check (char_length(affiliation) <= 48),
  -- 機密。クライアントから直接更新できないよう RLS で保護する
  role         participant_role not null default 'AGENT',
  joined_at    timestamptz      not null default now(),
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now(),
  unique (event_id, display_name)
);

create index if not exists participants_event_idx on public.participants (event_id);
create index if not exists participants_event_role_idx on public.participants (event_id, role);

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- missions
-- ---------------------------------------------------------------------------
create table if not exists public.missions (
  id         uuid         primary key default gen_random_uuid(),
  -- null の場合は全イベント共通のテンプレート
  event_id   uuid         references public.events(id) on delete cascade,
  code       text         not null check (char_length(code) between 1 and 32),
  title      text         not null check (char_length(title) between 1 and 40),
  body       text         not null check (char_length(body) between 1 and 200),
  kind       mission_kind not null default 'GENERAL',
  active     boolean      not null default true,
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);

create index if not exists missions_event_kind_idx on public.missions (event_id, kind, active);

create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- participant_missions : 参加者へのMISSION割り当て
--   UNIQUE(participant_id, mission_id) により同一人物への重複配布を防止
-- ---------------------------------------------------------------------------
create table if not exists public.participant_missions (
  id             uuid        primary key default gen_random_uuid(),
  participant_id uuid        not null references public.participants(id) on delete cascade,
  mission_id     uuid        not null references public.missions(id) on delete cascade,
  order_index    integer     not null default 1 check (order_index between 1 and 20),
  completed      boolean     not null default false,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (participant_id, mission_id)
);

create index if not exists participant_missions_participant_idx
  on public.participant_missions (participant_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid              primary key default gen_random_uuid(),
  event_id   uuid              not null references public.events(id) on delete cascade,
  title      text              not null check (char_length(title) between 1 and 40),
  body       text              not null check (char_length(body) between 1 and 300),
  kind       notification_kind not null default 'INFO',
  created_at timestamptz       not null default now()
);

create index if not exists notifications_event_created_idx
  on public.notifications (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- votes : 1イベント1人1票 / 自己投票禁止 / 変更・削除禁止
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id                     uuid        primary key default gen_random_uuid(),
  event_id               uuid        not null references public.events(id) on delete cascade,
  voter_participant_id   uuid        not null references public.participants(id) on delete cascade,
  target_participant_id  uuid        not null references public.participants(id) on delete cascade,
  created_at             timestamptz not null default now(),
  constraint votes_no_self_vote check (voter_participant_id <> target_participant_id),
  constraint votes_one_per_voter unique (event_id, voter_participant_id)
);

create index if not exists votes_event_target_idx on public.votes (event_id, target_participant_id);

-- 投票フェーズ以外の投票、他イベントへの投票を拒否する
create or replace function votes_validate()
returns trigger
language plpgsql
as $$
declare
  current_phase game_phase;
  voter_event   uuid;
  target_event  uuid;
begin
  select phase into current_phase from public.events where id = new.event_id;
  if current_phase is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if current_phase <> 'VOTING' then
    raise exception 'PHASE_NOT_VOTING';
  end if;

  select event_id into voter_event  from public.participants where id = new.voter_participant_id;
  select event_id into target_event from public.participants where id = new.target_participant_id;

  if voter_event is distinct from new.event_id or target_event is distinct from new.event_id then
    raise exception 'TARGET_OTHER_EVENT';
  end if;

  return new;
end;
$$;

create trigger votes_validate_before_insert
  before insert on public.votes
  for each row execute function votes_validate();

-- 投票後の変更・削除を禁止
create or replace function votes_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'VOTE_IMMUTABLE';
end;
$$;

create trigger votes_no_update
  before update on public.votes
  for each row execute function votes_immutable();

create trigger votes_no_delete
  before delete on public.votes
  for each row execute function votes_immutable();

-- ---------------------------------------------------------------------------
-- event_phase_history
-- ---------------------------------------------------------------------------
create table if not exists public.event_phase_history (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  from_phase game_phase,
  to_phase   game_phase  not null,
  changed_by uuid        references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists event_phase_history_event_idx
  on public.event_phase_history (event_id, changed_at);

-- ---------------------------------------------------------------------------
-- 参加者へ公開してよい参加者情報（role を含まないビュー）
-- ---------------------------------------------------------------------------
create or replace view public.participants_public as
select
  p.id,
  p.event_id,
  p.display_name,
  p.affiliation,
  p.joined_at
from public.participants p;
