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

Specs for all 20 modules: `erp-dev-plan/`

```bash
cp .env.example apps/api/.env
npm install
npm run db:generate && npm run db:push && npm run db:seed
npm run dev          # API on :3000
npm run dev:web      # Web on :3004
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
