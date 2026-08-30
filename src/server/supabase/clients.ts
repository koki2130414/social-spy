import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/env';

/**
 * サーバー専用の Supabase クライアント。
 *
 * SERVICE ROLE KEY はこのモジュールからのみ参照し、
 * クライアントバンドルには決して含めない（"use client" から import しないこと）。
 *
 * 参加者は Supabase Auth のユーザーではなく、サーバーが署名した Cookie で識別する。
 * そのため参加者データの読み書きは必ず Route Handler 内のこのクライアント経由で行い、
 * サーバー側で権限チェックを行う。RLS は「万一 anon キーで直接叩かれた場合」の
 * 二重防御として全テーブルに設定している（supabase/migrations 参照）。
 */
let cachedAdmin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase の環境変数が設定されていません。');
  }
  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}
