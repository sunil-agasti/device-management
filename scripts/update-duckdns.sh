#!/bin/bash
############################################
# Update DuckDNS with current VPN IP
# Usage: bash scripts/update-duckdns.sh [ip]
# Auto-detects VPN IP if not provided
############################################

DOMAIN="tcs-device-management-portal"
TOKEN_FILE="$HOME/.duckdns_token"

# Load token
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
elif [ -n "$DUCKDNS_TOKEN" ]; then
  TOKEN="$DUCKDNS_TOKEN"
else
  echo "DuckDNS token not found."
  echo "Save your token: echo 'YOUR_TOKEN' > ~/.duckdns_token"
  echo "Or set: export DUCKDNS_TOKEN=YOUR_TOKEN"
  exit 1
fi

# Get IP
IP="${1:-$(ifconfig | grep "inet 17\." | awk '{print $2}' | head -1)}"
if [ -z "$IP" ]; then
  echo "No VPN IP detected."
  exit 1
fi

# Update DuckDNS
RESULT=$(curl -s "https://www.duckdns.org/update?domains=$DOMAIN&token=$TOKEN&ip=$IP")

if [ "$RESULT" = "OK" ]; then
  echo "✅ DuckDNS updated: $DOMAIN.duckdns.org → $IP"
else
  echo "❌ DuckDNS update failed: $RESULT"
fi
