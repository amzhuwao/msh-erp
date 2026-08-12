# MODULE 9 — HUMAN RESOURCES (HR) TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Human Resources Module administers employee lifecycles, contract records, department allocations, leave configurations, attendance logs, and disciplinary tracking within a unified and highly restricted database schema.

The module integrates with:
- Payroll (providing active employee hours, salaries, and approved leave details)
- System Administration (mapping system users to concrete employee records)
- Security & Access Control (defining departmental visibility and data policies)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized HR users to:
- Establish employee profiles detailing contact information, banking details, and statutory numbers.
- Manage employment contracts (probationary, permanent, fixed-term) and track expiry periods.
- Map organizational structures by assigning employees to departments and job roles.
- Process digital Leave Requests, automating balance deductions based on leave types (annual, sick, study).
- Track daily shifts and logs via attendance integration nodes.
- Log and audit employee disciplinary actions and performance evaluations.

## 3. EMPLOYEE LIFECYCLE STATE MACHINE
```
Onboarding ➔ Probation ➔ Active Status (Permanent / Contracted) ➔ Leave/Suspension Status ➔ Resigned/Terminated
```

## 4. DATABASE DESIGN
### Employee
- `EmployeeID` (PK, UUID)
- `FirstName` (String)
- `LastName` (String)
- `Email` (String, Unique)
- `Phone` (String)
- `DepartmentID` (FK)
- `PositionID` (FK)
- `HireDate` (Date)
- `Status` (Enum: ONBOARDING, PROBATION, ACTIVE, SUSPENDED, TERMINATED, RESIGNED)
- `NSSANumber` (String, Optional)
- `TaxNumber` (String, Optional)
- `BankName` (String)
- `BankAccountNumber` (String)
- `BankBranchCode` (String)
- `CreatedAt` (Timestamp)

### EmploymentContract
- `ContractID` (PK, UUID)
- `EmployeeID` (FK)
- `ContractType` (Enum: FIXED_TERM, PERMANENT, CASUAL)
- `StartDate` (Date)
- `EndDate` (Date, Nullable)
- `BaseSalary` (Decimal)
- `ContractDocumentURL` (String, Optional)
- `IsActive` (Boolean)

### LeaveRequest
- `LeaveRequestID` (PK, UUID)
- `EmployeeID` (FK)
- `LeaveType` (Enum: ANNUAL, SICK, MATERNITY, COMPASSIONATE, STUDY)
- `StartDate` (Date)
- `EndDate` (Date)
- `TotalDays` (Integer)
- `Status` (Enum: PENDING, APPROVED_BY_DEPT, APPROVED_BY_HR, REJECTED)
- `ApprovedByUserID` (FK to User, Nullable)
- `RejectionReason` (String, Nullable)

### DisciplinaryRecord
- `RecordID` (PK, UUID)
- `EmployeeID` (FK)
- `OffenceDate` (Date)
- `HearingDate` (Date, Nullable)
- `ChargeDescription` (Text)
- `Outcome` (Enum: VERBAL_WARNING, WRITTEN_WARNING, FINAL_WARNING, SUSPENSION, TERMINATION, ACQUITTED)
- `RecordedByUserID` (FK to User)

## 5. BUSINESS RULES
1. Overlapping Leave Prohibition: An employee cannot have overlapping leave requests. The database layer must reject leave creation if the date range conflicts with an existing approved or pending record.
2. Leave Balance Validation: An employee cannot request paid annual leave exceeding their accrued current balance unless authorized by a senior HR manager override.
3. Contract Transition: Active contracts for the same employee cannot have overlapping validity dates.
4. Data Privacy: Employee statutory numbers, bank accounts, and disciplinary logs must be encrypted at rest and masked in UI views from non-HR roles.

## 6. USER INTERFACE
### HR Dashboard
- Interactive headcount analytics by department and role.
- Expiry timeline for fixed-term contracts (flagging alerts 30/60 days prior).
- Pending leave approvals queue grouped by department.
- Attendance exceptions log (late arrivals, unlogged shifts).

### Leave Request Portal
- Self-service widget displaying remaining leave balances by category.
- Simple date picker form auto-calculating total business days (excluding weekends and public holidays).

## 7. SUGGESTED API ENDPOINTS
- `POST /api/hr/employees`
- `GET /api/hr/employees/{id}/contracts`
- `POST /api/hr/leave/requests`
- `PUT /api/hr/leave/requests/{id}/approve`
- `POST /api/hr/disciplinary-records`

## 8. SECURITY AND ACCESS CONTROL
- **HR Officer**: Permitted: Create employee records, draft contracts, track attendance, log disciplinary items. Denied: Approve leave requests, delete records, modify base salary metrics on finalized contracts.
- **HR Manager**: Permitted: All HR Officer actions + approve leave, finalize contracts, execute disciplinary outcomes.
- **Finance Controller**: Permitted: View bank details and salaries for payroll matching. Denied: Modify employee profiles.

## 9. AUDIT LOG SPECIFICATION
Log: `EMPLOYEE_CREATED`, `CONTRACT_FINALIZED`, `LEAVE_APPROVED`, `DISCIPLINARY_LOGGED`.

## 10. KEY DESIGN PRINCIPLE
Strict identity confidentiality. All identity documents, medical details, and bank routing structures must be treated with robust access-control boundaries to prevent internal data exposure.\n