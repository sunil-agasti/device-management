#!/bin/bash
############################################
# Shared SSH Connection & User Info Fetcher
# Usage: bash ssh-connect.sh <IP> [command]
#
# Without command: returns username|hostname
# With command: establishes connection and runs it
############################################

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IP="$1"
REMOTE_CMD="$2"

# Load passwords from env or .env file
if [ -z "$SSH_PRIMARY_PASS" ]; then
  if [ -f "$SCRIPT_DIR/.env" ]; then
    eval "$(grep -E '^SSH_PRIMARY_PASS=|^SSH_BACKUP_PASS=|^SSH_USER=' "$SCRIPT_DIR/.env" | sed "s/^/export /")"
  elif [ -f "$SCRIPT_DIR/.env.local" ]; then
    eval "$(grep -E '^SSH_PRIMARY_PASS=|^SSH_BACKUP_PASS=|^SSH_USER=' "$SCRIPT_DIR/.env.local" | sed "s/^/export /")"
  fi
fi

SSH_USER="${SSH_USER:-tcsadmin}"
PRIMARY_PASS="${SSH_PRIMARY_PASS:-}"
BACKUP_PASS="${SSH_BACKUP_PASS:-}"

if [ -z "$IP" ]; then
  echo "ERROR:No IP provided"
  exit 1
fi

if [ -z "$PRIMARY_PASS" ]; then
  echo "ERROR:SSH_PRIMARY_PASS not configured"
  exit 1
fi

############################################
# TRY CONNECTION WITH EXPECT
############################################
try_ssh() {
  local PASS="$1"
  local CMD="$2"
  local TIMEOUT="${3:-15}"

  expect -c "
    set timeout $TIMEOUT
    log_user 0
    spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${IP}
    expect {
      -re \".*assword.*\" { send \"${PASS}\r\" }
      timeout { puts \"ERROR:Connection timed out\"; exit 1 }
      eof { puts \"ERROR:Connection closed\"; exit 1 }
    }
    expect {
      -re \"\\\\\$|%|>|#\" {}
      timeout { puts \"ERROR:Shell prompt not received\"; exit 1 }
    }
    log_user 1
    send \"${CMD}\r\"
    expect {
      -re \"\\\\\$|%|>|#\" {}
      eof {}
      timeout {}
    }
    send \"exit\r\"
    expect eof
  " 2>/dev/null
}

############################################
# DEFAULT: FETCH USERNAME + HOSTNAME
############################################
if [ -z "$REMOTE_CMD" ]; then
  REMOTE_CMD='CONSOLE_USER=$(stat -f%Su /dev/console); HOSTNAME=$(scutil --get ComputerName); echo __SSHDATA__:${CONSOLE_USER}"|"${HOSTNAME}'
fi

# Try primary password
OUTPUT=$(try_ssh "$PRIMARY_PASS" "$REMOTE_CMD" 15)
EXIT_CODE=$?

# If failed, try backup password
if [ $EXIT_CODE -ne 0 ] || ! echo "$OUTPUT" | grep -q "__SSHDATA__"; then
  if [ -n "$BACKUP_PASS" ]; then
    OUTPUT=$(try_ssh "$BACKUP_PASS" "$REMOTE_CMD" 15)
    EXIT_CODE=$?
  fi
fi

# Parse and return
if echo "$OUTPUT" | grep -q "__SSHDATA__"; then
  DATA=$(echo "$OUTPUT" | grep "__SSHDATA__" | sed 's/.*__SSHDATA__://')
  USERNAME=$(echo "$DATA" | cut -d'|' -f1 | tr -d '\r\n ')
  HOSTNAME=$(echo "$DATA" | cut -d'|' -f2 | tr -d '\r\n ')
  echo "SUCCESS:${USERNAME}|${HOSTNAME}"
  exit 0
elif echo "$OUTPUT" | grep -q "ERROR:"; then
  echo "$OUTPUT" | grep "ERROR:" | tail -1
  exit 1
else
  echo "ERROR:SSH connection failed to $IP"
  exit 1
fi
