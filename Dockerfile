# -------- Build-Stage ---------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Abhängigkeiten installieren (nur Prod-Deps)
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Quellcode – alles außer node_modules/.env
COPY . .

# -------- Runtime-Stage -------------------------------------------------------
FROM node:20-slim AS runtime

# Unprivilegierten Nutzer anlegen
RUN addgroup --system --gid 1001 bot  \
 && adduser  --system --uid 1001 --gid 1001 --home /app bot

WORKDIR /app
COPY --from=builder --chown=bot:bot /app /app

USER bot
ENV NODE_ENV=production

# Read-only-FS und keine überflüssigen Capabilities konfigurieren wir 
# in docker-compose; hier reicht das Start-Kommando:
CMD ["node", "src/index.js"]
