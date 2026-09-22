'use client';

import { useEffect, useRef } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { realtimeJitter } from '@/lib/polling';

/**
 * 合図が届いてから問い合わせるまでに散らす幅。
 *
 * フェーズ変更は101台に同時に届く。そのまま全員が問い合わせると
 * その一瞬だけ詰まるので、1.5秒の幅に散らして山を平らにする。
 * 人が「反応が遅い」と感じる長さではない。
 */
const JITTER_MS = 1500;

let browserClient: SupabaseClient | null | undefined;

/** ブラウザ用 Supabase クライアント（anon キーのみ。未設定なら null） */
function getBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return browserClient;
}

/**
 * イベントの変化を購読して onChange を呼ぶ。
 * Supabase が設定されていれば Realtime、そうでなければ何もしない
 * （呼び出し側はポーリングも併用しているため、デモモードでも追従する）。
 */
export function useRealtimeEvent(eventId: string | null, onChange: () => void) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!eventId) return;
    const client = getBrowserClient();
    if (!client) return;

    // フェーズ変更では events と notifications の両方が動くことがある。
    // 予約済みのときは重ねず、1回にまとめる
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        handler.current();
      }, realtimeJitter(JITTER_MS));
    };

    const channel = client
      .channel(`event-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        () => schedule(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `event_id=eq.${eventId}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (timer !== null) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [eventId]);
}
