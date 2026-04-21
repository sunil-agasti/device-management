import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { updateLogStatus } from '@/lib/db';
import { validateVpnIp } from '@/lib/validation';
import { sendNotification, isLocalIp } from '@/lib/notify';

const execAsync = promisify(exec);

async function forceRevokeAdmin(username: string, vpnIp: string): Promise<{ success: boolean; output: string }> {
  if (isLocalIp(vpnIp)) {
    try {
      await execAsync(`sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin`, { timeout: 15000 });
      return { success: true, output: `Admin removed locally for ${username}` };
    } catch (err) {
      return { success: false, output: `Local revoke failed: ${err}` };
    }
  }

  const passwords = ["Tc$@April2026", "tcs123"];
  for (const password of passwords) {
    try {
      const { stdout } = await execAsync(
        `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${vpnIp} "
          CONSOLE_USER=\\$(stat -f%Su /dev/console)
          echo '${password}' | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin
          dseditgroup -o checkmember -m \\$CONSOLE_USER admin 2>/dev/null
        "`, { timeout: 30000 });

      if (stdout.includes('not a member') || stdout.includes('NOT a member')) {
        return { success: true, output: `Admin removed for ${username} on ${vpnIp}` };
      }
      return { success: true, output: `Command executed on ${vpnIp}. Verify manually.` };
    } catch { continue; }
  }
  return { success: false, output: `SSH failed to ${vpnIp} with all passwords` };
}

async function forceRevokeGithub(vpnIp: string): Promise<{ success: boolean; output: string }> {
  if (isLocalIp(vpnIp)) {
    try {
      await execAsync("echo '127.0.0.1 github.com' | sudo tee -a /etc/hosts > /dev/null", { timeout: 10000 });
      await execAsync("echo '127.0.0.1 www.github.com' | sudo tee -a /etc/hosts > /dev/null", { timeout: 10000 });
      await execAsync("sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder", { timeout: 10000 });
      return { success: true, output: 'GitHub re-blocked locally. DNS flushed.' };
    } catch (err) {
      return { success: false, output: `Local GitHub revoke failed: ${err}` };
    }
  }

  const passwords = ["Tc$@April2026", "tcs123"];
  for (const password of passwords) {
    try {
      await execAsync(
        `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${vpnIp} "
          echo '${password}' | sudo -S bash -c 'echo \\\"127.0.0.1 github.com\\\" >> /etc/hosts && echo \\\"127.0.0.1 www.github.com\\\" >> /etc/hosts'
          echo '${password}' | sudo -S dscacheutil -flushcache
          echo '${password}' | sudo -S killall -HUP mDNSResponder
        "`, { timeout: 30000 });
      return { success: true, output: `GitHub re-blocked on ${vpnIp}` };
    } catch { continue; }
  }
  return { success: false, output: `SSH failed to ${vpnIp} with all passwords` };
}

export async function POST(req: NextRequest) {
  try {
    const { logId, type, username, vpnIp } = await req.json();

    if (!logId || !type) {
      return NextResponse.json({ error: 'logId and type are required' }, { status: 400 });
    }

    const ipCheck = validateVpnIp(vpnIp);
    if (!ipCheck.valid) {
      return NextResponse.json({ error: ipCheck.message }, { status: 400 });
    }

    let result: { success: boolean; output: string };

    if (type === 'admin') {
      if (!username) return NextResponse.json({ error: 'Username is required for admin revoke' }, { status: 400 });
      result = await forceRevokeAdmin(username, vpnIp);
    } else if (type === 'github') {
      result = await forceRevokeGithub(vpnIp);
    } else {
      return NextResponse.json({ error: 'Invalid type. Must be "admin" or "github"' }, { status: 400 });
    }

    if (result.success) {
      updateLogStatus(logId, type, 'REVOKED');
      await sendNotification(vpnIp,
        type === 'admin' ? 'Admin Access Removed' : 'GitHub Access Removed',
        type === 'admin'
          ? 'Your admin access has been permanently revoked. You are now a standard user.'
          : 'Your GitHub access has been revoked.'
      );
      return NextResponse.json({
        success: true,
        message: result.output,
      });
    }

    return NextResponse.json({
      success: false,
      error: result.output,
    }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: 'Force revoke failed: ' + String(err) }, { status: 500 });
  }
}
