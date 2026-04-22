import { execSync } from 'child_process';
import path from 'path';

const SSH_USER = process.env.SSH_USER || 'tcsadmin';
const SSH_PRIMARY_PASS = process.env.SSH_PRIMARY_PASS || '';
const SSH_BACKUP_PASS = process.env.SSH_BACKUP_PASS || '';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const SSH_SCRIPT = path.join(SCRIPTS_DIR, 'ssh-connect.sh');

export function getSshCredentials(): { user: string; passwords: string[] } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) {
    console.warn('SSH passwords not configured. Set SSH_PRIMARY_PASS and SSH_BACKUP_PASS in .env');
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

export function sshFetchUserInfo(ip: string): { success: boolean; username: string; hostname: string; error?: string } {
  try {
    const output = execSync(`bash "${SSH_SCRIPT}" "${ip}"`, {
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, SSH_PRIMARY_PASS, SSH_BACKUP_PASS, SSH_USER },
    }).trim();

    if (output.startsWith('SUCCESS:')) {
      const data = output.replace('SUCCESS:', '');
      const parts = data.split('|');
      return { success: true, username: parts[0] || '', hostname: parts[1] || '' };
    }

    const error = output.replace('ERROR:', '');
    return { success: false, username: '', hostname: '', error };
  } catch (err) {
    return { success: false, username: '', hostname: '', error: String(err) };
  }
}

export function sshRunCommand(ip: string, command: string): { success: boolean; output: string } {
  const wrappedCmd = `${command}; echo __SSHDATA__:DONE`;
  try {
    const output = execSync(`bash "${SSH_SCRIPT}" "${ip}" "${wrappedCmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 120000,
      env: { ...process.env, SSH_PRIMARY_PASS, SSH_BACKUP_PASS, SSH_USER },
    }).trim();

    if (output.includes('__SSHDATA__:DONE') || output.startsWith('SUCCESS:')) {
      return { success: true, output };
    }
    if (output.startsWith('ERROR:')) {
      return { success: false, output: output.replace('ERROR:', '') };
    }
    return { success: true, output };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}
