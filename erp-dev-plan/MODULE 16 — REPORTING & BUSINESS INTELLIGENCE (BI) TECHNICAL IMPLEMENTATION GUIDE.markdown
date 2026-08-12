# MODULE 16 — REPORTING & BUSINESS INTELLIGENCE (BI) TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Reporting & Business Intelligence Module consolidates historical and real-time operational data into standardized dashboards, business reports, audit listings, and exportable financial files.

The module integrates with:
- All system modules (providing secure database read access to Reservations, Finance, POS, Inventory, and HR)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Generate daily operational metrics reports (Arrivals, Departures, In-house list, No-shows).
- Run historical financial reports (Trial Balance, P&L, VAT collections ledger, AR Aging).
- Export key operational analytics dashboards (Occupancy forecast, ADR, RevPAR).
- Query store usage listings and inventory valuation summaries.
- Build custom reports using advanced column filters and date ranges.
- Export report listings to PDF and Excel/CSV formats.
- Set up automated email delivery schedules for recurring managers' reports.

## 3. REPORT DATA PIPELINE
```
Query Trigger ➔ Identify Permissions ➔ Apply Filter/Date Parameters ➔ Execute Optimised Database Read 
  ➔ Format Output (JSON/CSV) ➔ Apply PDF/Excel Template Styles ➔ Display / Deliver to User
```

## 4. DATABASE DESIGN & DATA PIPELINE ARCHITECTURE
To prevent reporting queries from slowing down the primary transactional database, the BI module should read from optimized Database Views, Materialized Views, or a Read-Replica database.

### Core Database Views (SQL Reference Examples)

#### View: v_revenue_performance
```sql
CREATE VIEW v_revenue_performance AS
SELECT 
  CAST("createdAt" AS DATE) as "TransactionDate",
  SUM(CASE WHEN "description" LIKE 'Room%' THEN "amount" ELSE 0 END) as "AccommodationRevenue",
  SUM(CASE WHEN "description" NOT LIKE 'Room%' THEN "amount" ELSE 0 END) as "IncidentalRevenue",
  SUM("amount") as "TotalRevenue"
FROM "FolioCharge"
GROUP BY CAST("createdAt" AS DATE);
```

#### View: v_occupancy_analytics
```sql
CREATE VIEW v_occupancy_analytics AS
SELECT 
  d.date as "OccupancyDate",
  COUNT(r.id) as "RoomsOccupied",
  (SELECT COUNT(*) FROM "Room") as "TotalRooms",
  ROUND((COUNT(r.id)::decimal / (SELECT COUNT(*) FROM "Room")::decimal) * 100, 2) as "OccupancyPercentage"
FROM generate_series('2026-01-01'::date, '2026-12-31'::date, '1 day'::interval) d
LEFT JOIN "Reservation" r ON d.date >= r."checkIn" AND d.date < r."checkOut" AND r.status = 'CHECKED_IN'
GROUP BY d.date;
```

## 5. BUSINESS RULES
1. Data Isolation: Reports must not under any circumstances write or modify database records. Connection pools allocated to the BI Module must be strictly marked as Read-Only.
2. Query Timeout Limit: Any report query running for longer than 30 seconds must be programmatically terminated by the database driver to protect system resources.
3. Access Boundary Enforcements: Column-level masking is mandatory. Sensitive columns (e.g., credit card numbers, payroll salaries, disciplinary text files) must remain blank on report configurations unless the user has verified matching permissions.
4. Materialized Views Refresh: High-load analytical queries (such as historical F&B consumption trends) must run against Materialized Views that refresh during off-peak hours (e.g., 3:00 AM) to maintain transactional speed.

## 6. USER INTERFACE
### Reporting Hub
- Grouped directory of standard system reports (Operational, Financial, Inventory, HR, Maintenance).
- Visual Dashboard containing interactive line charts (ADR trend), bar charts (Revenue by department), and progress meters (Occupancy targets).

### Custom Report Builder
- Column selector interface allowing users to select parameters, sort patterns, and group metrics dynamically.
- Export widget presenting quick buttons for "Download PDF", "Export CSV", and "Email Report".

## 7. SUGGESTED API ENDPOINTS
- `GET /api/reports/operational/arrivals?date=YYYY-MM-DD`
- `GET /api/reports/financial/trial-balance?startDate=TS&endDate=TS`
- `GET /api/reports/inventory/valuation?locationId=ID`
- `POST /api/reports/schedules`
- `POST /api/reports/custom/build`

## 8. SECURITY AND ACCESS CONTROL
- **Department Staff**: Permitted: View department-specific reports (e.g., Housekeeper views room lists). Denied: View company financial performance, payroll summaries, or ledger listings.
- **Finance Team**: Permitted: Access to financial, accounts receivable, accounts payable, and inventory reports. Denied: Access to HR disciplinary text logs.
- **General Manager / Director**: Permitted: View all reports (Financial, HR, CRM, Operations).

## 9. AUDIT LOG SPECIFICATION
Log: `REPORT_EXPORTED` (storing report name, user ID, format, parameters, and row count), `REPORT_SCHEDULE_CREATED`.

## 10. KEY DESIGN PRINCIPLE
Single version of the truth. Financial figures and key metrics displayed on the BI dashboard must correspond exactly to the double-entry transactional logs recorded in the ledger.\n