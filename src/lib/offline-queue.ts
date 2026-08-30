/**
 * オフライン時のMISSION達成を端末に保持し、通信が戻ったら送信するキュー。
 *
 * 会場の電波は不安定なので「達成を押したのに記録されていない」を防ぐのが目的。
 * 投票は確定性が重要なため、このキューの対象にしない（オンライン時のみ受け付ける）。
 *
 * 保存先を差し替えられるようにして、ロジックを単体テストできるようにしている。
 */

export interface QueuedMission {
  assignmentId: string;
  completed: boolean;
  queuedAt: number;
}

export interface QueueStorage {
  read(): QueuedMission[];
  write(items: QueuedMission[]): void;
}

export const QUEUE_KEY = 'social-spy.pending-missions';

/** localStorage を使う保存先。利用できない環境では自動的にメモリへ退避する */
export function createLocalStorageQueue(key: string = QUEUE_KEY): QueueStorage {
  let fallback: QueuedMission[] = [];
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as QueuedMission[]) : [];
      } catch {
        return fallback;
      }
    },
    write(items) {
      fallback = items;
      try {
        window.localStorage.setItem(key, JSON.stringify(items));
      } catch {
        /* プライベートブラウズなどで書けない場合はメモリのみ */
      }
    },
  };
}

export function createMemoryQueue(initial: QueuedMission[] = []): QueueStorage {
  let items = [...initial];
  return {
    read: () => [...items],
    write: (next) => {
      items = [...next];
    },
  };
}

/**
 * 同じMISSIONに対する操作は最新の1件だけを残す。
 * （オフライン中に達成→取り消し→達成と押しても、送信は1回で済む）
 */
export function enqueueMission(
  storage: QueueStorage,
  entry: Omit<QueuedMission, 'queuedAt'>,
  now: number = Date.now(),
): QueuedMission[] {
  const items = storage.read().filter((i) => i.assignmentId !== entry.assignmentId);
  items.push({ ...entry, queuedAt: now });
  storage.write(items);
  return items;
}

export function removeMission(storage: QueueStorage, assignmentId: string): QueuedMission[] {
  const items = storage.read().filter((i) => i.assignmentId !== assignmentId);
  storage.write(items);
  return items;
}

/** 未送信の操作を assignmentId → completed の形で返す（画面の上書き表示用） */
export function pendingMap(storage: QueueStorage): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const item of storage.read()) map[item.assignmentId] = item.completed;
  return map;
}

export interface FlushResult {
  sent: number;
  remaining: number;
  /** 送信を打ち切った理由。通信断なら 'offline' */
  stoppedBy: 'done' | 'offline' | 'rejected';
}

/**
 * キューを古い順に送信する。
 *  - 送信できたら取り除く
 *  - サーバーに拒否された（フェーズ終了など）操作は、再送し続けても通らないので取り除く
 *  - 通信エラーは残したまま中断し、次の機会に再試行する
 */
export async function flushQueue(
  storage: QueueStorage,
  send: (item: QueuedMission) => Promise<'ok' | 'rejected' | 'network-error'>,
): Promise<FlushResult> {
  const items = storage.read().sort((a, b) => a.queuedAt - b.queuedAt);
  let sent = 0;

  for (const item of items) {
    const result = await send(item);
    if (result === 'network-error') {
      return { sent, remaining: storage.read().length, stoppedBy: 'offline' };
    }
    removeMission(storage, item.assignmentId);
    if (result === 'ok') sent += 1;
  }

  return { sent, remaining: storage.read().length, stoppedBy: 'done' };
}
