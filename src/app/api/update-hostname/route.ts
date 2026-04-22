import { NextRequest, NextResponse } from 'next/server';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { validateVpnIp, validateHostname } from '@/lib/validation';
import { sanitizeIp, sanitizeHostname } from '@/lib/sanitize';
import { getSshCredentials } from '@/lib/ssh';
import { isLocalIp } from '@/lib/notify';

const execAsync = promisify(exec);

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

        try {
          await execAsync('sudo /usr/local/bin/jamf manage', { timeout: 60000 });
          await execAsync('sudo /usr/local/bin/jamf policy', { timeout: 60000 });
          await execAsync('sudo /usr/local/bin/jamf recon', { timeout: 60000 });
        } catch { /* JAMF not available */ }

        return NextResponse.json({ success: true, message: `Hostname updated to ${safeHostname} (local). JAMF synced.` });
      } catch (err) {
        return NextResponse.json({ error: 'Local hostname update failed: ' + String(err) }, { status: 500 });
      }
    }

    const { user, passwords } = getSshCredentials();
    let password = '';
    for (const p of passwords) {
      try {
        execSync(`sshpass -p '${p}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${safeIp} "exit"`, { timeout: 10000 });
        password = p;
        break;
      } catch { continue; }
    }
    if (!password) return NextResponse.json({ error: 'SSH authentication failed' }, { status: 500 });

    const output = execSync(
      `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no ${user}@${safeIp} "
        echo '${password}' | sudo -S scutil --set HostName '${safeHostname}'
        echo '${password}' | sudo -S scutil --set ComputerName '${safeHostname}'
        echo '${password}' | sudo -S scutil --set LocalHostName '${safeHostname}'
        echo '${password}' | sudo -S /usr/local/bin/jamf manage 2>/dev/null
        echo '${password}' | sudo -S /usr/local/bin/jamf policy 2>/dev/null
        echo '${password}' | sudo -S /usr/local/bin/jamf recon 2>/dev/null
        echo SUCCESS
      "`,
      { encoding: 'utf-8', timeout: 120000 }
    ).trim();

    if (output.includes('SUCCESS')) {
      return NextResponse.json({ success: true, message: `Hostname updated to ${safeHostname}. JAMF synced.` });
    }
    return NextResponse.json({ error: 'Failed to update hostname' }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: 'Hostname update failed: ' + String(err) }, { status: 500 });
  }
}
