import { headers } from 'next/headers';
import { execSync } from 'child_process';
import { findUserByIp, upsertUser } from '@/lib/db';
import { sshFetchUserInfo } from '@/lib/ssh';
import { sanitizeIp } from '@/lib/sanitize';
import HomeClient from '@/components/HomeClient';

async function getSystemInfo() {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get('x-forwarded-for');
    const rawIp = forwarded?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || '127.0.0.1';
    const clientIp = sanitizeIp(rawIp) || '127.0.0.1';

    let serverHostname = 'unknown';
    let serverUsername = 'unknown';
    try {
      serverHostname = execSync('scutil --get ComputerName 2>/dev/null || hostname', { encoding: 'utf-8' }).trim();
      serverUsername = execSync('whoami', { encoding: 'utf-8' }).trim();
    } catch { /* ignore */ }

    let clientUsername = serverUsername;
    let clientHostname = serverHostname;

    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1';
    if (!isLocal && clientIp.startsWith('17.')) {
      const dbUser = findUserByIp(clientIp);
      if (dbUser && dbUser.username) {
        clientUsername = dbUser.username;
        clientHostname = dbUser.hostname || clientHostname;
      } else {
        const sshResult = sshFetchUserInfo(clientIp);
        if (sshResult.success && sshResult.username) {
          clientUsername = sshResult.username;
          clientHostname = sshResult.hostname || clientHostname;
          upsertUser({ username: sshResult.username, hostname: sshResult.hostname, vpnIp: clientIp });
        }
      }
    }

    return { serverHostname, serverUsername, clientIp, clientUsername, clientHostname };
  } catch {
    return { serverHostname: 'unknown', serverUsername: 'unknown', clientIp: '127.0.0.1', clientUsername: 'unknown', clientHostname: 'unknown' };
  }
}

export default async function Home() {
  const systemInfo = await getSystemInfo();
  return <HomeClient systemInfo={systemInfo} />;
}
