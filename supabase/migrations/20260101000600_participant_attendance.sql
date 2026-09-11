-- ---------------------------------------------------------------------------
-- 当日のドタキャンに対応する「欠席」印
--
-- 当日、受付に来なかった人を運営が画面から外せるようにする。
-- 行ごと消すのではなく印を付けるだけにしてある。理由は2つ。
--
--  1. 押し間違えても元に戻せる。当日の混雑した受付で
--     取り返しのつかない操作があるのは危ない。
--  2. votes には削除禁止トリガ（votes_no_delete）がある。
--     参加者を行ごと消すと votes への cascade delete がこれに弾かれ、
--     「消せません」というエラーになる。印なら影響しない。
--
-- 欠席にすると、サーバー側で次のように扱われる。
--   ・ログインできない（配った番号とパスワードが使えなくなる）
--   ・SPY の抽選から外れる  ← いちばん大事。
--     SPY はゲーム開始の瞬間に選ばれるので、開始前に欠席にしておけば
--     「SPYが来ていない人だった」という事故が防げる。
--   ・投票の候補に出ない／その人へ投票できない
--   ・結果の集計に出ない
--
-- 何度実行しても同じ結果になるよう書いてある。
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists attending boolean not null default true;

-- 出席者だけを引く問い合わせ（SPY抽選・投票候補）を速くしておく
create index if not exists participants_event_attending_idx
  on public.participants (event_id, attending);

-- ---------------------------------------------------------------------------
-- 投票の検証に「欠席者は投票できない／されない」を足す。
--
-- 画面とサーバーでも同じ判定をしているが、ここにも置く。
-- 画面の作り変えやAPIの直叩きで抜けないようにするため。
--
-- 既存の検証（フェーズ・別イベント）はそのまま残している。
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

  return new;
end;
$$;
