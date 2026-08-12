# MODULE 8 — FINANCE & ACCOUNTING TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Finance & Accounting Module serves as the general financial backbone of the hotel ERP, transforming operational transactions (reservations, sales, procurement, inventory issues, and payroll payments) into double-entry ledger postings.

The module integrates with:
- Front Office (guest ledger and guest invoicing)
- Restaurant POS (sales and cash books)
- Procurement & Stores (accounts payable, supplier invoices, and inventory value)
- Payroll (salary ledger distributions)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized finance users to:
- Establish and manage a multi-tiered Chart of Accounts (COA).
- Process manual and automated Journal Entries.
- Track Accounts Receivable (AR) and age outstanding corporate accounts.
- Manage Accounts Payable (AP), logging vendor invoices against GRNs.
- Execute automated Bank Reconciliations.
- Compute tax collections and extract VAT schedules.
- Generate complete financial declarations: Balance Sheet, Trial Balance, Profit & Loss (P&L), and Cash Flow Statements.
- Lock accounting periods (monthly and annual close processes).

## 3. ACCOUNTING POSTING PIPELINE
```
Transaction Event ➔ Rule Mapping Identification ➔ Double-Entry Generation 
  ➔ Audit Log Write ➔ General Ledger Entry Update ➔ Real-Time Dashboard Sync
```

## 4. DATABASE DESIGN
### ChartOfAccount
- `AccountID` (PK, UUID)
- `AccountCode` (String, Unique, e.g., "1200-GuestLedger")
- `AccountName` (String)
- `AccountType` (Enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
- `ParentAccountID` (FK, Nullable for hierarchical structures)
- `CurrentBalance` (Decimal)
- `IsActive` (Boolean)

### GeneralLedgerEntry
- `GLEntryID` (PK, UUID)
- `EntryNumber` (Unique, e.g., GL-2026-000492)
- `TransactionDate` (Date)
- `ReferenceDocument` (String, e.g., Invoice-4902)
- `Description` (String)
- `CreatedBy` (FK to User)
- `CreatedAt` (Timestamp)

### GeneralLedgerLine
- `LineID` (PK, UUID)
- `GLEntryID` (FK)
- `AccountID` (FK)
- `DebitAmount` (Decimal)
- `CreditAmount` (Decimal)

### VendorInvoice
- `VendorInvoiceID` (PK, UUID)
- `InvoiceNumber` (String)
- `PurchaseOrderID` (FK)
- `SupplierID` (FK)
- `NetAmount` (Decimal)
- `TaxAmount` (Decimal)
- `TotalAmount` (Decimal)
- `Status` (Enum: UNPAID, PARTIALLY_PAID, PAID)
- `CreatedDate` (Date)

## 5. BUSINESS RULES
1. Double-Entry Integrity: No manual or automated journal entry can be saved unless the sum of Debits is exactly equal to the sum of Credits.
2. Immutable Ledger Principle: No financial transaction, once committed to the General Ledger, can be deleted or updated. Any correction must be handled by an authorized reversal/adjustment transaction.
3. Closed Period Protection: Postings into periods marked as CLOSED are strictly blocked.
4. Accounts Receivable Limits: Corporate client profiles must not exceed their designated Credit Limit during reservations or checkout transfers without General Manager approval.

## 6. USER INTERFACE
### Finance Workspace
- **Executive Financial Indicators**: Cash in Hand, AR Balance, AP Balance, Month-to-date Revenue, Operating Margin.
- **General Ledger Browser**: Search, filter, and expand any transaction line.
- **Invoice Reconciler**: Match Purchase Orders, GRNs, and Supplier Invoices.
- **Journal Entry Generator**: Grid interface with auto-sum of debits and credits.
- **Bank Reconciliation Engine**: Match CSV statements against system cash book ledgers.

## 7. TRANSACTION AUTOMATION SCHEMES
- **Case A: Room Charge Posted** (during Night Audit)
  - Debit: Guest Ledger (Asset Account)
  - Credit: Room Revenue (Revenue Account)
- **Case B: Cash POS Sale**
  - Debit: Cash Clearing Account (Asset Account)
  - Credit: Food & Beverage Revenue (Revenue Account)
  - Credit: VAT Output Liability (Liability Account)
- **Case C: Guest Check-out to Corporate Account**
  - Debit: Accounts Receivable (Asset Account)
  - Credit: Guest Ledger (Asset Account)

## 8. SUGGESTED API ENDPOINTS
- `GET /api/finance/coa`
- `POST /api/finance/journals`
- `GET /api/finance/reports/trial-balance`
- `GET /api/finance/reports/profit-and-loss`
- `POST /api/finance/vendor-invoices`
- `POST /api/finance/periods/close`

## 9. SECURITY AND ACCESS CONTROL
- **Accountant**: Permitted: View reports, draft journal entries, process vendor invoices, perform bank reconciliations. Denied: Authorize manual journal entries, open/close accounting periods, edit system billing maps.
- **Finance Manager**: Permitted: All accountant actions + authorize journal entries, edit COA nodes, open/close periods, manage credit parameters.

## 10. AUDIT LOG SPECIFICATION
Log: `JOURNAL_POSTED`, `PERIOD_CLOSED`, `COA_MODIFIED`, `INVOICE_REVERSED`.

## 11. KEY DESIGN PRINCIPLE
The general ledger is the final destination for all transactional workflows. The module must be designed with strict transaction boundaries so that any system failures in downstream modules do not create incomplete accounting records.
