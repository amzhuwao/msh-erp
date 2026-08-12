# MODULE 6 — INVENTORY & STORES TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Inventory & Stores Module manages the lifecycle of physical assets, consumables, food and beverage stocks, linen, and general supplies. It ensures accurate real-time stock balances, controls internal department requisitions, monitors item expiries, and performs automatic cost-of-sales valuations.

The module integrates with:
- Procurement & Purchasing (updating stock levels on Goods Received Notes)
- Restaurant & Bar POS (depleting raw ingredients/beverages via recipes)
- Housekeeping (tracking cleaning supplies and amenity distribution)
- Maintenance (tracking spare parts used for work orders)
- Finance & Accounting (updating stock asset values and cost-of-goods-sold ledgers)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Establish a master Item Registry categorized by department (F&B, Rooms, Housekeeping, Admin).
- Track multiple stock locations (Main Store, Kitchen Store, Bar Store, Housekeeping Store).
- Manage Unit of Measure (UOM) conversions (e.g., box to bottle, bottle to cl/ml).
- Record internal department stock issues and transfer stock between locations.
- Execute physical stock takes, reconcile variances, and post adjustments.
- Track batch numbers, manufacturing dates, and expiration profiles.
- Alert users when stock levels fall below critical reorder limits.

## 3. INVENTORY TRANSACTION LIFECYCLE
```
Item Configured ➔ Reorder Point Tripped ➔ Purchase Order (Procurement) ➔ Goods Received (GRN) 
  ➔ Stock Invoiced ➔ Internal Request/Requisition ➔ Store Issue ➔ Consumption (F&B recipe/Usage)
```

## 4. DATABASE DESIGN
### InventoryItem
- `ItemID` (PK, UUID)
- `ItemCode` (String, Unique, e.g., INV-FB-0021)
- `Name` (String)
- `Description` (String, Optional)
- `CategoryID` (FK)
- `BaseUnitOfMeasure` (String, e.g., "Bottle", "KG", "Box")
- `CostMethod` (Enum: FIFO, LIFO, WEIGHTED_AVERAGE)
- `CurrentAverageCost` (Decimal)
- `ReorderLevel` (Decimal)
- `ReorderQuantity` (Decimal)
- `IsPerishable` (Boolean)
- `IsActive` (Boolean)

### StockBalance
- `StockBalanceID` (PK, UUID)
- `ItemID` (FK)
- `StoreLocationID` (FK)
- `QuantityOnHand` (Decimal)
- `ReservedQuantity` (Decimal)

### StockTransaction
- `TransactionID` (PK, UUID)
- `ItemID` (FK)
- `StoreLocationID` (FK)
- `TransactionType` (Enum: RECEIPT, ISSUE, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT)
- `Quantity` (Decimal)
- `UnitCost` (Decimal)
- `TotalCost` (Decimal)
- `ReferenceDocument` (String, e.g., GRN-1092, REQ-3902)
- `TransactionDate` (Timestamp)
- `CreatedBy` (FK to User)

### StoreLocation
- `StoreLocationID` (PK, UUID)
- `LocationName` (String, e.g., "Main Food & Beverage Store", "Lounge Bar")
- `ManagerUserID` (FK to User)
- `IsActive` (Boolean)

## 5. BUSINESS RULES
1. System-wide restriction on negative inventory: Stock issues and transfers must be blocked if the QuantityOnHand of the requested item in the source location is less than the requested transaction quantity.
2. Every stock movement must reference a valid source document (e.g., GRN for purchases, Approved Store Requisition for issues, or signed Physical Count Sheet for adjustments).
3. Inventory adjustments resulting from physical variance audits must require documented explanations and secondary approval if the value exceeds a configurable threshold (e.g., $100 USD).
4. Unit conversion multipliers must be defined explicitly to handle raw material issues (e.g., 1 Box of Spirits contains 12 Bottles; 1 Bottle contains 750ml).

## 6. USER INTERFACE
### Inventory Control Panel
- **Main Stock Grid**: Searchable by code, name, category, and location.
- **Status Flags**: Highlighting low stock (below reorder level) and expiring batches.
- **Transfer Console**: Quick multi-item selection interface to move stocks between stores.
- **Digital Stock Take Sheet**: Grid visual mapping physical items to manual inputs against book values.

## 7. STOCK VALUATION LOGIC (WEIGHTED AVERAGE COST)
The default inventory valuation method for Manica Skyview Hotel is Weighted Average Cost (WAC).
Whenever a new stock receipt occurs (via a Goods Received Note):
`New Average Cost = (Total Value of Current Stock + Total Value of Incoming Stock) / (Current Quantity + Incoming Quantity)`
- Current Average Cost is updated directly in the `InventoryItem` master record.
- Internal stock issues and POS ingredient depletions must be priced using this updated cost to calculate Cost of Goods Sold (COGS).

## 8. F&B RECIPE DEPLETION ENGINE (POS INTEGRATION)
1. Define a Recipe map for POS Menu Items. Example: "Double Gin Tonic" consists of 60ml of Gin and 1 Can of Tonic Water.
2. Upon POS transaction closure, retrieve the menu item's recipe composition.
3. Identify the target store location (e.g., "Lounge Bar Store").
4. Process a background StockTransaction of type ISSUE for each recipe component.
5. If depletions cause a stock balance to hit the critical reorder point, dispatch an automated notification to the F&B Storekeeper.

## 9. SUGGESTED API ENDPOINTS
- `GET /api/inventory/items`
- `POST /api/inventory/items`
- `GET /api/inventory/balances?locationId=ID`
- `POST /api/inventory/transfers`
- `POST /api/inventory/reconcile-count`
- `GET /api/inventory/alerts/low-stock`

## 10. SECURITY AND ACCESS CONTROL
- **Storekeeper**: Permitted: View inventory balances, generate transfer slips, record physical counts, log received items. Denied: Post manual value adjustments, edit item master configurations, bypass negative inventory blocks.
- **F&B / Rooms Manager**: Permitted: Approve internal requisitions, view usage metrics, initiate OOO supply calls.
- **Finance Controller**: Permitted: Approve valuation adjustments, modify cost settings, override lock dates for stock-take sessions.

## 11. AUDIT LOG SPECIFICATION
Log: `STOCK_ADJUSTMENT`, `UNIT_CONVERSION_UPDATED`, `ITEM_CREATED`, `STORE_LOCATION_DEACTIVATED`.

## 12. KEY DESIGN PRINCIPLE
Accurate tracking of quantities and values. Every single item entry, exit, or relocation must have a traceable transaction record linked to a human user and an approved document.
