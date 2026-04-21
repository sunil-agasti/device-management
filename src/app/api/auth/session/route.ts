import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isIDMSEnabled } from '@/lib/idms';

export async function GET(req: NextRequest) {
  if (!isIDMSEnabled()) {
    return NextResponse.json({
      authenticated: true,
      idmsEnabled: false,
      message: 'IDMS not enabled. Using VPN-based auth.',
    });
  }

  const user = getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    idmsEnabled: true,
    user: {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      dsid: user.dsid,
      employeeId: user.employeeId,
    },
  });
}
