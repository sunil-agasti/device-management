import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { validateVpnIp, validateHostname } from '@/lib/validation';
import { sanitizeIp, sanitizeHostname } from '@/lib/sanitize';
import { sshRunCommand, getSshCredentials } from '@/lib/ssh';
import { isLocalIp } from '@/lib/notify';
import { formatSSHError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { vpnIp, newHostname } = await req.json();

    const ipCheck = validateVpnIp(vpnIp);
    if (!ipCheck.valid) return NextResponse.json({ error: ipCheck.message }, { status: 400 });
    const hostCheck = validateHostname(newHostname);
    if (!hostCheck.valid) return NextResponse.json({ error: hostCheck.message }, { status: 400 });

    const safeIp = sanitizeIp(vpnIp);
    const safeHostname = sanitizeHostname(newHostname);
    if (!safeIp || !safeHostname) {
      return NextResponse.json({ error: 'Invalid input characters detected' }, { status: 400 });
    }

    if (isLocalIp(safeIp)) {
      try {
        execSync(`sudo scutil --set HostName '${safeHostname}'`, { timeout: 10000 });
        execSync(`sudo scutil --set ComputerName '${safeHostname}'`, { timeout: 10000 });
        execSync(`sudo scutil --set LocalHostName '${safeHostname}'`, { timeout: 10000 });
        return NextResponse.json({ success: true, message: `Hostname updated to ${safeHostname} (local).` });
      } catch (err) {
        return NextResponse.json({ error: 'Local hostname update failed: ' + String(err) }, { status: 500 });
      }
    }

    const { passwords } = getSshCredentials();
    const pass = passwords[0] || '';
    const safePass = pass.replace(/'/g, "'\\''");

    const result = sshRunCommand(safeIp,
      `echo '${safePass}' | sudo -S scutil --set HostName '${safeHostname}'; ` +
      `echo '${safePass}' | sudo -S scutil --set ComputerName '${safeHostname}'; ` +
      `echo '${safePass}' | sudo -S scutil --set LocalHostName '${safeHostname}'; ` +
      `echo SUCCESS`
    );

    if (result.success && result.output.includes('SUCCESS')) {
      return NextResponse.json({ success: true, message: `Hostname updated to ${safeHostname}. Run JAMF from admin page if needed.` });
    }
    return NextResponse.json({ error: result.output || 'Failed to update hostname' }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: formatSSHError('target', String(err)) }, { status: 500 });
  }
}
