import { NextResponse } from 'next/server';
import { appMode } from '@/lib/env';
import { getRepo } from '@/server/repo';

/**
 * 死活確認用のエンドポイント。
 *
 * 目的は2つ。
 *
 * 1. Supabase の無料プランは一定期間アクセスが無いとプロジェクトが
 *    自動停止し、アプリ全体が落ちる。定期的にここを叩いて
 *    「データベースへの問い合わせ」を発生させ、停止を防ぐ。
 * 2. 当日、アプリが生きているかを1秒で確認する手段にする。
 *
 * 返す情報は公開しても害の無いものだけに限る。
 * イベント名・参加者・role などは絶対に含めない。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const mode = appMode();
  const startedAt = Date.now();

  try {
    // 実際にデータベースへ1往復させる。ここを省くと
    // 「アプリは生きているがDBは停止している」状態を見逃す。
    await getRepo().listEvents();
    return NextResponse.json(
      { ok: true, mode, db: 'ok', ms: Date.now() - startedAt },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    // 失敗の中身は返さない（接続文字列などが混ざる恐れがあるため）
    return NextResponse.json(
      { ok: false, mode, db: 'error', ms: Date.now() - startedAt },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
