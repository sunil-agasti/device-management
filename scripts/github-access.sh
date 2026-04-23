#!/bin/bash
############################################
# Grant GitHub Access (simplified)
# Usage: bash github-access.sh <IP> <DURATION_SEC>
# Called by Node.js only as fallback
############################################

IP="$1"
DURATION="${2:-1800}"

[ -z "$IP" ] && echo "ERROR: No IP" && exit 1

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$SSH_PRIMARY_PASS" ]; then
  [ -f "$SCRIPT_DIR/.env" ] && eval "$(grep -E '^SSH_PRIMARY_PASS=|^SSH_BACKUP_PASS=|^SSH_USER=' "$SCRIPT_DIR/.env" | sed "s/^/export /")"
fi

SSH_USER="${SSH_USER:-tcsadmin}"
ASKPASS=$(mktemp /tmp/.askpass_XXXXXX)
echo "#!/bin/bash" > "$ASKPASS"
echo "echo '${SSH_PRIMARY_PASS}'" >> "$ASKPASS"
chmod 700 "$ASKPASS"
trap "rm -f $ASKPASS" EXIT

run_ssh() {
  SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 \
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${SSH_USER}@${IP}" "$1" 2>/dev/null
}

echo "Unblocking GitHub on $IP..."
run_ssh "sudo sed -i '' '/github.com/d' /etc/hosts; sudo sed -i '' '/www.github.com/d' /etc/hosts; sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder && echo UNBLOCK_OK || echo UNBLOCK_FAIL"

echo "Sending notification..."
run_ssh "CONSOLE_USER=\$(stat -f%Su /dev/console); USER_ID=\$(id -u \$CONSOLE_USER); sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"GitHub access granted for \$(($DURATION / 60)) minutes.\" with title \"GitHub Access Granted\" sound name \"Glass\"'"

echo "Setting up auto-revoke..."
run_ssh "sudo tee /usr/local/bin/github_revoke.sh > /dev/null <<'REVOKE'
#!/bin/bash
sleep $DURATION
echo '127.0.0.1 github.com' | sudo tee -a /etc/hosts > /dev/null
echo '127.0.0.1 www.github.com' | sudo tee -a /etc/hosts > /dev/null
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
CONSOLE_USER=\$(stat -f%Su /dev/console)
USER_ID=\$(id -u \$CONSOLE_USER)
sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"GitHub access revoked.\" with title \"GitHub Access Removed\"'
rm -f /usr/local/bin/github_revoke.sh
REVOKE
sudo chmod +x /usr/local/bin/github_revoke.sh && nohup sudo /usr/local/bin/github_revoke.sh &>/dev/null &"

echo "Done."
