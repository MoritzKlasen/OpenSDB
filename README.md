# School Discord Bot (Docker + MongoDB)

---

## Schnellstart

### 1. Repository klonen

```bash
git clone https://github.com/dein-user/dein-bot.git HTL-Dornbirn
cd HTL-Dornbirn
```

### 2. `.env` Datei erstellen

```bash
nano .env
```

#### Inhalt:

```env
DISCORD_TOKEN=------TOKEN------
CLIENT_ID=------CLIENT-ID------
ALLOWED_GUILD_ID=------GUILD-ID------
DB_URI=mongodb://mongo:27017/schooldb
```

### 3. Bot starten

```bash
docker compose up -d
```

Logs anzeigen:

```bash
docker compose logs -f bot
```

---

## CSV → MongoDB Migration

Verifizierte Nutzer aus CSV-Datei in MongoDB importieren.

### 1. Virtuelle Umgebung erstellen

```bash
python3 -m venv venv
source venv/bin/activate
pip install pymongo
```

### 2. Migration ausführen

```bash
python migrate_verified_users.py
```

---

## ⚠️ Hinweise zur Migration

- Die CSV-Datei (`verified_users.csv` o. ä.) muss im Projektordner liegen.
- Pfad und Dateiname in `migrate_verified_users.py` anpassen:

```python
with open("verified_users.csv", "r") as file:
    ...
```

- `MongoClient` anpassen:

```python
client = MongoClient("mongodb://localhost:27017/")
db = client["schooldb"]
```