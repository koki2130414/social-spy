import QRCode from 'qrcode';
import { appUrl } from '@/lib/env';
import { fail, ok } from '@/server/http';
import { getEvent } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const event = await getEvent(eventId);
    const joinUrl = `${appUrl()}/join?code=${encodeURIComponent(event.code)}`;
    const dataUrl = await QRCode.toDataURL(joinUrl, {
      width: 512,
      margin: 2,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
    return ok({ joinUrl, dataUrl, code: event.code });
  } catch (error) {
    return fail(error);
  }
}
