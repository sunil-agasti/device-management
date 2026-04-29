#!/bin/bash
############################################
# Update at.apple.com redirect with new IP
# Usage: bash scripts/update-at-apple.sh <new-ip> [port]
#
# This script attempts to update the at.apple.com
# redirect for tcs-device-management-portal.
#
# If the API method fails, it opens the browser
# for manual update and copies the URL to clipboard.
############################################

NEW_IP="$1"
PORT="${2:-3000}"
SLUG="tcs-device-management-portal"
NEW_URL="http://$NEW_IP:$PORT/device-management-portal"

if [ -z "$NEW_IP" ]; then
  echo "Usage: $0 <new-vpn-ip> [port]"
  echo "Example: $0 17.233.58.245 3000"
  exit 1
fi

echo "Updating at.apple.com/$SLUG → $NEW_URL"

# Method 1: Try at.apple.com API (curl with AppleConnect auth)
# Note: This requires valid AppleConnect session cookies
COOKIE_FILE="$HOME/.at_apple_cookies"

update_via_api() {
  if [ ! -f "$COOKIE_FILE" ]; then
    return 1
  fi

  # Try to update via API
  RESPONSE=$(curl -s -w "%{http_code}" \
    -b "$COOKIE_FILE" \
    -X PUT \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$NEW_URL\"}" \
    "https://at.apple.com/api/v1/links/$SLUG" 2>/dev/null)

  HTTP_CODE="${RESPONSE: -3}"
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "✅ Updated via API: https://at.apple.com/$SLUG → $NEW_URL"
    return 0
  fi
  return 1
}

# Method 2: Open browser for manual update
update_via_browser() {
  echo ""
  echo "Auto-update not available. Opening browser for manual update..."
  echo ""
  echo "  1. Browser will open at.apple.com"
  echo "  2. Find redirect: $SLUG"
  echo "  3. Update URL to: $NEW_URL"
  echo ""
  echo "New URL copied to clipboard."
  echo "$NEW_URL" | pbcopy 2>/dev/null
  open "https://at.apple.com" 2>/dev/null
}

# Try API first, fall back to browser
if update_via_api; then
  echo "Done!"
else
  update_via_browser
fi
