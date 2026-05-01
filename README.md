# Device Management Portal - MacBook Management

A modern web portal for managing temporary admin access, GitHub access, hostname updates, and system cleanup on managed Apple MacBooks. Built with Next.js, TypeScript, and Tailwind CSS.

Storybook - https://sunil-agasti.github.io/device-management/demo-playbook-standalone.html

> **Full project documentation**: Open [docs/project-document.html](docs/project-document.html) in a browser for the complete interactive architecture guide with diagrams, data flows, API reference, and setup instructions.

## Why This Portal - Old vs New

| Area | Old System | New Portal |
|------|-----------|---------------|
| **Data Entry** | Every field manual every time, even for repeat users | Auto-populates from DB after first use via SSH + IP lookup |
| **Intelligence** | Zero automation. Pure form-based, navigate multiple pages | Auto-populate via SSH, smart validation, one-click access |
| **User Lookup** | No database, no memory of previous users | JSON DB stores all users. Search by ID, username, or IP |
| **Revoke Failures** | No UI retry. Had to SSH manually to fix | Bulletproof auto-revoke: LaunchDaemon + 3 retries + final verify. Failure logs for debugging |
| **VPN IP Changes** | No handling. Revoke fails silently | Username is primary key, IP re-resolved at revoke time |
| **Notifications** | None. Users unaware of access status | macOS notifications: granted, 5-min warning, revoked |
| **Logs** | Basic static table, no search/sort/export | Search, sort, lazy-load, CSV export, device tracking |
| **UI** | Dated 2015 look, no dark mode | Modern dark/light theme, animations, glassmorphism |
| **Validation** | Minimal. Could submit invalid data | Strict: IP 17.x, hostname prefix, @apple.com, 5-180 min |
| **Security** | No session timeout, no VPN gate, HTTP only | VPN-gated access, CSRF protection, 15-min idle timeout, device audit |
| **Maintenance** | No cleanup. Orphaned entries accumulate | 4-task cleanup: fix expired, dedup, archive, detect orphans |
| **Uptime** | Portal dies on sleep/VPN drop | Keepalive: caffeinate + VPN watchdog + server auto-restart |

## Architecture

```
  USER BROWSER (React + Tailwind + Framer Motion)
  ┌────────────┬────────────┬────────────┬──────────────┐
  │ Dashboard  │   Admin    │   GitHub   │   Hostname   │
  └─────┬──────┴─────┬──────┴─────┬──────┴──────┬───────┘
        └────────────┴────────────┴─────────────┘
                           │
                    HTTPS (port 3000)
                           │
  NEXT.JS SERVER (Node.js + TypeScript)
  ┌──────────────────────────────────────────────────────┐
  │  API Routes          │  Auth (IDMS / VPN)            │
  │  /system-info        │  /auth/callback               │
  │  /user               │  /auth/session                │
  │  /admin-access       │  /visitor                     │
  │  /github-access      │  /logs (JSON + CSV)           │
  │  /update-hostname    │  /cleanup                     │
  ├──────────────────────┼───────────────────────────────┤
  │  Shell Scripts       │  JSON Database                │
  │  (child_process)     │  (fs read/write)              │
  └──────────┬───────────┴──────────┬────────────────────┘
             │                      │
     SSH (SSH_ASKPASS)         data/*.json
     to target Mac           (NoSQL DB)
             │
  TARGET MACBOOK
  ├── dseditgroup (admin grant/revoke)
  ├── /etc/hosts (GitHub block/unblock)
  ├── scutil (hostname update)
  ├── jamf (MDM manage + recon)
  ├── osascript (user notifications)
  └── LaunchDaemon (auto-revoke)
```

## How It Works — Grant & Revoke Flow

### Admin Access Grant Flow

```
1. User enters VPN IP → SSH auto-detects username + hostname
2. User clicks "Request Admin Access"
3. Server streams real-time progress (NDJSON):

   [Step 1: Grant]
   ├── SSH to target Mac as tcsadmin
   ├── Run: sudo dseditgroup -o edit -a <user> -t user admin
   ├── Verify: dseditgroup -o checkmember -m <user> admin
   └── Result: "yes, <user> is a member of admin" ✓

   [Step 2: JAMF]
   ├── SSH run: jamf manage + jamf policy + jamf recon
   └── Updates MDM inventory and enforces policies

   [Step 3: Schedule Auto-Revoke]
   ├── Installs /usr/local/bin/admin_revoke.sh (root:wheel 700)
   ├── Installs LaunchDaemon: com.tcs.admin.revoke (RunAtLoad + KeepAlive)
   ├── Script uses epoch timestamp (not sleep) — survives reboot
   └── LaunchDaemon auto-restarts if killed or machine reboots

   [Step 4: Notify User]
   └── Dialog box on target Mac: "Hello <user>, you have been granted
       temporary admin access for <N> minutes."
```

### Admin Access Revoke Flow (Bulletproof)

```
When timer expires (epoch-based, checked every 30 seconds):

1. Remove from admin group:
   └── sudo dseditgroup -o edit -d <user> -t user admin

2. Verify removal:
   └── dseditgroup -o checkmember -m <user> admin

3. Force retry (if still admin):
   └── Retry 5 times with 2-second intervals

4. Notify user (dialog box):
   └── "User Privileges Updated — Hello <user>, your admin privileges
       have been revoked and updated to Standard User."

5. Self-cleanup:
   ├── rm /usr/local/bin/admin_revoke.sh
   ├── launchctl bootout system/com.tcs.admin.revoke
   └── rm /Library/LaunchDaemons/com.tcs.admin.revoke.plist

Survives: reboot, shutdown, VPN disconnect, network loss, server crash
Password: uses tcsadmin password from .env via sudo -S
Security: revoke script is root:wheel 700 (only root can read)
```

### GitHub Access Grant Flow

```
1. User enters VPN IP → SSH auto-detects username + hostname
2. User clicks "Request GitHub Access"
3. Server executes:

   [Step 1: Unblock GitHub]
   ├── SSH to target Mac
   ├── Remove github.com entries from /etc/hosts
   ├── Flush DNS: dscacheutil -flushcache + killall -HUP mDNSResponder
   └── Verify: github.com resolves to public IP

   [Step 2: JAMF]
   └── Background: jamf manage + policy + recon

   [Step 3: Schedule Auto-Revoke]
   ├── Installs /usr/local/bin/github_revoke.sh (root:wheel 700)
   ├── Installs LaunchDaemon: com.tcs.github.revoke (RunAtLoad + KeepAlive)
   └── Epoch-based timer — survives reboot

   [Step 4: Notify User]
   └── Dialog box: "Hello <user>, you have been granted public GitHub
       access for <N> minutes."
```

### GitHub Access Revoke Flow

```
When timer expires:

1. Re-block GitHub:
   ├── Add "127.0.0.1 github.com" to /etc/hosts
   ├── Add "127.0.0.1 www.github.com" to /etc/hosts
   └── Flush DNS cache

2. Notify user (dialog box):
   └── "GitHub Access Revoked — Your public GitHub access has been revoked."

3. Self-cleanup:
   └── Removes revoke script + LaunchDaemon plist

Survives: reboot, shutdown, VPN disconnect, network loss
```

### Notification Timeline

```
  Grant                    1 min before expiry        Expiry
    │                             │                      │
    ▼                             ▼                      ▼
  ┌──────────┐            ┌──────────────┐        ┌──────────────┐
  │ Dialog:  │            │ Dialog:      │        │ Dialog:      │
  │ "Access  │            │ "Expiring in │        │ "Privileges  │
  │ Granted  │            │  1 minute"   │        │  Revoked"    │
  │ for Nm"  │            │              │        │              │
  └──────────┘            └──────────────┘        └──────────────┘
```

## Features

### Temporary Admin Access
- Grant/revoke admin privileges via SSH (SSH_ASKPASS) on remote MacBooks
- Real-time streaming progress with expandable script logs per step
- Automated JAMF manage, policy & recon after granting
- Epoch-based auto-revoke via LaunchDaemon (survives reboot/shutdown/VPN loss)
- Force retry 5x if revoke fails, self-cleanup after
- Dialog notifications: grant, 1-min warning, revoke with personalized messages
- Detects if user is already admin and skips redundant grant

### Temporary GitHub Access
- Unblock GitHub by modifying `/etc/hosts` on remote machines
- LaunchDaemon-based auto-revoke
- System notifications to end users

### Update Hostname
- Remotely update ComputerName and LocalHostName via SSH
- Hostname validation (must start with 02HW0, 01HW0, 34HW0, 3HW0, or 4HW0)

### Cleanup Utility
Automated database maintenance that performs 4 tasks:
1. **Fix Stuck Entries** - Finds access logs still marked "GRANTED" whose timer has expired (e.g. server restarted mid-session) and updates them to "EXPIRED"
2. **Detect Incomplete Users** - Identifies users missing their Employee ID or Apple Email (auto-created via SSH probe but never completed profile)
3. **Remove Duplicates** - Cleans up duplicate log entries caused by double-clicks or network retries
4. **Archive Old Logs** - Moves logs older than 90 days to archive files, keeping active database fast while preserving audit history

### Leadership Reports (New)
Analytics dashboard for management visibility:
- **Summary metrics**: Total requests, registered users, active sessions, avg duration, success rate
- **Admin vs GitHub breakdown**: Granted/revoked/expired/failed counts with progress bars
- **Monthly trend chart**: 12-month bar chart showing admin vs GitHub requests
- **Top requesters**: Who is making the most access requests
- **Most accessed users**: Which users are receiving access most frequently
- **Device breakdown**: Mac vs iPhone vs iPad usage with percentage bars
- **Time filtering**: Today, This Week, This Month, This Quarter, This Year, All Time

### Human-Readable Error Messages (New)
All SSH and system errors are mapped to clear, actionable messages:
- Connection refused: "The remote machine may be offline or SSH is not enabled"
- Timeout: "The device may be unreachable. Check that the VPN IP is correct"
- Auth failed: "The configured credentials may be incorrect"
- sshpass missing: "Run: brew install hudochenkov/sshpass/sshpass"
- JAMF errors: "The JAMF agent may not be installed or the device is not enrolled"

### Permanent Backup Database (New)
Every log entry is automatically saved to a permanent backup that is never cleaned:
- `data/backup/admin_logs_backup.json` - all admin logs forever
- `data/backup/github_logs_backup.json` - all GitHub logs forever
- Active logs in `data/` are cleaned after 90 days by Cleanup Utility
- Backup is updated on every grant AND status change (revoke/fail/expire)
- Reports page uses backup data for "All Time" and "This Year" views
- CSV export with `?source=backup` downloads the complete history

### Keepalive Service (New)
A macOS LaunchAgent that keeps the portal running 24/7 without manual intervention:

**Install:** `bash scripts/install-service.sh`

| Component | File | Purpose |
|-----------|------|---------|
| LaunchAgent | `scripts/com.tcs.admin-portal.keepalive.plist` | macOS service config - starts on login, auto-restarts on crash |
| Keepalive | `scripts/keepalive.sh` | Main watchdog script |
| Installer | `scripts/install-service.sh` | One-time setup - copies plist to ~/Library/LaunchAgents |

**What the keepalive service does:**
- **Caffeinate** - prevents Mac from sleeping (`caffeinate -dimsu`)
- **VPN Watchdog** - checks every 30s, auto-reconnects via AnyConnect/GlobalProtect if dropped
- **IP Tracker** - detects VPN IP changes, sends macOS desktop notification so you can update at.apple.com
- **Server Monitor** - auto-restarts the Next.js server if it crashes
- **Logging** - all activity logged to `data/keepalive.log`

**Commands:**
```bash
bash scripts/keepalive.sh status   # check VPN, server, caffeinate
bash scripts/keepalive.sh restart  # restart the portal server
bash scripts/keepalive.sh stop     # stop everything
tail -f data/keepalive.log         # watch keepalive logs
```

### Smart Auto-Population
- Detects user VPN IP on page load
- SSHs to target IP to retrieve username and hostname (read-only, cannot be edited)
- Checks database for existing users to auto-fill employee ID and email (editable, can override if outdated)
- First-time users must enter employee ID and Apple email (mandatory)
- Field behavior:
  - **Hostname / Username**: SSH only, read-only (locked after auto-detect)
  - **Employee ID / Email**: DB lookup, editable (user can update if data is stale)

### Access Logs
- Real-time log table with auto-refresh (30s)
- CSV download export
- Status badges: GRANTED, REVOKED, EXPIRED, FAILED
- Time remaining countdown for active sessions

### Security
- VPN authentication gate (IP must start with `17.`)
- HTTPS with self-signed SSL certificate
- All SSH operations use `sshpass` with password fallback

### UI/UX
- Dark and Light theme with persistent toggle
- Responsive design (desktop + mobile)
- Animated progress tracker for multi-step operations
- Glass morphism and gradient accents
- Framer Motion animations throughout

## Security

| Protection | Implementation |
|-----------|---------------|
| **Server-Side Auth** | `middleware.ts` enforces VPN IP check on ALL requests (not client-side only) |
| **CSRF** | Double-submit cookie with timing-safe comparison on all POST requests |
| **Rate Limiting** | 200 requests/minute per IP with auto-cleanup, 429 responses |
| **Command Injection** | `sanitize.ts` strips all shell metacharacters from IP, hostname, username, email |
| **Security Headers** | CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy |
| **CORS** | Blocked by default - no cross-origin access |
| **Credentials** | SSH passwords in `.env.local` not source code |
| **Session Timeout** | 15-min idle timeout with 2-min warning |
| **Input Validation** | Strict patterns: IP 17.x, hostname prefixes, @apple.com email |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Next.js 16, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API Routes (Node.js) |
| Database | JSON file-based NoSQL (no paid DB required) |
| Animations | Framer Motion |
| Shell Scripts | Bash (sshpass, SSH, dseditgroup, JAMF, osascript) |
| SSL | Self-signed OpenSSL certificate |

## Quick Start

### Prerequisites
- Node.js 18+
- npm
- `sshpass` installed (`brew install hudochenkov/sshpass/sshpass`)
- Apple VPN connection (IP starting with 17.)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd system-admin-portal

# Install dependencies
npm install

# Initialize data directory
mkdir -p data data/backup
echo '[]' > data/users.json
echo '[]' > data/admin_logs.json
echo '[]' > data/github_logs.json
```

### Environment Setup

Create a `.env` file in the project root:

```bash
# SSH Credentials (REQUIRED - used to connect to managed MacBooks)
SSH_USER=tcsadmin
SSH_PRIMARY_PASS='your-primary-password'
SSH_BACKUP_PASS='your-backup-password'

# App URL
APP_URL=http://localhost:3000

# IDMS Authentication (optional - set to true if registered)
IDMS_ENABLED=false
```

### Prerequisites

- **Node.js** 18+ and npm
- **SSH access** to managed MacBooks as `tcsadmin`
- **Apple VPN** connection (IP starting with 17.)
- **sshpass** (optional, SSH_ASKPASS is used by default): `brew install hudochenkov/sshpass/sshpass`
- **expect** (built into macOS at `/usr/bin/expect`)

### Running

```bash
# Development
npm run dev

# Production (recommended)
bash scripts/start.sh
```

### Access URLs

| Who | URL |
|-----|-----|
| **You (admin)** | `http://localhost:3000/device-management-portal` |
| **Others on VPN** | `http://<your-vpn-ip>:3000/device-management-portal` |
| **Short link** | `https://at.apple.com/tcs-device-management-portal` |

> **Note:** You cannot access your own VPN IP from the same machine (VPN self-loop). Always use `localhost` for self-access.

### VPN IP Changes

Apple VPN assigns dynamic IPs that change on reconnect/restart. When your IP changes:

1. `start.sh` detects the change within 30 seconds
2. Copies the new portal URL to your clipboard
3. Shows a dialog notification with the new URL
4. You paste the new URL into `at.apple.com` to update the redirect (10 seconds)

**at.apple.com setup:**
```
Slug: tcs-device-management-portal
URL:  http://<your-vpn-ip>:3000/device-management-portal
```

### Auto-Start on Login (LaunchAgent)

The portal can auto-start when you log in, and auto-restart if it crashes.

```bash
# Install (one-time)
bash scripts/install-autostart.sh

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.tcs.device-management-portal.plist
rm ~/Library/LaunchAgents/com.tcs.device-management-portal.plist

# Check status
launchctl list | grep com.tcs.device-management-portal
```

**What happens automatically:**
| Event | Action |
|-------|--------|
| **Login** | LaunchAgent starts `start.sh` → server + caffeinate |
| **VPN IP changes** | Detected within 30s → new URL copied to clipboard → notification shown |
| **Server crashes** | `KeepAlive` → launchd restarts within 30s |
| **System sleep** | `caffeinate` prevents sleep while server runs |
| **System restart** | Server down until next login → LaunchAgent restarts it |

### Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/start.sh` | Start portal with caffeinate + IP monitor + clipboard copy |
| `scripts/install-autostart.sh` | Install LaunchAgent for auto-start on login |
| `scripts/update-at-apple.sh` | Update at.apple.com redirect (opens browser) |
| `scripts/keepalive.sh` | Full keepalive daemon (VPN reconnect + server + caffeinate) |

## Project Structure

```
system-admin-portal/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Dashboard with feature cards
│   │   ├── layout.tsx          # Root layout with theme + auth
│   │   ├── globals.css         # Global styles + dark mode
│   │   ├── admin-access/       # Admin access page
│   │   ├── github-access/      # GitHub access page
│   │   ├── update-hostname/    # Hostname update page
│   │   ├── cleanup/            # Cleanup utility page
│   │   └── api/                # Backend API routes
│   │       ├── system-info/    # GET system/client IP info
│   │       ├── user/           # GET/POST user CRUD
│   │       ├── admin-access/   # POST grant admin access
│   │       ├── github-access/  # POST grant GitHub access
│   │       ├── update-hostname/# POST update hostname
│   │       ├── cleanup/        # POST run cleanup
│   │       ├── admin-access/   # POST grant admin access
│   │       └── logs/           # GET logs (JSON or CSV)
│   ├── components/             # React components
│   │   ├── AdminAccessForm.tsx # Admin grant form with streaming
│   │   ├── AccessLogs.tsx      # Logs table with CSV export
│   │   ├── AdminAccessForm.tsx # Admin access form + progress
│   │   ├── AuthGuard.tsx       # VPN authentication gate
│   │   ├── Dashboard.tsx       # Feature cards grid
│   │   ├── ExpiryWarning.tsx   # 5-min expiry notifications
│   │   ├── GithubAccessForm.tsx# GitHub access form + progress
│   │   ├── Navbar.tsx          # Top nav with theme toggle
│   │   └── ProgressTracker.tsx # Animated step progress bar
│   ├── context/
│   │   └── ThemeContext.tsx     # Dark/Light theme provider
│   └── lib/
│       ├── db.ts               # JSON file database operations
│       ├── types.ts            # TypeScript interfaces
│       └── validation.ts       # Input validation + AI parser
├── scripts/
│   ├── user-admin.sh           # Admin access grant/revoke script
│   └── github-access.sh        # GitHub access grant/revoke script
├── data/                       # Runtime JSON database (gitignored)
├── certs/                      # SSL certificates (gitignored)
├── docs/
│   └── ARCHITECTURE.md         # System architecture document
├── server.js                   # Custom HTTPS server
├── next.config.ts              # Next.js configuration
└── package.json                # Dependencies and scripts
```

## Validation Rules

| Field | Rule |
|-------|------|
| VPN IP | Must start with `17.` (Apple VPN range) |
| Hostname | Must start with `02HW0`, `01HW0`, `34HW0`, `3HW0`, or `4HW0` |
| Employee ID | Numeric only, mandatory for first-time users |
| Email | Must end with `@apple.com`, mandatory for first-time users |
| Duration | 5-180 minutes (default: 60 for admin, 30 for GitHub) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system-info` | Get client IP, server hostname/username |
| GET | `/api/user?username=X` | Look up user by username, employee ID, or IP |
| POST | `/api/user` | Create or update user record |
| POST | `/api/admin-access` | Grant temporary admin access |
| POST | `/api/github-access` | Grant temporary GitHub access |
| POST | `/api/update-hostname` | Update remote machine hostname |
| POST | `/api/cleanup` | Run database cleanup |
| POST | `/api/admin-access` | Grant temporary admin access |
| GET | `/api/logs?type=admin&format=csv` | Get access logs (JSON or CSV) |
| GET | `/api/reports?period=month` | Analytics report with trends, top users, devices |

## Database Schema

### users.json
```json
{
  "employeeId": "1255389",
  "email": "name@apple.com",
  "username": "abhishek",
  "hostname": "02HW062504",
  "vpnIp": "17.233.8.2",
  "lastSeen": "2026-04-17T12:00:00Z",
  "createdAt": "2026-04-01T12:00:00Z"
}
```

### admin_logs.json / github_logs.json
```json
{
  "id": "uuid",
  "type": "admin",
  "hostname": "02HW062504",
  "username": "abhishek",
  "employeeId": "1255389",
  "email": "name@apple.com",
  "vpnIp": "17.233.8.2",
  "grantedAt": "2026-04-17T12:34:13Z",
  "duration": 60,
  "revokedAt": null,
  "status": "GRANTED",
  "requestedBy": "sunilkumaragasti (02HW067534)"
}
```

## License

Internal use only - TCS Apple Operations Team.
