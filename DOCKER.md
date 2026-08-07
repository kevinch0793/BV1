# Running on Windows with Docker

Runs the whole platform — Next.js server, background fetch+tailor pipeline, and
headless Chrome for PDF export — in one container. No Node, npm, or Chrome install
needed on the Windows machine.

## Prerequisites

- [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
  with the **WSL2 backend** (the default).
- The project folder, including a `.env` file. `.env` is gitignored, so it will
  **not** come across from a `git clone` — copy it over manually.

## First run

From the project folder in PowerShell:

```powershell
docker compose up --build
```

The first build takes several minutes: it installs dependencies, downloads the
Chrome build Puppeteer needs (~150MB), and runs `next build`. Later starts take
seconds.

Then open **http://localhost:3000**.

### Create the admin account

On a fresh database the app has no users. In a second terminal, with the app
running:

```powershell
docker compose exec app node prisma/seed.mjs
```

This reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` and is safe to run
more than once — it reports `Admin already exists` and makes no changes.

## Everyday use

```powershell
docker compose up -d      # start in the background
docker compose logs -f    # follow logs (pipeline progress prints here)
docker compose down       # stop; the database volume is kept
docker compose up --build # rebuild after changing code
```

## Where the data lives

The SQLite database is in a Docker **named volume** (`bv1-data`), not in the image
and not in your project folder. It survives `docker compose down` and rebuilds.

This is deliberate: SQLite depends on file locking, and locking across the
Docker Desktop / Windows file share is unreliable enough to cause intermittent
`database is locked` errors and, at worst, corruption. Keeping the database inside
the Linux VM avoids that entirely.

To back it up:

```powershell
docker run --rm -v bv1-data:/data -v ${PWD}:/backup alpine tar czf /backup/bv1-db-backup.tar.gz -C /data .
```

To delete it and start over: `docker compose down -v`.

### Bringing the existing database over from the Mac

Only if you want the current data. **Stop the Mac server first** — copying a live
SQLite file mid-write yields a corrupt copy.

The database also has a large write-ahead log that must be folded in first,
otherwise the copy is missing recent writes:

```bash
# On the Mac, with the server stopped:
sqlite3 prisma/dev.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

Copy `prisma/dev.db` to the Windows project folder, then load it into the volume:

```powershell
docker compose run --rm -v ${PWD}/prisma:/seed app sh -c "cp /seed/dev.db /data/dev.db"
```

Note it is currently ~440MB, so the transfer is not instant.

## Notes and gotchas

- **`.env` is required.** The container reads it at startup and will fail without
  `SESSION_SECRET` and the API keys. It is passed at run time, never baked into the
  image, so rotating a key means restarting the container — not rebuilding it.
- **`DATABASE_URL` is overridden** by `docker-compose.yml` to `file:/data/dev.db`.
  The value in `.env` (`file:./prisma/dev.db`) applies only outside Docker.
- **Migrations run automatically** on every start (`prisma migrate deploy`). It is
  a no-op when the schema is already current.
- **Reaching it from other devices** on the network: use the Windows machine's LAN
  IP, e.g. `http://192.168.1.50:3000`. If you expose it through a tunnel, add that
  hostname to `TUNNEL_ORIGINS` in `next.config.ts` or Server Actions will be
  rejected by the CSRF origin check.
- **Port 3000 already in use?** Change the host side only:
  `ports: - "3001:3000"`.
- **PDF export needs Chrome**, which is why the image installs a set of system
  libraries and why compose sets `shm_size: 1gb`. If PDF export ever fails while
  the rest of the app works, that is where to look.
