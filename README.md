# OpenSDB - Open School Discord Bot

A comprehensive, open-source self-hosted Discord bot for managing school communities. Features a secure student verification system, admin dashboard, warning management, ticket system, and multi-language support—all containerized with Docker and backed by MongoDB.

**Repository:** [GitHub - MoritzKlasen/OpenSDB](https://github.com/MoritzKlasen/OpenSDB)

---

## Table of Contents

1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Quick Start](#quick-start)
6. [Configuration Guide](#configuration-guide)
7. [Slash Commands Reference](#slash-commands-reference)
8. [Admin Dashboard](#admin-dashboard)
9. [Ticket System](#ticket-system)
10. [Localization](#localization)
11. [Developing Locally](#developing-locally)
12. [Troubleshooting](#troubleshooting)
13. [Security Considerations](#security-considerations)
14. [Contributing](#contributing)

---

## Overview

OpenSDB is designed specifically for school Discord servers to:
- **Verify student identities** and assign them appropriate roles
- **Monitor server behavior** with a banned words filter and warning system
- **Manage administrative tasks** through an intuitive web dashboard
- **Support multi-language environments** (English & German built-in)
- **Create support and verification workflows** via ticket systems
- **Track and report** user activity and verification metrics

The entire system runs in Docker containers for easy deployment and scaling.

---

## Core Features

### User Management
- **Student Verification** – Verify users with their first and last name, automatically assigning verification numbers and roles
- **Unverification** – Remove verification status and associated roles when needed
- **User Comments** – Add contextual notes to verified students (e.g., accommodations, issues)
- **Deanonymization** – View student's real name and recent warnings (admin/team only)

### Moderation & Safety
- **Prohibited Word Filter** – Automatically detect banned words and notify admins
- **Warning System** – Issue, track, and delete warnings per student
- **Admin Notifications** – Get real-time alerts in a dedicated admin channel with quick action buttons
- **Comment Prompts** – Add notes directly from ban notifications

### Infrastructure & Support
- **Ticket System** – Students can create support tickets or verification requests
- **Auto-role Assignment** – Assign roles to new members or upon verification
- **Team Role Management** – Designate team members with elevated permissions
- **Role Customization** – Configure separate roles for teams, verified users, and new members

### Advanced Features
- **Multi-language Support** – English and German localization with per-server language settings
- **Localized Message Updates** – Language changes automatically update all bot messages
- **CSV Import/Export** – Bulk import student data or export for analysis
- **Metrics API** – Track verification rates with JSON/CSV endpoints
- **Message Tracking** – Bot tracks and manages message updates for localization
- **Secure Admin UI** – JWT-authenticated web dashboard with HTTPS support

---

## Architecture

### Services (Docker Compose)

```
┌─────────────┐
│ Discord Bot │ (Node.js + discord.js)
│   Bots      │ • Processes commands & interactions
│  Service    │ • Monitors messages for banned words
│             │ • Memory: 256M, CPU: 0.50
└──────┬──────┘
       │
       ├────────────────┬──────────────┐
       │                │              │
┌──────▼──────┐  ┌──────▼────┐  ┌──────▼─────┐
│   MongoDB   │  │ Admin Web │  │   Nginx    │
│             │  │   Server  │  │  Reverse   │
│ (mongo:7)   │  │ (Express) │  │   Proxy    │
│             │  │ Memory:   │  │ (SSL/TLS)  │
│ Port: 27017 │  │ 128M,     │  │ Ports:     │
│ Database    │  │ CPU: 0.25 │  │ 80, 443    │
└─────────────┘  └───────────┘  └────────────┘
```

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Bot Runtime | Node.js | 20-slim |
| Web UI Runtime | Node.js | 18-alpine |
| Discord Library | discord.js | 14.25+ |
| Web Framework | Express.js | 5.2+ |
| Database | MongoDB | 7 |
| Reverse Proxy | Nginx | alpine |
| Authentication | JWT + bcrypt | node packages |
| Language Locales | JSON | en.json, de.json |

---

## Prerequisites

### Required
- **Git** – For cloning the repository
- **Docker & Docker Compose** – [Install Docker Desktop](https://www.docker.com/products/docker-desktop) or [Docker + Compose](https://docs.docker.com/compose/install/)
- **Discord Bot Token** – Create application at [Discord Developer Portal](https://discord.com/developers/applications)
- **Server ID** – Your Discord guild ID (enable Developer Mode, right-click server > Copy Server ID)

### Optional
- **OpenSSL** – For generating self-signed HTTPS certificates (macOS/Linux: usually pre-installed)
- **Node.js 18+** – Only if developing locally without Docker

### System Resources
- **Minimum:** 512MB RAM, 1 CPU core
- **Recommended:** 1GB RAM, 2 CPU cores
- **Disk:** 1GB free (including MongoDB data growth)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/MoritzKlasen/OpenSDB.git
cd OpenSDB
```

### 2. Create `.env` Configuration File

Create `.env` in the project root:

```bash
nano .env  # edit with your values
```

Required variables:

```dotenv
# Discord Configuration (obtain from Developer Portal)
DISCORD_TOKEN=your-bot-token-here
CLIENT_ID=your-application-id-here
ALLOWED_GUILD_ID=your-server-id-here

# Database
DB_URI=mongodb://mongo:27017/botdb

# Admin UI Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-strong-password
JWT_SECRET=generate-a-random-jwt-secret

# Server Configuration
ADMIN_UI_PORT=8001

# Optional: Metrics API Authentication (Grafana, etc.)
METRICS_BASIC_USER=grafana
METRICS_BASIC_PASS=changeMe!
```

> **⚠️ Security Warning:** Never commit `.env` to version control. Ensure it's in `.gitignore`.

### 3. (Optional) Generate SSL Certificates

For production HTTPS support:

```bash
cd nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout opensdb.key -out opensdb.crt \
  -config ../openssl.cnf
cd ../..
```

The Nginx config expects: `opensdb.key` and `opensdb.crt`

### 4. Deploy with Docker Compose

```bash
# Build and start all services in the background
docker compose up --build -d

# Verify services are running
docker compose ps
```

### 5. Register Discord Commands

The bot commands are automatically registered when the bot connects. To manually register:

```bash
node deploy-commands.js
```

This must be run once after setup (it uses `DISCORD_TOKEN`, `CLIENT_ID`, `ALLOWED_GUILD_ID` from `.env`).

### 6. Access the Admin Dashboard

- **HTTP:** `http://SERVER-IP:8001/login.html`
- **HTTPS:** `https://SERVER-IP/login.html`

Login with credentials from your `.env` file (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).

---

## Configuration Guide

### Environment Variables

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `DISCORD_TOKEN` | Bot authentication token | `AaBbCcDdEeFfGgHhIiJjKk...` | ✅ |
| `CLIENT_ID` | Discord application ID | `1234567890987654321` | ✅ |
| `ALLOWED_GUILD_ID` | Restrict bot to one server | `1234567890987654321` | ✅ |
| `DB_URI` | MongoDB connection string | `mongodb://mongo:27017/botdb` | ✅ |
| `ADMIN_USERNAME` | Dashboard login username | `admin` | ✅ |
| `ADMIN_PASSWORD` | Dashboard login password | `MyS3curePass!` | ✅ |
| `JWT_SECRET` | JWT signing secret (long random string) | `AaBbCcDdEeFfGgHhIiJjKk...` | ✅ |
| `ADMIN_UI_PORT` | Dashboard port (inside container) | `8001` | Optional (default: 8001) |
| `METRICS_BASIC_USER` | Metrics API auth username | `grafana` | Optional |
| `METRICS_BASIC_PASS` | Metrics API auth password | `changeMe!` | Optional |

### Bot Setup in Discord

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a New Application
3. Go to "Bot" → Click "Add Bot"
4. Under TOKEN, click "Copy" and paste into `DISCORD_TOKEN` in `.env`
5. Go to "OAuth2" → "URL Generator"
   - Scopes: `bot`
   - Permissions: `Administrator` (or scope: `applications.commands`, `send_messages`, `manage_roles`, `manage_channels`)
6. Copy the generated URL and use it to invite the bot to your server
7. Copy your **Guild ID** (right-click server → Copy Server ID) → paste into `ALLOWED_GUILD_ID`

---

## Slash Commands Reference

The bot uses Discord's slash commands for all interactions. Commands are **admin-restricted** unless otherwise noted.

### User Verification

#### `/verify <user> <firstname> <lastname>`
Verify a student and assign them a verification number and role.
- **Permissions:** Server Owner, Team Role
- **Result:** Student receives verified role, verification number assigned
- **Database:** Stores name, Discord tag, ID, and verification date

#### `/unverify <user>`
Remove verification status and associated roles from a student.
- **Permissions:** Server Owner, Team Role
- **Result:** Verified role removed, database record deleted

### Warnings & Moderation

#### `/warn <user> <reason>`
Issue a warning to a verified student.
- **Permissions:** Server Owner, Team Role
- **Requirements:** User must be verified
- **Notifications:** Sends DM to user notifying them
- **Database:** Stores reason, issuer, timestamp

#### `/comment <user> <text>`
Add or update contextual notes about a student.
- **Permissions:** Server Owner, Team Role
- **Requirements:** User must be verified
- **Use Cases:** Behavioral notes, accommodations, special circumstances

#### `/deanon <user>`
Display a verified user's real name and recent warnings (privileged view).
- **Permissions:** Everyone can view basic info; Server Owner/Team see full details (comments + warnings)
- **Requires:** User must be verified
- **Shows:** Name, Discord tag, last 3 warnings with issuer and date

### Banned Word Management

#### `/word add <word>`
Add a word to the banned words filter.
- **Permissions:** Server Owner, Team Role
- **Effect:** Future messages containing this word trigger admin notifications

#### `/word remove <word>`
Remove a word from the banned words filter.
- **Permissions:** Server Owner, Team Role

### Server Configuration

#### `/setrole [teamrole] [verifiedrole] [onjoinrole]`
Configure roles for different user statuses.
- **Permissions:** Server Owner, Administrator, Team Role
- **Options:**
  - `teamrole`: Users with this role can manage bot
  - `verifiedrole`: Role given to verified students
  - `onjoinrole`: Role auto-assigned to new members (removed upon verification)
- **Note:** At least one role required

#### `/setadminchannel <channel>`
Set the channel where banned word alerts are sent.
- **Permissions:** Server Owner, Administrator, Team Role
- **Alerts Include:** User mention, channel, message preview, quick action buttons

#### `/language get`
Display the current server language setting.
- **Permissions:** Everyone

#### `/language set <lang>`
Change the server's language (affects all bot responses and messages).
- **Permissions:** Administrator, Server Owner, Team Role
- **Options:** `en` (English), `de` (German)
- **Effect:** Updates all localized messages in real-time

### Ticket System

#### `/ticketpanel <type> <category> [title] [description] [button]`
Create a ticket panel with a button for students to open support or verification requests.
- **Type:** `support` or `verify`
- **Category:** Category where new tickets will be created
- **Overrides:** Optional custom title, description, button text
- **Features:**
  - Auto-creates private channels per user
  - Team members automatically get access
  - Closed tickets remain visible to team only
  - Messages are language-tracked for automatic translation

---

## Admin Dashboard

### Features

The web UI at `/dashboard` provides:

#### User Management Table
- **Search:** Filter by Discord tag, first name, or last name
- **View All Verified Students:** Full list with verification numbers and dates
- **Edit Comments:** Click comment to edit inline
- **Delete Warnings:** Remove specific warnings with confirmation
- **Warning History:** View all warnings per student with issuer and date

#### Data Import/Export
- **Export CSV:** Download all verified students and warnings
- **Import CSV:** Bulk import student data (upsert by Discord ID)
- **CSV Columns:** `verificationNumber`, `discordTag`, `discordId`, `firstName`, `lastName`, `comment`, `warnings` (JSON), `verifiedAt`

#### Utilities
- **Search Bar:** Real-time filtering
- **Dark Mode Toggle:** User preference stored in localStorage
- **Logout:** Clear session and return to login

#### Security
- **JWT Authentication:** Token-based session (1 hour expiry)
- **HTTPS Ready:** Works with Nginx reverse proxy and SSL
- **HttpOnly Cookies:** Tokens stored securely, not accessible to JavaScript

### API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/login` | POST | None | Authenticate with username/password |
| `/api/verified-users` | GET | JWT | Fetch all verified users |
| `/api/remove-warning/:discordId/:index` | DELETE | JWT | Delete specific warning |
| `/api/update-comment/:discordId` | PUT | JWT | Update user comment |
| `/api/export-users` | GET | JWT | Download CSV of all users |
| `/api/import-users` | POST | JWT | Upload and import CSV |
| `/api/metrics/users-per-day` | GET | BasicAuth | Cumulative verification metrics (JSON/CSV) |

---

## Ticket System

Ticket panels allow students to create support requests or verification channels.

### How It Works

1. **Admin Creates Panel:** `/ticketpanel support #support-tickets`
2. **Button Appears:** Students see a button to "Open Ticket"
3. **Private Channel Created:** Named `support-[username]` or `verify-[username]`
4. **Permissions:**
   - Student can view and message
   - Team role members auto-added
   - Others cannot see the channel
5. **Closing:** Student or team clicks "Close Ticket"
   - Channel name becomes `🔒-[original-name]`
   - Student loses access (team retains access for records)

### Ticket Metadata

Channels store metadata in the topic:

```
status:open; type:support; opener:123456789
```

This allows the bot to track ticket state and ownership.

### Localization

Ticket messages are automatically tracked and updated when server language changes.

---

## Localization

OpenSDB supports multiple languages. Built-in: **English** and **German**.

### Current Language Setting

Each server has its own language setting (stored in MongoDB).

- **Default:** English
- **Change Command:** `/language set de` or `/language set en`

### Adding New Languages

1. Create `/src/locales/[lang].json` (e.g., `fr.json` for French)
2. Add language code to `SUPPORTED` set in `src/utils/i18n.js`
3. Add subcommand choices in `/src/commands/setlanguage.js`
4. Restart the bot

### Locale File Structure

```json
{
  "language": { "current": "...", "setSuccess": "..." },
  "errors": { "noPermission": "..." },
  "ticketPanel": {
    "support": { "title": "...", "desc": "...", "button": "..." },
    "verify": { ... }
  },
  ...
}
```

Use placeholders: `{userName}`, `{reason}`, etc.

---

## Developing Locally

### Prerequisites for Local Development

- **Node.js 18+:** [nodejs.org](https://nodejs.org/)
- **MongoDB 7+:** [mongodb.com/try](https://www.mongodb.com/try) or via Docker
- **Git**

### Setup

```bash
# 1. Clone and install
git clone https://github.com/MoritzKlasen/OpenSDB.git
cd OpenSDB
npm install

# 2. Create .env (same as production)
nano .env

# 3. Start MongoDB locally (optional, if not using Docker)
# On Linux (Debian/Ubuntu):
sudo apt-get install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb

# 4. Run the bot
node src/index.js

# 5. In another terminal, run the admin UI
node src/admin-server.js
# Dashboard available at http://localhost:8001
```

### Project Structure

```
OpenSDB/
├── src/
│   ├── index.js              # Bot entry point
│   ├── admin-server.js       # Web UI server
│   ├── loadCommands.js       # Command loader
│   ├── deploy-commands.js    # Slash command registration
│   ├── commands/             # Slash command definitions
│   │   ├── verify.js
│   │   ├── warn.js
│   │   ├── ticketpanel.js
│   │   └── ...
│   ├── events/               # Discord event handlers
│   │   ├── handleInteractions.js  # Button/modal/command logic
│   │   ├── handleBannedWords.js   # Message filtering
│   │   └── guildMemberAdd.js      # Auto-role on join
│   ├── database/
│   │   ├── connect.js        # MongoDB connection
│   │   └── models/           # Mongoose schemas
│   │       ├── VerifiedUser.js
│   │       ├── ServerSettings.js
│   │       ├── BannedWord.js
│   │       └── LocalizedMessage.js
│   ├── utils/
│   │   ├── i18n.js           # Translation helper
│   │   ├── localizedSend.js  # Send + track messages
│   │   ├── ticketPanelRenderer.js
│   │   └── updateLocalizedMessages.js
│   ├── admin-ui/
│   │   ├── login.html        # Login page
│   │   ├── dashboard.html    # Main dashboard
│   │   └── assets/
│   │       ├── dashboard.js  # Dashboard frontend logic
│   │       ├── style.css     # Styling
│   │       └── favicon.png
│   └── locales/
│       ├── en.json           # English translations
│       └── de.json           # German translations
├── docker-compose.yml        # Service orchestration
├── Dockerfile.bot            # Bot container
├── Dockerfile.web            # Web UI container
├── nginx/
│   ├── nginx.conf            # Reverse proxy config
│   ├── ssl_params.conf       # SSL/TLS settings
│   ├── openssl.cnf           # Certificate generation config
│   └── certs/                # (Git-ignored) SSL certificates
├── package.json              # Dependencies
├── .env                       # (Git-ignored) Configuration
└── README.md

```

### Key Files for Customization

- **Commands:** `/src/commands/*.js` – Add new slash commands here
- **Events:** `/src/events/*.js` – Modify bot behavior
- **Locales:** `/src/locales/*.json` – Add/edit translations
- **Styles:** `/src/admin-ui/assets/style.css` – Dashboard appearance
- **Database Models:** `/src/database/models/*.js` – Extend data schema

---

## Troubleshooting

### Bot Connectivity

**Bot not responding to commands:**
1. Verify bot is online: `docker compose ps` (bot service running)
2. Check logs: `docker compose logs bot --tail 20`
3. Ensure bot has permissions in your server: Settings → Integrations → Bot
4. Verify `DISCORD_TOKEN`, `CLIENT_ID`, `ALLOWED_GUILD_ID` in `.env`

**"Invalid Token" errors:**
- Copy token from Discord Dev Portal (not application ID)
- Regenerate token if exposed

### Database Issues

**MongoDB connection fails:**
```bash
docker compose logs mongo
docker compose exec mongo mongosh  # Test connection
```

**Lost data:**
- Data persists in Docker volume: `db:/data/db`
- To backup: `docker compose exec mongo mongodump --out /tmp/backup`

### Admin Dashboard

**Can't access dashboard:**
- Check if web service is running: `docker compose ps web`
- Try: `docker compose logs web`
- Verify `ADMIN_UI_PORT` matches in `.env`
- Default URL: `http://localhost:8001` (local) or `http://IP:8001` (remote)

**Login fails:**
- Verify `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` match login attempt
- Check JWT_SECRET is set and consistent
- Clear browser cookies: Settings → Privacy → Cookies → Clear all

### SSL/HTTPS Issues

**Certificate problems:**
```bash
# Regenerate certificates
rm -rf nginx/certs/*
cd nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout opensdb.key -out opensdb.crt -config ../openssl.cnf
cd ../..
docker compose restart nginx
```

**Mixed content warnings:**
- Ensure `.env` doesn't have `http://` URLs
- Nginx config should redirect HTTP → HTTPS

### Port Conflicts

**"Address already in use":**
```bash
# Find process using port
lsof -i :8001  # macOS/Linux
netstat -ano | findstr :8001  # Windows

# Kill process or change port in docker-compose.yml
```

**Ports required (can be changed in config):**
- `80` – HTTP (Nginx)
- `443` – HTTPS (Nginx)
- `8001` – Admin UI (can be modified)
- `27017` – MongoDB (internal only)

### Performance & Resource Limits

Check resource usage:
```bash
docker stats
```

Adjust limits in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 256M    # Increase if bot is slow
      cpus: "0.50"    # Increase if hitting CPU limit
```

### Logs & Debugging

**View logs in real-time:**
```bash
docker compose logs -f bot      # Bot logs
docker compose logs -f web      # Admin UI logs
docker compose logs -f nginx    # Web server logs
docker compose logs -f mongo    # Database logs
docker compose logs -f          # All services
```

**Enable verbose logging:**
Add `NODE_ENV=development` to `.env` (some modules log more)

---

## Security Considerations

### Authentication & Secrets

- **Admin Credentials:** Use strong passwords (16+ characters, mixed case, numbers, symbols)
- **JWT Secret:** Generate with `openssl rand -base64 32`
- **Never commit `.env`:** Ensure `.gitignore` includes it
- **Token Expiration:** Admin sessions expire after 1 hour; requires re-login

### Network Security

- **HTTPS/SSL:** Use self-signed certificates for development, proper CA certificates for production
- **Nginx Reverse Proxy:** Handles TLS termination
- **Docker Network:** Services communicate over internal bridge network
- **Port Exposure:** Only expose ports 80/443; keep MongoDB port 27017 internal

### Bot Permissions

- **Grant Minimal Permissions:** Only grant roles the bot actually needs
- **Role Positioning:** Bot's highest role must be above roles it assigns/removes
- **Channel Permissions:** Set explicitly; don't rely on @everyone permissions

### Data Privacy

- **Student Data:** Stored in MongoDB; ensure server is secure
- **Message Logging:** Bot can see all messages in monitored channels
- **GDPR Compliance:** Implement data deletion on `/unverify` (currently implemented)
- **Comment Visibility:** Only team members and owner see comments/warnings

### Banned Word Filter

- **Case Insensitive:** Filters match regardless of capitalization
- **Partial Matching:** Detects words even within other words (e.g., "bad" in "badly")
- **Notification Only:** Filter notifies admins; doesn't auto-delete (gives context)

### Regular Maintenance

- **Update Dependencies:** `npm update` weekly/monthly
- **Backup Database:** Regular MongoDB exports
- **Monitor Logs:** Check logs for errors, warnings
- **Review Warnings:** Periodically audit issued warnings and comments

---

## Contributing

### Guidelines

1. **Fork & Clone:** Create a GitHub fork and clone locally
2. **Create Branch:** `git checkout -b feature/my-feature`
3. **Code Style:** Use existing code patterns (consistent formatting)
4. **Test Locally:** Run with `npm install && node src/index.js`
5. **Commit:** `git commit -m "Add [feature]: description"`
6. **Push & PR:** Push to fork and create pull request

### Areas for Contribution

- 🌍 **New Language Support:** Add locales (e.g., French, Spanish)
- 🎨 **UI Improvements:** Enhance dashboard design/UX
- 🔧 **Bug Fixes:** Report and fix issues
- 📖 **Documentation:** Improve guides and examples
- ✨ **New Features:** Suggest features via Issues

### Report Issues

Use [GitHub Issues](https://github.com/MoritzKlasen/OpenSDB/issues) to report bugs or request features:
- **Bug Report:** [Use template](https://github.com/MoritzKlasen/OpenSDB/issues/new?template=bug_report.md)
- **Feature Request:** [Use template](https://github.com/MoritzKlasen/OpenSDB/issues/new?template=feature_request.md)

---

## License

OpenSDB is **open source** under the ISC License. Modify and use freely for educational purposes.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/MoritzKlasen/OpenSDB/issues)
- **Discussions:** [GitHub Discussions](https://github.com/MoritzKlasen/OpenSDB/discussions)

---

Made with ❤️ by **McScheleba**  
Last Updated: January 2026
