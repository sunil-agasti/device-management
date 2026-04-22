# TCS Admin Portal - AI-Powered MacBook Management

A modern, AI-powered web portal for managing temporary admin access, GitHub access, hostname updates, and system cleanup on managed Apple MacBooks. Built with Next.js, TypeScript, and Tailwind CSS.

> **Full project documentation**: Open [docs/project-document.html](docs/project-document.html) in a browser for the complete interactive architecture guide with diagrams, data flows, API reference, and setup instructions.

## Why This Portal - Old vs New

| Area | Old System | New AI Portal |
|------|-----------|---------------|
| **Data Entry** | Every field manual every time, even for repeat users | Auto-populates from DB after first use via SSH + IP lookup |
| **Intelligence** | Zero AI. Pure form-based, navigate multiple pages | AI command bar: "grant admin to 17.233.8.2 for 60 min" |
| **User Lookup** | No database, no memory of previous users | JSON DB stores all users. Search by ID, username, or IP |
| **Revoke Failures** | No UI retry. Had to SSH manually to fix | "Make Standard" button with editable IP retry |
| **VPN IP Changes** | No handling. Revoke fails silently | Username is primary key, IP re-resolved at revoke time |
| **Notifications** | None. Users unaware of access status | macOS notifications: granted, 5-min warning, revoked |
| **Logs** | Basic static table, no search/sort/export | Search, sort, lazy-load, CSV export, device tracking |
| **UI** | Dated 2015 look, no dark mode | Modern dark/light theme, animations, glassmorphism |
| **Validation** | Minimal. Could submit invalid data | Strict: IP 17.x, hostname prefix, @apple.com, 5-180 min |
| **Security** | No session timeout, no VPN gate, HTTP only | VPN + IDMS SSO, HTTPS, 15-min idle timeout, device audit |
| **Maintenance** | No cleanup. Orphaned entries accumulate | 4-task cleanup: fix expired, dedup, archive, detect orphans |
| **Uptime** | Portal dies on sleep/VPN drop | Keepalive: caffeinate + VPN watchdog + server auto-restart |

## Architecture

```
  USER BROWSER (React + Tailwind + Framer Motion)
  ┌────────────┬────────────┬────────────┬──────────────┐
  │ Dashboard  │   Admin    │   GitHub   │   Hostname   │
  │ + AI Bar   │   Access   │   Access   │   / Cleanup  │
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
  │  /admin-access       │  /ai-prompt                   │
  │  /github-access      │  /logs (JSON + CSV)           │
  │  /update-hostname    │  /cleanup                     │
  ├──────────────────────┼───────────────────────────────┤
  │  Shell Scripts       │  JSON Database                │
  │  (child_process)     │  (fs read/write)              │
  └──────────┬───────────┴──────────┬────────────────────┘
             │                      │
     SSH (sshpass)           data/*.json
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

## Features

### AI Command Bar
Natural language interface for quick actions:
- `grant admin to 17.233.8.2 for 60 minutes`
- `give github access to 17.233.8.2`
- `search employee 1255389`
- `update hostname on 17.233.8.2`
- `run cleanup utility`

### Temporary Admin Access
- Grant/revoke admin privileges via SSH on remote MacBooks
- Automated JAMF manage & recon after granting
- Auto-revoke with configurable duration (5-180 minutes)
- macOS system notifications on grant and revoke
- 5-minute expiry warning notifications in the portal

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

### Smart Auto-Population
- Detects user VPN IP on page load
- SSHs to target IP to retrieve username and hostname
- Checks database for existing users to auto-fill employee ID and email
- First-time users must enter employee ID and Apple email (mandatory)

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
| **Rate Limiting** | 30 requests/minute per IP with auto-cleanup, 429 responses |
| **Command Injection** | `sanitize.ts` strips all shell metacharacters from IP, hostname, username, email |
| **Security Headers** | CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy |
| **CORS** | Blocked by default - no cross-origin access |
| **Credentials** | SSH passwords in `.env.local` not source code |
| **Session Timeout** | 15-min idle timeout with 2-min warning |
| **Input Validation** | Strict patterns: IP 17.x, hostname prefixes, @apple.com email |
| **IDMS SSO** | Optional Apple IDMS OAuth2 with signed session cookies |

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

# Generate SSL certificates
mkdir -p certs
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj '/CN=localhost'

# Initialize data directory
mkdir -p data
echo '[]' > data/users.json
echo '[]' > data/admin_logs.json
echo '[]' > data/github_logs.json
```

### Running

```bash
# Development (HTTP on port 3000)
npm run dev

# Development (HTTPS on port 3000)
npm run dev:https

# Production build
npm run build

# Production (HTTPS)
npm start

# Production (HTTP)
npm run start:http
```

Access the portal at `https://localhost:3000`

## Project Structure

```
system-admin-portal/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Dashboard with AI prompt bar
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
│   │       ├── ai-prompt/      # POST parse AI commands
│   │       └── logs/           # GET logs (JSON or CSV)
│   ├── components/             # React components
│   │   ├── AIPromptBar.tsx     # Natural language command input
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
| POST | `/api/ai-prompt` | Parse natural language command |
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
