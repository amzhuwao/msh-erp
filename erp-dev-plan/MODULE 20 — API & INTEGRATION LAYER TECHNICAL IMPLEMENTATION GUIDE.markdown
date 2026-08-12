# MODULE 20 — API & INTEGRATION LAYER TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The API & Integration Layer regulates, secures, and audits all data transmissions and synchronization tasks with external hotel systems, booking engines, OTAs, payment gateways, and key card door machines.

The module integrates with:
- All system modules (acting as the secure gateway for incoming and outgoing data handshakes)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized system integrators to:
- Establish secure REST APIs with HMAC signature and Bearer Token authorizations.
- Track incoming and outgoing API request payloads inside an immutable integration log.
- Enforce API Rate Limiting to prevent Denial of Service occurrences.
- Sync real-time rates and availability with Channel Managers (e.g., Siteminder).
- Process online reservations coming from the Web Booking Engine.
- Securely process bank card transactions with third-party payment gateways.
- Dispatch room door lock coding instructions to key card encoders.

## 3. INTEGRATION TRANSACTION LIFECYCLE
```
Incoming Request ➔ Route Identification ➔ Token/HMAC Signature Validation ➔ Rate-Limit Checks 
  ➔ Validate Input Payload ➔ Execute Operational Action ➔ Parse Output ➔ Format JSON ➔ Log API Handshake
```

## 4. DATABASE DESIGN
### ApiKeyCredential
- `KeyID` (PK, UUID)
- `ClientName` (String, e.g., "WebBookingEngine")
- `TokenHash` (String)
- `SecretKeyHash` (String)
- `Scopes` (JSON array of allowed scopes, e.g., ["reservations:read", "reservations:create"])
- `IsActive` (Boolean)
- `ExpiresAt` (Timestamp)

### IntegrationWebhook
- `WebhookID` (PK, UUID)
- `EventName` (String, e.g., "RESERVATION_CHECKIN")
- `TargetURL` (String)
- `SecretToken` (String, used for HMAC request signing)
- `IsActive` (Boolean)

### ApiIntegrationLog
- `LogID` (PK, UUID)
- `Endpoint` (String)
- `HttpMethod` (String)
- `RequestPayload` (Text, masked for PII)
- `ResponsePayload` (Text)
- `StatusCode` (Integer)
- `ResponseTimeMs` (Integer)
- `IpAddress` (String)
- `CreatedAt` (Timestamp)

## 5. BUSINESS RULES
1. HMAC Verification: All high-sensitivity incoming integration payloads (such as web booking transactions or payment confirmations) must contain an HMAC header computed with the shared secret. Payloads failing this calculation must be blocked instantly and logged with error code `API-001` (Signature Invalidation).
2. API Rate Limiting: Enforce standard rate parameters: API keys are limited to 100 requests per minute from a unique IP address. Tripping this limit returns HTTP Status Code 429 (Too Many Requests).
3. Payload Masking: The integration logger must automatically mask payment cards (e.g., keeping only first 6 and last 4 digits) and password variables inside both incoming and outgoing logs.
4. Fail-Safe Idempotency: Web booking reservation payloads must require a unique client-side transaction key. The API must verify this key to prevent duplicate bookings if network issues cause the client to retry.

## 6. USER INTERFACE
### API Integration Panel
- Live API monitoring dashboard showing transaction charts, request volumes, average latency times, and error rate splits.
- Webhook configurator: Form to map events to endpoints and generate shared secret codes.
- API Log Browser: Expandable grid layout showing details of every integration payload.

## 7. SUGGESTED API ENDPOINTS
- `POST /api/v1/integrations/keys`
- `GET /api/v1/integrations/logs?statusCode=500`
- `POST /api/v1/integrations/webhooks`
- `POST /api/v1/integrations/ota/sync`
- `POST /api/v1/integrations/payments/process`

## 8. SECURITY AND ACCESS CONTROL
- **Integrations Engineer**: Permitted: Create webhooks, view non-masked integration logs, execute OTA sync tests, configure API keys. Denied: Deactivate keys assigned to core platforms, modify business configurations.
- **IT Director / Systems Administrator**: Permitted: Complete access to authorize new client keys, manage scopes, modify rate limits, delete webhook endpoints.

## 9. AUDIT LOG SPECIFICATION
Log: `API_KEY_CREATED`, `WEBHOOK_MODIFIED`, `INTEGRATION_SYNC_ERROR`, `RATE_LIMIT_TRIPPED` (storing target IP and client code).

## 10. KEY DESIGN PRINCIPLE
Interface decoupling. All integrations must act on clear contract configurations. Failure of an external sync or system must not affect the performance of core internal hotel operations.\n