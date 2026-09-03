import { appMode, appUrl } from '@/lib/env';
import { getRepo } from '@/server/repo';
import { ServiceError } from '@/server/errors';
import { createAdminSetupToken, verifyAdminSetupToken } from '@/server/auth/session';
import { DEMO_ADMIN_ID } from '@/server/demo/seed';
import { requireAdmin } from './admin';

/**
 * 運営メンバー（管理者アカウント）の管理。
 *
 * ここだけは Supabase Auth を直接触る。参加者と違って運営者は
 * メールアドレスとパスワードで本人確認する必要があるため。
 *
 * 追加すると、その人専用のパスワード設定URLが出る。運営がそれを本人へ渡し、
 * 本人が自分でパスワードを決める（/admin/set-password）。
 *
 * メール送信に頼らないのは、Supabaseの標準メールが
 * 「プロジェクトのメンバー以外のアドレスには送信しない」制限を持つため。
 * 外部のスタッフを追加できないと運用にならないので、リンクを手渡す形にしている。
 */

export interface AdminMember {
  id: string;
  email: string;
  displayName: string;
  /** 招待済みだがまだパスワードを設定していない */
  pending: boolean;
  managedEvents: number;
  /** 操作している本人かどうか（自分の権限は外せない） */
  isSelf: boolean;
}

function requireSupabaseMode(): void {
  if (appMode() !== 'supabase') {
    throw new ServiceError(
      'DEMO_UNSUPPORTED',
      'デモモードでは運営メンバーを追加できません。Supabaseを接続した環境で操作してください。',
      400,
    );
  }
}

export async function listAdminMembers(): Promise<AdminMember[]> {
  const session = await requireAdmin();
  if (appMode() !== 'supabase') {
    return [
      {
        id: DEMO_ADMIN_ID,
        email: session.email,
        displayName: session.name,
        pending: false,
        managedEvents: 1,
        isSelf: true,
      },
    ];
  }

  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const db = supabaseAdmin();

  const { data: users, error } = await db
    .from('users')
    .select('id, email, display_name')
    .eq('is_admin', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listAdminMembers: ${error.message}`);

  const { data: links } = await db.from('event_admins').select('user_id');
  const counts = new Map<string, number>();
  for (const row of links ?? []) {
    const id = row.user_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // まだパスワードを設定していない人は「招待中」として見せる
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const confirmed = new Set(
    (authList?.users ?? []).filter((u) => u.last_sign_in_at).map((u) => u.id),
  );

  return (users ?? []).map((u) => ({
    id: u.id as string,
    email: u.email as string,
    displayName: (u.display_name as string) ?? 'ADMIN',
    pending: !confirmed.has(u.id as string),
    managedEvents: counts.get(u.id as string) ?? 0,
    isSelf: (u.id as string) === session.uid,
  }));
}

/** その人専用のパスワード設定URL */
export function buildSetupUrl(userId: string): string {
  return `${appUrl()}/admin/set-password?t=${createAdminSetupToken(userId)}`;
}

/**
 * 運営メンバーを追加する。
 *
 * アカウントを作り、管理者フラグと既存イベントの管理権限を付けたうえで、
 * パスワード設定用のURLを返す。運営はそのURLを本人に渡す。
 */
export async function inviteAdminMember(
  email: string,
): Promise<{ email: string; alreadyExisted: boolean; setupUrl: string }> {
  await requireAdmin();
  requireSupabaseMode();

  const normalized = email.trim().toLowerCase();
  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const db = supabaseAdmin();

  // 既に登録済みなら作り直さず、権限だけ付ける
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === normalized);

  let userId: string;
  let alreadyExisted = false;

  if (existing) {
    userId = existing.id;
    alreadyExisted = true;
  } else {
    // メールは送らない。確認済み扱いで作り、本人はリンクからパスワードを決める
    const { data, error } = await db.auth.admin.createUser({
      email: normalized,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new ServiceError(
        'CREATE_FAILED',
        'アカウントを作成できませんでした。メールアドレスを確認してください。',
        502,
      );
    }
    userId = data.user.id;
  }

  // 運営者プロフィールを作る／既にあれば管理者にする
  const { error: upsertError } = await db
    .from('users')
    .upsert(
      { id: userId, email: normalized, display_name: 'ADMIN', is_admin: true },
      { onConflict: 'id' },
    );
  if (upsertError) throw new Error(`inviteAdminMember(users): ${upsertError.message}`);

  // 既存のイベントをすべて管理できるようにする
  const repo = getRepo();
  for (const event of await repo.listEvents()) {
    await repo.addEventAdmin(event.id, userId);
  }

  return { email: normalized, alreadyExisted, setupUrl: buildSetupUrl(userId) };
}

/**
 * パスワード設定リンクを使って、本人がパスワードを決める。
 *
 * ここだけはログイン前に呼ばれるので、管理者チェックの代わりに
 * 署名付きトークンで本人性を確認する。
 */
export async function completeAdminSetup(token: string, password: string): Promise<void> {
  const payload = verifyAdminSetupToken(token);
  if (!payload) {
    throw new ServiceError(
      'SETUP_LINK_INVALID',
      'リンクが無効か、有効期限が切れています。運営者にリンクの再発行を依頼してください。',
      401,
    );
  }
  requireSupabaseMode();

  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const db = supabaseAdmin();

  // 運営メンバーとして登録されている人にだけ設定させる
  const { data: profile } = await db
    .from('users')
    .select('id, is_admin')
    .eq('id', payload.uid)
    .maybeSingle();
  if (!profile?.is_admin) {
    throw new ServiceError('SETUP_LINK_INVALID', 'このリンクは使用できません。', 401);
  }

  const { error } = await db.auth.admin.updateUserById(payload.uid, { password });
  if (error) {
    throw new ServiceError('SETUP_FAILED', 'パスワードを設定できませんでした。', 502);
  }
}

/** 自分自身の権限は外せない（全員が締め出される事故を防ぐ） */
export function canRevokeMember(currentUserId: string, targetUserId: string): boolean {
  return currentUserId !== targetUserId;
}

export async function revokeAdminMember(userId: string): Promise<void> {
  const session = await requireAdmin();
  requireSupabaseMode();

  if (!canRevokeMember(session.uid, userId)) {
    throw new ServiceError('CANNOT_REVOKE_SELF', '自分自身の運営権限は外せません。', 400);
  }

  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const db = supabaseAdmin();

  // アカウント自体は消さず、権限だけ外す（監査の手がかりを残すため）
  const { error } = await db.from('users').update({ is_admin: false }).eq('id', userId);
  if (error) throw new Error(`revokeAdminMember: ${error.message}`);
  await db.from('event_admins').delete().eq('user_id', userId);
}
