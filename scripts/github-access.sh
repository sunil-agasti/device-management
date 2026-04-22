#!/bin/bash

############################################
# INPUTS
############################################
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IP="$1"
DURATION="${2:-1800}"

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

LOCAL_LOG="$HOME/Desktop/github_access_log.csv"

############################################
# USE SHARED SSH TO GET USER INFO
############################################
log() { echo "[ $(date '+%H:%M:%S') ] $1"; }

log "Fetching user info via ssh-connect.sh..."
CONNECT_RESULT=$(bash "$SCRIPT_DIR/ssh-connect.sh" "$IP")

if echo "$CONNECT_RESULT" | grep -q "^SUCCESS:"; then
  DATA=$(echo "$CONNECT_RESULT" | sed 's/SUCCESS://')
  REMOTE_USER=$(echo "$DATA" | cut -d'|' -f1)
  HOSTNAME=$(echo "$DATA" | cut -d'|' -f2)
  log "✅ Connected: $REMOTE_USER @ $HOSTNAME"
else
  log "❌ SSH connection failed: $CONNECT_RESULT"
  exit 1
fi

############################################
# SSH HELPER (reuses expect for auth)
############################################
try_ssh() {
  expect -c "
    set timeout 30
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

############################################
# TIME
############################################
GRANT_TIME=$(date "+%Y-%m-%d %H:%M:%S")

############################################
# CSV HEADER
############################################
if [ ! -f "$LOCAL_LOG" ]; then
    echo "remote_user,hostname,ip,grant_time,revoke_time,status" > "$LOCAL_LOG"
fi

############################################
# REMOTE EXECUTION
############################################
REMOTE_OUTPUT=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no tcsadmin@$IP "

echo '$PASSWORD' | sudo -S -v

log() {
  echo \"[ \$(date '+%H:%M:%S') ] \$1\"
}

############################################
# CONTEXT
############################################
log 'Fetching user info'
REMOTE_USER=\$(stat -f%Su /dev/console)
HOSTNAME=\$(scutil --get ComputerName)
USER_ID=\$(id -u \$REMOTE_USER)

echo \"__DATA__:\$REMOTE_USER|\$HOSTNAME\"

############################################
# GRANT ACCESS
############################################
log 'Granting GitHub access'

sudo sed -i '' '/github.com/d' /etc/hosts
sudo sed -i '' '/www.github.com/d' /etc/hosts

sudo launchctl asuser \$USER_ID osascript -e 'display dialog \"GitHub access granted\" buttons {\"OK\"}' giving up after 30

############################################
# CREATE REVOKE SCRIPT
############################################
log 'Creating revoke script'

sudo tee /usr/local/bin/github_revoke.sh > /dev/null <<EOF
#!/bin/bash

USER=\"$REMOTE_USER\"
UID=\"$USER_ID\"

sleep $DURATION

echo \"127.0.0.1 github.com\" >> /etc/hosts
echo \"127.0.0.1 www.github.com\" >> /etc/hosts

/bin/launchctl asuser \$UID /usr/bin/osascript -e 'display dialog \"GitHub access revoked\" buttons {\"OK\"}' giving up after 30

rm -f /usr/local/bin/github_revoke.sh
rm -f /Library/LaunchDaemons/com.github.revoke.plist
EOF

sudo chmod +x /usr/local/bin/github_revoke.sh

############################################
# LAUNCHDAEMON
############################################
log 'Creating LaunchDaemon'

sudo tee /Library/LaunchDaemons/com.github.revoke.plist > /dev/null <<PLIST
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>com.github.revoke</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/usr/local/bin/github_revoke.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLIST

sudo chown root:wheel /Library/LaunchDaemons/com.github.revoke.plist
sudo chmod 644 /Library/LaunchDaemons/com.github.revoke.plist

log 'Loading LaunchDaemon'
sudo launchctl bootstrap system /Library/LaunchDaemons/com.github.revoke.plist 2>/dev/null || \
sudo launchctl load -w /Library/LaunchDaemons/com.github.revoke.plist

log 'Remote execution completed'
")

############################################
# PARSE OUTPUT
############################################
REMOTE_DATA=$(echo "$REMOTE_OUTPUT" | grep "__DATA__:" | tail -1 | sed 's/^.*__DATA__://')

REMOTE_USER=$(echo "$REMOTE_DATA" | cut -d'|' -f1 | tr -d '\r\n')
HOSTNAME=$(echo "$REMOTE_DATA"   | cut -d'|' -f2 | tr -d '\r\n')

[ -z "$REMOTE_USER" ] && REMOTE_USER="unknown"
[ -z "$HOSTNAME" ] && HOSTNAME="unknown"

############################################
# WRITE CSV (GRANTED)
############################################
echo "$REMOTE_USER,$HOSTNAME,$IP,$GRANT_TIME,,GRANTED" >> "$LOCAL_LOG"

############################################
# UPDATE CSV AFTER REVOKE
############################################
(
sleep $DURATION
REVOKE_TIME=$(date "+%Y-%m-%d %H:%M:%S")

sed -i '' "/$REMOTE_USER,$HOSTNAME,$IP/ s/GRANTED/$REVOKE_TIME,REVOKED/" "$LOCAL_LOG"

echo "Status updated to REVOKED"
) &

echo "Automation completed successfully."