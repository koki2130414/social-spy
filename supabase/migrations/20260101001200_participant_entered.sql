-- ---------------------------------------------------------------------------
-- 「入場」の記録
--
-- 受付でQRカードを配っても、その人がちゃんと読み込めたかは分からない。
-- 読めていない人は、席に着いてから「入れません」と言いに来ることになる。
-- 受付のうちに気づけるよう、最初にアプリへ入れた時刻を残す。
--
-- 一度入ったら上書きしない（最初の時刻を残す）。
-- 出欠（attending）とは別物で、こちらは運営が手で切り替える印。
-- entered_at は本人が実際に入れたときだけ付く。
--
-- 何度実行しても同じ結果になります。
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists entered_at timestamptz;

comment on column public.participants.entered_at is
  '最初にアプリへ入れた時刻。null ならまだ一度も入れていない。受付で配ったQRを読めたかの確認に使う。';

-- 受付では「まだ入っていない人」を何度も引くので、その検索を速くする
create index if not exists participants_event_entered_idx
  on public.participants (event_id, entered_at);

-- ---------------------------------------------------------------------------
-- 確認
-- ---------------------------------------------------------------------------
select count(*) filter (where entered_at is not null) as 入場済み,
       count(*) filter (where entered_at is null and attending) as まだ入っていない出席者,
       count(*) as 合計
  from public.participants
 where event_id = (select id from public.events where code = 'BUZZ0925');
