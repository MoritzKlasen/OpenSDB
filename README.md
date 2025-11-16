Hier ist der gesamte Text *verständlich und natürlich auf Deutsch* übersetzt – inklusive technischer Fachbegriffe, sauberem Stil und konsistenter Formatierung:

---

# OpenSDB – Open School Discord Bot (Docker + MongoDB)

Ein quelloffener, selbst gehosteter Discord-Bot für Schul-Communities, inklusive Admin-Weboberfläche, ausgeführt in Docker-Containern und mit persistenten Daten in MongoDB.

---

## Funktionen

* **Sicheres Verifizierungssystem** – Weist verifizierten Nutzern über `/verify` automatisch Rollen zu, mit Namensprotokollierung und dauerhafter Speicherung
* **Admin-Weboberfläche** – Verwalte Nutzer, Verwarnungen und Verifizierungsstatus über ein passwortgeschütztes lokales Dashboard
* **Verwarnungssystem** – Erfasse, füge hinzu und entferne Verwarnungen pro Nutzer; liste mit `/listwarns` die Nutzer mit den meisten Verwarnungen auf
* **Wortfilter für verbotene Begriffe** – Erkennt markierte Wörter und benachrichtigt das Adminteam mit Kontext und Nutzerinformationen
* **Anpassbare Rollen** – Lege fest, welche Rollen als „Admin“, „Team“ oder „Verifiziert“ gelten
* **Kommentarsystem** – Füge Nutzern über ein Modal-Fenster Hinweise oder Notizen hinzu, gespeichert in der Datenbank
* **CSV → MongoDB Migration** – Importiere Schülerdaten direkt in der Admin-Weboberfläche
* **Modularer Code** – Entwickelt für Erweiterbarkeit und Anpassungen durch Schulen und Entwickler
* **Vollständig Open Source** – Ändern, erweitern und umbenennen für eigene Schul-Use-Cases

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Schnellstart](#schnellstart)
   2.1 [Repository klonen](#repository-klonen)
   2.2 [`.env`-Datei erstellen](#env-datei-erstellen)
   2.3 [Mit Docker Compose starten](#mit-docker-compose-starten)
   2.4 [Logs anzeigen](#logs-anzeigen)
3. [Lokal entwickeln](#lokal-entwickeln)
   3.1 [Abhängigkeiten installieren](#abhängigkeiten-installieren)
4. [Fehlerbehebung](#fehlerbehebung)

---

## Voraussetzungen

* Installiertes [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
* Grundkenntnisse im Umgang mit der Kommandozeile
* Eine Discord-Anwendung (Bot-Token, Client-ID) und eine Ziel-Guild/Server-ID

---

## Schnellstart

### Repository klonen

```bash
git clone https://github.com/MoritzKlasen/OpenSDB.git
cd OpenSDB
```

### `.env`-Datei erstellen

Erstelle im Projektverzeichnis eine Datei `.env`:

```bash
nano .env
```

Befülle sie mit:

```dotenv
# Discord Bot
DISCORD_TOKEN=dein-bot-token
CLIENT_ID=deine-client-id
ALLOWED_GUILD_ID=deine-guild-id

# MongoDB
DB_URI=mongodb://mongo:27017/schooldb

# Admin Web UI
ADMIN_USERNAME=admin          # gewünschter Admin-Benutzername
ADMIN_PASSWORD=supersecret    # gewünschtes Admin-Passwort
JWT_SECRET=anotherSuperSecret # JWT-Signatur-Secret
ADMIN_UI_PORT=8001            # gewünschter Port
```

> **Sicherheit:** Commite die `.env` niemals in ein Repository. Füge sie zur `.gitignore` hinzu.

### Mit Docker Compose starten

Baue und starte alle Services (Bot, Admin UI, MongoDB):

```bash
docker compose up --build -d
```

Das Admin-Dashboard ist erreichbar unter:
**[http://SERVER-IP-ADRESSE:8001/login.html](http://SERVER-IP-ADRESSE:8001/login.html)**

### Logs anzeigen

Bot-Logs streamen:

```bash
docker compose logs -f bot
```

Logs der Weboberfläche:

```bash
docker compose logs -f web
```

---

## Lokal entwickeln

### Abhängigkeiten installieren

Bevor der Bot lokal ausgeführt wird, installiere die Node.js-Pakete:

```bash
npm install bcrypt cookie-parser discord.js dotenv dotenv-extended express jsonwebtoken mongoose multer csvtojson json2csv
```

---

## Fehlerbehebung

* **Port bereits belegt**: Stelle sicher, dass nichts anderes auf Port `8001` (Web UI) oder `27017` (MongoDB) läuft.
* **Umgebungsvariablen werden nicht geladen**: Prüfe, ob deine `.env` im Projektverzeichnis liegt und dem Format `KEY=VALUE` folgt.
* **Build-Fehler in Docker**: Bei Änderungen der Dependencies `docker compose up --build` erneut ausführen.
* **Admin-Login schlägt fehl**: `ADMIN_USERNAME` und `ADMIN_PASSWORD` in `.env` müssen mit den Login-Daten übereinstimmen.

---

> Wenn du Probleme hast oder neue Features vorschlagen möchtest, eröffne gerne ein Issue im [GitHub-Repository](https://github.com/MoritzKlasen/OpenSDB).

Erstellt mit ❤️ von McScheleba
