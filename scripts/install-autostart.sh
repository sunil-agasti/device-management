#!/bin/bash
############################################
# Install Device Management Portal as LaunchAgent
# Runs start.sh automatically on login
# Usage: bash scripts/install-autostart.sh
############################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.tcs.device-management-portal"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "Installing Device Management Portal as LaunchAgent..."

# Create LaunchAgents directory if needed
mkdir -p "$HOME/Library/LaunchAgents"

# Create the plist
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$PORTAL_DIR</string>
    <key>StandardOutPath</key>
    <string>$PORTAL_DIR/data/autostart.log</string>
    <key>StandardErrorPath</key>
    <string>$PORTAL_DIR/data/autostart-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>
EOF

# Load the agent
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load -w "$PLIST_PATH"

echo ""
echo "✅ LaunchAgent installed!"
echo ""
echo "  Plist: $PLIST_PATH"
echo "  Logs:  $PORTAL_DIR/data/autostart.log"
echo ""
echo "  The portal will now auto-start on login."
echo "  If the server crashes, launchd will restart it (KeepAlive)."
echo ""
echo "  To uninstall:"
echo "    launchctl unload $PLIST_PATH"
echo "    rm $PLIST_PATH"
echo ""
echo "  To check status:"
echo "    launchctl list | grep $PLIST_NAME"
