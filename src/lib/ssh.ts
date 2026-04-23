import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SSH_USER = process.env.SSH_USER || 'tcsadmin';
const SSH_PRIMARY_PASS = process.env.SSH_PRIMARY_PASS || '';
const SSH_BACKUP_PASS = process.env.SSH_BACKUP_PASS || '';

export function getSshCredentials(): { user: string; passwords: string[] } {
  return { user: SSH_USER, passwords: [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean) };
}

export function debugCredentials(): { user: string; passwordCount: number; primaryLength: number; backupLength: number } {
  return {
    user: SSH_USER,
    passwordCount: [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean).length,
    primaryLength: SSH_PRIMARY_PASS.length,
    backupLength: SSH_BACKUP_PASS.length,
  };
}

function runSsh(ip: string, command: string, password: string, timeout = 5): { success: boolean; output: string } {
  const askpass = path.join(os.tmpdir(), `.askpass_${process.pid}_${Date.now()}`);
  fs.writeFileSync(askpass, `#!/bin/bash\necho '${password.replace(/'/g, "'\\''")}'`, { mode: 0o700 });

  try {
    const output = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${SSH_USER}@${ip} '${command.replace(/'/g, "'\\''")}'`,
      {
        encoding: 'utf-8',
        timeout: timeout * 1000,
        env: {
          ...process.env,
          SSH_ASKPASS: askpass,
          SSH_ASKPASS_REQUIRE: 'force',
          DISPLAY: ':0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();
    return { success: true, output };
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = (typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() || '').trim();
    if (stderr.includes('Permission denied')) return { success: false, output: 'Authentication failed' };
    if (stderr.includes('Connection refused')) return { success: false, output: 'Connection refused - device offline' };
    if (stderr.includes('timed out') || stderr.includes('No route')) return { success: false, output: 'Device unreachable - check VPN' };
    return { success: false, output: stderr.split('\n').pop() || 'SSH connection failed' };
  } finally {
    try { fs.unlinkSync(askpass); } catch { /* already cleaned */ }
  }
}

export function sshFetchUserInfo(ip: string): { success: boolean; username: string; hostname: string; error?: string; method?: string } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) {
    return { success: false, username: '', hostname: '', error: 'No SSH passwords in .env' };
  }

  const cmd = 'stat -f%Su /dev/console && scutil --get ComputerName';

  for (const pass of passwords) {
    const result = runSsh(ip, cmd, pass, 5);
    if (result.success) {
      const lines = result.output.split('\n').filter(Boolean);
      const username = lines[0]?.trim() || '';
      const hostname = lines[1]?.trim() || '';
      if (username) return { success: true, username, hostname, method: 'ssh' };
    }
    if (result.output === 'Authentication failed') continue;
    return { success: false, username: '', hostname: '', error: result.output };
  }

  return { success: false, username: '', hostname: '', error: 'Wrong password - update SSH_PRIMARY_PASS in .env' };
}

export function sshRunCommand(ip: string, command: string): { success: boolean; output: string } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) return { success: false, output: 'No SSH passwords configured' };

  for (const pass of passwords) {
    const result = runSsh(ip, command, pass, 120);
    if (result.success) return result;
    if (result.output === 'Authentication failed') continue;
    return result;
  }
  return { success: false, output: 'Wrong password - update SSH_PRIMARY_PASS in .env' };
}
