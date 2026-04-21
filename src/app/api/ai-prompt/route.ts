import { NextRequest, NextResponse } from 'next/server';
import { parseAIPrompt } from '@/lib/validation';
import { findUserByEmployeeId, findUserByIp } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    const result = parseAIPrompt(prompt);

    if (result.action === 'unknown') {
      return NextResponse.json({
        ...result,
        suggestions: [
          'grant admin to 17.x.x.x',
          'give github access to 17.x.x.x for 30 minutes',
          'search employee 1234567',
          'run cleanup',
        ],
      });
    }

    let user = null;
    if (result.employeeId) user = findUserByEmployeeId(result.employeeId);
    if (!user && result.ip) user = findUserByIp(result.ip);

    if (result.action === 'search') {
      return NextResponse.json({ ...result, user, found: !!user });
    }

    const missingFields: string[] = [];
    if (!result.ip && !user?.vpnIp) missingFields.push('vpnIp');
    if (!user) {
      if (!result.employeeId) missingFields.push('employeeId');
      missingFields.push('email');
    }

    return NextResponse.json({
      ...result, user, found: !!user,
      requiresInput: missingFields.length > 0, missingFields,
      formData: user
        ? { employeeId: user.employeeId, email: user.email, hostname: user.hostname, vpnIp: result.ip || user.vpnIp, username: user.username, duration: result.duration || 60 }
        : { employeeId: result.employeeId || '', email: '', hostname: '', vpnIp: result.ip || '', username: '', duration: result.duration || 60 },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed: ' + String(err) }, { status: 500 });
  }
}
