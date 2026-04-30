#!/bin/bash
############################################
# JAMF Policy Runner (background execution)
# Usage: Called by Node.js after admin/github grant
# Runs: jamf manage + recon via SSH
# NOTE: jamf policy is intentionally skipped —
#   it triggers device management policies that
#   demote admin users back to standard, undoing
#   the access grant.
############################################

IP="$1"
if [ -z "$IP" ]; then echo "ERROR: No IP"; exit 1; fi

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

echo "Running jamf manage..."
run_ssh "sudo /usr/local/bin/jamf manage" && echo "OK" || echo "SKIP"

echo "Running jamf recon..."
run_ssh "sudo /usr/local/bin/jamf recon" && echo "OK" || echo "SKIP"

echo "JAMF complete."
