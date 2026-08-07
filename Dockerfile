# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Tailored Resume Platform — production image
#
# Next.js 16 (next start) + Prisma 7 (libSQL/SQLite driver adapter) + Puppeteer
# (headless Chrome, used only by the PDF export in lib/export/pdf.ts).
#
# Node 22: Next requires >=20.9, and prisma.config.ts calls process.loadEnvFile()
# which needs >=20.12.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base

# Puppeteer downloads its own Chrome build (the version it is tested against).
# Pin the cache INSIDE /app so it survives the copy into the runtime stage —
# the default is $HOME/.cache, which would be left behind.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer


# --------------------------------- builder ---------------------------------
FROM base AS builder
WORKDIR /app

# Manifests + Prisma schema FIRST: `npm ci` runs the postinstall `prisma generate`,
# which needs prisma/schema.prisma to exist. Keeping this layer separate from the
# source means dependencies are only reinstalled when the lockfile changes.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Also downloads the matching Chrome into PUPPETEER_CACHE_DIR.
RUN npm ci

# Now the application source (see .dockerignore for what is skipped).
COPY . .

# Regenerate explicitly: the COPY above may have shadowed the postinstall output.
RUN npx prisma generate

RUN npm run build

# NOTE: devDependencies are deliberately NOT pruned. The Prisma CLI is a
# devDependency and is needed at container startup for `prisma migrate deploy`.


# --------------------------------- runtime ---------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Shared libraries Chrome needs to start. Puppeteer ships the browser binary but
# not its system dependencies. Without these, PDF export fails at launch while
# the rest of the app runs fine — an easy failure to misdiagnose later.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
      libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
      libgcc-s1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
      libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
      libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
      libxtst6 wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Whole built app, including node_modules and the Chrome download.
COPY --from=builder /app ./

# The SQLite file lives on a volume, NOT in the image, so data survives rebuilds.
# Compose sets DATABASE_URL=file:/data/dev.db to point here.
RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply any pending migrations, then serve. Safe on every boot: `migrate deploy`
# is a no-op when the schema is already current, and this container is the only
# writer to its database (so it cannot hit the "database is locked" error that a
# concurrently-running server would cause).
#
# `exec` matters: without it, /bin/sh stays PID 1 and does NOT forward SIGTERM to
# its child, so `docker compose down` would hang for the 10s grace period and then
# SIGKILL the server — leaving an unclean SQLite WAL and orphaned Chrome processes.
# exec replaces the shell with the server, so signals reach it directly. Calling
# the next binary rather than `npm run start` removes npm as another layer that
# would have to relay the signal.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node_modules/.bin/next start"]
