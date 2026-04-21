const SSH_USER = process.env.SSH_USER || 'tcsadmin';
const SSH_PRIMARY_PASS = process.env.SSH_PRIMARY_PASS || '';
const SSH_BACKUP_PASS = process.env.SSH_BACKUP_PASS || '';

export function getSshCredentials(): { user: string; passwords: string[] } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) {
    console.warn('SSH passwords not configured. Set SSH_PRIMARY_PASS and SSH_BACKUP_PASS in .env.local');
  }
  return { user: SSH_USER, passwords };
}

export function sshCommand(ip: string, command: string, password: string): string {
  return `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${ip} "${command}"`;
}
