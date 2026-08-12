# MODULE 5 — CONFERENCE & EVENTS TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Conference & Events Module governs the reservation, planning, scheduling, and billing of banquet halls, meeting rooms, outdoor event spaces, catering packages, and auxiliary audio-visual resources. 

The module integrates with:
- Group Reservations (linking major events directly to room block bookings)
- Restaurant POS & Kitchen (providing meal packages, menu configurations, and banquet pax counts)
- Inventory & Stores (tracking non-perishable store items, beverage crates, and event decor consumables)
- Finance & Accounting (direct event invoicing, deposit tracking, and banquet revenue allocation)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Establish a register of physical event venues and conference rooms with capacity configurations based on setup styles (e.g., U-shape, Boardroom, Banquet, Cinema).
- Create and manage event enquiries, turning them into formal event proposals and quotations.
- Place tentative blocks on venues with a configurable auto-release expiry time.
- Book catering packages (including half-day, full-day, and custom meal configurations).
- Rent out auxiliary equipment and resources (projectors, microphones, PA systems, flip charts).
- Generate run-sheets (detailed timelines) for Banqueting, Kitchen, and IT coordinators.
- Process event billing, split charges, and consolidate totals into Master Folios.

## 3. EVENT BOOKING LIFECYCLE
```
Enquiry ➔ Proposal/Quotation ➔ Tentative Block ➔ Deposit Payment ➔ Confirmed ➔ Run-Sheet Generated 
  ➔ Resource Allocation ➔ Event In-Progress ➔ Consumption Logging ➔ Invoice Finalization ➔ Closed
```

## 4. DATABASE DESIGN
### ConferenceVenue
- `VenueID` (PK, UUID)
- `Name` (String, Unique)
- `LocationDescription` (String)
- `MaxCapacityBanquet` (Integer)
- `MaxCapacityCinema` (Integer)
- `MaxCapacityBoardroom` (Integer)
- `HalfDayRate` (Decimal)
- `FullDayRate` (Decimal)
- `IsActive` (Boolean)

### ConferenceBooking
- `ConferenceBookingID` (PK, UUID)
- `GroupReservationID` (FK, Optional - links to Master Group)
- `BookingNumber` (Unique string, e.g., EVT-2026-00041)
- `ContactName` (String)
- `CompanyID` (FK, Optional)
- `VenueID` (FK)
- `StartTimestamp` (Timestamp)
- `EndTimestamp` (Timestamp)
- `SetupStyle` (Enum: BANQUET, BOARDROOM, USHAPE, CINEMA)
- `EstimatedPax` (Integer)
- `ActualPax` (Integer, Nullable)
- `Status` (Enum: TENTATIVE, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED)
- `DepositRequired` (Decimal)
- `DepositPaid` (Decimal)
- `BaseVenueCost` (Decimal)
- `TotalAmount` (Decimal)
- `CreatedBy` (FK to User)
- `CreatedAt` (Timestamp)

### ConferencePackage
- `PackageID` (PK, UUID)
- `Name` (String, e.g., "Full Day Conference Package", "Platinum Wedding Package")
- `RatePerPax` (Decimal)
- `Details` (JSON detailing breakfast, teas, lunch, and standard venue inclusions)
- `IsActive` (Boolean)

### ConferenceResource
- `ResourceID` (PK, UUID)
- `Name` (String, e.g., "Wireless Mic", "Laser Projector")
- `TotalInventoryCount` (Integer)
- `DailyRentalRate` (Decimal)
- `Category` (Enum: AV, FURNITURE, DECOR, IT)

### ConferenceResourceAllocation
- `AllocationID` (PK, UUID)
- `ConferenceBookingID` (FK)
- `ResourceID` (FK)
- `QuantityAllocated` (Integer)
- `ChargedRate` (Decimal)
- `Subtotal` (Decimal)

## 5. BUSINESS RULES
1. Double Booking Prevention: The system must execute database transaction checks immediately prior to saving a booking. The same physical VenueID cannot be allocated to overlapping timeframes for bookings with a status of TENTATIVE or CONFIRMED.
2. Over-Allocation of Shared Equipment: The cumulative QuantityAllocated of any ConferenceResource across all active events on a specific day must not exceed the resource's configured TotalInventoryCount.
3. Deposit Deadlines: Tentative bookings must automatically revert to a status of CANCELLED and release the venue block if the DepositRequired is not received by a configurable date offset (e.g., 7 days prior to start date).
4. Run-Sheet Locking: Once an event moves to IN_PROGRESS or COMPLETED, the configuration of run-sheets and venue rates must lock, allowing adjustments only through financial correction journal flows.

## 6. USER INTERFACE
### Interactive Event Calendar
- Gantt-style daily, weekly, and monthly view of all event spaces.
- Drag-and-drop mechanics to shift bookings between times or venues (triggering immediate conflict checking).
- Visual coloring highlighting booking status (Yellow = Tentative, Green = Confirmed, Blue = In-Progress).

### Event Builder Wizard
- Single-page view comprising: Contact Info, Venue Selection, Setup Style, Pax Input, Package Selection, Equipment Checklist, and a Billing Summary block.

### Kitchen Banquet Run-Sheet
- A specific view sorting expected events by meal times, detailing dietary requirements, package configurations, and estimated/confirmed meal counts.

## 7. THE DOUBLE-BOOKING CONFLICT ALGORITHM
The system must validate date overlaps prior to committing:
```sql
SELECT COUNT(*) FROM "ConferenceBooking"
WHERE "VenueID" = :selected_venue_id
  AND "Status" IN ('TENTATIVE', 'CONFIRMED', 'IN_PROGRESS')
  AND (
    (:start_time < "EndTimestamp" AND :end_time > "StartTimestamp")
  )
  AND "ConferenceBookingID" != :exclude_booking_id;
```
If the count returns greater than zero, the system aborts the reservation attempt and triggers error code `EVT-001` (Venue Already Booked).

## 8. SUGGESTED API ENDPOINTS
- `GET /api/conference/availability?venueId=ID&start=TS&end=TS`
- `POST /api/conference/bookings`
- `PUT /api/conference/bookings/{id}/confirm`
- `POST /api/conference/bookings/{id}/resources`
- `GET /api/conference/kitchen-summary?date=YYYY-MM-DD`
- `GET /api/conference/packages`

## 9. SECURITY AND ACCESS CONTROL
- **Events Coordinator**: Permitted: Create bookings, update packages, configure setup styles, generate run-sheets. Denied: Authorize complimentary spaces, bypass automatic conflict warnings, waive deposit requirements.
- **Banqueting / F&B Manager**: Permitted: View run-sheets, log actual consumption quantities, authorize equipment issues.
- **General Manager**: Permitted: Approve zero-deposit bookings, override booking overlaps, approve multi-event corporate discounts.

## 10. AUDIT LOG SPECIFICATION
Log: `EVENT_COMPLETED`, `OVERLAP_BYPASS_GM`, `VENUE_COMPLIMENTARY_GRANTED`, `MEAL_COUNT_ADJUSTED`.

## 11. KEY DESIGN PRINCIPLE
Accurate resource scheduling. A conference booking is a high-cost operational asset. The system must prevent over-allocations of venues, personnel, food supplies, and hardware to ensure standard operational performance.
