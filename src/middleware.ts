import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken, setCsrfCookie, validateCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rateLimit';

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || '127.0.0.1';
}

function isVpnIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('17.') || ip.startsWith('192.168.') || ip.startsWith('10.');
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const clientIp = getClientIp(req);

  // Skip middleware for static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  // Rate limiting on API routes
  if (pathname.startsWith('/api/')) {
    const { allowed, remaining } = rateLimit(clientIp);
    if (!allowed) {
      const res = NextResponse.json(
        { error: 'Too many requests. Try again in 60 seconds.' },
        { status: 429 }
      );
      res.headers.set('Retry-After', '60');
      res.headers.set('X-RateLimit-Remaining', '0');
      return addSecurityHeaders(res);
    }

    // VPN authentication for API routes (server-side enforcement)
    if (!isVpnIp(clientIp)) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Access denied. Connect to Apple VPN.' }, { status: 403 })
      );
    }

    // CSRF validation for mutation endpoints
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      if (!validateCsrf(req)) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Invalid CSRF token.' }, { status: 403 })
        );
      }
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    return addSecurityHeaders(response);
  }

  // For page requests: set CSRF cookie if not present
  const response = NextResponse.next();

  if (!req.cookies.get('csrf_token')) {
    const token = generateCsrfToken();
    setCsrfCookie(response, token);
  }

  // VPN check for pages
  if (!isVpnIp(clientIp)) {
    const url = req.nextUrl.clone();
    url.pathname = '/blocked';
    return addSecurityHeaders(NextResponse.rewrite(url));
  }

  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
