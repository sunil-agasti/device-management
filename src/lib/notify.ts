import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { sshRunCommandAsync, getSshCredentials } from './ssh';
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

  const script = `display notification "${safeMessage}" with title "${safeTitle}" sound name "Glass"`;

  if (local) {
    try {
      await execAsync(`osascript -e '${script}'`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  const { passwords } = getSshCredentials();
  const safePass = (passwords[0] || '').replace(/'/g, "'\\''");

  try {
    const result = await sshRunCommandAsync(ip,
      `CONSOLE_USER=$(stat -f%Su /dev/console); USER_ID=$(id -u $CONSOLE_USER); echo '${safePass}' | sudo -S launchctl asuser $USER_ID sudo -u $CONSOLE_USER osascript -e '${script}'`,
      10
    );
    return result.success;
  } catch {
    return false;
  }
}
