import { fail } from '@/server/http';
import { buildParticipantsExport } from '@/server/service/participants-export';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * 受付一覧CSVと全員ぶんのQR画像をまとめたZIP。
 *
 * 全員の鍵が入っているので、運営権限の確認はサービス層で必ず行い、
 * キャッシュにも残さない。
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const { body, fileName } = await buildParticipantsExport(eventId);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        // ファイル名は半角英数字のみ（日本語名は環境によって落ちる）
        'content-disposition': `attachment; filename="${fileName}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
