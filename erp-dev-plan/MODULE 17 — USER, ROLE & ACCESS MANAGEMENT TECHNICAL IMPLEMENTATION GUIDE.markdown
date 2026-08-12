# MODULE 17 — USER, ROLE & ACCESS MANAGEMENT TECHNICAL IMPLEMENTATION GUIDE

## 1. PURPOSE
The User, Role & Access Management Module secures the entire ERP system, establishing secure identity boundaries, enforcing Role-Based Access Control (RBAC) [1], managing active user sessions, and recording system mutations within an immutable audit framework [1].

The module integrates with:
- All system modules (providing authorization middleware for every endpoint and UI component)
- Notifications (alerting users of privileged logins or permission adjustments)
- System Administration (providing audit structures)

## 2. FUNCTIONAL REQUIREMENTS
The module shall allow authorized system administrators to:
- Authenticate system users using secure hashing and session configurations.
- Maintain a directory of system users, linking them to departments and active states.
- Configure hierarchical permission levels or discrete roles (e.g., Receptionist, Storekeeper).
- Establish User Groups to apply access configurations in bulk.
- Apply granular individual permission overrides where necessary.
- Configure multi-factor authentication (MFA) parameters for privileged accounts.
- Trace and inspect the audit trails of any user action across any module.

## 3. ACCESS WORKFLOW
```
User Login Request ➔ Password Verification ➔ MFA Code Validation ➔ Fetch User Roles 
  ➔ Build Permissions Map ➔ Generate Encrypted JWT Session ➔ API Route Authorization Middleware 
  ➔ Route Action Processing ➔ Write Session Details to Audit Log
```

## 4. DATABASE DESIGN
### User
- `UserID` (PK, UUID)
- `Username` (String, Unique)
- `PasswordHash` (String)
- `FullName` (String)
- `Email` (String, Unique)
- `DepartmentID` (FK)
- `RoleID` (FK)
- `IsActive` (Boolean)
- `SessionTimeoutMinutes` (Integer)
- `LastLoginAt` (Timestamp, Nullable)
- `MFASecret` (String, Nullable)
- `CreatedAt` (Timestamp)

### Role
- `RoleID` (PK, UUID)
- `Name` (String, Unique, e.g., "Receptionist", "Finance Controller")
- `Description` (String)
- `Permissions` (JSON object mapping modules to arrays of permitted actions)
  *Example:*
  ```json
  {
    "Reservations": ["VIEW", "CREATE", "EDIT"],
    "Finance": ["VIEW_LIMITED"]
  }
  ```

### UserGroup
- `UserGroupID` (PK, UUID)
- `Name` (String, Unique)
- `Description` (String)

### UserGroupMember
- `UserGroupID` (FK)
- `UserID` (FK)
- Composite PK: (`UserGroupID`, `UserID`)

### PermissionOverride
- `OverrideID` (PK, UUID)
- `UserID` (FK)
- `Module` (String, e.g., "Reservations")
- `Action` (String, e.g., "RATE_OVERRIDE")
- `IsAllowed` (Boolean)

## 5. BUSINESS RULES
1. System Administrator Restrictions: A system administrator account does not inherit automatic operational or business authorization [1]. While they can configure users and system rules, they must not bypass financial audit checks or process/modify business ledger records directly without clear secondary authorization [1].
2. Password Security Constraints: Enforce standard parameters: Minimum 10 characters, requiring at least one uppercase letter, one lowercase letter, one numeric character, and one special character. Keep previous passwords to prevent reuse.
3. MFA Enforcement: Multi-Factor Authentication (MFA) is mandatory for any user with administrative permissions, rate adjustment privileges, or ledger-altering capabilities.
4. Session Expiration: Sessions must automatically terminate after a configurable duration of inactivity (defaulting to 20 minutes) and require re-authentication.

## 6. USER INTERFACE
### User Directory View
- Searchable user index showing status flags (Active, Inactive, Blocked).
- Create User panel (populates metadata, profile image, and department allocation).

### Role Configuration Grid
- Dashboard displaying active roles.
- Grid mapping modules (Rows) to Permissions (Columns: VIEW, CREATE, EDIT, DELETE, CANCEL, APPROVE, EXPORT, OVERRIDE) with toggle switches.
- Save mechanism verifying that editing an active role changes the access matrix for all mapped users in real time.

### Audit Viewer Dashboard
- Chronological stream of system modifications.
- Deep search filters: Filter by User, Date, Module, Action, or IP Address.

## 7. MIDDLEWARE AUTHORIZATION FLOW
To enforce authorization checks before executing any backend logic, the system should deploy route middleware on all REST API endpoints.
Example logic pattern (Node.js):
```typescript
function authorize(module: string, requiredAction: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !user.isActive) {
      return res.status(401).json({ code: "AUTH-002", message: "Unauthenticated" });
    }

    // 1. Check direct individual overrides
    const override = await db.permissionOverride.findFirst({
      where: { userID: user.id, module, action: requiredAction }
    });
    if (override) {
      if (override.isAllowed) return next();
      return res.status(403).json({ code: "AUTH-003", message: "Forbidden: Denied by override" });
    }

    // 2. Check role-based permission JSON
    const rolePermissions = user.role.permissions[module];
    if (rolePermissions && rolePermissions.includes(requiredAction)) {
      return next();
    }

    return res.status(403).json({ code: "AUTH-004", message: "Forbidden: Insufficient privileges" });
  };
}
```

## 8. SUGGESTED API ENDPOINTS
- `POST /api/auth/login`
- `POST /api/auth/mfa/verify`
- `POST /api/users`
- `PUT /api/users/{id}/status`
- `POST /api/roles`
- `PUT /api/roles/{id}/permissions`
- `GET /api/audit/logs?userId=ID&module=NAME`

## 9. SECURITY AND ACCESS CONTROL
- **System Administrator**: Permitted: Complete control over Users, Roles, Permission Override rules, Session settings, and global parameters. Denied: Directly post or balance General Ledger journals, bypass personal audit logging.

## 10. AUDIT LOG SPECIFICATION
Any transaction processed in this module must log with deep detail: `USER_CREATED`, `PASSWORD_RESET`, `ROLE_PERMISSIONS_CHANGED` (must record the previous and new permission maps), `MFA_BYPASS_ATTEMPT`.

## 11. KEY DESIGN PRINCIPLE
Least Privilege. Users should only be assigned the access required to complete their operational tasks [1]. Any escalation of authority must be temporary, authorized, and fully recorded in the audit trail.
