-- ---------------------------------------------------------------------------
-- MISSION に難易度を持たせる
--
-- 参加者には イージー / ノーマル / ハード を1つずつ配る。
-- どれがどの段階かをサーバー側で判断する必要があるため、列として持つ。
--
-- 得点や集計には使わない（表示と配布の振り分けだけ）。
-- 既存のMISSIONは NORMAL 扱いになる。
--
-- 何度実行しても同じ結果になるよう書いてある。
-- ---------------------------------------------------------------------------

do $$ begin
  create type mission_difficulty as enum ('EASY', 'NORMAL', 'HARD');
exception when duplicate_object then null; end $$;

alter table public.missions
  add column if not exists difficulty mission_difficulty not null default 'NORMAL';

-- 配布時に難易度で絞り込むため、イベント内の検索を速くしておく
create index if not exists missions_event_difficulty_idx
  on public.missions (event_id, kind, difficulty);
