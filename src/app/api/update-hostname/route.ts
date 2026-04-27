import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { validateVpnIp, validateHostname } from '@/lib/validation';
import { sanitizeIp, sanitizeHostname } from '@/lib/sanitize';
import { sshRunCommand, getSshCredentials } from '@/lib/ssh';
import { isLocalIp } from '@/lib/notify';
import { formatSSHError } from '@/lib/errors';
import { addHostnameLog, upsertUser } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { vpnIp, newHostname, employeeId, email, username, oldHostname, requestedBy } = await req.json();

    const ipCheck = validateVpnIp(vpnIp);
    if (!ipCheck.valid) return NextResponse.json({ error: ipCheck.message }, { status: 400 });
    const hostCheck = validateHostname(newHostname);
    if (!hostCheck.valid) return NextResponse.json({ error: hostCheck.message }, { status: 400 });

    if (oldHostname && newHostname.toLowerCase() === oldHostname.toLowerCase()) {
      return NextResponse.json({ error: `New hostname is the same as current hostname (${oldHostname}). No changes needed.` }, { status: 400 });
    }

    const safeIp = sanitizeIp(vpnIp);
    const safeHostname = sanitizeHostname(newHostname);
    if (!safeIp || !safeHostname) {
      return NextResponse.json({ error: 'Invalid input characters detected' }, { status: 400 });
    }

    if (username) upsertUser({ username, employeeId, email, hostname: newHostname, vpnIp });

    const logId = crypto.randomUUID();
    let success = false;

    if (isLocalIp(safeIp)) {
      try {
        execSync(`sudo scutil --set HostName '${safeHostname}'`, { timeout: 10000 });
        execSync(`sudo scutil --set ComputerName '${safeHostname}'`, { timeout: 10000 });
        execSync(`sudo scutil --set LocalHostName '${safeHostname}'`, { timeout: 10000 });
        success = true;
      } catch { /* fall through */ }
    } else {
      const { passwords } = getSshCredentials();
      const safePass = (passwords[0] || '').replace(/'/g, "'\\''");
      const result = sshRunCommand(safeIp,
        `echo '${safePass}' | sudo -S scutil --set HostName '${safeHostname}'; ` +
        `echo '${safePass}' | sudo -S scutil --set ComputerName '${safeHostname}'; ` +
        `echo '${safePass}' | sudo -S scutil --set LocalHostName '${safeHostname}'; ` +
        `echo SUCCESS`
      );
      success = result.success && result.output.includes('SUCCESS');
    }

    addHostnameLog({
      id: logId, employeeId: employeeId || '', email: email || '', username: username || '',
      oldHostname: oldHostname || 'Unknown', newHostname: safeHostname, vpnIp: safeIp,
      updatedAt: new Date().toISOString(), status: success ? 'SUCCESS' : 'FAILED',
      requestedBy: requestedBy || 'system',
    });

    if (success) {
      return NextResponse.json({ success: true, logId, message: `Hostname updated to ${safeHostname}.` });
    }
    return NextResponse.json({ error: 'Failed to update hostname', logId }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: formatSSHError('target', String(err)) }, { status: 500 });
  }
}
