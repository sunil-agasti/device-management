import { NextRequest, NextResponse } from 'next/server';

const IDMS_AUTH_URL = process.env.IDMS_AUTH_URL || 'https://idmsac.apple.com/IDMSWebAuth/authenticate';
const IDMS_TOKEN_URL = process.env.IDMS_TOKEN_URL || 'https://idmsac.apple.com/IDMSWebAuth/token';
const IDMS_CLIENT_ID = process.env.IDMS_CLIENT_ID || 'tcs-admin-portal';
const IDMS_CLIENT_SECRET = process.env.IDMS_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://localhost:3000';
const IDMS_ENABLED = process.env.IDMS_ENABLED === 'true';

export interface IDMSUser {
  dsid: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
}

export function getIDMSLoginUrl(returnPath: string = '/'): string {
  const redirectUri = `${APP_URL}/api/auth/callback`;
  const state = Buffer.from(JSON.stringify({ returnPath })).toString('base64');

  const params = new URLSearchParams({
    client_id: IDMS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });

  return `${IDMS_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string; id_token: string } | null> {
  try {
    const res = await fetch(IDMS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: IDMS_CLIENT_ID,
        client_secret: IDMS_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/auth/callback`,
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function parseIDMSToken(idToken: string): IDMSUser | null {
  try {
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    return {
      dsid: decoded.sub || decoded.dsid || '',
      email: decoded.email || '',
      firstName: decoded.given_name || decoded.firstName || '',
      lastName: decoded.family_name || decoded.lastName || '',
      employeeId: decoded.employeeId || decoded.employee_id || '',
    };
  } catch {
    return null;
  }
}

const SESSION_COOKIE = 'tcs_admin_session';

export function getSessionFromRequest(req: NextRequest): IDMSUser | null {
  if (!IDMS_ENABLED) return null;

  const cookie = req.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;

  try {
    return JSON.parse(Buffer.from(cookie.value, 'base64').toString());
  } catch {
    return null;
  }
}

export function createSessionResponse(user: IDMSUser, redirectTo: string): NextResponse {
  const sessionValue = Buffer.from(JSON.stringify(user)).toString('base64');
  const response = NextResponse.redirect(redirectTo);

  response.cookies.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });

  return response;
}

export function isIDMSEnabled(): boolean {
  return IDMS_ENABLED;
}
