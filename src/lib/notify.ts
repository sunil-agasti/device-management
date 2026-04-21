import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { getSshCredentials } from './ssh';
import { sanitizeForShell } from './sanitize';

const execAsync = promisify(exec);

function getLocalIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = ['127.0.0.1', '::1'];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      ips.push(iface.address);
    }
  }
  return ips;
}

export function isLocalIp(ip: string): boolean {
  return getLocalIps().includes(ip);
}

export async function sendNotification(
  ip: string,
  title: string,
  message: string,
): Promise<boolean> {
  const safeTitle = sanitizeForShell(title);
  const safeMessage = sanitizeForShell(message);
  const local = isLocalIp(ip);

  if (local) {
    try {
      await execAsync(
        `osascript -e 'display notification "${safeMessage}" with title "${safeTitle}" sound name "Glass"'`,
        { timeout: 5000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  const { user, passwords } = getSshCredentials();
  for (const password of passwords) {
    try {
      await execAsync(
        `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${ip} "
          CONSOLE_USER=\\$(stat -f%Su /dev/console)
          USER_ID=\\$(id -u \\$CONSOLE_USER)
          sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display notification \\\"${safeMessage}\\\" with title \\\"${safeTitle}\\\" sound name \\\"Glass\\\"'
        "`,
        { timeout: 15000 }
      );
      return true;
    } catch { continue; }
  }
  return false;
}
