# Manica Skyview Hotel ERP (MSH ERP)

Property Management System for **Manica Skyview Hotel**, Mutare, Zimbabwe.

## Live API (droplet)

- Base URL: `https://209.38.225.150/msh-erp`
- Property info: `GET /api/property`
- Health: `GET /api/health`

### Default users (change after first login)

| Username | Password | Role |
|----------|----------|------|
| `admin` | `Admin@MSH2026!` | System Administrator |
| `reception` | `Reception@MSH2026!` | Receptionist |
| `fosupervisor` | `Supervisor@MSH2026!` | Front Office Supervisor |

### Quick start

```bash
# Login
curl -sk -X POST https://209.38.225.150/msh-erp/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"reception","password":"Reception@MSH2026!"}'

# Use token for authenticated requests
curl -sk https://209.38.225.150/msh-erp/api/property/dashboard \
  -H "Authorization: Bearer <token>"
```

## Implemented modules (Phase 1)

| Module | Status | Features |
|--------|--------|----------|
| **17 — Auth & RBAC** | ✅ | Login, JWT, role permissions, audit log |
| **18 — Property config** | ✅ | Hotel profile, tax rates, doc numbering |
| **3 — Rooms** | ✅ | 30 rooms, 4 room types, status tracking |
| **1 — Reservations** | ✅ | Guests, availability, booking, check-in, cancel |
| **14 — Rate plans** | ✅ | BAR rate plans per room type |

## API endpoints

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### Property & dashboard
- `GET /api/property`
- `GET /api/property/dashboard`

### Guests
- `GET /api/guests`
- `POST /api/guests`
- `GET /api/guests/:id`
- `PUT /api/guests/:id`

### Reservations
- `GET /api/reservations/availability?checkIn=&checkOut=&adults=`
- `GET /api/reservations`
- `POST /api/reservations`
- `GET /api/reservations/:id`
- `POST /api/reservations/:id/checkin`
- `POST /api/reservations/:id/cancel`

### Rooms
- `GET /api/rooms`
- `GET /api/rooms/types`

## Development

Specs for all 20 modules are in `erp-dev-plan/`.

```bash
cp .env.example apps/api/.env
docker compose up -d postgres   # or use native PostgreSQL
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Project structure

```
apps/api/           Express + TypeScript + Prisma API
  prisma/schema.prisma
  prisma/seed.ts    Manica Skyview seed data
  src/routes/       REST endpoints
  src/services/     Business logic
  src/middleware/   Auth & validation
erp-dev-plan/       Module implementation guides (20 modules)
deploy/             nginx + systemd configs
scripts/            Droplet bootstrap
```

## Droplet development

SSH: `mshdev@209.38.225.150` → open `/opt/msh-erp`

```bash
npm run dev          # port from apps/api/.env (3003 on droplet)
pm2 logs msh-erp-api
pm2 restart msh-erp-api
```

**Important:** Do not overwrite `/opt/msh-erp/apps/api/.env` when deploying.
