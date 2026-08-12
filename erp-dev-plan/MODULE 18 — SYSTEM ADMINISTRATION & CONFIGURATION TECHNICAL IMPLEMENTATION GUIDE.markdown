# MODULE 18 — SYSTEM ADMINISTRATION & CONFIGURATION TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The System Administration Module centralizes the global configuration of the ERP system, including property profiles, currency mappings, tax profiles, system document sequencing patterns, and background job configurations.

The module integrates with:
- All system modules (providing standard configurations such as VAT rates, currency formats, and transaction number schemas)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized system administrators to:
- Edit the hotel's property profile, contact information, and logo assets.
- Configure global tax codes and rates (e.g., VAT at 15%, Tourism Levy).
- Establish currency rates and format configurations.
- Set up document numbering patterns with custom prefixes and auto-increment numbers.
- Manage system configurations (e.g., standard check-in/out times, session timeouts).
- Monitor background job tasks and cron jobs (e.g., auto-releasing tentative room blocks).
- Execute system maintenance tasks (clearing active session caches).

## 3. CONFIGURATION WORKFLOW
```
Update Configuration Parameter ➔ Validate Input Constraints ➔ Check System Dependencies 
  ➔ Update Global Config Cache ➔ Write Parameter Change to Audit Log
```

## 4. DATABASE DESIGN
### GlobalSetting
- `SettingID` (PK, UUID)
- `Key` (String, Unique, e.g., "SYS_CHECKIN_TIME")
- `Value` (String, e.g., "14:00")
- `Description` (String)
- `IsSystemLocked` (Boolean, Default: false - prevents deletion of critical keys)

### TaxRateDefinition
- `TaxRateID` (PK, UUID)
- `Name` (String, e.g., "VAT 15%")
- `Code` (String, Unique, e.g., VAT_15)
- `RatePercent` (Decimal, e.g., 0.1500)
- `GLAccountID` (FK, links tax accounts directly to General Ledger COA)
- `IsActive` (Boolean)

### DocumentNumberingPattern
- `PatternID` (PK, UUID)
- `Module` (Enum: RESERVATIONS, INVOICES, RECEIPTS, PO, GRN, PAYROLL)
- `Prefix` (String, e.g., "MSV-INV-")
- `CurrentSequence` (Integer, Default: 1)
- `PaddingDigits` (Integer, Default: 5)
- `Suffix` (String, Optional)

### PropertyConfiguration
- `PropertyID` (PK, UUID)
- `PropertyName` (String)
- `Address` (Text)
- `VATNumber` (String)
- `PrimaryCurrency` (String)
- `SecondaryCurrency` (String, Optional)
- `ContactEmail` (String)
- `ContactPhone` (String)

## 5. BUSINESS RULES
1. Sequenced Numbering Locking: Document numbering sequences must increment sequentially and atomicity must be guaranteed. If a transaction fails, the number must not skip or create gaps in invoice registers.
2. Tax Rate Non-Mutability: Tax rate values cannot be simply overwritten if they are already mapped to posted financial transactions. To update a tax rate, the existing code must be marked as inactive and a new rate defined.
3. System Admin Boundaries: Changing a global configuration setting (such as default check-out time) must clear the system cache layer to enforce updates across all active user sessions instantly.
4. Critical Key Lock: System settings with `IsSystemLocked = true` cannot be deleted, as they are hardcoded as operational boundaries in backend controllers.

## 6. USER INTERFACE
### Admin Settings Hub
- Left Menu: Grouped links to Property Info, Tax Settings, Doc Sequences, Currency Setup, Background Tasks.
- Database Sequence Manager: Grid interface showing active document numbering patterns and current counts.
- Background Jobs Board: Terminal dashboard monitoring cron schedules, last run times, and execution outputs.

## 7. SUGGESTED API ENDPOINTS
- `GET /api/admin/settings`
- `PUT /api/admin/settings/{key}`
- `POST /api/admin/tax-rates`
- `PUT /api/admin/numbering-patterns/{id}`
- `GET /api/admin/system-health`

## 8. SECURITY AND ACCESS CONTROL
- **System Administrator**: Permitted: Complete access to edit settings, configure doc patterns, edit tax allocations, manage backup directories. Denied: Modify transactional histories in operational databases.

## 9. AUDIT LOG SPECIFICATION
Log: `SETTING_CHANGED` (recording key, old value, and new value), `TAX_RATE_CREATED`, `DOC_PATTERN_RESET`.

## 10. KEY DESIGN PRINCIPLE
System stability and consistency. All critical configuration metrics must be protected against corruption, as small configuration changes can destabilize operational or financial algorithms.\n