# Manica Skyview Hotel ERP (MSH ERP)

Property Management System for **Manica Skyview Hotel**, Mutare, Zimbabwe.

## Live application

| Service | URL |
|---------|-----|
| **Web UI** | https://209.38.225.150/msh/login |
| **API** | https://209.38.225.150/msh-erp |

### Default users

| Username | Password | Role |
|----------|----------|------|
| `admin` | `Admin@MSH2026!` | System Administrator |
| `guest` | `Guest@MSH2026!` | Receptionist (demo / limited) |
| `reception` | `Reception@MSH2026!` | Receptionist |
| `fosupervisor` | `Supervisor@MSH2026!` | Front Office Supervisor |
| `housekeeping` | `Housekeeping@MSH2026!` | Housekeeping Supervisor |
| `sales` | `Sales@MSH2026!` | Sales Coordinator |

## Features

### Front Office UI (`apps/web`)
- **Tape chart** — 14-day room grid with reservation blocks
- **Arrivals** — today's expected arrivals with check-in flow
- **Departures** — folio balance + check-out
- **In-house** — searchable guest list
- **Availability search** — room type availability by date
- **Folio panel** — post charges and payments
- **Night audit** — no-shows, room charge posting

### Housekeeping UI
- Room status grid with cleaning workflow (Dirty → Cleaning → Clean → Inspected)
- Status filters and per-room action buttons

### Group Reservations UI (`/dashboard/groups`)
- Group dashboard with metrics (tentative, confirmed, arrivals)
- New group booking form with availability check
- Group detail: room allocation, guest list, CSV rooming list import
- Confirm booking workflow

### API modules
- Module 17: Auth & RBAC
- Module 18: Property configuration
- Module 1: Reservations, guests, check-in/out, folios
- Module 3: Housekeeping status workflow
- Module 2: Group reservations, corporate profiles, rooming list import
- Module 14: Rate plans

## API endpoints

```
POST /api/auth/login
GET  /api/front-office/tape-chart?days=14
GET  /api/front-office/arrivals
GET  /api/front-office/departures
GET  /api/front-office/in-house
GET  /api/reservations/availability
POST /api/reservations
POST /api/reservations/:id/checkin
POST /api/reservations/:id/checkout
POST /api/reservations/:id/cancel
GET  /api/folios/:id
POST /api/folios/:id/charges
POST /api/folios/:id/payments
GET  /api/housekeeping/dashboard
PUT  /api/housekeeping/rooms/:id/status
POST /api/group-reservations
GET  /api/group-reservations/dashboard
POST /api/group-reservations/:id/confirm
POST /api/group-reservations/:id/allocate-room
POST /api/group-reservations/:id/import-rooming-list
GET  /api/corporate/profiles
```

## Development

See [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) for the local development milestones and workflow priorities. Specs for all 20 modules are in `erp-dev-plan/`.

Prerequisites: Node.js 20 or newer, npm, and Docker Engine with the Docker Compose plugin. Run these commands from the repository root as your normal user (no `sudo` required). The bundled PostgreSQL service listens on `127.0.0.1:55432`; if you use a separately managed local PostgreSQL cluster, set `DATABASE_URL` in `apps/api/.env` to that cluster instead.

```bash
npm ci
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
docker compose up -d postgres
npm run db:setup
npm run dev          # API on :3000
npm run dev:web      # Web on :3004
```

Open `http://localhost:3004/login` and sign in with `admin` / `Admin@MSH2026!`.
The seed includes a local sample guest (`Development Guest`) and inspected rooms/rates. In the Front Office dashboard, register another guest if needed, use **New Reservation** to search and book, then check the guest in from **Arrivals**. Open the guest's folio from **In-House** to post a charge and payment, then check out after the balance reaches zero.

`npm run db:setup` generates the Prisma client, pushes the schema, and runs the sample-data seed. **The seed deletes and recreates application data. Use it only with a disposable local database; never point it at staging or production.**

To add three months of sample reservations and folio activity without deleting existing records, run `npm run db:seed:three-months`. It uses deterministic demo reservation numbers, so rerunning it skips reservations already created by this seed.

To import the November 2025 bar price list into the POS outlet labeled “Bar”, run `npm run db:import-bar-pricelist`. It updates matching sample prices, adds missing items, moves snacks to Bar and meal categories to the restaurant outlet, combines lunch and dinner as À la carte, and deactivates unmatched sample bar products while retaining their order history.

For normal development, run the API and web with the commands above so both support hot reload. To run the API in Docker instead, first complete the database setup above, then use `docker compose up -d api`; run the web app separately with `npm run dev:web`.

```bash
npm run db:studio    # Prisma Studio
```

## Project structure

```
apps/api/     Express + Prisma backend
apps/web/     Next.js front office UI
erp-dev-plan/ Module specs (20 modules)
deploy/       nginx + systemd
scripts/      Bootstrap & nginx setup
```

## Droplet

SSH: `mshdev@209.38.225.150` → `/opt/msh-erp`

```bash
pm2 logs msh-erp-api
pm2 logs msh-erp-web
pm2 restart all
```

**Important:** Never overwrite `/opt/msh-erp/apps/api/.env` on deploy.
