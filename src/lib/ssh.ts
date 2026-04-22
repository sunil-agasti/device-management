import { execSync } from 'child_process';

const SSH_USER = process.env.SSH_USER || 'tcsadmin';
const SSH_PRIMARY_PASS = process.env.SSH_PRIMARY_PASS || '';
const SSH_BACKUP_PASS = process.env.SSH_BACKUP_PASS || '';

export function getSshCredentials(): { user: string; passwords: string[] } {
  const passwords = [SSH_PRIMARY_PASS, SSH_BACKUP_PASS].filter(Boolean);
  if (passwords.length === 0) {
    console.warn('SSH passwords not configured. Set SSH_PRIMARY_PASS and SSH_BACKUP_PASS in .env or .env.local');
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

export function sshCommand(ip: string, command: string, password: string): string {
  const escapedPass = password.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  return `expect -c '
    set timeout 15
    spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${ip} "${command}"
    expect {
      "*assword*" { send "${escapedPass}\\r"; exp_continue }
      "*\\$*" { }
      eof { }
      timeout { exit 1 }
    }
    expect eof
    catch wait result
    exit [lindex \\$result 3]
  '`;
}

export function sshExec(ip: string, command: string, password: string, timeout = 15000): string {
  const escapedPass = password.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const expectScript = `
set timeout ${Math.floor(timeout / 1000)}
log_user 1
spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${ip}
expect {
  "*assword*" { send "${escapedPass}\\r" }
  timeout { puts "TIMEOUT"; exit 1 }
  eof { puts "EOF"; exit 1 }
}
expect {
  "*\\$*" {}
  "*%*" {}
  "*>*" {}
  "*#*" {}
  timeout { puts "TIMEOUT_PROMPT"; exit 1 }
}
send "${command.replace(/"/g, '\\"')}\\r"
expect {
  "*\\$*" {}
  "*%*" {}
  "*>*" {}
  "*#*" {}
  eof {}
  timeout {}
}
send "exit\\r"
expect eof
`;

  return execSync(`expect -c '${expectScript.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf-8',
    timeout,
  }).trim();
}

export function sshExecSimple(ip: string, remoteCmd: string, password: string, timeout = 15000): string {
  const escapedPass = password.replace(/'/g, "'\\''").replace(/\$/g, '\\$');
  const script = `#!/usr/bin/expect -f
set timeout ${Math.floor(timeout / 1000)}
spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${ip} {${remoteCmd}}
expect {
  -re ".*assword.*" { send "${escapedPass}\\r"; exp_continue }
  eof
}
lassign [wait] pid spawnid os_error value
exit $value
`;

  const tmpFile = `/tmp/ssh_expect_${Date.now()}.exp`;
  try {
    execSync(`cat > ${tmpFile} << 'EXPECTEOF'\n${script}\nEXPECTEOF\nchmod +x ${tmpFile}`);
    const output = execSync(`expect ${tmpFile}`, { encoding: 'utf-8', timeout }).trim();
    return output;
  } finally {
    try { execSync(`rm -f ${tmpFile}`); } catch { /* ignore */ }
  }
}
