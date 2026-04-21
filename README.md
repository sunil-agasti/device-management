# TCS Admin Portal - AI-Powered MacBook Management

A modern, AI-powered web portal for managing temporary admin access, GitHub access, hostname updates, and system cleanup on managed Apple MacBooks. Built with Next.js, TypeScript, and Tailwind CSS.

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
- Fix orphaned log entries
- Update expired access records
- Database integrity maintenance

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
