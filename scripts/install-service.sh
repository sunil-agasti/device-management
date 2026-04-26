#!/bin/bash
############################################
# Install Device Management Portal as a service
# Runs keepalive on login (caffeinate + VPN + server)
############################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.tcs.admin-portal.keepalive.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.tcs.admin-portal.keepalive.plist"

echo "=========================================="
echo "Device Management Portal - Service Installer"
echo "=========================================="
echo "Portal: $PORTAL_DIR"
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/keepalive.sh"
chmod +x "$SCRIPT_DIR/user-admin.sh"
chmod +x "$SCRIPT_DIR/github-access.sh"

# Unload existing service if present
if [ -f "$PLIST_DST" ]; then
    launchctl unload "$PLIST_DST" 2>/dev/null
    echo "Unloaded existing service"
fi

# Create plist with correct paths
sed "s|PORTAL_DIR_PLACEHOLDER|$PORTAL_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

# Load the service
launchctl load "$PLIST_DST"

echo ""
echo "✅ Service installed and started!"
echo ""
echo "Commands:"
echo "  Status:    bash $SCRIPT_DIR/keepalive.sh status"
echo "  Stop:      launchctl unload $PLIST_DST"
echo "  Restart:   bash $SCRIPT_DIR/keepalive.sh restart"
echo "  Logs:      tail -f $PORTAL_DIR/data/keepalive.log"
echo "  Server:    tail -f $PORTAL_DIR/data/server.log"
echo ""
echo "The portal will:"
echo "  ☕ Keep your Mac awake (caffeinate)"
echo "  🔄 Auto-reconnect VPN if disconnected"
echo "  🚀 Auto-restart the server if it crashes"
echo "  📋 Notify you when your VPN IP changes"
echo ""

# Show current status
bash "$SCRIPT_DIR/keepalive.sh" status
