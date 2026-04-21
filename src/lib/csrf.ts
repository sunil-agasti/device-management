import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export function validateCsrf(req: NextRequest): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) return false;
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );
}
