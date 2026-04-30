import { NextRequest, NextResponse } from 'next/server';
import { updateLogStatus, logFailure } from '@/lib/db';
import { sendNotification } from '@/lib/notify';

export async function POST(req: NextRequest) {
  try {
    const { logId, type, username, status } = await req.json();

    if (!logId || !type) {
      return NextResponse.json({ error: 'logId and type required' }, { status: 400 });
    }

    const validTypes = ['admin', 'github'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    updateLogStatus(logId, type, status === 'FAILED' ? 'FAILED' : 'REVOKED');
    logFailure(type, 'revoke-callback', username || '', 'device',
      status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      `LaunchDaemon on-device revoke reported: ${status || 'REVOKED'}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
