# MODULE 14 — REVENUE MANAGEMENT TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Revenue Management Module calculates pricing yields, establishes rate plans, configures promotional code parameters, manages occupancy pricing matrices, and measures standard hospitality yield metrics (ADR, RevPAR).

The module integrates with:
- Front Office (pulling occupied room nights and accommodation revenue records)
- API & Integration Layer (syncing active rates to Channel Managers and OTAs)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized yield controllers to:
- Create global Rate Plans (e.g., Rack, BAR, Bed & Breakfast, Non-Refundable).
- Set up seasonal rate adjustments (higher rates during peak months, lower during low season).
- Apply dynamic occupancy-based yield rules (raise prices automatically as occupancy increases).
- Create package plans combining lodging with F&B or event amenities.
- Establish promotional codes with validity periods and discount limits.
- Display yield performance dashboards (ADR, RevPAR, and occupancy forecasts).

## 3. REVENUE RATE FLOW
```
Configure Base Room Rates ➔ Apply Seasonal Adjustments ➔ Apply Real-Time Dynamic Occupancy Yields 
  ➔ Package Cost Distribution ➔ API Distribution to Channel Managers / OTAs
```

## 4. DATABASE DESIGN
### RatePlan
- `RatePlanID` (PK, UUID)
- `Name` (String, e.g., "Best Available Rate")
- `Code` (String, Unique, e.g., BAR-01)
- `BaseModifierAmount` (Decimal, Default: 0)
- `IsPercentage` (Boolean, Default: false)
- `CancellationPolicyDays` (Integer)
- `IsActive` (Boolean)

### YieldRule
- `YieldRuleID` (PK, UUID)
- `RoomTypeID` (FK)
- `OccupancyThresholdPercent` (Decimal, e.g., 0.80 for 80% occupancy)
- `RateIncreasePercent` (Decimal, e.g., 0.15 for 15% increase)
- `IsActive` (Boolean)

### SeasonalRateAdjustment
- `AdjustmentID` (PK, UUID)
- `RoomTypeID` (FK)
- `StartDate` (Date)
- `EndDate` (Date)
- `AdjustedRate` (Decimal)
- `IsActive` (Boolean)

### PromoCode
- `PromoID` (PK, UUID)
- `Code` (String, Unique, e.g., SUMMER26)
- `DiscountType` (Enum: PERCENT, FIXED)
- `DiscountValue` (Decimal)
- `StartDate` (Date)
- `EndDate` (Date)
- `MinNights` (Integer, Default: 1)
- `UsageLimit` (Integer)
- `CurrentUsage` (Integer, Default: 0)

## 5. BUSINESS RULES
1. Rule Precedence: Dynamic pricing calculations must always execute in the following priority:
   `Final Rate = (Base Rate + Seasonal Adjustment) * (1 + Active Dynamic Yield Increase) - Active Promo Code`
2. Dynamic Threshold Enforcement: When a reservation is checked-in or created, the system must recalculate the current occupancy of that Room Type and adjust rates immediately if the target threshold is crossed.
3. Promo Code Limits: The database must reject reservations using promo codes that have crossed their `UsageLimit` or expired their `EndDate`.
4. Revenue Splitting: Package bookings must automatically partition the total cost into designated revenue buckets (e.g., lodging vs food and beverage) during financial ledger posting.

## 6. USER INTERFACE
### Revenue Management Console
- Performance panel showing key metrics: Occupancy %, ADR, RevPAR, and Total Accommodation Revenue.
- Dynamic Pricing Designer: Grid view where users configure dynamic triggers and rate plan dependencies.
- Seasonal Calendar: Interactive year-view highlighting rate adjustments across seasons.

## 7. SUGGESTED API ENDPOINTS
- `GET /api/revenue/calculate-rate?roomTypeId=ID&date=YYYY-MM-DD`
- `POST /api/revenue/rate-plans`
- `POST /api/revenue/yield-rules`
- `POST /api/revenue/promo-codes/validate`
- `GET /api/revenue/metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

## 8. SECURITY AND ACCESS CONTROL
- **Reservations Agent**: Permitted: View current computed rates, search and apply valid promotional codes. Denied: Modify base rates, configure yield rules, create promotional plans.
- **Revenue Manager / Director**: Permitted: All reservations actions + edit base rates, design dynamic yield rules, configure packages, edit promo code limits.

## 9. AUDIT LOG SPECIFICATION
Log: `BASE_RATE_MODIFIED`, `DYNAMIC_RULE_ACTIVATED`, `PROMO_CODE_EXCEEDED`, `REVENUE_METRIC_EXPORT`.

## 10. KEY DESIGN PRINCIPLE
Yield optimization. Every room night is a perishable asset. Rates should float logically based on demand, occupancy, and season to maximize Revenue Per Available Room (RevPAR).\n