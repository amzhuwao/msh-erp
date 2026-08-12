# MODULE 2 — GROUP RESERVATIONS TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Group Reservation Module allows the hotel to manage multiple reservations under a single booking while maintaining individual guest records, room assignments, billing, and operational workflows.

The module integrates with:
- Front Office
- Housekeeping
- Restaurant POS
- Conference Management
- Inventory
- Finance
- CRM
- Reporting
- Notification System

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Create group enquiries.
- Convert enquiries into quotations.
- Confirm bookings.
- Reserve multiple rooms.
- Allocate rooms.
- Register individual guests.
- Split billing.
- Manage deposits.
- Generate invoices.
- Track arrivals and departures.
- Produce management reports.

## 3. BOOKING LIFECYCLE
```
Enquiry ➔ Availability Check ➔ Quotation ➔ Client Approval
  ➔ Confirmed Booking ➔ Room Allocation ➔ Guest Registration
  ➔ Check-in ➔ In House ➔ Check-out ➔ Closed
```

## 4. DATABASE DESIGN
### GroupReservation
- `GroupReservationID` (PK, UUID)
- `GroupCode` (String, Unique)
- `CompanyID` (FK)
- `GroupName` (String)
- `ContactPerson` (String)
- `Phone` (String)
- `Email` (String)
- `ArrivalDate` (Date)
- `DepartureDate` (Date)
- `Adults` (Integer)
- `Children` (Integer)
- `RoomCount` (Integer)
- `Status` (Enum: TENTATIVE, CONFIRMED, CLOSED, CANCELLED)
- `DepositAmount` (Decimal)
- `Balance` (Decimal)
- `CreatedBy` (FK to User)
- `CreatedDate` (Timestamp)
- `UpdatedDate` (Timestamp)

### GroupGuest
- `GuestID` (PK, UUID)
- `GroupReservationID` (FK)
- `ReservationID` (FK, Optional)
- `FullName` (String)
- `Nationality` (String)
- `NationalID` (String, Optional)
- `PassportNo` (String, Optional)
- `RoomNumber` (String, Optional)
- `CheckInStatus` (Enum: PENDING, CHECKED_IN, CHECKED_OUT)
- `CheckOutStatus` (Enum: PENDING, COMPLETED)
- `VIPStatus` (Enum: NONE, VIP)

### GroupRoom
- `RoomAllocationID` (PK, UUID)
- `GroupReservationID` (FK)
- `RoomID` (FK)
- `RoomType` (String)
- `Rate` (Decimal)
- `Status` (Enum: BLOCKED, ALLOCATED)
- `AssignedGuest` (String)

### GroupCharge
- `ChargeID` (PK, UUID)
- `GroupReservationID` (FK)
- `GuestID` (FK, Optional)
- `ChargeType` (String)
- `Amount` (Decimal)
- `PaidBy` (Enum: MASTER, GUEST, COMPANY, SPONSOR)
- `ChargeDate` (Date)

### GroupInvoice
- `InvoiceID` (PK, UUID)
- `GroupReservationID` (FK)
- `InvoiceType` (String)
- `Amount` (Decimal)
- `Outstanding` (Decimal)
- `Status` (Enum: UNPAID, PAID, PARTIAL)

## 5. BUSINESS RULES
1. Arrival date must be earlier than departure date.
2. Requested rooms cannot exceed available capacity.
3. Rooms cannot be double-booked for overlapping dates.
4. Each guest may only belong to one active room at a time.
5. Required guest identification and profile information must be captured before check-in.
6. A master booking cannot be fully checked out while active guests remain unless an authorized override is used.

## 6. USER INTERFACE
### Group Reservations Dashboard
- Key metrics: Today's arrivals, today's departures, pending quotations, confirmed groups, cancelled groups, group revenue, group occupancy, outstanding deposits.

### New Group Reservation Form
- Form fields: Group Name, Company, Contact Person, Phone, Email, Arrival Date, Departure Date, Adults, Children, Rooms Required, Special Requests, and integration requests (Conference, F&B, Transport).
- Action buttons: "Check Availability", "Save Draft", "Create Quote", "Cancel".

### Availability Matrix & Room Allocation Panel
- Visual matrix comparing requested rooms with actual available stock.
- Dynamic drag-and-drop workspace linking unassigned imported guests with blocked available rooms.

## 7. EXCEL ROOMING-LIST IMPORT
Supported fields: Guest Name, Gender, Nationality, National ID, Passport, Room Type, VIP, Special Notes.
### Import Process
1. Download approved template.
2. Complete guest information.
3. Upload file.
4. Validate rows.
5. Display errors.
6. Correct/remove invalid rows.
7. Import valid guests and link them to the master group reservation.
The system must prevent duplicate guests and duplicate room assignments.

## 8. WORKFLOW ENGINE
Sales prepares quote ➔ Client accepts ➔ Booking confirmed ➔ Deposit requested ➔ Deposit received ➔ Rooms blocked ➔ Guest list received ➔ Rooms allocated ➔ Arrival ➔ Check-in ➔ Charges posted ➔ Checkout ➔ Invoice generated ➔ Booking closed.

## 9. SPLIT BILLING LOGIC
Company may pay accommodation, conference, and breakfast. Guests pay personal bar, laundry, and mini-bar charges. The system must automatically route transactions to the guest's personal folio or the group's master folio based on these rules.

## 10. OTHER MODULE INTEGRATIONS
- **Housekeeping**: Receives automated summaries of expected arrivals, rooms, VIP profiles, and setup demands. Updates state dynamically during bulk arrivals and check-outs.
- **Restaurant**: Distributes breakfast, lunch, and dinner package logs directly to kitchen and dining panels.
- **Conference**: Blocks conference venues and shared hardware assets to prevent scheduling conflicts.
- **Finance**: Auto-posts invoice entries and monitors outstanding credit risks against active limits.

## 11. SECURITY AND ACCESS CONTROL
- **Sales**: Permitted: Create groups, edit quotations, view availability. Denied: Perform final check-in, authorize rate changes.
- **Reception**: Permitted: Check-in/out guests, allocate rooms. Denied: Modify negotiated group rates.
- **Finance**: Permitted: Process group payments, balance folios, issue pro formas. Denied: Modify guest identities.

## 12. AUDIT LOG SPECIFICATION
Any structural alteration must create a log including: Group creation, group editing, rate changes, discount changes, room allocations, check-ins, payments, invoice overrides, and permission overrides.

## 13. SUGGESTED API ENDPOINTS
- `POST /api/group-reservations`
- `GET /api/group-reservations/{id}`
- `PUT /api/group-reservations/{id}`
- `POST /api/group-reservations/{id}/confirm`
- `POST /api/group-reservations/{id}/import-rooming-list`
- `GET /api/group-reservations/{id}/folio`

## 14. RECOMMENDED ADVANCED FEATURES
- **Automated Reassignment**: Dynamic shifting of rooms if an operational emergency causes an allocated room to go out-of-order.
- **Auto-Release Policy**: Automatic release of tentative group room blocks if the contract deposit is not recorded by the defined deadline.

## 15. KEY DESIGN PRINCIPLE
The Group Reservation ID must act as the primary master transaction key linking guests, rooms, accounts, and events across all operational systems.
