# MSH ERP

Hotel Property Management System (PMS) — backend API and ERP modules.

## Develop on your DigitalOcean droplet (209.38.225.150)

Your droplet already has **nginx** running. This repo adds the app stack, bootstrap script, and Cursor Remote SSH workflow.

### 1. One-time droplet setup

SSH into the droplet as root (DigitalOcean console or your existing key):

```bash
ssh root@209.38.225.150
```

Clone and bootstrap:

```bash
git clone https://github.com/amzhuwao/msh-erp.git /opt/msh-erp
cd /opt/msh-erp
git checkout cursor/droplet-dev-setup-fb78   # or main after merge
bash scripts/droplet-bootstrap.sh
```

The script installs Node 20, Docker, PostgreSQL (via Docker Compose), configures nginx, and starts the API as a systemd service.

Verify (use HTTPS — port 80 redirects on this droplet):

```bash
curl -sk https://209.38.225.150/msh-erp/api/health
```

On shared droplets with existing apps (efundo, ajira), MSH ERP runs on **port 3003** behind the `/msh-erp/` nginx path.

### 2. Connect Cursor via Remote SSH

On your **local machine**:

```bash
# Generate a key if you don't have one
ssh-keygen -t ed25519 -C "cursor-msh-erp"

# Copy it to the droplet (after bootstrap created user `mshdev`)
ssh-copy-id mshdev@209.38.225.150
```

Add to `~/.ssh/config`:

```
Host msh-erp-droplet
    HostName 209.38.225.150
    User mshdev
    IdentityFile ~/.ssh/id_ed25519
```

In **Cursor**: Command Palette → **Remote-SSH: Connect to Host** → `mshdev@209.38.225.150` → open `/opt/msh-erp`.

### 3. Daily development on the droplet

```bash
cd /opt/msh-erp
npm install
npm run dev          # API with hot reload on port 3000
npm run db:studio    # Prisma Studio (database UI)
npm run db:migrate   # After schema changes
```

Production API (systemd):

```bash
sudo systemctl status msh-erp-api
sudo systemctl restart msh-erp-api
journalctl -u msh-erp-api -f
```

### 4. Local development (Cloud Agent / laptop)

```bash
cp .env.example apps/api/.env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:push
npm run dev
```

## Project structure

```
apps/api/          Express + TypeScript + Prisma API
erp-dev-plan/      Module implementation guides (20 modules)
deploy/            nginx + systemd configs for droplet
scripts/           Droplet bootstrap script
```

## Tech stack

- **API**: Node.js 20, Express 5, TypeScript
- **Database**: PostgreSQL 16, Prisma ORM
- **Deploy**: Docker Compose, nginx, systemd

## ERP modules

Implementation guides live in `erp-dev-plan/`. Foundation schema starts with Module 1 (Reservations) and Module 17 (Users/Roles).
