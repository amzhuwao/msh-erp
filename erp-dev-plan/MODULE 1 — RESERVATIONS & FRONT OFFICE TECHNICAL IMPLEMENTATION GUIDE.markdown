# MODULE 1 — RESERVATIONS & FRONT OFFICE TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Reservations & Front Office Module manages the individual guest booking lifecycle, room assignments, check-in/check-out processes, guest profile histories, and the core Guest Folio ledger. It functions as the primary operational engine of the PMS.

The module integrates with:
- Housekeeping (room status locks)
- Restaurant & Bar POS (room charge posting)
- Corporate Clients & Accounts (contracted rates)
- Revenue Management (rate plans and seasonal rates)
- Finance & Accounting (folio closures, payments, and general ledger posting)
- Notifications (email/SMS confirmations)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Perform rapid room availability searches based on dates and capacities.
- Create, modify, and cancel individual reservations.
- Manage a centralized Guest Profile database with VIP status and history.
- Assign physical rooms dynamically or block rooms during booking.
- Execute guest check-ins (requiring ID capture and registration card).
- Process room transfers (moving a guest from one room to another).
- Manage Guest Folios, posting manual charges and adjusting errors.
- Execute check-outs, enforcing zero-balance rules prior to departure.
- Perform the Night Audit to close the operational business day.

## 3. BOOKING LIFECYCLE
```
Enquiry ➔ Availability Check ➔ Tentative Booking ➔ Deposit Pending ➔ Confirmed 
  ➔ Room Allocated ➔ Arrived/Check-In ➔ In-House ➔ Check-out Processing ➔ Folio Settled ➔ Closed
```

## 4. DATABASE DESIGN
### Reservation
- `ReservationID` (PK, UUID)
- `ReservationNumber` (Unique string, e.g., MSV-RES-2026-0001)
- `GuestID` (FK)
- `CompanyID` (FK, Optional)
- `RatePlanID` (FK)
- `RoomID` (FK, Nullable until allocation)
- `CheckInDate` (Date)
- `CheckOutDate` (Date)
- `Adults` (Integer)
- `Children` (Integer)
- `Status` (Enum: TENTATIVE, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW)
- `SpecialRequests` (Text)
- `CreatedBy` (FK to User)
- `CreatedDate` (Timestamp)
- `UpdatedDate` (Timestamp)

### Guest
- `GuestID` (PK, UUID)
- `FirstName` (String)
- `LastName` (String)
- `Email` (String, Unique)
- `Phone` (String)
- `Nationality` (String)
- `NationalID` (String, Optional)
- `PassportNumber` (String, Optional)
- `VIPStatus` (Enum: NONE, VIP1, VIP2, VIP3)
- `Notes` (Text)

### ReservationStatusHistory
- `HistoryID` (PK, UUID)
- `ReservationID` (FK)
- `OldStatus` (Enum)
- `NewStatus` (Enum)
- `ChangedBy` (FK to User)
- `ChangeReason` (String)
- `Timestamp` (Timestamp)

## 5. BUSINESS RULES
1. Check-In Date must be strictly less than Check-Out Date.
2. Room allocations must not overlap. The system must reject room assignments if the selected RoomID is associated with another active reservation during the same period.
3. Identity verification (National ID or Passport) must be recorded before reservation status can transition to CHECKED_IN.
4. No manual changes can be made to a Folio once a reservation transitions to CLOSED. Any corrections must use post-departure adjustment entries.
5. Cancellations must be logged with a system-defined cancellation reason.

## 6. USER INTERFACE
### Front Office Dashboard
- **Room Grid / Tape Chart**: Interactive calendar displaying rooms and bookings.
- **Search Widget**: Check availability by date range, room type, and capacity.
- **Arrivals Tab**: List of expected arrivals today with quick check-in actions.
- **Departures Tab**: List of expected departures with outstanding folio balances.
- **In-House Guests**: Searchable list of current guests by room number, name, or company.

### Guest Folio Panel
- **Split-Screen Interface**: Left side displays itemized charges; right side displays payments and credits.
- **Folio Actions**: "Post Charge", "Make Payment", "Transfer Charge", "Split Folio", "Generate Pro Forma Invoice".

## 7. NIGHT AUDIT PROCESS
The Night Audit is a critical automated and manual sequence run at the end of every business day (e.g., 2:00 AM).
### Sequence
1. **Validate Departures**: Identify scheduled check-outs who have not left. Display exception list.
2. **Validate Arrivals**: Identify scheduled check-ins who have not arrived. Mark remaining un-flagged bookings as NO_SHOW based on cancellation policy.
3. **Post Room Charges**: System automatically generates and posts room charges and taxes to all active in-house reservations' folios.
4. **Reconcile POS**: Verify all POS registers are closed and balanced.
5. **Close Business Date**: Roll system date forward to the next calendar day.
6. **Generate Financial Reports**: Export Daily Manager's Report, Occupancy Summary, and Revenue Ledger.

## 8. WORKFLOW ENGINE
- **Walk-In Guest**: Receptionist checks availability ➔ Enters guest details ➔ Creates Guest Profile ➔ Allocates room ➔ Processes immediate payment/deposit ➔ Checks in guest ➔ Changes room state to OCCUPIED.
- **Pre-booked Guest Check-in**: Receptionist retrieves reservation ➔ Validates details ➔ Swipes/uploads Guest ID ➔ Auto-prints registration card ➔ Assigns physical room keys ➔ Clicks "Check-In" ➔ System updates Reservation status to CHECKED_IN.

## 9. SPLIT BILLING LOGIC
If a guest reservation is linked to a Company ID, the system checks the billing instructions:
- **Rule A**: Route Accommodation + Tax to Company Master Folio; route personal charges (POS, laundry) to Guest Personal Folio.
- **Rule B**: Route all charges to Company Master Folio up to a configured credit limit.
- Rules must be configured *prior* to check-in.

## 10. OTHER MODULES INTEGRATIONS
- **Housekeeping**: The front office room selection panel must display the current cleanliness state (VACANT_CLEAN, VACANT_DIRTY, INSPECTED). Only INSPECTED rooms are eligible for assignment during check-in.
- **Finance**: Every post-charge or payment action must post balanced double-entry adjustments to the guest ledger.
- **POS**: POS systems query `/api/rooms/{number}/active-folio` to confirm guest status prior to room charge postings.

## 11. SECURITY AND ACCESS CONTROL
- **Receptionist**: Permitted: View tape chart, Create Reservation, Process Check-in, Post Charges. Denied: Delete transactions, modify rates, bypass credit limit checks.
- **Front Office Supervisor**: Permitted: All receptionist actions + rate overrides, manual room status overrides, post-audit folio adjustments.
- **Finance Controller**: Permitted: Post financial corrections, approve write-offs, configure rate plan bases.

## 12. AUDIT LOG SPECIFICATION
Every change to a Reservation record must write to the `AuditLog` table.
- Action types: `RESERVATION_CREATE`, `RESERVATION_CANCEL`, `ROOM_TRANSFER`, `RATE_OVERRIDE`, `FOLIO_CHARGE_POST`, `PAYMENT_RECORD`.

## 13. SUGGESTED API ENDPOINTS
- `GET /api/reservations/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`
- `POST /api/reservations`
- `POST /api/reservations/{id}/checkin`
- `POST /api/reservations/{id}/checkout`
- `POST /api/reservations/{id}/transfer-room`
- `POST /api/folios/{id}/charges`
- `POST /api/folios/{id}/payments`

## 14. RECOMMENDED ADVANCED FEATURES
- **Queue Management**: Handling early arrivals by assigning rooms to a prioritized cleaning queue.
- **Room Key Integration**: API hooks to electronic key-card encoders (e.g., VingCard/Salto).
- **Automatic Upgrades**: Recommendation engine when a guest's reserved room type is unavailable, offering higher categories without charging additional fees.

## 15. KEY DESIGN PRINCIPLE
The Front Office module owns the "Room State" and the "Guest State". It must act as the primary gatekeeper for financial transactions posted to active guests.
