# Architecture Document - Device Management Portal

## 1. System Overview

The Device Management Portal is a full-stack web application that provides a modern, AI-powered interface for managing temporary access privileges on Apple-managed MacBooks. It replaces manual SSH operations with a centralized web portal featuring natural language commands.

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Dashboard │  │  Admin   │  │  GitHub  │  │   Hostname   │   │
│  │ + AI Bar  │  │  Access  │  │  Access  │  │   / Cleanup  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
│       └──────────────┴──────────────┴───────────────┘           │
│                              │                                   │
│                     HTTPS (port 3000)                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                     NEXT.JS SERVER                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    API ROUTES                            │    │
│  │  /api/system-info  /api/user      /api/ai-prompt        │    │
│  │  /api/admin-access /api/github-access  /api/logs        │    │
│  │  /api/update-hostname  /api/cleanup                     │    │
│  └────────┬────────────────────┬───────────────────────────┘    │
│           │                    │                                 │
│  ┌────────┴────────┐  ┌───────┴────────┐                       │
│  │  Shell Scripts   │  │  JSON Database  │                       │
│  │  (child_process) │  │  (fs read/write)│                       │
│  └────────┬────────┘  └───────┬────────┘                       │
│           │                    │                                 │
└───────────┼────────────────────┼────────────────────────────────┘
            │                    │
    ┌───────┴───────┐    ┌──────┴──────┐
    │  SSH (sshpass) │    │  data/*.json │
    │  to target Mac │    │  (NoSQL DB)  │
    └───────┬───────┘    └─────────────┘
            │
    ┌───────┴───────────────────────────┐
    │        TARGET MACBOOK              │
    │  - dseditgroup (admin grant)       │
    │  - /etc/hosts (GitHub block)       │
    │  - scutil (hostname update)        │
    │  - jamf (MDM commands)             │
    │  - osascript (user notifications)  │
    │  - LaunchDaemon (auto-revoke)      │
    └───────────────────────────────────┘
```

## 2. Technology Decisions

### Frontend: React + Next.js + TypeScript
- **Why Next.js**: Full-stack framework - React frontend + Node.js API routes in one project. No need for separate backend server.
- **Why TypeScript**: Type safety across the full stack. Shared types between API and UI.
- **Why Tailwind CSS v4**: Utility-first CSS with built-in dark mode support. Zero custom CSS needed for most styling.
- **Why Framer Motion**: Smooth animations for progress tracker, page transitions, and notifications.

### Backend: Next.js API Routes
- **Why not Express/Fastify**: API routes are co-located with the frontend. No separate server to manage.
- **Shell execution**: Node.js `child_process.exec()` runs the bash scripts directly. No Python wrapper needed.

### Database: JSON Files (NoSQL)
- **Why not MongoDB/PostgreSQL**: No external service dependencies. No signup, no connection strings, no costs.
- **How it works**: Three JSON files act as collections (`users.json`, `admin_logs.json`, `github_logs.json`). Read/write via Node.js `fs` module.
- **CSV export**: Generated on-the-fly from JSON data via the `/api/logs?format=csv` endpoint.
- **Trade-offs**: Not suitable for high concurrency. Perfect for a single-admin tool.

### Authentication: VPN IP Check
- **How**: Server reads client IP from request headers. If it starts with `17.`, the user is on Apple VPN.
- **Why not SAML/OAuth**: This is an internal tool accessed via IP. Apple VPN acts as the authentication layer.

## 3. Data Flow

### Grant Admin Access Flow
```
User types "grant admin to 17.233.8.2"
    │
    ▼
AIPromptBar → POST /api/ai-prompt
    │  Parses natural language, extracts IP, action
    │  Checks DB for existing user data
    ▼
Redirects to /admin-access?vpnIp=17.233.8.2&...
    │
    ▼
AdminAccessForm auto-populates fields
    │  SSHs to IP → gets username + hostname
    │  Checks users.json → gets employeeId + email
    ▼
User clicks "Request Admin Access"
    │
    ▼
POST /api/admin-access
    │
    ├─ Validates all inputs
    ├─ Upserts user in users.json
    ├─ Creates log entry in admin_logs.json (status: GRANTED)
    ├─ Executes: bash scripts/user-admin.sh <IP> <DURATION>
    │     │
    │     ├─ SSH to target → sudo dseditgroup -a user admin
    │     ├─ Runs jamf manage & jamf recon
    │     ├─ Sends macOS notification to user
    │     └─ Background: sleeps DURATION, then revokes + notifies
    │
    └─ Schedules server-side timeout → updates log to REVOKED
```

### Auto-Population Flow
```
Page Load
    │
    ▼
GET /api/system-info
    │  Returns: clientIp, serverUsername, serverHostname
    │
    ├─ If clientIp starts with 17. → SSH to clientIp
    │     │  Gets: remoteUsername, remoteHostname
    │     ▼
    │  GET /api/user?username=<remoteUsername>
    │     │
    │     ├─ Found → auto-fill employeeId + email
    │     └─ Not found → user enters manually (mandatory)
    │
    └─ If not 17.x → AuthGuard blocks access
```

## 4. Component Architecture

```
RootLayout (layout.tsx)
  ├── ThemeProvider (context)
  └── AuthGuard (VPN check)
       └── Page Content
            │
            ├── Home (page.tsx)
            │   ├── Navbar (system info + theme toggle)
            │   ├── ExpiryWarning (floating notifications)
            │   ├── AIPromptBar (natural language input)
            │   ├── Dashboard (4 feature cards)
            │   └── AccessLogs (all logs table)
            │
            ├── AdminAccess (admin-access/page.tsx)
            │   ├── Navbar
            │   └── AdminAccessForm
            │       ├── Form fields (auto-populated)
            │       ├── ProgressTracker (5 animated steps)
            │       ├── Success/Error message
            │       └── AccessLogs (admin only)
            │
            ├── GithubAccess (github-access/page.tsx)
            │   ├── Navbar
            │   └── GithubAccessForm
            │       ├── Form fields (auto-populated)
            │       ├── ProgressTracker (5 animated steps)
            │       ├── Success/Error message
            │       └── AccessLogs (github only)
            │
            ├── UpdateHostname (update-hostname/page.tsx)
            │   ├── Navbar
            │   └── Hostname form
            │
            └── Cleanup (cleanup/page.tsx)
                ├── Navbar
                └── Cleanup button + results
```

## 5. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Unauthorized access | VPN IP check (17.x range) acts as auth gate |
| SSH credential exposure | Passwords in shell scripts (internal tool, not public) |
| Command injection | IP and hostname validated with strict regex before shell execution |
| Data integrity | JSON file writes are synchronous (single-user tool) |
| HTTPS | Self-signed cert for encrypted transport |
| CORS | Next.js same-origin by default |

## 6. Scalability Notes

This portal is designed for **single-team use** (1-5 concurrent admins). For scaling beyond that:

- **Database**: Migrate JSON files to SQLite (still no external service) or MongoDB
- **Concurrency**: Add file-locking for JSON writes or switch to a proper DB
- **Auth**: Integrate Apple IDMS/SSO for proper identity verification
- **Deployment**: Containerize with Docker, deploy behind Nginx reverse proxy
- **Monitoring**: Add structured logging (Winston/Pino) and health check endpoint

## 7. Shell Script Integration

The portal wraps two bash scripts that handle the actual system administration:

### user-admin.sh
1. SSH to target IP using `sshpass`
2. Get console user, hostname, and email via `stat`, `scutil`, `dscl`
3. Grant admin via `dseditgroup -o edit -a <user> -t user admin`
4. Run `jamf manage` and `jamf recon`
5. Send macOS notification via `osascript`
6. Background process: sleep → revoke → verify → notify

### github-access.sh
1. SSH to target IP
2. Remove github.com entries from `/etc/hosts`
3. Send macOS notification
4. Create revoke script at `/usr/local/bin/github_revoke.sh`
5. Install LaunchDaemon to auto-execute revoke after duration
