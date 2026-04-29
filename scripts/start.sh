#!/bin/bash
############################################
# Device Management Portal - Start Script
# Runs server with caffeinate (never sleeps)
# Usage: bash scripts/start.sh
############################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-3000}"

cd "$PORTAL_DIR"

echo "============================================"
echo "  Device Management Portal"
echo "============================================"

# Kill existing server on the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null
sleep 1

# Get current VPN IP
VPN_IP=$(ifconfig | grep "inet 17\." | awk '{print $2}' | head -1)
echo "VPN IP: ${VPN_IP:-not connected}"
echo "Local:  http://localhost:$PORT/device-management-portal"
[ -n "$VPN_IP" ] && echo "Remote: http://$VPN_IP:$PORT/device-management-portal"
[ -n "$VPN_IP" ] && echo "at.apple.com: Update redirect to http://$VPN_IP:$PORT/device-management-portal"
echo ""

# Log current IP
if [ -n "$VPN_IP" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') | IP: $VPN_IP | URL: http://$VPN_IP:$PORT/device-management-portal" > "$PORTAL_DIR/data/ip.log"
fi

# Build if needed
if [ ! -f ".next/BUILD_ID" ] || [ "$1" = "--build" ]; then
  echo "Building production bundle..."
  npm run build
  echo ""
fi

# Start with caffeinate (prevents sleep)
echo "Starting server with caffeinate (system won't sleep)..."
caffeinate -dimsu npm run start -- --port $PORT &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Press Ctrl+C to stop"
echo ""

# Monitor for IP changes
LAST_IP="$VPN_IP"
while kill -0 $SERVER_PID 2>/dev/null; do
  sleep 30
  NEW_IP=$(ifconfig | grep "inet 17\." | awk '{print $2}' | head -1)

  if [ -n "$NEW_IP" ] && [ "$NEW_IP" != "$LAST_IP" ]; then
    LAST_IP="$NEW_IP"
    URL="http://$NEW_IP:$PORT/device-management-portal"
    echo ""
    echo "[ $(date '+%H:%M:%S') ] IP changed → $NEW_IP"
    echo "  New URL: $URL"
    echo "$URL" | pbcopy 2>/dev/null
    echo "  (Copied to clipboard — paste into at.apple.com)"

    # Log IP to file (overwrite - always shows current IP)
    echo "$(date '+%Y-%m-%d %H:%M:%S') | IP: $NEW_IP | URL: $URL" > "$PORTAL_DIR/data/ip.log"

    osascript -e "display dialog \"VPN IP changed to $NEW_IP

New portal URL (copied to clipboard):
$URL

Update at.apple.com/tcs-device-management-portal with this URL.\" with title \"** Device Management Portal **\" buttons {\"Open at.apple.com\", \"OK\"} default button \"OK\" giving up after 30" 2>/dev/null

    # If user clicked "Open at.apple.com", open the browser
    if [ $? -eq 0 ]; then
      BUTTON=$(osascript -e 'button returned of result' 2>/dev/null)
      if [ "$BUTTON" = "Open at.apple.com" ]; then
        open "https://at.apple.com" 2>/dev/null
      fi
    fi
  fi
done

echo "Server stopped."
