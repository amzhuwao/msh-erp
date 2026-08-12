# MODULE 19 — NOTIFICATION & COMMUNICATION TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The Notification & Communication Module schedules, constructs, and dispatches transactional emails, SMS text alerts, and internal popups. It ensures guests and employees receive timely booking updates, approvals, and reminders.

The module integrates with:
- Reservations & Front Office (sending booking confirmations, cancellations, and welcome messages)
- Procurement & Payroll (routing department approval requests to senior managers)
- CRM (sending marketing communications and promotional codes)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized users to:
- Design email and SMS message templates using standard placeholder tags (e.g., {GuestName}, {BookingNumber}).
- Manage a centralized notification queue to process and track communications.
- Route outgoing traffic through SMTP email relays or SMS aggregator APIs.
- Set up retry routines for failed delivery attempts.
- Enforce strict communication policies (e.g., quiet hour limits, marketing opt-outs).
- Monitor delivery and reading statistics (logs of sent, opened, and bounced items).

## 3. NOTIFICATION DISPATCH FLOW
```
Trigger Event (e.g., Reservation Confirmed) ➔ Construct Template Payload ➔ Apply Placeholder Tags 
  ➔ Identify Delivery Channel ➔ Enqueue Message ➔ Dispatch via API Relay ➔ Log Delivery Status
```

## 4. DATABASE DESIGN
### MessageTemplate
- `TemplateID` (PK, UUID)
- `Name` (String, Unique, e.g., "RESERVATION_CONFIRMATION_EMAIL")
- `Channel` (Enum: EMAIL, SMS, IN_APP)
- `SubjectPattern` (String, Optional)
- `BodyPattern` (Text, containing variable tags)
- `IsActive` (Boolean)

### NotificationQueue
- `NotificationID` (PK, UUID)
- `TemplateID` (FK, Nullable for custom/direct messages)
- `RecipientContact` (String, e.g., "guest@email.com", "+263770000000")
- `Channel` (Enum: EMAIL, SMS, IN_APP)
- `Subject` (String, Optional)
- `Body` (Text)
- `Status` (Enum: PENDING, SENDING, SENT, FAILED, RETRYING)
- `RetryCount` (Integer, Default: 0)
- `ErrorMessage` (String, Nullable)
- `ScheduledTime` (Timestamp)
- `SentTime` (Timestamp, Nullable)

### CommunicationConsentLog
- `ConsentID` (PK, UUID)
- `GuestID` (FK)
- `Channel` (Enum: EMAIL, SMS)
- `IsOptIn` (Boolean, Default: true)
- `UpdatedDate` (Timestamp)

## 5. BUSINESS RULES
1. Retry Limits: The system must limit retry attempts for messages marked as `FAILED` to a maximum of 3 runs. After the third failure, the notification status must transition to `FAILED` and log the server output.
2. Quiet Hour Compliance: Non-essential operational or promotional SMS messages must not be sent between 8:00 PM and 7:00 AM. They must sit in the queue until the morning window opens.
3. Marketing Opt-Out: The system must block email or SMS campaigns to any `GuestID` where `CommunicationConsentLog` indicates an active opt-out. Transactional confirmations (such as purchase receipts or booking confirmations) bypass this restriction.
4. Auto-release Queue: Every background notification process must run asynchronously, ensuring that any delays in external SMTP or gateway relays do not block user interface responsiveness.

## 6. USER INTERFACE
### Communications Hub
- Unified dashboard tracking total sent items, open rates, and bounced/failure metrics.
- Notification Queue table: Monitor live dispatches, manually trigger a retry, or cancel a pending message.
- Template Designer: Rich-text editor displaying a sidebar of available data tags.

## 7. SUGGESTED API ENDPOINTS
- `POST /api/notifications/send-direct`
- `GET /api/notifications/queue?status=PENDING`
- `POST /api/notifications/templates`
- `PUT /api/notifications/consent`
- `POST /api/notifications/{id}/retry`

## 8. SECURITY AND ACCESS CONTROL
- **System Administrator / IT Specialist**: Permitted: Configure SMTP relay endpoints, adjust gateway API keys, inspect queue outputs, configure retry timings.
- **Marketing Assistant**: Permitted: Edit campaign email templates, schedule promotional dispatches, track consent tables. Denied: Modify system transactional templates (confirmations, passwords).

## 9. AUDIT LOG SPECIFICATION
Log: `GATEWAY_KEY_UPDATED`, `CAMPAIGN_DISPATCHED`, `TEMPLATE_EDITED`, `SMS_CREDITS_ALERT` (if low balance is tripped).

## 10. KEY DESIGN PRINCIPLE
Non-blocking communication. All notification channels must run within background worker queues, separating transactional UI processing from third-party networks.\n