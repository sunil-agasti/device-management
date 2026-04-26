#!/bin/bash
############################################
# Device Management Portal - Keep Alive Script
# Prevents sleep, monitors VPN, restarts server
############################################

PORTAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PORTAL_DIR/data/keepalive.log"
IP_FILE="$PORTAL_DIR/data/current_ip.txt"
PID_FILE="$PORTAL_DIR/data/server.pid"
PORT=3000

mkdir -p "$PORTAL_DIR/data"

log() {
  echo "[ $(date '+%Y-%m-%d %H:%M:%S') ] $1" | tee -a "$LOG_FILE"
}

############################################
# CAFFEINATE - Prevent system sleep
############################################
start_caffeinate() {
  if ! pgrep -x "caffeinate" > /dev/null; then
    caffeinate -dimsu &
    log "☕ Caffeinate started (PID: $!). System will not sleep."
  fi
}

############################################
# VPN CHECK & RECONNECT
############################################
get_vpn_ip() {
  # Get the IP that starts with 17. (Apple VPN)
  ifconfig | grep "inet 17\." | awk '{print $2}' | head -1
}

check_vpn() {
  local ip=$(get_vpn_ip)
  if [ -z "$ip" ]; then
    return 1  # VPN is down
  fi
  echo "$ip"
  return 0
}

reconnect_vpn() {
  log "🔄 VPN disconnected. Attempting reconnect..."

  # Try Cisco AnyConnect
  if [ -f "/opt/cisco/secureclient/bin/vpn" ]; then
    /opt/cisco/secureclient/bin/vpn connect "Apple VPN" 2>/dev/null
    sleep 5
  elif [ -f "/opt/cisco/anyconnect/bin/vpn" ]; then
    /opt/cisco/anyconnect/bin/vpn connect "Apple VPN" 2>/dev/null
    sleep 5
  fi

  # Try GlobalProtect
  if command -v /Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect &>/dev/null; then
    open -a "GlobalProtect"
    sleep 5
  fi

  # Try macOS built-in VPN
  local vpn_service=$(networksetup -listnetworkserviceorder | grep -i "vpn" | head -1 | sed 's/.*) //')
  if [ -n "$vpn_service" ]; then
    networksetup -connectpppoeservice "$vpn_service" 2>/dev/null
    sleep 5
  fi

  # Verify
  local new_ip=$(get_vpn_ip)
  if [ -n "$new_ip" ]; then
    log "✅ VPN reconnected. New IP: $new_ip"
    return 0
  else
    log "❌ VPN reconnect failed. Will retry in 60 seconds."
    return 1
  fi
}

############################################
# IP CHANGE DETECTION
############################################
handle_ip_change() {
  local new_ip="$1"
  local old_ip=""

  if [ -f "$IP_FILE" ]; then
    old_ip=$(cat "$IP_FILE")
  fi

  if [ "$new_ip" != "$old_ip" ]; then
    echo "$new_ip" > "$IP_FILE"
    log "🔀 IP changed: ${old_ip:-none} → $new_ip"
    log "📋 Update at.apple.com redirect to: https://$new_ip:$PORT"
    log "   Direct access: https://$new_ip:$PORT"

    # Send desktop notification about IP change
    osascript -e "display notification \"New VPN IP: $new_ip. Update at.apple.com redirect if needed.\" with title \"Device Management Portal - IP Changed\"" 2>/dev/null
  fi
}

############################################
# SERVER MANAGEMENT
############################################
is_server_running() {
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  # Also check by port
  lsof -ti:$PORT > /dev/null 2>&1
  return $?
}

start_server() {
  if is_server_running; then
    return 0
  fi

  log "🚀 Starting Device Management Portal server..."
  cd "$PORTAL_DIR"

  if [ -d ".next" ]; then
    # Production mode
    node server.js > "$PORTAL_DIR/data/server.log" 2>&1 &
  else
    # Dev mode
    npx next dev --port $PORT > "$PORTAL_DIR/data/server.log" 2>&1 &
  fi

  echo $! > "$PID_FILE"
  sleep 3

  if is_server_running; then
    log "✅ Server started (PID: $(cat $PID_FILE))"
  else
    log "❌ Server failed to start. Check data/server.log"
  fi
}

stop_server() {
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    kill "$pid" 2>/dev/null
    rm -f "$PID_FILE"
    log "🛑 Server stopped"
  fi
  # Kill anything on the port
  lsof -ti:$PORT | xargs kill 2>/dev/null
}

############################################
# MAIN LOOP
############################################
main() {
  log "=========================================="
  log "Device Management Portal Keep-Alive Starting"
  log "Portal Dir: $PORTAL_DIR"
  log "Port: $PORT"
  log "=========================================="

  # Start caffeinate
  start_caffeinate

  # Start server
  start_server

  # Monitor loop
  while true; do
    # Check caffeinate
    start_caffeinate

    # Check VPN
    local vpn_ip
    vpn_ip=$(check_vpn)
    if [ $? -ne 0 ]; then
      reconnect_vpn
      vpn_ip=$(get_vpn_ip)
    fi

    # Handle IP change
    if [ -n "$vpn_ip" ]; then
      handle_ip_change "$vpn_ip"
    fi

    # Check server
    if ! is_server_running; then
      log "⚠️ Server down. Restarting..."
      start_server
    fi

    sleep 30
  done
}

############################################
# COMMAND HANDLING
############################################
case "${1:-start}" in
  start)
    main
    ;;
  stop)
    stop_server
    pkill -f "caffeinate -dimsu" 2>/dev/null
    log "Keep-alive stopped"
    ;;
  status)
    echo "VPN IP: $(get_vpn_ip || echo 'disconnected')"
    echo "Server: $(is_server_running && echo 'running' || echo 'stopped')"
    echo "Caffeinate: $(pgrep -x caffeinate > /dev/null && echo 'active' || echo 'inactive')"
    [ -f "$IP_FILE" ] && echo "Last known IP: $(cat $IP_FILE)"
    ;;
  ip)
    get_vpn_ip
    ;;
  restart)
    stop_server
    sleep 2
    start_server
    ;;
  *)
    echo "Usage: $0 {start|stop|status|ip|restart}"
    exit 1
    ;;
esac
