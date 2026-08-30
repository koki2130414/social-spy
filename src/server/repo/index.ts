import { appMode } from '@/lib/env';
import { DemoRepo } from './demo-repo';
import { SupabaseRepo } from './supabase-repo';
import type { Repo } from './types';

let cached: Repo | null = null;
let cachedMode: string | null = null;

export function getRepo(): Repo {
  const mode = appMode();
  if (cached && cachedMode === mode) return cached;
  cached = mode === 'supabase' ? new SupabaseRepo() : new DemoRepo();
  cachedMode = mode;
  return cached;
}

export function isDemoRepo(): boolean {
  return getRepo().kind === 'demo';
}

export type { Repo } from './types';
