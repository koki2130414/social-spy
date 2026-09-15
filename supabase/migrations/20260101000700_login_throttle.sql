-- ---------------------------------------------------------------------------
-- パスワードの総当たりを止める
--
-- 受付で渡すパスワードを数字4桁にした。打ちやすいかわりに1万通りしかなく、
-- 桁数だけでは総当たりを防げない。そこで回数で止める。
--
-- 守りたいものが2つある。
--
--  1. 他人になりすまして入られること。
--     入られると、その人がSPYかどうかを見られてしまいゲームが壊れる。
--
--  2. 当日アプリが落ちること。  ← 実はこちらの方が怖い
--     パスワード照合は意図的に重い計算（scrypt）で、1回に数秒かかる。
--     1万回試されるとサーバーの計算枠を食い尽くし、
--     攻撃が成功しなくても本番のアプリが止まる。
--     そのため、止めると決めた相手には照合そのものを走らせない。
--
-- 間違いが続いた参加者だけを一時的に止める。他の人には影響しない。
-- 運営が「PW再発行」をすると、その場で解除される。
--
-- 何度実行しても同じ結果になるよう書いてある。
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists login_locked_until timestamptz;

-- 数がおかしくならないようにしておく（負の回数はありえない）
do $$ begin
  alter table public.participants
    add constraint participants_failed_login_count_check
    check (failed_login_count >= 0);
exception when duplicate_object then null; end $$;
