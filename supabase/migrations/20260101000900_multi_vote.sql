-- ---------------------------------------------------------------------------
-- 投票を「1人1票」から「SPYだと思う人を最大10人まで」に変える
--
-- 変えること
--   ・1人1票の制約を外す（voter ごとに複数行を許す）
--   ・ただし同じ相手を二重に選べないようにする
--   ・1人あたり10人までに制限する（上限が無いと全員選んで全員正解になる）
--
-- 変えないこと
--   ・自己投票の禁止
--   ・投票フェーズ以外の投票の禁止
--   ・欠席者は投票できない／されない
--   ・投票後の変更・削除の禁止（票は消さない）
--
-- 何度実行しても同じ結果になるように書いてあります。
-- ---------------------------------------------------------------------------

-- 1人1票の制約を外す
alter table public.votes
  drop constraint if exists votes_one_per_voter;

-- 同じ相手を二重に選べないようにする（画面の二度押し対策も兼ねる）
do $$ begin
  alter table public.votes
    add constraint votes_one_per_target unique (event_id, voter_participant_id, target_participant_id);
exception when duplicate_object then null; end $$;

-- 投票者ごとの票を引く問い合わせ（自分の選択の表示）を速くする
create index if not exists votes_event_voter_idx
  on public.votes (event_id, voter_participant_id);

-- ---------------------------------------------------------------------------
-- 検証。既存の条件はそのまま残し、「10人まで」を足す。
--
-- 画面とサーバーでも同じ判定をしているが、ここにも置く。
-- 画面の作り変えやAPIの直叩きで抜けないようにするため。
-- ---------------------------------------------------------------------------
create or replace function votes_validate()
returns trigger
language plpgsql
as $$
declare
  current_phase    game_phase;
  voter_event      uuid;
  target_event     uuid;
  voter_attending  boolean;
  target_attending boolean;
  already          integer;
begin
  select phase into current_phase from public.events where id = new.event_id;
  if current_phase is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if current_phase <> 'VOTING' then
    raise exception 'PHASE_NOT_VOTING';
  end if;

  select event_id, attending into voter_event, voter_attending
    from public.participants where id = new.voter_participant_id;
  select event_id, attending into target_event, target_attending
    from public.participants where id = new.target_participant_id;

  if voter_event is distinct from new.event_id or target_event is distinct from new.event_id then
    raise exception 'TARGET_OTHER_EVENT';
  end if;

  if voter_attending is not true then
    raise exception 'VOTER_NOT_ATTENDING';
  end if;
  if target_attending is not true then
    raise exception 'TARGET_NOT_ATTENDING';
  end if;

  -- 1人が選べるのは10人まで
  select count(*) into already
    from public.votes
   where event_id = new.event_id
     and voter_participant_id = new.voter_participant_id;
  if already >= 10 then
    raise exception 'TOO_MANY_TARGETS';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 確認（最後にこの結果が出ます）
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_constraint
    where conname = 'votes_one_per_voter')                    as 旧_1人1票制約,
  (select count(*) from pg_constraint
    where conname = 'votes_one_per_target')                   as 新_同じ相手の重複禁止,
  (select count(*) from public.votes)                         as 今の票数;

-- 期待される結果: 旧_1人1票制約 = 0 / 新_同じ相手の重複禁止 = 1
