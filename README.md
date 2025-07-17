# School Discord Bot (Docker + MongoDB)

A self-hosted Discord bot for school communities, complete with an admin web UI, running in Docker containers and persisting data in MongoDB.

---

## Table of Contents

1. [Prerequisites](#prerequisites)  
2. [Quickstart](#quickstart)  
   2.1 [Clone the Repository](#clone-the-repository)  
   2.2 [Create Your `.env` File](#create-your-env-file)  
   2.3 [Launch with Docker Compose](#launch-with-docker-compose)  
   2.4 [View Logs](#view-logs)  
3. [CSV → MongoDB Migration](#csv--mongodb-migration)  
   3.1 [Setup Python Environment](#setup-python-environment)  
   3.2 [Run the Migration Script](#run-the-migration-script)  
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
git clone https://github.com/MoritzKlasen/HTL-Dornbirn.git
cd HTL-Dornbirn
```

### Install Dependencies

Before running the bot, install the Node.js packages:

```bash
npm install bcrypt cookie-parser discord.js dotenv dotenv-extended express jsonwebtoken mongoose
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

The admin dashboard will be available at <http://SERVER-IP-ADDRESS:3001/login.html>.

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

## CSV → MongoDB Migration

Import verified users from a CSV file (e.g. `name_list.csv`) into MongoDB.

### Setup Python Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install pymongo
```

### Run the Migration Script

```bash
python migrate_verified_users.py
```

> **Note:**  
> - Place your CSV file (e.g. `verified_users.csv`) in the project root.  
> - If your filename or MongoDB URI differ, update the script accordingly:

```python
# migrate_verified_users.py
from pymongo import MongoClient
import csv

client = MongoClient("mongodb://localhost:27017/")
db = client["schooldb"]
collection = db["verifiedusers"]

with open("verified_users.csv", newline="", encoding="utf-8") as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        # Adjust field mappings as needed
        collection.update_one(
            {"discordId": row["discordId"]},
            {"$set": {
                "firstName": row["firstName"],
                "lastName": row["lastName"],
                "comment": row.get("comment", "")
            }},
            upsert=True
        )
```

---

## Troubleshooting

- **Ports in Use**: Make sure nothing else is running on ports `3001` (web UI) or `27017` (MongoDB) on your host.  
- **Environment Variables Not Loaded**: Verify your `.env` file is in the project root and follows the `KEY=VALUE` format.  
- **Docker Build Issues**: If dependencies change, rerun with `docker-compose up --build`.  
- **Admin Login Fails**: Ensure `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` match what you use on the login page.  

---

>Happy coding! If you run into any issues or would like to request new features, feel free to open an issue on the [GitHub-Repo](https://github.com/MoritzKlasen/HTL-Dornbirn).

Made with ❤️ by McScheleba