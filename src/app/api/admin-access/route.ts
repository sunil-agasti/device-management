import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername, logFailure } from '@/lib/db';
import { validateVpnIp, validateHostname, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';
import { sendNotification, isLocalIp } from '@/lib/notify';
import { detectDevice } from '@/lib/device';
import { sshRunCommand, sshRunCommandAsync, getSshCredentials } from '@/lib/ssh';
import { formatSSHError } from '@/lib/errors';

const execAsync = promisify(exec);

type StreamWriter = (event: Record<string, unknown>) => void;

function streamStep(write: StreamWriter, id: string, label: string, status: string, extra?: Record<string, unknown>) {
  write({ step: id, label, status, ...extra });
}

async function revokeAdminAccess(username: string, logId: string, originalIp: string) {
  const user = findUserByUsername(username);
  const currentIp = user?.vpnIp || originalIp;

  if (isLocalIp(currentIp) || isLocalIp(originalIp)) {
    try {
      await execAsync(`sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin`, { timeout: 10000 });
      updateLogStatus(logId, 'admin', 'REVOKED');
      await sendNotification(currentIp, 'User Privileges Updated', `Hello ${username}, your admin privileges have been revoked and updated to Standard User.`);
      logFailure('admin', 'revoke', username, currentIp, 'SUCCESS', 'Local revoke completed');
      return;
    } catch (e) {
      logFailure('admin', 'revoke', username, currentIp, 'RETRY', `Local revoke failed: ${e}`);
    }
  }

  const { passwords } = getSshCredentials();
  const safePass = (passwords[0] || '').replace(/'/g, "'\\''");

  // Retry up to 3 times with 30s delay (LaunchDaemon might still be running)
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const ip of [currentIp, originalIp]) {
      // First check if already revoked (LaunchDaemon might have done it)
      const checkResult = sshRunCommand(ip, `dseditgroup -o checkmember -m $(stat -f%Su /dev/console) admin 2>&1`);
      if (checkResult.success && /not a member/i.test(checkResult.output)) {
        updateLogStatus(logId, 'admin', 'REVOKED');
        logFailure('admin', 'revoke', username, ip, 'SUCCESS', `Already revoked (attempt ${attempt}): ${checkResult.output}`);
        return;
      }

      // Try to revoke
      const revokeCmd = `CONSOLE_USER=$(stat -f%Su /dev/console); echo '${safePass}' | sudo -S /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin 2>&1; echo "CHECK:"; dseditgroup -o checkmember -m $CONSOLE_USER admin 2>&1`;
      const result = sshRunCommand(ip, revokeCmd);
      if (result.success && /not a member/i.test(result.output)) {
        updateLogStatus(logId, 'admin', 'REVOKED');
        await sendNotification(ip, 'User Privileges Updated', `Hello ${username}, your admin privileges have been revoked and updated to Standard User.`);
        logFailure('admin', 'revoke', username, ip, 'SUCCESS', `Revoked on attempt ${attempt}: ${result.output}`);
        return;
      }
      logFailure('admin', 'revoke', username, ip, 'RETRY', `Attempt ${attempt} failed. SSH: ${result.success}, output: ${result.output}`);
    }
    // Wait 30s before retry (LaunchDaemon polls every 30s)
    if (attempt < 3) await new Promise(r => setTimeout(r, 30000));
  }

  // Final check: LaunchDaemon may have revoked even though SSH failed for us
  // Try one more time with longer timeout to verify actual status
  for (const ip of [currentIp, originalIp]) {
    try {
      const finalCheck = sshRunCommand(ip, `dseditgroup -o checkmember -m $(stat -f%Su /dev/console) admin 2>&1`);
      if (finalCheck.success && /not a member/i.test(finalCheck.output)) {
        updateLogStatus(logId, 'admin', 'REVOKED');
        logFailure('admin', 'revoke', username, ip, 'SUCCESS', `LaunchDaemon revoked (verified on final check): ${finalCheck.output}`);
        return;
      }
    } catch { /* continue */ }
  }

  updateLogStatus(logId, 'admin', 'FAILED');
  logFailure('admin', 'revoke', username, currentIp, 'FAILED', 'All 3 attempts + final verification failed');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employeeId, email, hostname, vpnIp, username, duration = 60, requestedBy } = body;

  const userAgent = req.headers.get('user-agent') || '';
  const device = detectDevice(userAgent);

  const checks = [
    validateVpnIp(vpnIp), validateHostname(hostname),
    validateEmployeeId(employeeId), validateEmail(email), validateDuration(duration),
  ];
  for (const c of checks) {
    if (!c.valid) return NextResponse.json({ error: c.message }, { status: 400 });
  }

  upsertUser({ username, employeeId, email, hostname, vpnIp });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write: StreamWriter = (event) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const local = isLocalIp(vpnIp);
        const { passwords } = getSshCredentials();
        const pass = passwords[0] || '';
        const safePass = pass.replace(/'/g, "'\\''");
        const logId = crypto.randomUUID();
        let overallSuccess = true;

        // === STEP 1: GRANT ===
        streamStep(write, 'grant', 'Granting admin access', 'active');

        if (local) {
          try {
            await execAsync(`sudo dseditgroup -o edit -a ${username} -t user admin`, { timeout: 10000 });
            streamStep(write, 'grant', 'Granting admin access', 'completed', {
              success: true, log: `dseditgroup -o edit -a ${username} -t user admin\nOK`,
            });
          } catch (e) {
            streamStep(write, 'grant', 'Granting admin access', 'error', {
              success: false, log: `Failed: ${e}`,
            });
            overallSuccess = false;
          }
        } else {
          // Check if already admin
          const checkResult = sshRunCommand(vpnIp, `dseditgroup -o checkmember -m $(stat -f%Su /dev/console) admin 2>/dev/null`);
          if (checkResult.success && checkResult.output.includes('is a member')) {
            streamStep(write, 'grant', 'Granting admin access', 'completed', {
              success: true, log: `User ${username} is already an admin on this device.\n${checkResult.output.trim()}`,
            });
            write({ done: true, success: true, alreadyAdmin: true, message: `${username} is already an admin on ${hostname}. No changes made.` });
            controller.close();
            return;
          }

          // Grant admin
          const grantCmd = `CONSOLE_USER=$(stat -f%Su /dev/console); echo "User: $CONSOLE_USER"; echo '${safePass}' | sudo -S dseditgroup -o edit -a $CONSOLE_USER -t user admin 2>/dev/null && echo "GRANT_OK" || echo "GRANT_FAIL"`;
          const grantResult = sshRunCommand(vpnIp, grantCmd);
          const grantOk = grantResult.success && grantResult.output.includes('GRANT_OK');

          if (grantOk) {
            const verifyResult = sshRunCommand(vpnIp, `dseditgroup -o checkmember -m $(stat -f%Su /dev/console) admin 2>/dev/null`);
            const isMember = verifyResult.success && verifyResult.output.includes('is a member');
            streamStep(write, 'grant', 'Granting admin access', isMember ? 'completed' : 'error', {
              success: isMember,
              log: `ssh tcsadmin@${vpnIp}\n> sudo dseditgroup -o edit -a ${username} -t user admin\n${grantResult.output}\n> Verify: ${verifyResult.output.trim()}`,
            });
            if (!isMember) overallSuccess = false;
          } else {
            streamStep(write, 'grant', 'Granting admin access', 'error', {
              success: false,
              log: `ssh tcsadmin@${vpnIp}\n> sudo dseditgroup -o edit -a ${username} -t user admin\n${grantResult.output}`,
            });
            overallSuccess = false;
          }
        }

        if (!overallSuccess) {
          addLog({ id: logId, hostname, username, employeeId, email, vpnIp, grantedAt: new Date().toISOString(), duration, scheduledRevokeAt: new Date(Date.now() + duration * 60000).toISOString(), revokedAt: null, status: 'FAILED', requestedBy: requestedBy || 'system', type: 'admin', device });
          write({ done: true, success: false, logId, error: 'Failed to grant admin access' });
          controller.close();
          return;
        }

        // === STEP 2: JAMF (async, non-blocking) ===
        const expiryEpoch = Math.floor(Date.now() / 1000) + duration * 60;

        streamStep(write, 'jamf', 'Running JAMF Commands', 'active');
        if (local) {
          try {
            await execAsync('sudo /usr/local/bin/jamf manage', { timeout: 60000 });
            await execAsync('sudo /usr/local/bin/jamf recon', { timeout: 60000 });
            streamStep(write, 'jamf', 'Running JAMF Commands', 'completed', { success: true, log: 'jamf manage ✓\njamf recon ✓\n(jamf policy skipped — would undo admin grant)' });
          } catch {
            streamStep(write, 'jamf', 'Running JAMF Commands', 'completed', { success: true, log: 'JAMF not available (skipped)' });
          }
        } else {
          const scriptPath = path.join(process.cwd(), 'scripts', 'jamf-policies.sh');
          execAsync(`bash "${scriptPath}" "${vpnIp}"`, { timeout: 120000 }).catch(() => {});
          streamStep(write, 'jamf', 'Running JAMF Commands', 'completed', {
            success: true,
            log: `JAMF manage + recon triggered in background on ${vpnIp}\n(jamf policy skipped — would undo admin grant)`,
          });
        }

        // === STEP 3: SCHEDULE AUTO-REVOKE ===
        streamStep(write, 'schedule', 'Scheduling auto-revoke', 'active');
        if (local) {
          const revokeScript = `/usr/local/bin/admin_revoke_${username}.sh`;
          const revokeContent = `#!/bin/bash
EXPIRY=${expiryEpoch}
while [ $(date +%s) -lt $EXPIRY ]; do sleep 10; done
/usr/sbin/dseditgroup -o edit -d ${username} -t user admin 2>/dev/null || sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin
VERIFY=$(dseditgroup -o checkmember -m ${username} admin 2>/dev/null)
if echo "$VERIFY" | grep -q "is a member"; then
  for i in 1 2 3 4 5; do sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin 2>/dev/null; sleep 2; done
fi
osascript -e 'display notification "Hello ${username}, your admin privileges have been revoked and updated to Standard User." with title "User Privileges Updated" sound name "Glass"'
rm -f "${revokeScript}"
sudo launchctl bootout system/com.tcs.admin.revoke 2>/dev/null
sudo rm -f /Library/LaunchDaemons/com.tcs.admin.revoke.plist`;
          try {
            await execAsync(`sudo tee "${revokeScript}" > /dev/null << 'SCRIPT'\n${revokeContent}\nSCRIPT`);
            await execAsync(`sudo chmod +x "${revokeScript}"`);
            const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.tcs.admin.revoke</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>${revokeScript}</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
</dict></plist>`;
            await execAsync(`sudo tee /Library/LaunchDaemons/com.tcs.admin.revoke.plist > /dev/null << 'PLIST'\n${plist}\nPLIST`);
            await execAsync(`sudo chown root:wheel /Library/LaunchDaemons/com.tcs.admin.revoke.plist && sudo chmod 644 /Library/LaunchDaemons/com.tcs.admin.revoke.plist`);
            await execAsync(`sudo launchctl bootstrap system /Library/LaunchDaemons/com.tcs.admin.revoke.plist 2>/dev/null || sudo launchctl load -w /Library/LaunchDaemons/com.tcs.admin.revoke.plist`);
            streamStep(write, 'schedule', 'Scheduling auto-revoke', 'completed', {
              success: true,
              log: `Revoke at epoch ${expiryEpoch} (${new Date(expiryEpoch * 1000).toLocaleTimeString()})\nLaunchDaemon: com.tcs.admin.revoke (KeepAlive + RunAtLoad)\nSurvives: reboot, shutdown, network loss\nForce retry: 5 attempts if first fails\nNotification on revoke`,
            });
          } catch (e) {
            streamStep(write, 'schedule', 'Scheduling auto-revoke', 'error', { success: false, log: String(e) });
          }
        } else {
          const revokeCmd = `echo '${safePass}' | sudo -S tee /usr/local/bin/admin_revoke.sh > /dev/null <<'REVOKESCRIPT'
#!/bin/bash
EXPIRY=${expiryEpoch}
PASSWORD='${safePass}'
while [ \\$(date +%s) -lt \\$EXPIRY ]; do sleep 10; done
CONSOLE_USER=\\$(stat -f%Su /dev/console)
USER_ID=\\$(id -u \\$CONSOLE_USER)
echo "\\$PASSWORD" | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin 2>/dev/null
VERIFY=\\$(dseditgroup -o checkmember -m \\$CONSOLE_USER admin 2>/dev/null)
if echo "\\$VERIFY" | grep -q "is a member"; then
  for i in 1 2 3 4 5; do
    echo "\\$PASSWORD" | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin 2>/dev/null
    sleep 2
  done
fi
sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display notification "Your admin privileges have been revoked and updated to Standard User." with title "User Privileges Updated" sound name "Glass"'
sudo rm -f /usr/local/bin/admin_revoke.sh
sudo launchctl bootout system/com.tcs.admin.revoke 2>/dev/null
sudo rm -f /Library/LaunchDaemons/com.tcs.admin.revoke.plist
REVOKESCRIPT
echo '${safePass}' | sudo -S chmod 700 /usr/local/bin/admin_revoke.sh
echo '${safePass}' | sudo -S chown root:wheel /usr/local/bin/admin_revoke.sh
echo '${safePass}' | sudo -S tee /Library/LaunchDaemons/com.tcs.admin.revoke.plist > /dev/null <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.tcs.admin.revoke</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>/usr/local/bin/admin_revoke.sh</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
</dict></plist>
PLIST
echo '${safePass}' | sudo -S chown root:wheel /Library/LaunchDaemons/com.tcs.admin.revoke.plist
echo '${safePass}' | sudo -S chmod 644 /Library/LaunchDaemons/com.tcs.admin.revoke.plist
echo '${safePass}' | sudo -S launchctl bootstrap system /Library/LaunchDaemons/com.tcs.admin.revoke.plist 2>/dev/null || echo '${safePass}' | sudo -S launchctl load -w /Library/LaunchDaemons/com.tcs.admin.revoke.plist
echo "SCHEDULE_OK"`;
          const schedResult = await sshRunCommandAsync(vpnIp, revokeCmd);
          const schedOk = schedResult.success && schedResult.output.includes('SCHEDULE_OK');
          streamStep(write, 'schedule', 'Scheduling auto-revoke', schedOk ? 'completed' : 'error', {
            success: schedOk,
            log: `LaunchDaemon on remote machine (KeepAlive + RunAtLoad)\n> Revoke at epoch ${expiryEpoch} (${new Date(expiryEpoch * 1000).toLocaleTimeString()})\n> Survives: reboot, shutdown, VPN disconnect, network loss\n> Script: /usr/local/bin/admin_revoke.sh (root:wheel 700)\n> Password secured, force retry 5x, notification on revoke\n> Cleanup: removes script + plist after revoke\n${schedResult.output}`,
          });
        }

        // === STEP 4: SEND NOTIFICATION ===
        streamStep(write, 'notify', 'Sending notification', 'active');
        const notifySent = await sendNotification(vpnIp, 'Admin Access Granted',
          `Hello ${username}, you have been granted temporary admin access for ${duration} minutes. Your privileges will be automatically revoked after the timer expires.`);
        if (notifySent) {
          streamStep(write, 'notify', 'Sending notification', 'completed', {
            success: true, log: `Notification sent to ${vpnIp}`,
          });
        } else {
          logFailure('admin', 'notify', username, vpnIp, 'FAILED', 'Grant notification failed to send');
          streamStep(write, 'notify', 'Sending notification', 'completed', {
            success: false, log: `Notification delivery failed to ${vpnIp} — user may not see the alert`,
          });
        }

        // Log and schedule server-side backup
        addLog({ id: logId, hostname, username, employeeId, email, vpnIp, grantedAt: new Date().toISOString(), duration, scheduledRevokeAt: new Date(Date.now() + duration * 60000).toISOString(), revokedAt: null, status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'admin', device });

        if (duration > 1) {
          setTimeout(async () => {
            const u = findUserByUsername(username);
            await sendNotification(u?.vpnIp || vpnIp, 'Access Expiring Soon', `Hello ${username}, your admin access will expire in 1 minute. Save your work.`);
          }, (duration - 1) * 60 * 1000);
        }
        setTimeout(() => revokeAdminAccess(username, logId, vpnIp), (duration + 1) * 60 * 1000);

        write({ done: true, success: true, logId, message: `Admin access granted to ${username} on ${hostname}. Will auto-revoke in ${duration} minutes.` });
      } catch (err) {
        write({ done: true, success: false, error: formatSSHError('target', String(err)) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Transfer-Encoding': 'chunked' },
  });
}
