import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { validateVpnIp, validateHostname } from '@/lib/validation';

export async function POST(req: NextRequest) {
  try {
    const { vpnIp, newHostname } = await req.json();

    const ipCheck = validateVpnIp(vpnIp);
    if (!ipCheck.valid) return NextResponse.json({ error: ipCheck.message }, { status: 400 });
    const hostCheck = validateHostname(newHostname);
    if (!hostCheck.valid) return NextResponse.json({ error: hostCheck.message }, { status: 400 });

    const passwords = ["Tc$@April2026", "tcs123"];
    let password = '';
    for (const p of passwords) {
      try {
        execSync(`sshpass -p '${p}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 tcsadmin@${vpnIp} "exit"`, { timeout: 10000 });
        password = p;
        break;
      } catch { continue; }
    }
    if (!password) return NextResponse.json({ error: 'SSH authentication failed' }, { status: 500 });

    const output = execSync(
      `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no tcsadmin@${vpnIp} "echo '${password}' | sudo -S scutil --set ComputerName '${newHostname}' && echo '${password}' | sudo -S scutil --set LocalHostName '${newHostname}' && echo SUCCESS"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    if (output.includes('SUCCESS')) {
      return NextResponse.json({ success: true, message: `Hostname updated to ${newHostname}` });
    }
    return NextResponse.json({ error: 'Failed to update hostname' }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: 'Hostname update failed: ' + String(err) }, { status: 500 });
  }
}
