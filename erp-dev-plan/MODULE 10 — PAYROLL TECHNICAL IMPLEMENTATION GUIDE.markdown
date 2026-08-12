# MODULE 10 — PAYROLL TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Payroll Module automates salary computations, tax deductions, pension contributions, and local statutory filings (PAYE, AIDS Levy, NSSA). It processes payroll periods, generates payslips, and handles bank disbursement records.

The module integrates with:
- Human Resources (fetching base contracts, leave adjustments, and attendance metrics)
- Finance & Accounting (direct posting of salary expense and tax liability ledgers)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized payroll processors to:
- Establish salary structures comprising basic pay, allowances, and statutory deductions.
- Compute PAYE tax bands using local tax tables.
- Calculate NSSA contributions and the national AIDS Levy.
- Process recurring and one-off salary adjustments (allowances, advances, or deductions).
- Execute monthly payroll runs, locking transactions after approval.
- Generate standard PDF payslips with security protections.
- Export direct banking payment files (bank transfer text files).

## 3. PAYROLL PROCESSING WORKFLOW
```
Open Payroll Period ➔ Fetch Base Contracts ➔ Apply Approved Overtimes & Deductions ➔ Calculate Taxes 
  ➔ Reconcile Payroll Draft ➔ Finance Review ➔ Manager Approval ➔ Lock Period ➔ Generate Payslips ➔ GL Posting
```

## 4. DATABASE DESIGN
### PayrollPeriod
- `PeriodID` (PK, UUID)
- `Name` (String, e.g., "August 2026")
- `StartDate` (Date)
- `EndDate` (Date)
- `Status` (Enum: OPEN, DRAFT_RECONCILED, APPROVED, LOCKED)
- `CreatedBy` (FK to User)
- `ApprovedBy` (FK to User, Nullable)

### SalaryStructure
- `StructureID` (PK, UUID)
- `EmployeeID` (FK)
- `BasicSalary` (Decimal)
- `MedicalAidAllowance` (Decimal, Default: 0)
- `TransportAllowance` (Decimal, Default: 0)
- `HousingAllowance` (Decimal, Default: 0)
- `PensionsDeduction` (Decimal, Default: 0)
- `IsActive` (Boolean)

### EmployeePayslip
- `PayslipID` (PK, UUID)
- `PeriodID` (FK)
- `EmployeeID` (FK)
- `BasicPay` (Decimal)
- `TotalAllowances` (Decimal)
- `GrossPay` (Decimal)
- `PAYETax` (Decimal)
- `AIDSLevy` (Decimal)
- `NSSADeduction` (Decimal)
- `OtherDeductions` (Decimal)
- `NetPay` (Decimal)
- `IsDisbursed` (Boolean)
- `DisbursementDate` (Date, Nullable)

### PayslipLineItem
- `LineItemID` (PK, UUID)
- `PayslipID` (FK)
- `Name` (String, e.g., "Overtime 1.5x", "Salary Advance")
- `Type` (Enum: ALLOWANCE, DEDUCTION)
- `Amount` (Decimal)

## 5. BUSINESS RULES
1. Immutable Locked Period: No updates can be made to payslips or salary inputs once a `PayrollPeriod` transitions to `LOCKED`.
2. Tax Calculation Fidelity: Tax calculations must be programmatically derived from standard statutory tax bands without manual overrides inside the payslip calculation.
3. Separation of Duties: The user who processes the payroll run cannot be the same user who authorizes and locks the period.
4. Single Payslip Restriction: An employee can only have one payslip per active `PayrollPeriod`. The database must enforce a unique constraint on `(PeriodID, EmployeeID)`.

## 6. USER INTERFACE
### Payroll Processing Panel
- Master table showing active employees, gross pay, deductions, net pay, and calculation status.
- Summary block detailing total company payroll cost, tax liabilities, and pension totals.
- Action triggers: "Run Calculations", "Reconcile Adjustments", "Submit for Approval", "Lock & Finalize".

### Payslip Configuration Portal
- Detailed itemized view of an employee's selected calculation.
- Manual adjustment drawer allowing processors to add approved allowances or deductions.

## 7. SUGGESTED API ENDPOINTS
- `POST /api/payroll/periods`
- `POST /api/payroll/periods/{id}/calculate`
- `PUT /api/payroll/periods/{id}/approve`
- `GET /api/payroll/periods/{id}/payslips`
- `POST /api/payroll/payslips/{id}/adjustments`

## 8. SECURITY AND ACCESS CONTROL
- **Payroll Officer**: Permitted: Draft payroll runs, input allowances/deductions, reconcile payslip balances, export draft reports. Denied: Approve payroll calculations, modify tax tables, lock periods.
- **Finance Manager / Controller**: Permitted: Approve payroll runs, edit salary base structures, execute period locks, post payroll journals to the General Ledger.

## 9. AUDIT LOG SPECIFICATION
Log: `PAYROLL_RUN_STARTED`, `PAYSLIP_ADJUSTED`, `PAYROLL_LOCKED` (storing total net pay, total tax, and total deductions), `SALARY_STRUCTURE_EDITED`.

## 10. KEY DESIGN PRINCIPLE
Reconciliation security. Payroll must be backed by a dual-stage review process. Every payroll run must balance out to the cent against the General Ledger salary expense account.\n