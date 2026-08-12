# MODULE 12 — SALES, MARKETING & CRM TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Sales, Marketing & CRM Module structures the acquisition, profile building, and relationship lifecycle of hotel leads, travel agencies, tour operators, and individual guests. It administers the sales pipeline, tracks sales activities, and manages the guest loyalty points engine.

The module integrates with:
- Front Office (pulling reservation histories and guest folio totals)
- Corporate Clients & Accounts (linking leads directly to organizational credit approvals)
- Notifications (email campaigns and promotional distributions)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized sales users to:
- Establish and track sales leads, opportunities, and deal values.
- Log sales calls, emails, meetings, and follow-ups.
- Manage loyalty card programs, computing and issuing points based on booking volumes.
- Group guest profiles into dynamic segmentations (e.g., Business, Leisure, Corporate).
- Configure marketing campaigns and track promotional conversions.
- Log and audit guest feedback, complaints, and service recoveries.

## 3. DEAL OPPORTUNITY LIFECYCLE
```
Lead Identified ➔ Qualified ➔ Proposal Offered ➔ Negotiation ➔ Closed Won / Closed Lost
```

## 4. DATABASE DESIGN
### SalesLead
- `LeadID` (PK, UUID)
- `CompanyName` (String, Optional)
- `ContactPerson` (String)
- `Email` (String)
- `Phone` (String)
- `Source` (Enum: WEBSITE, WALK_IN, COLD_CALL, AGENCY, EVENT)
- `EstimatedValue` (Decimal)
- `PipelineStage` (Enum: LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST)
- `AssignedSalesUserID` (FK to User)
- `CreatedAt` (Timestamp)

### SalesActivity
- `ActivityID` (PK, UUID)
- `LeadID` (FK)
- `ActivityType` (Enum: PHONE_CALL, EMAIL, MEETING, PRESENTATION)
- `Summary` (String)
- `ActivityDate` (Date)
- `FollowUpRequired` (Boolean)
- `FollowUpDate` (Date, Nullable)

### LoyaltyAccount
- `LoyaltyAccountID` (PK, UUID)
- `GuestID` (FK)
- `CardNumber` (String, Unique)
- `TierLevel` (Enum: BRONZE, SILVER, GOLD, PLATINUM)
- `TotalPointsAccrued` (Integer, Default: 0)
- `TotalPointsRedeemed` (Integer, Default: 0)
- `IsActive` (Boolean)

### GuestFeedback
- `FeedbackID` (PK, UUID)
- `GuestID` (FK)
- `ReservationID` (FK, Optional)
- `Score` (Integer, e.g., 1 to 10 scale)
- `Comments` (Text, Optional)
- `IsActionRequired` (Boolean, Default: false)
- `Status` (Enum: PENDING, UNDER_REVIEW, RESOLVED)
- `ResolutionNotes` (Text, Nullable)

## 5. BUSINESS RULES
1. Loyalty Accrual Rule: Loyalty points are only calculated and credited to a guest's balance *after* the corresponding reservation has successfully transitioned to `CHECKED_OUT` with a zero balance.
2. Escalation of Complaints: Any `GuestFeedback` record marked with `IsActionRequired` and containing a rating below 4 out of 10 must automatically flag an emergency task for the Duty Manager.
3. Duplicate Lead Block: The system must reject new lead creations if there is an active opportunity using the exact same Company Name or Email within the last 90 days.

## 6. USER INTERFACE
### CRM & Sales Pipeline Board
- Kanban-style workspace categorized by pipeline stages (Lead, Proposal, etc.). Drag cards to transition deal states.
- Follow-up alerts widget flagging leads with pending activities.

### Guest Loyalty Hub
- Unified view of guest profile, total bookings count, average daily rate (ADR), points ledger, and redemption logs.

## 7. SUGGESTED API ENDPOINTS
- `POST /api/crm/leads`
- `PUT /api/crm/leads/{id}/stage`
- `POST /api/crm/leads/{id}/activities`
- `POST /api/crm/loyalty/redemptions`
- `POST /api/crm/feedback`

## 8. SECURITY AND ACCESS CONTROL
- **Sales Representative**: Permitted: View and edit their assigned leads, log activities, register feedback, view guest statistics. Denied: Modify global loyalty tiers, allocate manual loyalty points, export full customer lists.
- **Sales & Marketing Director**: Permitted: All representative actions + assign leads to users, configure campaign parameters, adjust loyalty points, export client lists.

## 9. AUDIT LOG SPECIFICATION
Log: `LEAD_WON`, `LOYALTY_POINTS_REDEMPTION` (storing points count, item value, and guest ID), `GUEST_COMPLAINT_LOGGED`.

## 10. KEY DESIGN PRINCIPLE
Actionable guest insights. Customer relationships are strengthened when feedback loops are tight, communication is customized, and guest histories are preserved.\n