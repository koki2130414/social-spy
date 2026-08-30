-- ---------------------------------------------------------------------------
-- 参加者のログインID / パスワード
--
-- 運営が参加者を代理登録するとき、その人専用のIDとパスワードを発行する。
-- 当日の受付でIDとパスワードを渡せば、参加者はスマホから自分の画面に入れる。
--
-- 平文パスワードは保存しない（サーバー側で scrypt ハッシュにしてから入れる）。
-- password_hash は最重要の機密なので、RLS で anon / authenticated から
-- 一切見えないようにし、サーバー（service_role）だけが読めるようにする。
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists login_id      text,
  add column if not exists password_hash text;

-- ID はイベント内で一意。大文字小文字は区別しない（受付で読み上げるため）
create unique index if not exists participants_event_login_id_key
  on public.participants (event_id, lower(login_id))
  where login_id is not null;

alter table public.participants
  drop constraint if exists participants_login_id_format;
alter table public.participants
  add constraint participants_login_id_format
  check (login_id is null or login_id ~ '^[a-z0-9_-]{4,24}$');

-- ---------------------------------------------------------------------------
-- 列レベルの保護
--
-- participants は RLS を有効にしてあり、参加者向けの SELECT ポリシーが存在する。
-- ポリシーは行単位でしか効かないため、ハッシュが誤って公開クライアントから
-- 読まれないよう、テーブルへの列権限そのものを絞る。
-- service_role は RLS も列権限もバイパスするため、サーバーからは従来どおり読める。
-- ---------------------------------------------------------------------------
revoke all on public.participants from anon, authenticated;
grant select (id, event_id, display_name, affiliation, joined_at, created_at, updated_at)
  on public.participants to anon, authenticated;
