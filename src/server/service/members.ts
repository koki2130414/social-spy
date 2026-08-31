import { appMode, appUrl } from '@/lib/env';
import { getRepo } from '@/server/repo';
import { ServiceError } from '@/server/errors';
import { DEMO_ADMIN_ID } from '@/server/demo/seed';
import { requireAdmin } from './admin';

/**
 * 運営メンバー（管理者アカウント）の管理。
 *
 * ここだけは Supabase Auth を直接触る。参加者と違って運営者は
 * メールアドレスとパスワードで本人確認する必要があるため。
 *
 * パスワードはこのアプリでは一切扱わない。招待メールのリンクから
 * 本人が自分で設定する（/admin/set-password）。
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

/**
 * 運営メンバーを招待する。
 *
 * 招待メールを送り、同時に管理者フラグと既存イベントの管理権限を付ける。
 * 本人がリンクからパスワードを設定した時点でログインできるようになる。
 */
export async function inviteAdminMember(
  email: string,
): Promise<{ email: string; alreadyExisted: boolean }> {
  await requireAdmin();
  requireSupabaseMode();

  const normalized = email.trim().toLowerCase();
  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const db = supabaseAdmin();

  // 既に登録済みかどうかを先に調べる（招待の二重送信を避ける）
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === normalized);

  let userId: string;
  let alreadyExisted = false;

  if (existing) {
    userId = existing.id;
    alreadyExisted = true;
  } else {
    const { data, error } = await db.auth.admin.inviteUserByEmail(normalized, {
      redirectTo: `${appUrl()}/admin/set-password`,
    });
    if (error || !data?.user) {
      throw new ServiceError(
        'INVITE_FAILED',
        '招待メールを送信できませんでした。メールアドレスを確認してください。',
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

  return { email: normalized, alreadyExisted };
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
