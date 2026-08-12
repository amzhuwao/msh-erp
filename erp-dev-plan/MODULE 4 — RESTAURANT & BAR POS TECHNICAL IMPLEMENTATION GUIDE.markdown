# MODULE 4 — RESTAURANT & BAR POS TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Restaurant & Bar Point of Sale (POS) module handles table layouts, order placements, kitchen ticket printing, guest payment collection, and direct posting of charges to Guest Folios.

The module integrates with:
- Front Office (validating active guests and posting room charges)
- Inventory & Stores (deducting raw materials based on recipes)
- Finance (fiscalization integration and revenue reporting)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized cashiers/waiters to:
- Visual table layouts for multiple dining outlets (e.g., Terrace Restaurant, Skyview Lounge).
- Split, merge, and transfer tables or orders.
- Send Kitchen Order Tickets (KOT) directly to kitchen/bar display monitors or printers.
- Manage menu categorizations, pricing, and active modifiers.
- Process payments via Cash, Credit Card, Mobile Money, and Room Charge.
- Perform shift opening/closing reconciliations (cash drop logs).
- Perform real-time fiscalisation with the national tax authority (ZIMRA RevMax).

## 3. TRANSACTION LIFECYCLE
```
Open Table/Tab ➔ Add Menu Items ➔ Select Modifiers ➔ Send KOT (Kitchen) ➔ Hold/Update Table 
  ➔ Print Bill (Pro Forma) ➔ Apply Discounts/Voids ➔ Process Payment / Post to Room ➔ Fiscalise ➔ Close Tab
```

## 4. DATABASE DESIGN
### POSOrder
- `OrderID` (PK, UUID)
- `OrderNumber` (Unique string, e.g., POS-2026-009232)
- `TableNumber` (String)
- `OutletID` (FK, e.g., RESTAURANT, LOUNGE)
- `CashierUserID` (FK to User)
- `WaiterUserID` (FK to User)
- `Status` (Enum: OPEN, BILL_PRINTED, PAID, VOIDED)
- `SubTotal` (Decimal)
- `TaxAmount` (Decimal)
- `DiscountAmount` (Decimal)
- `TotalAmount` (Decimal)
- `CreatedAt` (Timestamp)
- `ClosedAt` (Timestamp, Nullable)

### POSOrderItem
- `OrderItemID` (PK, UUID)
- `OrderID` (FK)
- `MenuItemID` (FK)
- `Quantity` (Integer)
- `UnitPrice` (Decimal)
- `ModifierDetails` (JSON array of selected modifications, e.g., ["Well Done", "No Garlic"])
- `Subtotal` (Decimal)

### MenuItem
- `MenuItemID` (PK, UUID)
- `Name` (String)
- `Code` (String, Unique)
- `CategoryId` (String)
- `Price` (Decimal)
- `Cost` (Decimal, for margin calculations)
- `IsActive` (Boolean)
- `TaxRate` (Decimal, e.g., 0.15 for 15% VAT)

## 5. BUSINESS RULES
1. Room Charges must undergo validation: The selected Room number must be active, checked-in, and have "room-charge" routing privileges enabled before the sale is finalized.
2. Voids and discounts above a defined threshold (e.g., 5%) must block the transaction until a manager inputs an approval PIN.
3. Every order item must have an associated tax rate. The system must compute tax on a per-line-item level to ensure financial reconciliation.
4. Cashiers must open a POS Session with a physical "Float Amount" and cannot close the session without recording a "Cash Drop Count".

## 6. USER INTERFACE
### POS Touchscreen Interface (POS Terminals / Tablets)
- **Left Column**: Grid of categories (Beverages, Starters, Mains, Desserts) and Menu Item buttons.
- **Right Column**: Active bill tray displaying items, quantities, modifiers, and subtotals.
- **Bottom Bar**: Action buttons ("Send Kitchen", "Void", "Print Bill", "Discount", "Pay Now").
- **Payment Interface Overlay**: Split payments, quick cash buttons, mobile payment logs, or Room Search.

## 7. FISCALISATION INTEGRATION (ZIMRA REVMAX)
When a bill is finalized, the system must interact with the RevMax API or physical fiscal device:
1. Construct the payload containing: Hotel VAT Number, Transaction Date, Invoice Number, Item Descriptions, Tax Category, Net, Tax, and Total.
2. Send payload to fiscal endpoint.
3. **On Success**: Parse response to extract fiscal signature, invoice number, and ZIMRA verification QR code data. Write this data to the database record.
4. **On Failure**: Hold transaction in PENDING_FISCALISATION queue, alert Supervisor, and permit a retry. Block final session closures if un-fiscalized items remain.

## 8. SUGGESTED API ENDPOINTS
- `GET /api/pos/menu`
- `POST /api/pos/orders`
- `PUT /api/pos/orders/{id}/items`
- `POST /api/pos/orders/{id}/pay`
- `POST /api/pos/orders/{id}/room-charge-validate`
- `POST /api/pos/sessions/open`
- `POST /api/pos/sessions/close`

## 9. SECURITY AND ACCESS CONTROL
- **Waiter**: Permitted: Open table, select items, print draft bills. Denied: Apply discounts, void printed items, execute checkout on tables not assigned to them.
- **POS Cashier**: Permitted: All waiter actions + processing payments, performing cashier drops, opening/closing their own active drawer session.
- **F&B Manager**: Permitted: All cashier actions + voiding KOT items, applying discretionary discounts, editing menu item master prices, forcing table clears.

## 10. AUDIT LOG SPECIFICATION
Log all critical operational changes: `VOID_ITEM` (must log item, waiter, authorizer, and reason), `DISCOUNT_APPLIED`, `DRAWER_FORCE_OPEN`, `FISCAL_RETRY`.

## 11. KEY DESIGN PRINCIPLE
Speed and reliability. If the local network disconnects, the POS should run in an offline-ready cache mode, synchronizing transactions and room authorizations to the central database once connection resumes.
