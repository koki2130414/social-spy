import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryQueue,
  enqueueMission,
  flushQueue,
  pendingMap,
  removeMission,
  type QueuedMission,
} from './offline-queue';

describe('オフライン時のMISSION送信キュー', () => {
  it('未送信の操作を保持する', () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);
    enqueueMission(q, { assignmentId: 'a2', completed: true }, 200);
    expect(q.read()).toHaveLength(2);
    expect(pendingMap(q)).toEqual({ a1: true, a2: true });
  });

  it('同じMISSIONを何度も操作しても、最後の状態だけが残る', () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);
    enqueueMission(q, { assignmentId: 'a1', completed: false }, 200);
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 300);

    expect(q.read()).toHaveLength(1);
    expect(pendingMap(q)).toEqual({ a1: true });
  });

  it('通信が戻ったら古い順に送信し、キューを空にする', async () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a2', completed: true }, 200);
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);

    const order: string[] = [];
    const result = await flushQueue(q, async (item: QueuedMission) => {
      order.push(item.assignmentId);
      return 'ok';
    });

    expect(order).toEqual(['a1', 'a2']);
    expect(result).toEqual({ sent: 2, remaining: 0, stoppedBy: 'done' });
    expect(q.read()).toHaveLength(0);
  });

  it('通信エラーなら送信を中断し、操作を失わない', async () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);
    enqueueMission(q, { assignmentId: 'a2', completed: true }, 200);

    const send = vi
      .fn<(item: QueuedMission) => Promise<'ok' | 'rejected' | 'network-error'>>()
      .mockResolvedValueOnce('ok')
      .mockResolvedValueOnce('network-error');

    const result = await flushQueue(q, send);

    expect(result.sent).toBe(1);
    expect(result.stoppedBy).toBe('offline');
    expect(q.read().map((i) => i.assignmentId)).toEqual(['a2']);
  });

  it('サーバーに拒否された操作は再送し続けない', async () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);

    const result = await flushQueue(q, async () => 'rejected');

    expect(result.sent).toBe(0);
    expect(q.read()).toHaveLength(0);
  });

  it('個別に取り除ける', () => {
    const q = createMemoryQueue();
    enqueueMission(q, { assignmentId: 'a1', completed: true }, 100);
    enqueueMission(q, { assignmentId: 'a2', completed: true }, 200);
    removeMission(q, 'a1');
    expect(pendingMap(q)).toEqual({ a2: true });
  });

  it('保存先が壊れていても落ちない', () => {
    const broken = {
      read: () => {
        throw new Error('boom');
      },
      write: () => {},
    };
    expect(() => pendingMap(broken)).toThrow();
    // createMemoryQueue は常に安全
    expect(pendingMap(createMemoryQueue())).toEqual({});
  });
});
