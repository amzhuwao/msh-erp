# MODULE 15 — GUEST SERVICES TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Guest Services Module manages auxiliary hospitality offerings, including Guest Laundry, Room Service orders, Shuttle/Valet logs, and Concierge tasks, ensuring all charges are tracked and routed to guest folios.

The module integrates with:
- Front Office (verifying in-house status and routing auxiliary charges directly to active folios)
- Restaurant POS (sending food-related room service orders to the kitchen)
- Notifications (alerting guests when services are completed)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Log laundry orders, detailing counts, clothing items, and service urgency (normal vs express).
- Process room service orders, printing receipts and tracking delivery state.
- Log airport transfers and shuttle collections on a central transit schedule.
- Dispatch concierge and guest service requests (e.g., wake-up calls, extra blankets, luggage assist) to runners.
- Automatically calculate taxes and post charges to active folios on task completion.

## 3. GUEST SERVICE LIFE CYCLE
```
Service Logged ➔ Task Dispatched to runner ➔ Action In-Progress ➔ Completed ➔ Charge Posted to Folio ➔ Closed
```

## 4. DATABASE DESIGN
### GuestServiceOrder
- `OrderID` (PK, UUID)
- `ServiceNumber` (Unique, e.g., GSO-2026-0045)
- `ReservationID` (FK)
- `ServiceType` (Enum: LAUNDRY, ROOM_SERVICE, TRANSIT, CONCIERGE, OTHERS)
- `RunnerUserID` (FK to User, Nullable)
- `Status` (Enum: RECEIVED, DISPATCHED, IN_PROGRESS, COMPLETED, CANCELLED)
- `TotalCharge` (Decimal, Default: 0)
- `SpecialInstructions` (Text, Optional)
- `CreatedAt` (Timestamp)

### LaundryItemLine
- `LineID` (PK, UUID)
- `OrderID` (FK)
- `ItemName` (String, e.g., "Suit Jacket", "Dress")
- `Quantity` (Integer)
- `UnitPrice` (Decimal)
- `ServiceOption` (Enum: WASH_AND_FOLD, IRON, DRY_CLEAN)

### TransitLog
- `TransitLogID` (PK, UUID)
- `OrderID` (FK)
- `PassengerName` (String)
- `TransitType` (Enum: AIRPORT_PICKUP, SHUTTLE_DROP, TOURS)
- `ScheduledTime` (Timestamp)
- `DriverUserID` (FK to User)
- `VehiclePlateNumber` (String)

## 5. BUSINESS RULES
1. Folio Status Validation: Charges for guest services must be blocked if the corresponding guest's reservation status is not CHECKED_IN, or if the guest's folio has been set to "Cash Only" and does not have sufficient credit.
2. Room Service Kitchen Routing: Room Service food and beverage items must be generated as POS orders in the background to automatically trigger KOT printing in the kitchen.
3. Service Delivery SLA: Concierge requests marked as high priority must generate visual red alerts on the Duty Manager's dashboard if they remain unresolved for more than 15 minutes.
4. Auto-posting: When a GuestServiceOrder status moves to COMPLETED, the system must post the `TotalCharge` to the guest's active `FolioID`.

## 6. USER INTERFACE
### Guest Services Central Panel
- Central log listing active services (color-coded by type: Blue = Laundry, Red = Room Service, Green = Transit).
- Task allocation grid: Drag and drop orders to active drivers or runners.
- Wake-up calls tracker displaying active alarms by room number and time.

### Runner Mobile App Layout (Mobile Web View)
- Simple queue for runners to swipe task milestones (Accept Task, Start, Mark Done).

## 7. SUGGESTED API ENDPOINTS
- `POST /api/services/orders`
- `PUT /api/services/orders/{id}/assign`
- `PUT /api/services/orders/{id}/status`
- `POST /api/services/transit/schedule`
- `GET /api/services/active-requests`

## 8. SECURITY AND ACCESS CONTROL
- **Runner / Driver**: Permitted: View assigned orders, update order status to IN_PROGRESS and COMPLETED. Denied: Create service items, alter billing prices, delete service histories.
- **Reception / Concierge Supervisor**: Permitted: All runner actions + log new services, adjust prices, cancel orders, assign runners, reverse mistaken service charges.

## 9. AUDIT LOG SPECIFICATION
Log: `SERVICE_ORDER_CREATED`, `RUNNER_ASSIGNED`, `GUEST_WAKEUP_LOGGED`, `SERVICE_CHARGE_POSTED`.

## 10. KEY DESIGN PRINCIPLE
Uncompromised guest service. Every request must be structured, dispatched, tracked against delivery time targets, and securely billed to prevent leakage.\n