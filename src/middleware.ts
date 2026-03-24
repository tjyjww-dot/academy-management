import { NextRequest, NextResponse } from 'next/server';
function decodeToken(token: string) { try { const payload = JSON.parse(atob(token.split('.')[1])); if (payload.exp && payload.exp * 1000 < Date.now()) return null; return payload; } catch { return null; } }

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow public routes and mobile API (ëª¨ë°ì¼ APIë ìì²´ Bearer í í° ì¸ì¦ ì¬ì©)
  const publicRoutes = ['/auth', '/api/auth', '/api/mobile', '/_next', '/favicon.ico'];
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // ëª¨ë°ì¼ API CORS ì§ì
    if (pathname.startsWith('/api/mobile')) {
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Type');
      return response;
    }
    return NextResponse.next();
  }

  // Get token from cookies
  const token = request.cookies.get('auth-token-js')?.value || request.cookies.get('auth-token')?.value;

  // Protect /admin/* routes
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    const decoded = decodeToken(token);
    if (!decoded) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    return NextResponse.next();
  }

  // Protect /parent/* routes
  if (pathname.startsWith('/parent')) {
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    const decoded = decodeToken(token);
      if (!decoded || (decoded.role !== 'PARENT' && decoded.role !== 'STUDENT')) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
