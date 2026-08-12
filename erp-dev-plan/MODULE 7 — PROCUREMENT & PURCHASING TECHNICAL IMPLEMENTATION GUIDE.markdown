# MODULE 7 — PROCUREMENT & PURCHASING TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Procurement & Purchasing Module automates and regulates the commercial acquisition workflow, from initial internal department requisitions to supplier quotation evaluations, Purchase Order approvals, Goods Received tracking, and final three-way invoice matching.

The module integrates with:
- Inventory & Stores (stock level updates on Goods Received Notes)
- Finance & Accounting (accounts payable ledger generation and invoice matching)
- Security (auditable approval hierarchies)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Submit digital Purchase Requisitions indicating urgency, department, and stock/non-stock requirements.
- Manage a centralized Vendor/Supplier database with contact, rating, and payment term details.
- Generate Requests for Quotation (RFQs) and compare incoming supplier proposals.
- Generate official Purchase Orders (PO) with automated document numbering.
- Route requisitions and POs through defined approval hierarchies based on cost limits.
- Generate Goods Received Notes (GRN) to record physical deliveries against open POs.
- Match supplier invoices with corresponding POs and GRNs prior to releasing payments.

## 3. PROCUREMENT LIFECYCLE
```
Purchase Requisition ➔ Department Approval ➔ Procurement Review ➔ Supplier Quotations 
  ➔ Quotation Evaluation ➔ Purchase Order ➔ System Approval ➔ Sent to Supplier ➔ Goods Delivered 
  ➔ Goods Received Note (GRN) ➔ Supplier Invoice ➔ Three-Way Match ➔ Accounts Payable
```

## 4. DATABASE DESIGN
### Supplier
- `SupplierID` (PK, UUID)
- `Name` (String)
- `Code` (String, Unique, e.g., SUP-0012)
- `ContactPerson` (String)
- `Email` (String)
- `Phone` (String)
- `Currency` (String)
- `PaymentTermsDays` (Integer, e.g., 30)
- `VATNumber` (String)
- `Rating` (Decimal)
- `IsActive` (Boolean)

### PurchaseRequisition
- `RequisitionID` (PK, UUID)
- `RequisitionNumber` (Unique, e.g., PR-2026-00049)
- `DepartmentID` (FK)
- `RequesterUserID` (FK to User)
- `RequiredDate` (Date)
- `ApprovalStatus` (Enum: DRAFT, SUBMITTED, APPROVED, REJECTED)
- `ApprovedBy` (FK to User, Nullable)
- `Notes` (Text)
- `CreatedAt` (Timestamp)

### RequisitionItem
- `RequisitionItemID` (PK, UUID)
- `RequisitionID` (FK)
- `ItemID` (FK, Nullable for non-stock items)
- `Description` (String, for custom/non-stock requests)
- `QuantityRequested` (Decimal)
- `EstimatedUnitPrice` (Decimal)

### PurchaseOrder
- `PurchaseOrderID` (PK, UUID)
- `PONumber` (Unique, e.g., PO-2026-00034)
- `SupplierID` (FK)
- `RequisitionID` (FK, Nullable)
- `Status` (Enum: DRAFT, PENDING_APPROVAL, SENT_TO_SUPPLIER, PARTIALLY_RECEIVED, COMPLETED, CANCELLED)
- `Subtotal` (Decimal)
- `TaxAmount` (Decimal)
- `TotalAmount` (Decimal)
- `ApprovedBy` (FK to User, Nullable)
- `CreatedBy` (FK to User)
- `CreatedAt` (Timestamp)

### GoodsReceivedNote
- `GRNID` (PK, UUID)
- `GRNNumber` (Unique, e.g., GRN-2026-00041)
- `PurchaseOrderID` (FK)
- `SupplierID` (FK)
- `ReceivedDate` (Date)
- `ReceivedByUserID` (FK to User)
- `InvoiceReference` (String, Nullable)
- `IsFullyReceived` (Boolean)

## 5. BUSINESS RULES
1. Separation of Duties: The requester of a Purchase Requisition cannot be the final approver of the resulting Purchase Order.
2. Three-Way Match Enforcement: Supplier Invoices cannot be approved for payment if there is a variance exceeding a configurable tolerance (e.g., 2% in price or quantity) when comparing the Purchase Order, Goods Received Note, and Supplier Invoice.
3. Approval Hierarchies: The system must enforce automatic limits for purchase order authorizations:
   - Level 1 (Procurement Officer): Up to $500 USD
   - Level 2 (Finance Manager): Up to $5,000 USD
   - Level 3 (General Manager): Above $5,000 USD
4. GRN validations: Received item quantities must be validated against open PO quantities. The system must reject entries where the received quantity exceeds the remaining ordered quantity.

## 6. USER INTERFACE
### Requisition Wizard
- Simple request layout for employees to search for stock items or type in custom requests.
- Tracking timeline showing the progress of their request through approvals and orders.

### Procurement Dashboard
- Supplier performance indicators (delivery timeliness, price variance, order fulfillment rate).
- Queue of pending requisitions awaiting review.
- Price comparison interface displaying quotes side-by-side for a specific RFQ.
- Goods receiving log to track partial and fully completed orders.

## 7. THE THREE-WAY MATCHING SERVICE
Validation routine executed before generating an Accounts Payable entry:
- **Step 1**: Fetch PO details (quantities ordered, unit prices).
- **Step 2**: Fetch GRN details (quantities actually received and accepted at the store).
- **Step 3**: Fetch Supplier Invoice details (quantities billed, unit prices billed).
- **Step 4**: Verify that:
  - `Quantity Billed` <= `Quantity Received` (GRN).
  - `Unit Price Billed` == `Unit Price Ordered` (PO).
- **Step 5**: If true, mark the Invoice status as `APPROVED_FOR_PAYMENT` and write to the general ledger. Otherwise, flag the invoice as `VARIANCE_HOLD` and generate an alert.

## 8. SUGGESTED API ENDPOINTS
- `POST /api/procurement/requisitions`
- `PUT /api/procurement/requisitions/{id}/approve`
- `POST /api/procurement/purchase-orders`
- `POST /api/procurement/grn`
- `POST /api/procurement/supplier-invoices/validate-match`
- `GET /api/procurement/suppliers`

## 9. SECURITY AND ACCESS CONTROL
- **Procurement Officer**: Permitted: Create RFQs, convert requisitions to draft POs, update supplier details, send POs to suppliers once approved. Denied: Approve requisitions, authorize PO payments, bypass three-way match holds.
- **Department Head**: Permitted: View department budgets, approve Purchase Requisitions originating from their own department.
- **General Manager**: Permitted: Approve any purchase orders, authorize exceptional non-PO payments, approve overrides.

## 10. AUDIT LOG SPECIFICATION
Log: `PO_APPROVED`, `PO_STATUS_CHANGED`, `INVOICE_MATCH_FAILED`, `SUPPLIER_BLACKLISTED`, `APPROVAL_LIMITS_EDITED`.

## 11. KEY DESIGN PRINCIPLE
Auditability and cost control. Every dollar spent on operations must trace back to an authorized requisition, a documented price commitment from a registered vendor, and a physical count confirmation at delivery.
