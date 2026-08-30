import { NextResponse, type NextRequest } from 'next/server';

const PARTICIPANT_COOKIE = 'spy_participant';
const ADMIN_COOKIE = 'spy_admin';

/**
 * Cookie の「有無」だけを見る一次ゲート。
 * 署名の検証と権限チェックは、必ずサーバー側（layout / API）で行う。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!request.cookies.get(ADMIN_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/game')) {
    if (!request.cookies.get(PARTICIPANT_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = '/join';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/game/:path*'],
};
