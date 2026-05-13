# OpenSDB - Open School Discord Bot

A comprehensive, open-source self-hosted Discord bot for managing school communities. Features a secure student verification system, modern React-based admin dashboard with real-time updates, advanced analytics, warning management, ticket system, and multi-language support—all containerized with Docker and backed by MongoDB.

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
9. [Anti-Scam Detection System](#anti-scam-detection-system)
10. [Ticket System](#ticket-system)
11. [Localization](#localization)
12. [Developing Locally](#developing-locally)
13. [Logging and Monitoring](#logging-and-monitoring)
14. [Troubleshooting](#troubleshooting)
15. [Security Considerations](#security-considerations)
16. [Contributing](#contributing)

---

## Overview

OpenSDB is designed specifically for school Discord servers to:
- **Verify student identities** and assign them appropriate roles
- **Monitor server behavior** with a banned words filter and warning system
- **Manage administrative tasks** through a modern React-based web dashboard with real-time updates
- **Support multi-language environments** (English, German, Spanish, French, Italian, Turkish, Chinese built-in)
- **Create support and verification workflows** via ticket systems with automatic channel management
- **Track and report** user activity, verification metrics, and warning trends through interactive analytics
- **Bulk manage users** with CSV import/export for batch operations and data migration

The entire system runs in Docker containers for easy deployment and scaling, with Nginx reverse proxy providing SSL/TLS termination and WebSocket support.

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
- **Anti-Scam Detection** – Dual-engine scam detection (rule-based + AI) with multilingual keyword matching, link analysis, behavioral anomaly detection, image scanning, auto-delete, and auto-timeout

### Real-time Admin Dashboard
- **WebSocket Integration** – Live dashboard updates without page refreshes
- **Multi-user Synchronization** – Changes made by one admin appear instantly on all other connected sessions
- **Instant User List Updates** – New verifications appear immediately in admin panel
- **Live Analytics** – Real-time user growth and warning metrics

### Infrastructure & Support
- **Ticket System** – Students can create support tickets or verification requests
- **Auto-role Assignment** – Assign roles to new members or upon verification
- **Team Role Management** – Designate team members with elevated permissions
- **Role Customization** – Configure separate roles for teams, verified users, and new members

### Advanced Features
- **Multi-language Support** – 7 built-in languages (English, German, Spanish, French, Italian, Turkish, Chinese) with per-server language settings
- **Localized Message Updates** – Language changes automatically update all bot messages deployed in tracking system
- **CSV Import/Export** – Bulk import student data or export verified users with warnings for analysis and backup
- **Metrics API** – Track verification rates and warning trends with JSON/CSV endpoints for Grafana integration
- **Message Tracking** – Bot tracks and manages message updates for automatic localization across all languages
- **Real-time Admin Dashboard** – Modern React frontend with WebSocket support for live user and warning updates
- **Interactive Analytics** – Charts for user growth trends and warning activity patterns
- **Secure Admin UI** – JWT-authenticated web dashboard with HTTPS/SSL support and CORS protection
- **AI-Powered Scam Detection** – Multi-provider AI support (OpenAI, Ollama, OpenRouter, Anthropic) with vision model routing for image analysis

---

## Architecture

### Services (Docker Compose)

```
┌──────────────────────────────────────────────────────┐
│                   Nginx Reverse Proxy                │
│              (SSL/TLS, WebSocket Support)            │
└─────────────────────┬────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
┌───────▼────────┐         ┌────────▼──────────┐
│  Discord Bot   │         │  Admin Web App    │
│  (Node.js +    │         │  (Node.js +       │
│   discord.js)  │         │   Express)        │
│                │         │                   │
│ • Processes    │         │ • React Frontend  │
│   commands     │         │   (Vite build)    │
│ • Monitors     │         │ • Real-time WS    │
│   messages     │         │ • User Management │
│ • Manages      │         │ • Analytics       │
│   roles & warn │         │ • CSV Import/Exp  │
│                │         │                   │
│ Memory: 256M   │         │ Memory: 128M      │
│ CPU: 0.50      │         │ CPU: 0.25         │
└────────┬───────┘         └────────┬──────────┘
         │                          │
         └──────────────┬───────────┘
                        │
                   ┌────▼─────┐
                   │ MongoDB   │
                   │ (mongo:7) │
                   │           │
                   │ Database  │
                   │ Port:27017│
                   │ (internal)│
                   └───────────┘
```

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Bot Runtime | Node.js | 20-slim | Discord bot execution |
| Web UI Runtime | Node.js | 20-alpine | Admin dashboard backend |
| Discord Library | discord.js | 14.25+ | Discord bot interactions |
| Web Framework | Express.js | 5.2+ | REST API and admin UI server |
| Frontend Framework | React | 18+ | Modern UI components |
| Frontend Build | Vite | 5.0+ | Fast, optimized builds |
| Styling | Tailwind CSS | 3.0+ | Utility-first CSS |
| Charts | Recharts | 2.0+ | Interactive data visualization |
| Real-time | WebSocket | 8.14+ | Live dashboard updates |
| Database | MongoDB | 7 | User and settings storage |
| Reverse Proxy | Nginx | alpine | SSL/TLS termination, load balancing |
| Authentication | JWT + bcrypt | node packages | Secure auth tokens and password hashing |
| Language Locales | JSON | en, de, es, fr, it, tr, zh | Multi-language support |

---

## Prerequisites

### Required
- **Git** – For cloning the repository
- **Docker & Docker Compose** – [Install Docker Desktop](https://www.docker.com/products/docker-desktop) or [Docker + Compose](https://docs.docker.com/compose/install/)
- **Discord Bot Token** – Create application at [Discord Developer Portal](https://discord.com/developers/applications)
- **Server ID** – Your Discord guild ID (enable Developer Mode, right-click server > Copy Server ID)

### Optional
- **OpenSSL** – For generating self-signed HTTPS certificates (macOS/Linux: usually pre-installed)
- **Node.js** – Only if developing locally without Docker; use the version required by the project's `package.json`/`engines` setting and supported dependencies

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

Create `.env` in the project root with your configuration:

**Option A: Copy the example file (recommended)**

```bash
cp .env.example .env
```

Then edit `.env` with your values. Alternatively, create it manually:

```dotenv
# Discord Configuration (obtain from Developer Portal)
DISCORD_TOKEN=your-bot-token-here
CLIENT_ID=your-application-id-here
ALLOWED_GUILD_ID=your-server-id-here

# Database
DB_URI=mongodb://mongo:27017/botdb

# Admin UI Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password-here
JWT_SECRET=your-random-secret-here
INTERNAL_SECRET=botInternalSecret123

# Server Configuration  
ADMIN_UI_PORT=8001
NODE_ENV=production

# Optional: Metrics API Authentication
METRICS_BASIC_USER=grafana
METRICS_BASIC_PASS=changeMe!

# Optional: Email/CORS settings
CORS_ORIGINS=https://yourdomain.com
```

> **Note:** `CORS_ORIGINS` must be an explicit list of allowed origins — wildcard `*` is not permitted when credentials are enabled.

**Option B: Command line (Mac/Linux)**

```bash
cp .env.example .env
# Then edit with your preferred editor:
nano .env
```

> **⚠️ Security Warning:** Never commit `.env` to version control. It's already in `.gitignore`.

### 3. Deploy with Docker Compose

```bash
# Build and start all services in the background
docker compose up --build -d

# Verify services are running
docker compose ps
```

All services will start automatically: Discord bot, admin dashboard, MongoDB database, and Nginx reverse proxy.

### 4. Access the Admin Dashboard

**Local development (Docker Compose):**
```
https://localhost/login
```
*Note: Browser may show SSL warning (self-signed certificate). This is normal for local development. Click "Advanced" → "Proceed".*

**Remote server:**
```
http://YOUR-SERVER-IP/login         (first time setup)
https://YOUR-SERVER-IP/login        (after SSL setup)
```

**Login with:**
- Username: value of `ADMIN_USERNAME` from `.env`
- Password: value of `ADMIN_PASSWORD` from `.env`

### 5. Verify Bot is Ready

Wait 10-15 seconds for all services to initialize, then check:

```bash
# View bot startup logs
docker compose logs bot --tail 20

# Verify all services are running
docker compose ps
```

You should see all 4 services (bot, web, nginx, mongo) in the **Up** status. Discord slash commands will automatically register when the bot connects to your server for the first time.

---

## Configuration Guide

### Environment Variables

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `DISCORD_TOKEN` | Bot authentication token from Developer Portal | ✅ | `ABCDEFGHIJKLMNOPQRSTUVWXYZ.ZYXWU...` |
| `CLIENT_ID` | Discord application ID | ✅ | `12345678998765432131` |
| `ALLOWED_GUILD_ID` | Restrict bot to one Discord server | ✅ | `12345678998765432131` |
| `DB_URI` | MongoDB connection string | ✅ | `mongodb://mongo:27017/botdb` |
| `ADMIN_USERNAME` | Dashboard login username | ✅ | `admin` |
| `ADMIN_PASSWORD` | Dashboard login password (16+ chars recommended) | ✅ | `MyS3curePass123!` |
| `ADMIN_PASSWORD_HASH` | Pre-hashed bcrypt password (alternative to plaintext) | Optional | `$2b$10$...` |
| `JWT_SECRET` | JWT signing secret (random 32+ chars) | ✅ | Generate with command below |
| `INTERNAL_SECRET` | Shared secret between bot and admin (random) | ✅ | `botInternalSecret123` |
| `NODE_ENV` | Environment mode | Optional | `production` |
| `ADMIN_UI_PORT` | Dashboard port inside container | Optional | `8001` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated, no wildcards) | Optional | `https://yourdomain.com` |
| `METRICS_BASIC_USER` | Metrics API basic auth username | ✅ Required | `grafana` |
| `METRICS_BASIC_PASS` | Metrics API basic auth password | ✅ Required | `changeMe!` |
| `SERVER_TIMEZONE` | Default timezone for analytics/metrics | Optional | `UTC` |

### Generating Secure Secrets

For production deployments, generate strong random secrets:

**On Mac/Linux:**
```bash
# Generate JWT_SECRET and INTERNAL_SECRET
openssl rand -base64 32  # Run twice, use output for each secret
```

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
# Run twice for both secrets
```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** and name it
3. Go to **"Bot"** tab → Click **"Add Bot"**
4. Under **"TOKEN"** → Click **"Copy"** and paste into `DISCORD_TOKEN` in `.env`
5. Go to **"OAuth2"** tab → Click **"URL Generator"**
   - Check scope: **`bot`**
   - Check permissions: **`Administrator`**
   - Copy the generated URL
6. Open the URL in browser to invite bot to your server
7. In Discord, enable Developer Mode (Settings → Advanced → Developer Mode)
8. Right-click your server name → **"Copy Server ID"** → paste into `ALLOWED_GUILD_ID`

### Production SSL/HTTPS Setup (Optional)

For HTTPS support on production servers:

```bash
cd nginx/certs

# Generate self-signed certificate (valid 1 year)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout opensdb.key -out opensdb.crt \
  -config ../openssl.cnf

cd ../..

# Rebuild containers to apply new certificates
docker compose down
docker compose up --build -d
```

**Note:** Self-signed certificates work for testing but show browser warnings. For production, purchase proper certificates from a Certificate Authority.

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
Change the server's language (affects all bot responses and messages instantly).
- **Permissions:** Administrator, Server Owner, Team Role
- **Options:** `en` (English), `de` (German), `es` (Spanish), `fr` (French), `it` (Italian), `tr` (Turkish), `zh` (Chinese Simplified)
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

### Anti-Scam Management

#### `/antiscam enable` / `/antiscam disable`
Enable or disable the anti-scam detection system for the server.
- **Permissions:** Administrator, Server Owner, Team Role

#### `/antiscam mode <type>`
Set the detection engine.
- **Options:** `default` (rule-based) or `ai` (AI-powered with fallback to default)

#### `/antiscam sensitivity <level>`
Set detection sensitivity.
- **Options:** `low` (score ≥60), `medium` (score ≥40), `high` (score ≥20)

#### `/antiscam alert-channel <channel>`
Set the channel where scam detection alerts are posted.

#### `/antiscam auto-delete <enabled>`
Toggle automatic deletion of detected scam messages.

#### `/antiscam auto-timeout <enabled> [duration]`
Toggle automatic timeout for users posting scam content.
- **Duration:** 1–40320 minutes (default: 60)

#### `/antiscam whitelist-user <user>`
Exempt a user from scam detection.

#### `/antiscam whitelist-domain <domain>`
Whitelist a domain from link analysis.

#### `/antiscam ai-configure <provider> <model> <baseurl> [apikey] [timeout]`
Configure a single AI provider for scam analysis.
- **Providers:** `openai`, `ollama`, `openrouter`, `anthropic`

#### `/antiscam ai-configure-multimodel`
Configure separate text and vision AI models for enhanced detection (e.g., text analysis with one model, image analysis with another).
- **Options:** `text-provider`, `text-model`, `text-baseurl`, `vision-provider`, `vision-model`, `vision-baseurl`, plus optional API keys and timeouts

#### `/antiscam ai-test`
Test the configured AI provider connection and verify it's working.

#### `/antiscam stats [period]`
Show detection statistics.
- **Periods:** `24h`, `7d`, `30d`, `all`

#### `/antiscam status`
Display the current anti-scam configuration, detection mode, sensitivity, AI health status, and whitelist entries.

---

## Admin Dashboard

The admin dashboard is a modern, production-ready React-based web interface built with Vite that provides secure, real-time access to user management and analytics. Access it via the Nginx reverse proxy at `/login`.

### Key Highlights

- **Real-time Updates** – WebSocket integration for live user and warning data without page refresh
- **Modern UI** – Built with React 18 and Tailwind CSS for a responsive, intuitive interface
- **Fast Performance** – Optimized with Vite for instant page loads and smooth interactions
- **Secure Access** – JWT-based authentication with automatic 1-hour session expiry

### Features

#### Authentication
- **Secure Login:** Username and password authentication with JWT tokens
- **Session Management:** 1-hour token expiry with automatic logout
- **HTTPS Ready:** Works with Nginx reverse proxy and SSL certificates

#### User Management
- **Real-time User List** – WebSocket-powered list that updates instantly when new users are verified
- **Live Search** – Debounced search by Discord tag, ID, first name, or last name with instant results
- **Visual Warning Badges** – Quick overview of warning counts for each user
- **Click to View Details** – Select any user to display full profile information

- **User Detail Panel:**
  - User profile information (Discord tag, ID, real name, verification date)
  - **Comments Section:** View and edit user comments with save/cancel
  - **Warning History:** Structured warning cards showing:
    - Reason for warning
    - Issued by (admin/moderator name)
    - Exact timestamp of warning
  - **Delete Warnings:** Remove specific warnings with confirmation modal
  - **Real-time Sync** – Changes broadcast to all connected admin sessions

#### Data Management
- **Export CSV:** Download all verified users with warnings as JSON array
  - Columns: `verificationNumber`, `discordTag`, `discordId`, `firstName`, `lastName`, `comment`, `warnings`, `verifiedAt`
  - Excel-compatible with UTF-8 BOM
  
- **Import CSV:** Bulk upload and upsert user data
  - Maximum file size: 5MB, CSV files only
  - Validates required columns (`discordId`) and Discord ID format
  - Matches by `discordId` for updates
  - Preserves existing verification dates if not specified

#### Analytics Dashboard
- **User Growth Chart** – Interactive line chart showing cumulative user registration over time (default: last 90 days)
- **Warning Activity Chart** – Bar chart displaying warnings issued by day to identify moderation trends
- **Summary Metrics:**
  - Total registered users
  - New users added this month
  - Total warnings issued this month
  - Real-time metric updates via WebSocket
- **Date Range Selection** – Customizable time windows for focused analysis

### Technology Stack

The admin dashboard is built with modern, professional-grade tools:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React 18 | Component-based UI framework |
| Styling | Tailwind CSS | Utility-first CSS framework |
| Charts | Recharts | Interactive data visualization |
| HTTP Client | Axios | API communication with credentials support |
| Build Tool | Vite | Fast frontend development and production builds |
| Routing | React Router v6 | Client-side navigation |

### API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/login` | POST | None | Authenticate with username/password |
| `/api/verified-users` | GET | JWT | Fetch all verified users |
| `/api/remove-warning/:discordId/:index` | DELETE | JWT | Delete specific warning by index |
| `/api/export-users` | GET | JWT | Download CSV of all users |
| `/api/import-users` | POST | JWT | Upload and import CSV file |
| `/api/dashboard/users-growth` | GET | JWT | User registration metrics (JSON) |
| `/api/dashboard/warnings-activity` | GET | JWT | Warning activity metrics (JSON) |
| `/api/dashboard/alerts-activity` | GET | JWT | Scam detection alerts activity over time |
| `/api/analytics/warnings-per-day` | GET | JWT | Warnings per day analytics |
| `/api/settings/server` | GET | JWT | Fetch complete server settings (roles, channels, language, anti-scam config) |
| `/api/settings/server` | PUT | JWT | Update server settings (sanitized response) |
| `/api/settings/banned-words` | GET | JWT | Fetch all banned words as array |
| `/api/settings/banned-words` | POST | JWT | Add new banned word |
| `/api/settings/banned-words/:word` | DELETE | JWT | Remove banned word from filter |
| `/api/monitoring/health` | GET | None | Application health status and uptime |
| `/api/monitoring/security-events` | GET | JWT | Security audit events (query: ?hours=24) |
| `/api/monitoring/errors` | GET | JWT | Error logs from past N hours (query: ?hours=24) |
| `/api/metrics/users-per-day.json` | GET | BasicAuth | User registration metrics (Grafana) |
| `/api/internal/notify-change` | POST | HMAC | Internal bot→admin notification |
| `/logout` | GET | Any | Clear session and logout |
| **WebSocket** `/ws` | WS | JWT | Real-time updates (user changes, warnings, verifications) |

### Dashboard Workflow

1. **Login:** Access `/login` and authenticate with admin credentials
2. **View Users:** Browse verified users in the left panel with real-time search
3. **Select User:** Click a user to view their full profile and complete history
4. **Manage Warnings:** View warning cards and delete as needed (confirmation required)
5. **Edit Comments:** Add contextual notes (accommodations, issues, follow-ups) with instant save
6. **Analytics:** Check user growth trends and moderation activity on dedicated analytics page
7. **Import/Export:** Manage bulk data operations for backup or data migration
8. **Real-time Sync:** Multiple admin sessions stay synchronized via WebSocket; changes appear instantly

---

## Anti-Scam Detection System

OpenSDB includes a comprehensive dual-engine scam detection system that monitors messages in real-time for phishing attempts, spam, and malicious content.

### Detection Engines

#### Default (Rule-Based) Engine
The built-in detection engine uses multiple heuristics scored by weighted risk:
- **Suspicious Domain Detection** – Identifies phishing TLDs, known scam domains, and URL shorteners
- **Punycode/IDN Homograph Attack Detection** – Catches visually similar domains designed to deceive
- **Multilingual Keyword Matching** – High-risk, medium-risk, and single-word categories loaded from locale files
- **Content Hashing & Deduplication** – MD5-based detection of duplicate/spam messages across channels
- **Image Hash Deduplication** – Identifies repeated image attachments
- **Fuzzy String Comparison** – Levenshtein distance matching (>0.8 similarity threshold) to catch slight message variations
- **Behavioral Anomaly Detection** – Flags new accounts, first messages with links, activity spikes, and cross-channel posting
- **Excessive Capitalization & Special Character Detection**

#### AI Detection Engine
Optional AI-powered analysis with multi-provider support:
- **Supported Providers:** OpenAI, Ollama (self-hosted), OpenRouter, Anthropic/Claude, plus generic fallback
- **Multi-Model Routing** – Automatically uses text model for text messages and vision model for images
- **Vision Model Support** – Analyzes images from Discord CDN (QR codes, fake promotions, etc.)
- **Structured Classification** – `likely scam`, `suspicious`, or `likely safe` with confidence scoring (0–100)
- **Automatic Fallback** – Falls back to the default engine if AI is unavailable or fails
- **Health Check System** – Monitors provider availability
- **Custom Provider Registration** – Extensible provider registry for additional AI services

#### AI Multi-Model Configuration

For advanced use cases, configure separate models for text and image analysis:

**Single Model Setup** (uses same model for all content):
```bash
/antiscam ai-configure provider:ollama model:llama3 baseurl:http://localhost:11434
```

**Multi-Model Setup** (optimized for different content types):
```bash
# Configure separate text and vision models
/antiscam ai-configure-multimodel \
  text-provider:ollama \
  text-model:llama3 \
  text-baseurl:http://localhost:11434 \
  vision-provider:openai \
  vision-model:gpt-4o \
  vision-baseurl:https://api.openai.com/v1 \
  vision-apikey:sk-your-key-here
```

**Benefits:**
- **Cost Optimization** – Use cheaper models for text, premium models for vision
- **Performance Tuning** – Specialized models for each content type
- **Reliability** – Mix self-hosted and cloud providers
- **Automatic Routing** – Bot automatically selects appropriate model based on message content

### Risk Scoring

Both engines produce a combined risk score (0–100) from weighted components:
- **Spam Score** – Duplicate/repetition indicators
- **Pattern Score** – Keyword and text pattern matches
- **Link Score** – Suspicious URLs and domains
- **Anomaly Score** – Behavioral signals

| Risk Level | Score Range | Color |
|------------|-------------|-------|
| LOW | 0–39 | Green |
| MEDIUM | 40–59 | Yellow |
| HIGH | 60–79 | Orange |
| CRITICAL | 80–100 | Red |

### Automated Actions

- **Admin Alerts** – Rich embeds posted to the configured alert channel with spam count, detection mode, risk level, reasons, extracted links, and AI analysis details
- **Alert Action Buttons** – View Message, Delete All, Timeout 1h, Timeout 24h, Dismiss
- **Auto-Delete** – Automatically removes detected scam messages (configurable)
- **Auto-Timeout** – Temporarily mutes users posting scam content (configurable duration: 1–40320 minutes)
- **Spam Staging** – Groups identical messages by user and content hash; alerts after threshold (3 duplicates, or 1 for previously-flagged content)
- **Detection Caching** – 5-minute TTL cache prevents redundant analysis of the same content

### Database Tracking

Every detection event is logged to the `ScamDetectionEvent` collection with full context:
- Message content, channel, user, and guild identifiers
- Detection mode used and whether fallback was triggered
- AI metadata (provider, model, classification, confidence, reason)
- Risk score, risk level, detection reasons, extracted links/domains
- Action taken (none/flagged/deleted/timedout) and alert status

User behavioral data is tracked in the `UserActivity` collection for anomaly detection.

### Quick Setup

```bash
# Enable anti-scam with default detection
/antiscam enable
/antiscam alert-channel #scam-alerts
/antiscam sensitivity medium

# Optional: Enable AI mode with Ollama (self-hosted)
/antiscam mode ai
/antiscam ai-configure provider:ollama model:llama3 baseurl:http://localhost:11434
/antiscam ai-test

# Optional: Enable auto-actions
/antiscam auto-delete enabled:True
/antiscam auto-timeout enabled:True duration:60
```

### Advanced Configuration Options

The anti-scam system has many configurable thresholds and behaviors accessible via the `/api/settings/server` endpoint or stored in the `ServerSettings` database model:

| Setting | Description | Default | Configured Via |
|---------|-------------|---------|----------------|
| `enabled` | Enable/disable scam detection | `false` | `/antiscam enable/disable` |
| `mode` | Detection engine (`default` or `ai`) | `default` | `/antiscam mode` |
| `sensitivity` | Alert threshold (low/medium/high) | `medium` | `/antiscam sensitivity` |
| `alertChannelId` | Where alerts are posted | `null` | `/antiscam alert-channel` |
| `autoDelete` | Auto-delete detected scam messages | `false` | `/antiscam auto-delete` |
| `autoTimeout` | Auto-timeout users posting scams | `false` | `/antiscam auto-timeout` |
| `autoTimeoutDuration` | Timeout duration in minutes (1-40320) | `60` | `/antiscam auto-timeout` |
| `minRiskScoreForAlert` | Minimum score to trigger alert | `45` | Database only |
| `minRiskScoreForAutoAction` | Minimum score for auto-delete/timeout | `80` | Database only |
| `duplicateMessageThreshold` | Spam threshold (duplicate messages) | `3` | Database only |
| `duplicateTimeWindow` | Time window for spam detection (minutes) | `2` | Database only |
| `accountAgeRequirement` | Flag new accounts (days) | `7` | Database only |
| `firstMessageSuspicion` | Flag first messages with links | `true` | Database only |
| `trustedUserIds` | User IDs exempt from detection | `[]` | `/antiscam whitelist-user` |
| `trustedDomains` | Whitelisted domains | `[]` | `/antiscam whitelist-domain` |

**AI-Specific Settings:**

| Setting | Description | Default | Configured Via |
|---------|-------------|---------|----------------|
| `aiSettings.enabled` | Enable AI analysis | `false` | `/antiscam mode ai` |
| `aiSettings.provider` | AI provider name | `null` | `/antiscam ai-configure` |
| `aiSettings.model` | Primary model identifier | `null` | `/antiscam ai-configure` |
| `aiSettings.baseUrl` | API endpoint URL | `null` | `/antiscam ai-configure` |
| `aiSettings.apiKey` | Authentication key | `null` | `/antiscam ai-configure` |
| `aiSettings.timeout` | Request timeout (ms) | `30000` | `/antiscam ai-configure` |
| `aiSettings.textModel.*` | Separate text analysis model config | Inherits from main | `/antiscam ai-configure-multimodel` |
| `aiSettings.visionModel.*` | Separate vision analysis model config | Inherits from main | `/antiscam ai-configure-multimodel` |
| `aiSettings.notifyAdminsOnFallback` | Alert when AI fails | `true` | Database only |
| `aiSettings.healthCheckEnabled` | Monitor AI provider health | `true` | Database only |
| `aiSettings.healthCheckInterval` | Health check frequency (ms) | `3600000` | Database only |

**Sensitivity Mappings:**
- **low**: Alerts when risk score ≥ 60 (fewer false positives)
- **medium**: Alerts when risk score ≥ 40 (balanced, recommended)
- **high**: Alerts when risk score ≥ 20 (more sensitive, more alerts)

**Note:** Settings marked "Database only" require direct MongoDB updates or API calls to `/api/settings/server` (PUT). Most users should only need the slash commands.

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

OpenSDB supports multiple languages with real-time language switching. Built-in: **English, German, Spanish, French, Italian, Turkish, and Chinese (Simplified)**.

### Current Language Setting

Each server has its own language setting (stored in MongoDB).

- **Default:** English
- **Change Command:** `/language set [lang]`
- **Supported Languages:**
  - `en` – English
  - `de` – Deutsch (German)
  - `es` – Español (Spanish)
  - `fr` – Français (French)
  - `it` – Italiano (Italian)
  - `tr` – Türkçe (Turkish)
  - `zh` – 简体中文 (Chinese Simplified)

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

## Advanced: Developing Locally

**Recommended for developers only.** For normal deployment, use Docker Compose (see Quick Start).

### Prerequisites for Local Development

- **Node.js 20+** – [Download](https://nodejs.org/)
- **MongoDB 7+** – [Community Edition](https://www.mongodb.com/try/download/community) or run via Docker
- **Git** – [Download](https://git-scm.com/)

### Quick Local Setup (using Docker for MongoDB)

For fastest local development, run only MongoDB in Docker:

```bash
# 1. Clone and install
git clone https://github.com/MoritzKlasen/OpenSDB.git
cd OpenSDB
npm install
cd frontend && npm install && cd ..

# 2. Start only MongoDB in Docker
docker run -d --name opensdb-mongo -p 27017:27017 mongo:7

# 3. Create .env file
# Create a new .env file with:
# DB_URI=mongodb://localhost:27017/botdb
# Plus other required variables (DISCORD_TOKEN, CLIENT_ID, etc.)

# 4. Run services locally (in separate terminals)
# Terminal 1: Bot
node src/index.js

# Terminal 2: Admin UI server
node src/admin-server.js
# Dashboard: http://localhost:8001

# To stop:
# - Press Ctrl+C in both terminals
# - docker stop opensdb-mongo
# - docker rm opensdb-mongo
```

### Troubleshooting Local Setup

**MongoDB connection fails:**
```bash
# Check if MongoDB container is running
docker ps | grep mongo
# If not, restart it
docker start opensdb-mongo
```

**Port already in use:**
```bash
# Use different port for Bot or MongoDB
DB_URI=mongodb://localhost:27018/botdb  # different port
```

### Project Structure

```
OpenSDB/
├── src/
│   ├── index.js              # Bot entry point
│   ├── admin-server.js       # Web UI server
│   ├── loadCommands.js       # Command loader
│   ├── commands/             # Slash command definitions
│   │   ├── antiscam.js       # Anti-scam config (15 subcommands)
│   │   ├── verify.js
│   │   ├── warn.js
│   │   ├── ticketpanel.js
│   │   └── ...
│   ├── events/               # Discord event handlers
│   │   ├── handleInteractions.js  # Button/modal/command logic
│   │   ├── handleAntiScam.js      # Scam detection + alerts
│   │   ├── handleBannedWords.js   # Message filtering
│   │   └── guildMemberAdd.js      # Auto-role on join
│   ├── database/
│   │   ├── connect.js        # MongoDB connection
│   │   └── models/           # Mongoose schemas
│   │       ├── VerifiedUser.js
│   │       ├── ServerSettings.js
│   │       ├── BannedWord.js
│   │       ├── LocalizedMessage.js
│   │       ├── ScamDetectionEvent.js
│   │       └── UserActivity.js
│   ├── utils/
│   │   ├── botNotifier.js    # HMAC-signed internal notifications
│   │   ├── envValidator.js   # Zod-based env validation
│   │   ├── i18n.js           # Translation helper
│   │   ├── localizedSend.js  # Send + track messages
│   │   ├── logger.js         # Structured JSON logging
│   │   ├── security.js       # Helmet, rate limiting, CORS
│   │   ├── ticketPanelRenderer.js
│   │   ├── updateLocalizedMessages.js
│   │   ├── websocket.js      # JWT-authenticated WebSocket server
│   │   └── scamDetection/    # Anti-scam engines
│   │       ├── aiDetectionEngine.js      # AI provider integration
│   │       ├── defaultDetectionEngine.js # Rule-based heuristics
│   │       └── scamKeywords.js           # Multilingual keyword loader
│   └── locales/
│       ├── en.json           # English translations
│       ├── de.json           # German translations
│       ├── es.json           # Spanish translations
│       ├── fr.json           # French translations
│       ├── it.json           # Italian translations
│       ├── tr.json           # Turkish translations
│       └── zh.json           # Chinese (Simplified) translations
├── frontend/                 # React admin dashboard
│   ├── src/
│   │   ├── App.jsx           # Router and layout
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # Auth context provider
│   │   ├── hooks/            # WebSocket and auto-refresh hooks
│   │   ├── pages/            # Login, Dashboard, Analytics pages
│   │   └── utils/            # API client and logger
│   ├── package.json
│   └── vite.config.js
├── deploy-commands.js        # Manual command registration (debugging)
├── docker-compose.yml        # Service orchestration
├── Dockerfile.bot            # Bot container
├── Dockerfile.web            # Web UI container
├── nginx/
│   ├── nginx.conf            # Reverse proxy config
│   ├── ssl_params.conf       # SSL/TLS settings
│   ├── openssl.cnf           # Certificate generation config
│   └── certs/                # (Git-ignored) SSL certificates
├── package.json              # Dependencies
├── .env                      # (Git-ignored) Configuration
├── .env.example              # Template with all required variables
└── README.md

```

### Key Files for Customization

- **Commands:** `/src/commands/*.js` – Add new slash commands here
- **Events:** `/src/events/*.js` – Modify bot behavior
- **Scam Detection:** `/src/utils/scamDetection/*.js` – Customize detection engines and keywords
- **Locales:** `/src/locales/*.json` – Add/edit translations (including scam keywords)
- **Frontend:** `/frontend/src/` – React dashboard components, pages, and hooks
- **Database Models:** `/src/database/models/*.js` – Extend data schema

---

## Logging and Monitoring

OpenSDB includes comprehensive logging and monitoring capabilities for tracking application activity, debugging issues, and auditing security events.

### Log Files

The application maintains three types of logs (stored in `/tmp/logs` inside the container):

- **app.log** – General application activity, API requests, server events
- **security.log** – Security audit trail, login attempts, authentication failures
- **error.log** – Errors and exceptions

All logs are in JSON format for easy parsing and integration with log aggregation services.

### Monitoring Endpoints

Access logs and application health through REST endpoints:

```bash
# Health check (no auth required)
GET /api/monitoring/health

# Security events (admin only)
GET /api/monitoring/security-events?hours=24

# Error logs (admin only)
GET /api/monitoring/errors?hours=24
```

### Environment Validation

On startup, the application validates all required environment variables and checks for weak defaults in production. This prevents accidental deployment with test credentials.

**Production requirement:** Generate strong secrets using:
```bash
openssl rand -base64 32
```

### Log Access

```bash
# View logs from running container
docker compose exec web cat /tmp/logs/app.log
docker compose exec web cat /tmp/logs/security.log

# Backup logs before container restart
mkdir -p logs-backup-$(date +%s)
docker compose cp web:/tmp/logs logs-backup-$(date +%s)/
```

---


## Troubleshooting

### Common Issues

#### Bot not responding to commands
1. **Verify services are running:**
   ```bash
   docker compose ps
   ```
   All 4 services (bot, web, nginx, mongo) should show **Status: Up**.

2. **Check bot permissions:**
   - In Discord Server Settings → Integrations → OpenSDB
   - Ensure the bot has **Administrator** or at least **Manage Roles** permission

3. **Verify environment variables:**
   ```bash
   # Check .env file for correct values
   cat .env | grep DISCORD_TOKEN
   cat .env | grep CLIENT_ID
   cat .env | grep ALLOWED_GUILD_ID
   ```

4. **View bot logs:**
   ```bash
   docker compose logs bot --tail 50
   ```

#### Dashboard won't load
1. **Check web service:**
   ```bash
   docker compose ps
   ```

2. **View web server logs:**
   ```bash
   docker compose logs web --tail 50
   ```

3. **Test dashboard directly:**
   - Local: `http://localhost/login`
   - Remote: `http://YOUR-SERVER-IP/login`

4. **Clear browser cache:**
   - Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
   - Clear all cookies and cache for the domain

#### "Invalid Token" error in Discord
- Copy the **TOKEN**, not the Application ID
- Generate a new token if the current one was exposed
- Allow 5-10 seconds for changes to take effect

#### Login fails on dashboard
- Clear browser cookies
- Verify `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`
- Restart services: `docker compose restart web`

#### MongoDB connection errors
```bash
# View MongoDB logs
docker compose logs mongo --tail 20

# Restart MongoDB
docker compose restart mongo
```

#### Port already in use
```bash
# Check which process is using a port
lsof -i :80    # macOS/Linux with lsof installed
ss -tulpn | grep :80    # Linux (modern alternative)
netstat -tulpn | grep :80    # Linux (older systems)
netstat -an | findstr :80    # Windows

# Stop the conflicting process or change ports in docker-compose.yml
```

#### Regenerate SSL certificates
```bash
# Remove old certificates
rm -rf nginx/certs/*

# Generate new certificate
cd nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout opensdb.key -out opensdb.crt \
  -config ../openssl.cnf
cd ../..

# Restart services
docker compose down
docker compose up --build -d
```

### Restarting Services

**Restart all services:**
```bash
docker compose restart
```

**Stop all services (to save resources):**
```bash
docker compose down
```

**Restart specific service:**
```bash
docker compose restart bot   # or: web, mongo, nginx
```

### Checking Logs

**View logs from all services:**
```bash
docker compose logs --tail 20        # Last 20 lines
docker compose logs -f               # Follow in real-time (Ctrl+C to exit)
```

**View specific service logs:**
```bash
docker compose logs bot --tail 50    # Bot logs
docker compose logs web --tail 50    # Web dashboard
docker compose logs mongo --tail 50  # Database
docker compose logs nginx --tail 50  # Reverse proxy
```

### Backing Up Data

**Backup database:**
```bash
# Create backup directory
mkdir -p backups

# Export MongoDB data
docker compose exec mongo mongodump --out /tmp/dump
docker compose cp mongo:/tmp/dump ./backups/mongodb-$(date +%s)
```

**Restore from backup:**
```bash
docker compose cp ./backups/mongodb-[timestamp]/dump mongo:/tmp/
docker compose exec mongo mongorestore /tmp/dump
```

---

## Security Considerations

### Authentication & Secrets

- **Admin Credentials:** Use strong passwords (16+ characters, mixed case, numbers, symbols)
- **JWT Secret:** Generate with `openssl rand -base64 32`
- **Never commit `.env`:** Ensure `.gitignore` includes it
- **Token Expiration:** Admin sessions expire after 1 hour; requires re-login

### Network Security

- **HTTPS/SSL:** Use self-signed certificates for development, proper CA certificates for production
- **Nginx Reverse Proxy:** Handles TLS termination with security headers and gzip
- **Docker Network:** Services communicate over internal bridge network with custom subnet
- **Port Exposure:** Only expose ports 80/443; keep MongoDB port 27017 internal
- **Container Hardening:** Read-only filesystems, `cap_drop: ALL`, `no-new-privileges`, tmpfs mounts
- **HMAC Request Signing:** Internal bot→admin API calls use HMAC signatures with replay protection
- **Rate Limiting:** Login attempts (5/15min), general API requests (100/min)
- **Helmet Security Headers:** Content Security Policy (per-response nonce), XSS protection, and more
- **CSRF Protection:** Custom header requirement (`X-Requested-With`) on state-changing API requests
- **WebSocket Security:** Origin verification against CORS allow list, ping/pong heartbeat with 30-second stale connection timeout
- **Input Validation:** Zod schema validation for environment variables; Discord ID format validation, comment length limits (500 chars), request body size limits (1MB JSON, 5MB file uploads), and date range caps (max 730 days) on API inputs
- **Database Resilience:** MongoDB connection retry with exponential backoff (5 attempts)
- **Docker Health Checks:** Web service monitored via `/api/monitoring/health` endpoint

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

- 🌍 **New Language Support:** Add additional locales beyond the 7 built-in languages
- 🤖 **AI Providers:** Add new scam detection AI provider integrations
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
Last Updated: March 2026
