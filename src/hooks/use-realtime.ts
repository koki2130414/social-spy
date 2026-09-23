'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { realtimeJitter } from '@/lib/polling';

/**
 * 合図が届いてから問い合わせるまでに散らす幅。
 *
 * フェーズ変更は101台に同時に届く。そのまま全員が問い合わせると
 * その一瞬だけ詰まるので、1.5秒の幅に散らして山を平らにする。
 * 人が「反応が遅い」と感じる長さではない。
 */
const JITTER_MS = 1500;

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * ブラウザ用 Supabase クライアント（anon キーのみ。未設定なら null）。
 *
 * このライブラリは圧縮後でも約50KBあり、参加者画面の初回表示の1/4を占める。
 * 受付では100台が同時に初回表示するので、最初の描画には載せず、
 * 画面が出たあとに読み込む。読み込みが終わるまでの数百ミリ秒は
 * 15秒ごとの定期更新が受け持つので、取りこぼしは起きない。
 */
function loadBrowserClient(): Promise<SupabaseClient | null> {
  if (clientPromise) return clientPromise;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    clientPromise = Promise.resolve(null);
    return clientPromise;
  }

  clientPromise = import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(url, key, { auth: { persistSession: false } }))
    .catch(() => null); // 読み込めなくても定期更新だけで動き続ける
  return clientPromise;
}

/**
 * イベントの変化を購読して onChange を呼ぶ。
 * Supabase が設定されていれば Realtime、そうでなければ何もしない
 * （呼び出し側はポーリングも併用しているため、デモモードでも追従する）。
 *
 * 購読するのは events の1本だけにしている。
 * Realtime は「1つの変化 × 購読している人数」だけ通信が発生する決まりなので、
 * 2本購読すると101人の会場では1回のフェーズ変更で202通になり、
 * 無料プランの上限（毎秒100通）を超えて一部の端末に届かなくなる。
 * お知らせを出したときはサーバー側が events も触るので、1本で両方拾える。
 */
export function useRealtimeEvent(eventId: string | null, onChange: () => void) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanup: (() => void) | null = null;

    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        handler.current();
      }, realtimeJitter(JITTER_MS));
    };

    void loadBrowserClient().then((client) => {
      if (!client || cancelled) return;

      const channel = client
        .channel(`event-${eventId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
          () => schedule(),
        )
        .subscribe();

      cleanup = () => void client.removeChannel(channel);
    });

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      cleanup?.();
    };
  }, [eventId]);
}
