# OpenSDB - Open School Discord Bot (Docker + MongoDB)

A open source self-hosted Discord bot for school communities, complete with an admin web UI, running in Docker containers and persisting data in MongoDB.

---

## Features

- **Secure Verification System** – Assign roles to verified users via `/verify`, with name logging and persistent tracking  
- **Admin Web UI** – Manage users, warnings, and verification status via a password-protected local dashboard  
- **Warning System** – Track, add, and remove warnings per user; list top offenders with `/listwarns`  
- **Prohibited Word Filter** – Detects flagged words and notifies admins with context and user info  
- **Customizable Roles** – Define which roles are considered “admin”, “team”, or “verified”  
- **Comment System** – Add context or notes to users via modal input, saved to the database  
- **CSV → MongoDB Migration** – Import student data via the Admin Web UI
- **Modular Codebase** – Designed for expansion and customization by schools and developers  
- **Fully Open Source** – Modify, rebrand, and extend for your own school use cases

---

## Table of Contents

1. [Prerequisites](#prerequisites)  
2. [Quickstart](#quickstart)  
   2.1 [Clone the Repository](#clone-the-repository)  
   2.2 [Create Your `.env` File](#create-your-env-file)  
   2.3 [Launch with Docker Compose](#launch-with-docker-compose)  
   2.4 [View Logs](#view-logs)  
3. [Developing Locally](#developing-locally)  
   3.1 [Install Dependencies](#install-dependencies)  
4. [Troubleshooting](#troubleshooting)  

---

## Prerequisites

- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) installed  
- Basic familiarity with the command line  
- A Discord application (Bot token, Client ID) and a target guild/server ID  

---

## Quickstart

### Clone the Repository

```bash
git clone https://github.com/MoritzKlasen/OpenSDB.git
cd OpenSDB
```

### Create Your `.env` File

Create a file named `.env` in the project root:

```bash
nano .env
```

Populate it with:

```dotenv
# Discord Bot
DISCORD_TOKEN=your-bot-token-here
CLIENT_ID=your-client-id-here
ALLOWED_GUILD_ID=your-guild-id-here

# MongoDB
DB_URI=mongodb://mongo:27017/schooldb

# Admin Web UI
ADMIN_USERNAME=admin          # your desired admin username
ADMIN_PASSWORD=supersecret    # your desired admin password
JWT_SECRET=anotherSuperSecret # JWT signing secret
ADMIN_UI_PORT=8001            # your desired port
```

> **Security:** Never commit `.env` to version control. Add it to your `.gitignore`.

### Launch with Docker Compose

Build and start all services (Bot, Admin UI, MongoDB):

```bash
docker compose up --build -d
```

The admin dashboard will be available at <http://SERVER-IP-ADDRESS:8001/login.html>.

### View Logs

To stream logs for the bot service:

```bash
docker compose logs -f bot
```

To stream logs for the web UI:

```bash
docker compose logs -f web
```

---

## Developing Locally

### Install Dependencies

Before running the bot, install the Node.js packages:

```bash
npm install bcrypt cookie-parser discord.js dotenv dotenv-extended express jsonwebtoken mongoose multer csvtojson json2csv
```

---

## Troubleshooting

- **Ports in Use**: Make sure nothing else is running on ports `8001` (web UI) or `27017` (MongoDB) on your host.  
- **Environment Variables Not Loaded**: Verify your `.env` file is in the project root and follows the `KEY=VALUE` format.  
- **Docker Build Issues**: If dependencies change, rerun with `docker compose up --build`.  
- **Admin Login Fails**: Ensure `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` match what you use on the login page.  

---

>If you run into any issues or would like to request new features, feel free to open an issue on the [GitHub-Repo](https://github.com/MoritzKlasen/OpenSDB).

Made with ❤️ by McScheleba
