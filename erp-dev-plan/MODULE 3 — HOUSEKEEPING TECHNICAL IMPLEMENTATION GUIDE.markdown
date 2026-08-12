# MODULE 3 — HOUSEKEEPING TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Housekeeping Module manages the cleanliness status of rooms, coordinates task assignments for cleaning staff, monitors physical linen and cleaning supply inventories, and tracks Lost & Found items.

The module integrates with:
- Front Office (live room status changes)
- Maintenance (automatic logging of room defects found during cleaning)
- Inventory & Stores (consumption of cleaning supplies)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Monitor a real-time grid of all hotel room cleaning statuses.
- Assign specific blocks of rooms to specific Room Attendants.
- Record cleaning inspections and update room statuses.
- Log, search, and manage Lost & Found entries.
- Initiate Out-of-Order (OOO) and Out-of-Service (OOS) room blocks.
- Track linen and guest amenity distribution.

## 3. ROOM CLEANING STATE MACHINE
```
OCCUPIED_DIRTY / VACANT_DIRTY ➔ CLEANING_IN_PROGRESS ➔ VACANT_CLEAN ➔ INSPECTED
```
*If inspection fails:* `INSPECTED` reverts back to `VACANT_DIRTY` with supervisor feedback logs.

## 4. DATABASE DESIGN
### RoomCleanLog
- `LogID` (PK, UUID)
- `RoomID` (FK)
- `AttendantUserID` (FK)
- `SupervisorUserID` (FK, Nullable)
- `StartTime` (Timestamp)
- `EndTime` (Timestamp, Nullable)
- `InitialStatus` (Enum: RoomStatus)
- `TargetStatus` (Enum: RoomStatus)
- `InspectionPassed` (Boolean, Nullable)
- `RejectionNotes` (Text, Nullable)

### HousekeepingAssignment
- `AssignmentID` (PK, UUID)
- `Date` (Date)
- `RoomID` (FK)
- `AttendantUserID` (FK)
- `Status` (Enum: PENDING, IN_PROGRESS, COMPLETED)

### LostAndFound
- `ItemID` (PK, UUID)
- `ItemDescription` (String)
- `LocationFound` (String, e.g., Room 102)
- `DateFound` (Date)
- `FoundBy` (FK to User or String)
- `Status` (Enum: CLAIMED, UNCLAIMED, DISPOSED, DONATED)
- `ClaimedBy` (String, Nullable)
- `ClaimedDate` (Date, Nullable)
- `StorageLocation` (String)

## 5. BUSINESS RULES
1. Front Office cannot assign a room to a checking-in guest unless its current database status is exactly INSPECTED.
2. A Room Attendant can transition a room to VACANT_CLEAN, but only an authorized Housekeeping Supervisor can transition it to INSPECTED.
3. If an attendant encounters a broken fixture, they can flag the room as MAINTENANCE. The system must automatically generate a draft Maintenance Ticket linked to that room.
4. An Out-of-Order (OOO) room status subtracts the room from the hotel's available inventory calculations (affecting occupancy calculations). An Out-of-Service (OOS) status retains the room in inventory metrics but prevents assignment.

## 6. USER INTERFACE
### Housekeeping Mobile View (Tablet/Phone Optimized)
- Attendant dashboard showing assigned rooms.
- Tap to "Start Cleaning" (launches timer).
- Tap to "Finish Cleaning" (sets state to VACANT_CLEAN, alerts supervisor).
- "Report Issue" button (triggers structural camera/text input for maintenance logs).

### Supervisor Dashboard
- Global status grid displaying rooms by floor/wing.
- Queue of rooms waiting for inspection.
- Bulk-assignment tool: drag-and-drop rooms to assign to specific attendants.
- Lost & Found logging panel.

## 7. INTEGRATION FLOWS
- **Housekeeping Stock Consumption**: Attendant completes daily shift assignment ➔ System calculates standard issue consumption (e.g., 2 shampoos, 1 soap, 2 toilet rolls per room cleaned) ➔ Generates draft stock issue voucher in the Inventory Module for authorization.

## 8. SUGGESTED API ENDPOINTS
- `GET /api/housekeeping/dashboard`
- `POST /api/housekeeping/assign-rooms`
- `PUT /api/housekeeping/rooms/{id}/status`
- `POST /api/housekeeping/lost-and-found`
- `POST /api/housekeeping/rooms/{id}/report-defect`

## 9. SECURITY AND ACCESS CONTROL
- **Room Attendant**: Permitted: View assigned rooms, update status from DIRTY to CLEANING to VACANT_CLEAN, submit lost and found. Denied: Inspect rooms, modify system room configurations, remove lost and found records.
- **Housekeeping Supervisor**: Permitted: All attendant actions + room assignments, status inspections (INSPECTED transition), OOO overrides, release Lost & Found items.

## 10. AUDIT LOG SPECIFICATION
All room state changes must write to the `AuditLog` table containing previous state, new state, user ID, and timestamp.

## 11. KEY DESIGN PRINCIPLE
Minimize physical communication bottlenecks. The system must operate dynamically so that the moment a supervisor clicks "Inspect" on their tablet, the front desk receptionist can immediately allocate the room to a guest standing in the lobby.
