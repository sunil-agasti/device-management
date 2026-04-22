#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IP="$1"
TIME_MIN="${2:-5}"
TIME_SEC=$((TIME_MIN*60))

############################################
# LOAD CREDENTIALS (shared with ssh-connect.sh)
############################################
PRIMARY_PASS="${SSH_PRIMARY_PASS:-}"
BACKUP_PASS="${SSH_BACKUP_PASS:-}"
SSH_USER="${SSH_USER:-tcsadmin}"

if [ -z "$PRIMARY_PASS" ]; then
  PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -f "$PROJ_DIR/.env" ]; then
    eval "$(grep -E '^SSH_PRIMARY_PASS=|^SSH_BACKUP_PASS=|^SSH_USER=' "$PROJ_DIR/.env" | sed "s/^/export /")"
    PRIMARY_PASS="${SSH_PRIMARY_PASS:-}"
    BACKUP_PASS="${SSH_BACKUP_PASS:-}"
  fi
fi

if [ -z "$PRIMARY_PASS" ]; then
  echo "ERROR: SSH_PRIMARY_PASS not set. Configure .env"
  exit 1
fi

LOCAL_CSV="$HOME/Desktop/admin_access.csv"

log() { echo "[ $(date '+%H:%M:%S') ] $1"; }
run_check() { [ $1 -eq 0 ] && log "✅ $2" || log "❌ $2"; }

############################################
# USE SHARED SSH TO GET USER INFO
############################################
log "Fetching user info via ssh-connect.sh..."
CONNECT_RESULT=$(bash "$SCRIPT_DIR/ssh-connect.sh" "$IP")

if echo "$CONNECT_RESULT" | grep -q "^SUCCESS:"; then
  DATA=$(echo "$CONNECT_RESULT" | sed 's/SUCCESS://')
  CONSOLE_USER=$(echo "$DATA" | cut -d'|' -f1)
  HOSTNAME=$(echo "$DATA" | cut -d'|' -f2)
  log "✅ Connected: $CONSOLE_USER @ $HOSTNAME"
else
  log "❌ SSH connection failed: $CONNECT_RESULT"
  exit 1
fi

############################################
# PICK PASSWORD (try primary first)
############################################
try_ssh() {
  expect -c "
    set timeout 10
    log_user 0
    spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${IP}
    expect -re \".*assword.*\" { send \"$1\r\" }
    expect -re \"\\\\\$|%|>|#\" {}
    log_user 1
    send \"$2\r\"
    expect -re \"\\\\\$|%|>|#\" {}
    send \"exit\r\"
    expect eof
  " 2>/dev/null
}

PASSWORD="$PRIMARY_PASS"
    log "❌ $2"
  fi
}

log "Checking primary password..."
sshpass -p "$PRIMARY_PASS" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "exit" 2>/dev/null
SSH_STATUS=$?
run_check $SSH_STATUS "Primary SSH login"

if [ $SSH_STATUS -eq 0 ]; then
    PASSWORD="$PRIMARY_PASS"
else
    log "Trying backup password..."
    PASSWORD="$BACKUP_PASS"
fi

START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
END_TIME=$(date -v+${TIME_MIN}M '+%Y-%m-%d %H:%M:%S')

if [ ! -f "$LOCAL_CSV" ]; then
    echo "ip,console_user,hostname,email,granted_time,expected_revoke_time,status" > "$LOCAL_CSV"
    log "CSV created"
fi

log "Starting remote execution..."

REMOTE_OUTPUT=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "

echo '$PASSWORD' | sudo -S -v
echo \"SUDO_STATUS:\$?\"

CONSOLE_USER=\$(stat -f%Su /dev/console)
echo \"USER_STATUS:\$?\"

HOSTNAME=\$(scutil --get ComputerName)
USER_ID=\$(id -u \$CONSOLE_USER)

EMAIL=\$(dscl . -read /Users/\$CONSOLE_USER EMailAddress 2>/dev/null | awk '/EMailAddress:/{print \$2}' | head -1)
[ -z \"\$EMAIL\" ] && EMAIL=\"unknown\"

echo \"__DATA__:\$CONSOLE_USER|\$HOSTNAME|\$EMAIL\"

echo '$PASSWORD' | sudo -S dseditgroup -o edit -a \$CONSOLE_USER -t user admin
echo \"GRANT_STATUS:\$?\"

sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"You have been granted temporary admin access for $TIME_MIN minutes.\" with title \"Admin Access Granted\"'

echo '$PASSWORD' | sudo -S /usr/local/bin/jamf manage
echo \"JAMF_MANAGE:\$?\"

echo '$PASSWORD' | sudo -S /usr/local/bin/jamf policy
echo \"JAMF_POLICY:\$?\"

echo '$PASSWORD' | sudo -S /usr/local/bin/jamf recon
echo \"JAMF_RECON:\$?\"
")

echo "$REMOTE_OUTPUT"

REMOTE_DATA=$(echo "$REMOTE_OUTPUT" | grep "__DATA__:" | tail -1 | sed 's/^.*__DATA__://')
CONSOLE_USER=$(echo "$REMOTE_DATA" | cut -d'|' -f1 | tr -d '\r\n')
HOSTNAME=$(echo "$REMOTE_DATA"     | cut -d'|' -f2 | tr -d '\r\n')
EMAIL=$(echo "$REMOTE_DATA"        | cut -d'|' -f3 | tr -d '\r\n')

if [[ -z "$CONSOLE_USER" || "$CONSOLE_USER" == "unknown" ]]; then
    log "❌ Invalid user — skipping CSV entry"
    exit 1
fi

VERIFY_GRANT=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
dseditgroup -o checkmember -m $CONSOLE_USER admin 2>/dev/null
")

log "Grant verification: $VERIFY_GRANT"

if [[ "$VERIFY_GRANT" == *"is a member"* ]]; then
    echo "$IP,$CONSOLE_USER,$HOSTNAME,$EMAIL,$START_TIME,$END_TIME,GRANTED" >> "$LOCAL_CSV"
    log "✅ Admin granted and logged"
else
    log "❌ Admin NOT granted — skipping CSV entry"
    exit 1
fi

(
sleep $TIME_SEC
log "Running revoke process..."

REVOKE_OUTPUT=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
echo '$PASSWORD' | sudo -S /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin
echo EXIT_CODE:\$?
")
echo "$REVOKE_OUTPUT"

VERIFY=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
dseditgroup -o checkmember -m $CONSOLE_USER admin 2>/dev/null
")
log "Verification result: $VERIFY"

if [[ "$VERIFY" == *"NOT a member"* || "$VERIFY" == *"not a member"* ]]; then
    sed -i '' "/$IP,$CONSOLE_USER,$HOSTNAME/ s/GRANTED/REVOKED/" "$LOCAL_CSV"
    log "✅ REVOKED SUCCESS"

    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
    CONSOLE_USER=\$(stat -f%Su /dev/console)
    USER_ID=\$(id -u \$CONSOLE_USER)
    sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"Your admin access has been revoked.\" with title \"Admin Access Removed\"'
    "
else
    log "⚠️ User still admin — forcing removal..."

    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
    for i in {1..5}; do
        echo '$PASSWORD' | sudo -S /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin
        sleep 2
    done
    "

    FINAL_VERIFY=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
    dseditgroup -o checkmember -m $CONSOLE_USER admin 2>/dev/null
    ")
    log "Final verification: $FINAL_VERIFY"

    if [[ "$FINAL_VERIFY" == *"not a member"* ]]; then
        sed -i '' "/$IP,$CONSOLE_USER,$HOSTNAME/ s/GRANTED/REVOKED/" "$LOCAL_CSV"
        log "✅ REVOKED AFTER FORCE"

        sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "
        CONSOLE_USER=\$(stat -f%Su /dev/console)
        USER_ID=\$(id -u \$CONSOLE_USER)
        sudo launchctl asuser \$USER_ID sudo -u \$CONSOLE_USER osascript -e 'display notification \"Your admin access has been revoked.\" with title \"Admin Access Removed\"'
        "
    else
        sed -i '' "/$IP,$CONSOLE_USER,$HOSTNAME/ s/GRANTED/FAILED/" "$LOCAL_CSV"
        log "❌ FORCE REVOKE FAILED"
    fi
fi
) &

log "Automation completed successfully."
