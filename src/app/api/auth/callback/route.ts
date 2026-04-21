import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, parseIDMSToken, createSessionResponse } from '@/lib/idms';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?auth_error=' + error, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?auth_error=no_code', req.url));
  }

  let returnPath = '/';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
      returnPath = decoded.returnPath || '/';
    } catch { /* use default */ }
  }

  const tokens = await exchangeCodeForToken(code);
  if (!tokens) {
    return NextResponse.redirect(new URL('/?auth_error=token_exchange_failed', req.url));
  }

  const user = parseIDMSToken(tokens.id_token);
  if (!user) {
    return NextResponse.redirect(new URL('/?auth_error=invalid_token', req.url));
  }

  const appUrl = process.env.APP_URL || 'https://localhost:3000';
  return createSessionResponse(user, `${appUrl}${returnPath}`);
}
