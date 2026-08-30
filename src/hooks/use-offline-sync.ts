'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiSend, ApiError } from '@/lib/api';
import {
  createLocalStorageQueue,
  enqueueMission,
  flushQueue,
  pendingMap,
  removeMission,
  type QueuedMission,
} from '@/lib/offline-queue';
import { useOnlineStatus } from './use-online-status';

type SendOutcome =
  | { kind: 'ok' }
  | { kind: 'rejected'; message: string }
  | { kind: 'network-error' };

async function sendMissionDetailed(item: QueuedMission): Promise<SendOutcome> {
  try {
    await apiSend('/api/participant/missions/complete', {
      assignmentId: item.assignmentId,
      completed: item.completed,
    });
    return { kind: 'ok' };
  } catch (e) {
    // ApiError はサーバーが応答した＝通信は届いている（＝再送しても通らない）
    if (e instanceof ApiError) return { kind: 'rejected', message: e.message };
    return { kind: 'network-error' };
  }
}

async function sendMission(item: QueuedMission): Promise<'ok' | 'rejected' | 'network-error'> {
  return (await sendMissionDetailed(item)).kind;
}

export type SubmitResult =
  | { status: 'sent' }
  | { status: 'queued' }
  | { status: 'rejected'; message: string };

export interface OfflineSync {
  online: boolean;
  /** 未送信の操作（assignmentId → 達成状態） */
  pending: Record<string, boolean>;
  pendingCount: number;
  /** 達成状態を送る。通信が届かなければ端末に保持して後で自動送信する */
  submitMission: (assignmentId: string, completed: boolean) => Promise<SubmitResult>;
  /** 保持している操作をまとめて送る */
  flush: () => Promise<void>;
}

/**
 * MISSION達成の送信をオフライン耐性のあるものにする。
 * 送信できなければ端末に積み、オンライン復帰時とマウント時に自動で送る。
 */
export function useOfflineSync(onSynced?: () => void): OfflineSync {
  const online = useOnlineStatus();
  const storage = useMemo(() => createLocalStorageQueue(), []);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const flushing = useRef(false);
  const synced = useRef(onSynced);
  synced.current = onSynced;

  const refreshPending = useCallback(() => {
    setPending(pendingMap(storage));
  }, [storage]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const result = await flushQueue(storage, sendMission);
      refreshPending();
      if (result.sent > 0 && synced.current) synced.current();
    } finally {
      flushing.current = false;
    }
  }, [storage, refreshPending]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!online) return;
    void flush();
  }, [online, flush]);

  const submitMission = useCallback(
    async (assignmentId: string, completed: boolean): Promise<SubmitResult> => {
      const outcome = await sendMissionDetailed({ assignmentId, completed, queuedAt: Date.now() });

      if (outcome.kind === 'ok') {
        setPending((prev) => {
          if (!(assignmentId in prev)) return prev;
          const next = { ...prev };
          delete next[assignmentId];
          return next;
        });
        removeMission(storage, assignmentId);
        return { status: 'sent' };
      }

      if (outcome.kind === 'rejected') {
        return { status: 'rejected', message: outcome.message };
      }

      enqueueMission(storage, { assignmentId, completed });
      refreshPending();
      return { status: 'queued' };
    },
    [storage, refreshPending],
  );

  return {
    online,
    pending,
    pendingCount: Object.keys(pending).length,
    submitMission,
    flush,
  };
}
