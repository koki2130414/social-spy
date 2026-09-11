-- ---------------------------------------------------------------------------
-- ログインIDの下限を4文字から1文字に緩める
--
-- 受付で「あなたは42番」と番号札を渡し、その番号をそのままIDにして
-- 入場する運用にするため。番号は1〜2桁になる。
--
-- IDが短くて推測しやすくても、入場にはパスワードが要る。
-- パスワードは英字4＋数字4で約38億通りあり、総当たりは現実的でない。
--
-- 使える文字（小文字英数字・ハイフン・アンダースコア）は変えない。
-- ---------------------------------------------------------------------------

alter table public.participants
  drop constraint if exists participants_login_id_format;

alter table public.participants
  add constraint participants_login_id_format
  check (login_id is null or login_id ~ '^[a-z0-9_-]{1,24}$');
