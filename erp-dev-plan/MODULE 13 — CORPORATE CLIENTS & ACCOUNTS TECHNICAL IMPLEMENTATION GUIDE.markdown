# MODULE 13 — CORPORATE CLIENTS & ACCOUNTS TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Corporate Clients & Accounts Module administers profile databases, negotiated corporate rate plans, credit parameters, billing rules, and payment statements for business clients, government departments, and travel agencies.

The module integrates with:
- Front Office (retrieving corporate rate contracts and posting invoice balances to credit accounts)
- Finance & Accounting (accounts receivable balancing and general ledger journal postings)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized credit users to:
- Establish corporate profiles containing trade references, credit thresholds, and credit terms.
- Configure negotiated contract rate agreements for Room Types.
- Track total outstanding corporate account balances.
- Apply automated billing routings (e.g., Company pays Room & Breakfast; Guest pays incidentals).
- Generate monthly corporate statements and age outstanding invoices (e.g., 30/60/90 days aging).
- Process bulk company payments and allocate them across outstanding invoices.

## 3. CORPORATE WORKFLOW ENGINE
```
Contract Proposal ➔ Legal Signoff ➔ Profile Set Up ➔ Credit Limit Authorized 
  ➔ Room Booked under Corporate Rate ➔ Checkout to Company Account ➔ Statement Generated ➔ Settlement
```

## 4. DATABASE DESIGN
### CorporateProfile
- `CompanyID` (PK, UUID)
- `CompanyName` (String)
- `RegistrationNumber` (String, Unique)
- `ContactName` (String)
- `ContactEmail` (String)
- `Phone` (String)
- `CreditLimit` (Decimal, Default: 0)
- `CurrentOutstanding` (Decimal, Default: 0)
- `PaymentTermsDays` (Integer, e.g., 30)
- `IsCreditApproved` (Boolean, Default: false)
- `IsActive` (Boolean)

### NegotiatedRateContract
- `ContractID` (PK, UUID)
- `CompanyID` (FK)
- `RoomTypeID` (FK)
- `ContractedRate` (Decimal)
- `StartDate` (Date)
- `EndDate` (Date)
- `IsActive` (Boolean)

### CorporateCreditTransaction
- `TransactionID` (PK, UUID)
- `CompanyID` (FK)
- `InvoiceID` (FK, Optional)
- `TransactionType` (Enum: DEBIT_CHARGE, CREDIT_PAYMENT, ADJUSTMENT)
- `Amount` (Decimal)
- `BalanceAfter` (Decimal)
- `ReferenceDetails` (String)
- `TransactionDate` (Timestamp)
- `CreatedBy` (FK to User)

## 5. BUSINESS RULES
1. Credit Threshold Protection: The system must block checkout checkouts or reservation routings to a company account if `CurrentOutstanding + NewChargeAmount > CreditLimit` unless authorized by a GM override.
2. Rate Parity Enforcement: Contracted rates are only valid within their specified `StartDate` and `EndDate`. If expired, bookings must fallback to standard rack rates.
3. Billing Rule Integrity: Split-billing instructions must be locked once the guest checks in. No modifications can be applied without supervisor authorization.
4. Active Account Rule: Reservations cannot be created under a company contract if the corresponding `CorporateProfile` has been set to inactive or suspended due to aging balances.

## 6. USER INTERFACE
### Corporate Profile Registry
- Profile card displaying company details, credit configurations, active contracts list, and outstanding aging metrics.
- Ledger grid displaying transaction history (charges vs payments).

### Aging AR Report Dashboard
- Graphical dashboard separating aging debt into columns (Current, 30 Days, 60 Days, 90+ Days).
- One-click trigger to generate and bulk-email monthly statements to all active accounts.

## 7. SUGGESTED API ENDPOINTS
- `POST /api/corporate/profiles`
- `PUT /api/corporate/profiles/{id}/credit-limit`
- `POST /api/corporate/contracts`
- `GET /api/corporate/profiles/{id}/statement`
- `POST /api/corporate/payments`

## 8. SECURITY AND ACCESS CONTROL
- **Sales Executive**: Permitted: Create corporate profiles, draft rate contracts, view credit statuses. Denied: Approve credit limits, process payments, edit aging ledgers.
- **Credit Controller / Finance Manager**: Permitted: Approve credit limits, set accounts to inactive, apply payments, authorize overrides.

## 9. AUDIT LOG SPECIFICATION
Log: `CORPORATE_PROFILE_CREATED`, `CREDIT_LIMIT_APPROVED` (storing company, old limit, and approved limit), `RATE_CONTRACT_CHANGED`, `PAYMENT_ALLOCATED`.

## 10. KEY DESIGN PRINCIPLE
Strict credit risk boundaries. Protecting the hotel's cash flow requires systematic enforcement of credit ceilings, automated aging alerts, and complete tracking of corporate billing rules.\n