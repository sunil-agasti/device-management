#!/bin/bash
############################################
# Grant Admin Access (simplified)
# Usage: bash user-admin.sh <IP> <DURATION_MIN>
# Called by Node.js only as fallback
############################################

IP="$1"
TIME_MIN="${2:-5}"

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

echo "Granting admin access on $IP..."
run_ssh "CONSOLE_USER=\$(stat -f%Su /dev/console); sudo dseditgroup -o edit -a \$CONSOLE_USER -t user admin && echo GRANT_OK || echo GRANT_FAIL"

echo "Verifying..."
run_ssh "dseditgroup -o checkmember -m \$(stat -f%Su /dev/console) admin 2>/dev/null"

echo "Sending notification..."
run_ssh "CONSOLE_USER=\$(stat -f%Su /dev/console); USER_ID=\$(id -u \$CONSOLE_USER); sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"Admin access granted for $TIME_MIN minutes.\" with title \"Admin Access Granted\" sound name \"Glass\"'"

echo "Done."
