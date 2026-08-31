/**
 * 環境変数の解決。
 *
 * - デモモードと本番(Supabase)モードを明確に分離する。
 * - 本番環境では `SPY_ALLOW_DEMO_IN_PRODUCTION=true` を明示しない限り
 *   デモモードは有効にならない（意図しないデモ有効化の防止）。
 * - SERVICE ROLE KEY はこのモジュール経由でサーバー側からのみ参照する。
 */

export type AppMode = 'demo' | 'supabase';

function bool(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/** ビルドが本番モードで動いているか（秘密鍵の必須化に使用） */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** 実際に本番環境へデプロイされているか（デモモードの遮断に使用） */
export function isDeployedProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.SPY_ENV === 'production';
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * デモモードの判定。
 *  - Supabase が設定されていれば常に無効（本番データとデモを混在させない）
 *  - 本番デプロイでは SPY_ALLOW_DEMO_IN_PRODUCTION=true が無い限り無効
 *  - NEXT_PUBLIC_DEMO_MODE=false で明示的に無効化できる
 *  - それ以外（ローカル開発など、外部サービス未設定）では既定で有効
 */
export function isDemoModeEnabled(): boolean {
  if (hasSupabaseConfig()) return false;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'false') return false;
  if (isDeployedProduction() && !bool(process.env.SPY_ALLOW_DEMO_IN_PRODUCTION)) return false;
  return true;
}

/** Supabase 設定があればそちらを優先。無ければデモモード */
export function appMode(): AppMode {
  if (hasSupabaseConfig()) return 'supabase';
  return 'demo';
}

let ephemeralSecret: string | null = null;

export function sessionSecret(): string {
  const secret = process.env.SPY_SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (isDeployedProduction()) {
    throw new Error(
      'SPY_SESSION_SECRET が未設定です。16文字以上のランダム文字列を設定してください。',
    );
  }

  if (isProductionRuntime()) {
    // ローカルの本番ビルド確認用。プロセスごとにランダムな鍵を生成する
    // （固定の既定値を使わないため、鍵が漏れても再利用されない）
    if (!ephemeralSecret) {
      ephemeralSecret = Array.from({ length: 8 }, () =>
        Math.random().toString(36).slice(2),
      ).join('');
      console.warn(
        '[BUZZ BASE] SPY_SESSION_SECRET が未設定のため、一時的な鍵を生成しました。' +
          '本番運用では必ず環境変数を設定してください。',
      );
    }
    return ephemeralSecret;
  }

  // 開発／テスト用のフォールバック
  return 'social-spy-development-only-secret-key';
}

/**
 * 参加用URLとQRコードのベースURL。
 *  1. NEXT_PUBLIC_APP_URL（独自ドメインを使う場合はこれを設定する）
 *  2. Vercel が自動で渡すドメイン（設定不要でデプロイ先を正しく指す）
 *  3. ローカル開発
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (explicit) return explicit;

  const hosted = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (hosted) return `https://${hosted.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

export function demoAdminCredentials(): { email: string; password: string } {
  return {
    email: process.env.DEMO_ADMIN_EMAIL || 'admin@socialspy.demo',
    password: process.env.DEMO_ADMIN_PASSWORD || 'spy-demo-2026',
  };
}

/**
 * Web Push（VAPID）の設定。3つ揃っているときだけプッシュ通知を有効にする。
 * 鍵の生成: npx web-push generate-vapid-keys
 */
export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

export function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
}
