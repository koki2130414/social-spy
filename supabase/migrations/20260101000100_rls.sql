-- =============================================================================
-- SOCIAL SPY - Row Level Security
-- =============================================================================
-- 前提
--  * 参加者は Supabase Auth のユーザーではない（サーバーが署名した Cookie で識別）。
--    参加者データの読み書きは Next.js のサーバー側（Route Handler）が
--    SERVICE ROLE KEY を使って行い、そこで必ず権限チェックを実施する。
--  * ここでの RLS は「万一 anon キーでブラウザから直接叩かれた場合」の防御線。
--    SPY情報（participants.role / SPY MISSION / votes）は anon から一切見えない。
--  * 運営者は Supabase Auth のユーザーで、users.is_admin と event_admins で判定する。
-- =============================================================================

alter table public.users                enable row level security;
alter table public.events               enable row level security;
alter table public.event_admins         enable row level security;
alter table public.participants         enable row level security;
alter table public.missions             enable row level security;
alter table public.participant_missions enable row level security;
alter table public.notifications        enable row level security;
alter table public.votes                enable row level security;
alter table public.event_phase_history  enable row level security;

-- ---------------------------------------------------------------------------
-- ヘルパー
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_admin from public.users u where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_event_admin(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_admins ea
    join public.users u on u.id = ea.user_id
    where ea.event_id = target_event
      and ea.user_id = auth.uid()
      and u.is_admin
  );
$$;

create or replace function public.spy_mission_public(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event
      and e.phase in ('SPY_MISSION_REVEALED', 'VOTING', 'IDENTITY_REVEALED', 'FINISHED')
  );
$$;

-- ---------------------------------------------------------------------------
-- users : 本人のみ参照可
-- ---------------------------------------------------------------------------
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid());

-- is_admin をクライアントから書き換えさせない（更新ポリシーを作らない）

-- ---------------------------------------------------------------------------
-- events : 参加画面・Realtime のため誰でも参照可（機密情報は含まない）
--          変更は event_admins のみ
-- ---------------------------------------------------------------------------
drop policy if exists events_select_all on public.events;
create policy events_select_all on public.events
  for select to anon, authenticated
  using (true);

drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events
  for all to authenticated
  using (public.is_event_admin(id))
  with check (public.is_event_admin(id));

-- ---------------------------------------------------------------------------
-- event_admins : 自分の権限行のみ参照可
-- ---------------------------------------------------------------------------
drop policy if exists event_admins_select_self on public.event_admins;
create policy event_admins_select_self on public.event_admins
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- participants : role を含むため anon には一切公開しない
--                （参加者向けの一覧はサーバー経由で participants_public を返す）
-- ---------------------------------------------------------------------------
drop policy if exists participants_admin_select on public.participants;
create policy participants_admin_select on public.participants
  for select to authenticated
  using (public.is_event_admin(event_id));

drop policy if exists participants_admin_write on public.participants;
create policy participants_admin_write on public.participants
  for all to authenticated
  using (public.is_event_admin(event_id))
  with check (public.is_event_admin(event_id));

-- anon には SELECT/INSERT/UPDATE いずれのポリシーも作らない = 全面拒否
-- （role をクライアントから書き換えることは不可能）

-- ---------------------------------------------------------------------------
-- missions : 一般MISSIONは誰でも参照可。SPY MISSION は公開フェーズ以降のみ
-- ---------------------------------------------------------------------------
drop policy if exists missions_select_public on public.missions;
create policy missions_select_public on public.missions
  for select to anon, authenticated
  using (
    kind = 'GENERAL'
    or (event_id is not null and public.spy_mission_public(event_id))
  );

drop policy if exists missions_admin_write on public.missions;
create policy missions_admin_write on public.missions
  for all to authenticated
  using (event_id is not null and public.is_event_admin(event_id))
  with check (event_id is not null and public.is_event_admin(event_id));

-- ---------------------------------------------------------------------------
-- participant_missions : 誰にどのMISSIONが割り当てられたかは機密
--                        （SPY MISSION の割り当てからSPYが特定できるため）
-- ---------------------------------------------------------------------------
drop policy if exists participant_missions_admin_all on public.participant_missions;
create policy participant_missions_admin_all on public.participant_missions
  for all to authenticated
  using (
    exists (
      select 1 from public.participants p
      where p.id = participant_id and public.is_event_admin(p.event_id)
    )
  )
  with check (
    exists (
      select 1 from public.participants p
      where p.id = participant_id and public.is_event_admin(p.event_id)
    )
  );

-- ---------------------------------------------------------------------------
-- notifications : 全参加者向けの公開情報
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select_all on public.notifications;
create policy notifications_select_all on public.notifications
  for select to anon, authenticated
  using (true);

drop policy if exists notifications_admin_write on public.notifications;
create policy notifications_admin_write on public.notifications
  for all to authenticated
  using (public.is_event_admin(event_id))
  with check (public.is_event_admin(event_id));

-- ---------------------------------------------------------------------------
-- votes : anon からは読み書き一切不可。管理者のみ参照可
-- ---------------------------------------------------------------------------
drop policy if exists votes_admin_select on public.votes;
create policy votes_admin_select on public.votes
  for select to authenticated
  using (public.is_event_admin(event_id));

-- INSERT ポリシーを作らない = anon / authenticated からの直接投票を全面拒否。
-- 投票は必ずサーバー側（署名済みセッションの検証後）で実行する。

-- ---------------------------------------------------------------------------
-- event_phase_history : 管理者のみ
-- ---------------------------------------------------------------------------
drop policy if exists phase_history_admin_select on public.event_phase_history;
create policy phase_history_admin_select on public.event_phase_history
  for select to authenticated
  using (public.is_event_admin(event_id));

-- ---------------------------------------------------------------------------
-- participants_public ビューの権限
--   security_invoker を有効にすると participants の RLS が適用され anon から
--   見えなくなるため、あえて security definer（既定）のまま公開する。
--   このビューには role が含まれない。
-- ---------------------------------------------------------------------------
revoke all on public.participants_public from anon, authenticated;
grant select on public.participants_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime : events / notifications のみ配信対象にする
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
