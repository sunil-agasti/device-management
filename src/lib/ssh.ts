import { execSync } from 'child_process';

const SSH_USER = process.env.SSH_USER || 'tcsadmin';
const SSH_PRIMARY_PASS = process.env.SSH_PRIMARY_PASS || '';
const SSH_BACKUP_PASS = process.env.SSH_BACKUP_PASS || '';

const SSH_OPTS = '-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=keyboard-interactive,password -o KbdInteractiveAuthentication=yes';

let sshpassPath = 'sshpass';
try {
  sshpassPath = execSync('which sshpass 2>/dev/null || echo /opt/homebrew/bin/sshpass', { encoding: 'utf-8' }).trim();
} catch {
  sshpassPath = '/opt/homebrew/bin/sshpass';
}

export function getSshCredentials(): { user: string; passwords: string[] } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) {
    console.warn('SSH passwords not configured. Set SSH_PRIMARY_PASS and SSH_BACKUP_PASS in .env or .env.local');
    console.warn("If password contains $ or special chars, wrap in single quotes: SSH_PRIMARY_PASS='Pa$$word'");
  }
  return { user: SSH_USER, passwords };
}

export function debugCredentials(): { user: string; passwordCount: number; primaryLength: number; backupLength: number } {
  return {
    user: SSH_USER,
    passwordCount: [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean).length,
    primaryLength: SSH_PRIMARY_PASS.length,
    backupLength: SSH_BACKUP_PASS.length,
  };
}

export function getSshpassPath(): string {
  return sshpassPath;
}

export function getSshOpts(): string {
  return SSH_OPTS;
}

export function sshCommand(ip: string, command: string, password: string): string {
  const escapedPass = password.replace(/'/g, "'\\''");
  return `${sshpassPath} -p '${escapedPass}' ssh ${SSH_OPTS} ${SSH_USER}@${ip} "${command}"`;
}
