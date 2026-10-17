# MSH ERP Development Plan

## Goal

Develop Manica Skyview Hotel ERP locally in small, complete workflows that can be reviewed before anything is deployed. The first milestone is a developer being able to start the application, sign in with seeded data, create a reservation, check a guest in, post a folio charge and payment, and check the guest out.

## Current shape

- `apps/api`: Express, TypeScript, Prisma, PostgreSQL.
- `apps/web`: Next.js staff and guest interfaces.
- `erp-dev-plan/`: specifications for 20 business modules.
- `docker-compose.yml`: PostgreSQL and a production-style API container; local web development runs separately through the npm workspace.
- Existing operational code includes reservations, guest records, rooms, folios, housekeeping, groups, and other hotel workflows. Coverage across the UI and backend is uneven, so each guide should be checked against working behavior before taking on a new module.

## Milestones

### 0. Reproducible local environment

- Document required Node.js, npm, and Docker versions and a clean setup path.
- Start an isolated local PostgreSQL database on host port `55432` and configure API and web environment files.
- Provide convenient database setup commands and safe sample accounts/catalog data.
- Ensure the web app uses the local API by default.
- Clearly mark seed/reset behavior so it cannot be mistaken for a production-safe operation.

**Done when:** a new checkout can be configured from the documented steps, the database health endpoint reports connected, and staff can sign in locally.

### 1. Front-office reservation to checkout

- Register or select a guest.
- Search room availability and create a reservation against a room type/rate plan.
- Assign an inspected room and check the guest in on or after the arrival date.
- Review the guest folio, post a charge, record payment, and check out when the balance is settled.
- Confirm reservation and room statuses update through the existing front-office views.

**Done when:** the entire workflow can be completed from the UI against the local database using seeded room inventory, without editing database records by hand.

### 2. Stabilize core operational workflows

- Compare module guides with routes, services, Prisma schema, and UI pages.
- Prioritize date handling, room availability/overlap, folio calculations, audit history, and role permissions.
- Add focused automated coverage around these critical rules as part of the engineering workflow.

**Done when:** core front-office cases and their expected failure cases have repeatable checks and documented behavior.

### 3. Expand by operational dependencies

After front-office is reliable, implement and validate workflows in this order:

1. Group reservations and corporate accounts.
2. Housekeeping, guest services, and room readiness.
3. POS and conference/event charges into guest folios.
4. Inventory, procurement, and maintenance.
5. Notifications and external integrations.

Each module should ship as a complete user-facing slice: permissions, data changes, audit trail, API, UI, and supporting operational documentation.

### 4. Prepare controlled releases

- Separate local, staging, and production configuration and data.
- Review database migration and rollback procedures before deployment.
- Add release checks, backups, and a deployment checklist.
- Keep live server credentials and `.env` files out of source control; never run local seed/reset commands against production.

## Working agreements

- Work in small, reviewable changes and keep this document updated as milestones are completed or reprioritized.
- Use local-only sample data and secrets for development.
- Treat module guides as requirements input, then verify assumptions with hotel staff before changing operational rules.
- Do not deploy or modify the live droplet as part of local development work.

## Current next step

Milestone 1 is complete for the seeded local scenario. On 2026-10-05, Development Guest completed reservation `MSV-RES-2026-0001` for a Standard Room, checked into room 101, received an $85.00 demo folio charge and matching cash payment, and checked out with a zero balance. The reservation appeared under Recheck-in afterward, and room 101 correctly changed to `OCCUPIED_DIRTY`.

That walkthrough found an off-by-one date issue: dashboard and front-office queries used Harare local midnight with PostgreSQL date-only fields, which made today's date appear as the previous UTC date and hid today's arrivals. Those query boundaries now use UTC date-only values; the workflow was repeated successfully after the fix.

Milestone 0 still needs its clean-checkout setup path checked against the documented default database port. PostgreSQL 16 cluster `main` is running locally on port `5432`. The local `msh_erp` role and database now match `apps/api/.env`; Prisma schema sync and the seed completed, and `/api/health` reports `database: connected`.

Group Reservations is complete for the local MVP. It supports group drafts and confirmation, availability checks, room allocation, CSV rooming-list import, identity validation and duplicate protection, manual room selection per group member (saved before check-in and honored at check-in), individual and bulk check-in, charges split across master, company, and sponsor accounts, invoice generation by payer, deposit and invoice-payment history, and individual check-out tied back to the rooming list. Closing a group requires all registered guests to be checked out and the group balance settled. Billing actions and lifecycle changes are audit logged. The local Prisma schema has been synced with the added group payment ledger.

Corporate Clients & Accounts is complete for the local MVP. It supports registering profiles in an unapproved state, credit-limit approval and account activation controls, active negotiated rate contracts by room type, manual account charges with credit-limit checks and a permission-protected approval override, payment posting that cannot exceed outstanding balance, ledger statements, FIFO invoice payment allocation, and applying a valid contracted rate when making a reservation under an approved company. Reservation rows retain the corporate account and contracted-rate snapshot; nightly folio charges and revenue reporting use that rate. Corporate billing departments can be configured per account and are snapshotted on each reservation. At checkout, routed folio charges create dated, numbered corporate invoices while guest-side charges remain due from the guest. Aging follows invoice due dates. Monthly statements can be exported as CSV and emailed to active corporate clients when SMTP is configured. Audit logging covers profile lifecycle, credit approval, charges, overrides, contract changes, payments, checkout invoices, and statement email results. Hotel staff should confirm department routing and contract terms before operational use.

Housekeeping & Room Readiness is implemented for the local MVP. The workflow provides date-specific room assignments to active Housekeeping department users, attendant ownership checks when cleaning starts, cleaning/inspection logs, supervisor-only inspection and rejection feedback, room readiness status controls, and audit history. Defect reports open linked maintenance tickets and block vacant rooms as maintenance; occupied rooms keep their occupied status. Staff can record and search found items; supervisors can mark them claimed, donated, or disposed. Per-room supply standards can be configured against Housekeeping inventory items and stores. A completed shift can generate a daily draft issue voucher; only a different Inventory approver can post the issue and deduct stock atomically. Configure and confirm actual hotel supply quantities before operational use.

Guest Services now has runner-scoped queues and status restrictions, supervisor dispatch, transit scheduling with drivers and vehicle details, reservation cash-only controls with prepayment-credit validation at completion, and room-service ticket creation in the restaurant POS. Room-service completion posts the guest folio charge once while keeping linked kitchen tickets out of duplicate sales and folio reporting. High-priority concierge requests older than 15 minutes are highlighted in Guest Services and on the front-office dashboard. Its schema changes are synced. Exercise the workflows with actual staff roles and menu data.

POS and conference/event folio integration is implemented for the local MVP. POS room-charge payments now claim the order and post one linked folio line in a database transaction, retain the reservation link, and reject cash-only reservations. Conference bookings can link an in-house reservation; completing a confirmed or in-progress event posts its charge once to that guest's open folio and marks the booking complete. Unlinked events, checked-out reservations, cash-only reservations, and reservations without an open folio cannot be billed through this action. The new source links and reservation relation are synced to the local PostgreSQL schema. API and web production builds both pass.

Conference venue management now supports listing and viewing venue details, creating venues, editing capacities and rates, and deleting or archiving venues through the Conference permissions. Linked booking history is preserved when a venue is archived; inactive venues are excluded from new booking selections. Venue changes are audit logged. Catering packages are assigned to a venue in Catalog and only that venue's active packages are offered when booking. The New booking form labels each input and accepts an optional custom venue rate that overrides standard half-day/full-day pricing while package charges remain separate.

Inventory, Procurement, and Maintenance are implemented for the local MVP. Stock transfers, count adjustments, goods receipt, housekeeping issues, and maintenance parts update stock and movement records transactionally. Count adjustments require a reference and explanation; variance approvals and purchase-order approval counts can be configured. Supplier quotes can be compared by PO line and selected before approval; supplier invoice lines are matched against received quantities and PO prices. Maintenance supports asset registration and lifecycle controls, recurring preventive schedules, technician work orders, and emergency room holds. Approval actions enforce separate approvers and show pending approval counts. Requisition-to-purchase-order conversion is deferred as a future feature. Enter actual approval tiers, supplier offers, inventory values, assets, and maintenance schedules before operational use.

Guest Profile Management is implemented for the local MVP. Staff with Reservations permissions can search and page through registered guest profiles, view full contact/identity details and recent reservation history, edit profile fields, and create profiles manually. CSV import supports up to 500 profiles per file, validates identity requirements, reports row-level failures such as duplicate email addresses, and records audit entries. Guest profile responses exclude portal password hashes.

## Future features

- Finance.
- Payroll.
- Reporting.
- Revenue Management.
- Requisition-to-purchase-order conversion.

Current sequence: confirm hotel-specific Housekeeping supply standards and configure real supplier approval tiers, quote data, assets, and preventive schedules. Then complete core workflow stabilization, validate the clean-checkout setup path, and prepare controlled releases. Notifications and integration screens are available locally; real SMS, payment, and OTA delivery requires the hotel's chosen providers and credentials. The features listed above are deferred beyond this sequence.
