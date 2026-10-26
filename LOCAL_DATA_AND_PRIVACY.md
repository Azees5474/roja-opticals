# Roja Opticals - Local Data Storage, Privacy & Security Guide

## 1. Local Data Storage & Architecture

Roja Opticals is configured to operate as a high-reliability, sellable **laptop-local web application**.

### Storage Locations
- **Windows Desktop App (Packaged)**:
  - Database Records: `%APPDATA%\RojaOpticals\data\`
  - Database Backups: `%APPDATA%\RojaOpticals\backups\`
  - Application Logs: `%APPDATA%\RojaOpticals\logs\server.log`
  - Authentication Secret: `%APPDATA%\RojaOpticals\.auth_secret`
- **Development / Standalone Batch Mode**:
  - Directory: `server/local_database/`
- **Tables**: `customers`, `prescriptions`, `followups`, `billing`, `orders`, `inventory`, `whatsapp_messages`, `whatsapp_settings`, `shop_settings`, `users`, `sheets_sync_log`.
- **Format**: Individual JSON documents named `<record-id>.json`.

### Update & Uninstall Data Safety
1. **Application Updates**: When upgrading to a newer version of the desktop application, the installer updates the program binaries in the application directory without touching `%APPDATA%\RojaOpticals`. Customer records, orders, and settings are preserved.
2. **Uninstallation Behavior**: The Windows uninstaller (`deleteAppDataOnUninstall: false`) explicitly preserves your customer database in `%APPDATA%\RojaOpticals` so that uninstalling the software does not delete your records.
3. **Safe Complete Removal**: If you wish to permanently remove all customer data upon uninstall, first perform an off-laptop backup to a USB flash drive, then manually delete `%APPDATA%\RojaOpticals`.

### Reliability Guarantees
1. **Atomic File Writes**: Records are written to temporary staging files (`<file>.tmp.<timestamp>.<random>`) and flushed to disk before an atomic rename (`fs.rename`). This prevents half-written or corrupted JSON files if power is lost during a write.
2. **Concurrent Write Mutex**: An in-memory serialization lock (`withLock`) queues updates for the same table and record ID, preventing lost updates or file handle collisions.
3. **Path Traversal Protection**:
   - Table names are strictly matched against a hardened whitelist (`ALLOWED_TABLES`).
   - Record IDs are strictly checked against `/^[a-zA-Z0-9_-]{1,64}$/`. Any path traversal (`../`, `..\`, null bytes) is rejected immediately with a 400 Bad Request.
4. **Resilience to Corrupted Files**: If an invalid file is placed in a data directory, `readAllLocal` skips it with a logged warning rather than crashing the system or failing the whole API call.
5. **Git & Distributable Isolation**: `local_database/` and `local_database_backups/` are strictly excluded in `.gitignore` and `electron-builder.json` so customer data is never checked into source control or bundled into the installer.

---

## 2. Privacy & Shared Laptop Security

### Transparent Encryption Disclosure
> [!IMPORTANT]
> The local JSON database stores records as unencrypted text JSON files on the local filesystem. Application-level file encryption is **NOT** enabled.

### Protecting Customer Privacy on a Shared Laptop
When multiple staff members or shop owners share a single Windows laptop:

1. **Enable Windows BitLocker Drive Encryption**:
   - Open Windows Search -> type `BitLocker` -> Turn on BitLocker for drive `C:` and any secondary data drives.
   - This ensures that if the laptop is stolen or the hard drive removed, customer data remains encrypted at rest.
2. **Use Separate Windows Accounts**:
   - Create a dedicated standard Windows user account for shop staff (without administrator rights).
   - Restrict NTFS read permissions on `server/local_database/` to the application/owner account if stricter local isolation is required.
3. **Screen Lock Policy**:
   - Press `Win + L` whenever stepping away from the counter to prevent unauthorized access.
4. **Network Exposure (Loopback Default)**:
   - The backend server binds strictly to `127.0.0.1` by default. It does **NOT** expose ports on `0.0.0.0` or local Wi-Fi networks unless an administrator explicitly sets `HOST=0.0.0.0` in `server/.env`.
5. **Rate Limiting on Loopback**:
   - Rate limiting is configured with a sliding window (100 requests per 15 minutes for standard routes; 10 per 15 minutes for authentication).
   - Memory is bounded with an automatic key eviction cap (`maxKeys: 2000`).
   - *Note on Local Loopback*: Because requests originating on the laptop arrive from `127.0.0.1`, rate limits apply to the browser session on that machine. In ordinary day-to-day shop use, limits are sufficiently high not to hinder operations while preventing runaway client loops.

---

## 3. Role-Based Access Control (RBAC)

Roja Opticals implements strict server-side role enforcement:

- **Authoritative Roles**: Roles are extracted solely from server-signed JWT claims (`app_metadata.role`) or cryptographic HMAC local session tokens. User-editable metadata (`user_metadata`) is strictly ignored for authorization decisions.
- **Frontend Consistency**: The frontend UI inspects the server-verified role to display role badges (`Owner` / `Staff`) and hides owner-exclusive actions. If a staff member attempts an owner-only action, the backend rejects it with an authoritative `403 Forbidden`.

### Role Permissions Matrix
| Action / Route | Staff | Owner |
|---|:---:|:---:|
| View Customers, Orders, Prescriptions, Follow-ups | ✅ Allowed | ✅ Allowed |
| Create & Update Customers, Orders, Prescriptions | ✅ Allowed | ✅ Allowed |
| Log Follow-up Status & Send WhatsApp Reminders | ✅ Allowed | ✅ Allowed |
| Delete Customers, Orders, Inventory, Prescriptions | ❌ Blocked (403) | ✅ Allowed |
| Edit Shop Settings (GSTIN, Address, Currency) | ❌ Blocked (403) | ✅ Allowed |
| Configure WhatsApp API & Automation Settings | ❌ Blocked (403) | ✅ Allowed |
| Trigger Manual Google Sheets Sync | ❌ Blocked (403) | ✅ Allowed |
| Create Database Backup / Restore Database | ❌ Blocked (403) | ✅ Allowed |

### Account Provisioning (No Hardcoded Credentials)
- **First-Run Master Owner Setup**:
  - On a fresh installation, no default credentials exist in the system.
  - The login interface checks `/api/auth/setup-status`. When no owner exists, it displays the First-Run Setup form.
  - The business owner enters their full name, email, shop name, and sets a strong password (minimum 8 characters, requiring uppercase, lowercase, number, and special character).
  - Once created, the setup permanently locks (`setup_locked: true`).
- **Staff Provisioning**:
  - Staff accounts are provisioned exclusively by the authenticated Owner via `/api/auth/staff`.
  - Passwords are salt-hashed using Node.js `crypto.scryptSync` with 16-byte random salts. Session tokens are signed using persistent HMAC-SHA256 secrets.

---

## 4. Backup & Disaster Recovery

### Automated Backups via API / UI
- **Create Snapshot**: `POST /api/sync/backup` (Owner-only)
  - Creates a unified JSON snapshot in `server/local_database_backups/backup_<timestamp>.json`.
- **Restore Snapshot**: `POST /api/sync/restore` (Owner-only)
  - Accepts a `backup_*.json` file, validates table structure, and restores all tables atomically.

### Manual Off-Laptop Backup (Recommended Best Practice)
To ensure business continuity against laptop loss, hardware failure, or liquid spills:
1. Plug an external USB flash drive into the laptop.
2. Copy the entire folder `e:\roja opticals\server\local_database` to the USB drive once a week.
3. Safely eject the USB drive and store it securely away from the shop counter.

---

## 5. Offline Local Mode vs Hybrid Cloud Mode

Roja Opticals is built with a dual-mode engine:

| Feature | Standalone Local Mode (`LOCAL_MODE=true`) | Hybrid Cloud Mode (`LOCAL_MODE=false`) |
|---|---|---|
| **Internet Requirement** | 100% Offline (No internet needed) | Needs Internet for Supabase / Sheets |
| **Authentication** | Local Argon/Scrypt Hash + HMAC Session Tokens | Cloud Supabase Auth |
| **Database** | Local JSON storage (`server/local_database/`) | Cloud Supabase + Local Realtime Mirror |
| **WhatsApp Messages** | Generates direct click-to-chat `https://wa.me/` URLs | Automated Twilio WhatsApp API & Scheduler |
| **Google Sheets** | Disabled cleanly without crashes | Realtime two-way synchronization |
