import webpush from 'web-push';
import { vapidConfig } from '@/lib/env';
import { getRepo } from '@/server/repo';

export interface PushPayload {
  title: string;
  body: string;
  /** 通知タップ時に開くパス */
  url?: string;
  tag?: string;
}

let configured = false;

function ensureConfigured(): boolean {
  const config = vapidConfig();
  if (!config) return false;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return true;
}

/** 送信対象が無くなった購読を判定する（410 Gone / 404 Not Found） */
function isGone(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

/**
 * イベントの全参加者へプッシュ通知を送る。
 *
 * 通知は「あると嬉しい」機能なので、失敗してもゲーム進行を止めない。
 * 呼び出し側は結果を待つが、例外は投げずに件数だけ返す。
 */
export async function sendPushToEvent(
  eventId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; skipped: boolean }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: true };

  const repo = getRepo();
  let subscriptions;
  try {
    subscriptions = await repo.listPushSubscriptions(eventId);
  } catch {
    return { sent: 0, removed: 0, skipped: true };
  }
  if (subscriptions.length === 0) return { sent: 0, removed: 0, skipped: false };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/game',
    tag: payload.tag ?? 'social-spy',
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 900 },
        );
        sent += 1;
      } catch (error) {
        if (isGone(error)) {
          removed += 1;
          try {
            await repo.deletePushSubscription(sub.endpoint);
          } catch {
            /* 掃除に失敗しても無視する */
          }
        }
      }
    }),
  );

  return { sent, removed, skipped: false };
}
