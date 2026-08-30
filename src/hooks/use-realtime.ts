'use client';

import { useEffect, useRef } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

    const channel = client
      .channel(`event-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        () => handler.current(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `event_id=eq.${eventId}` },
        () => handler.current(),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [eventId]);
}
