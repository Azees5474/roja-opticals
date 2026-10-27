# 👓 Roja Opticals - Shop Management Web Application

Roja Opticals is a full-featured optical retail and clinic management system designed for **laptop-local operation** (offline-first) with optional zero-knowledge encrypted cloud backups (Google Drive) and data export (Excel .xlsx).

---

## ⚡ Quick Start on Windows

### Option 1: Standalone Desktop App (Recommended for Shop Owners)
No Node.js, terminal, or developer tools required!

1. **Install**: Double-click [`dist-electron/Roja Opticals Setup 1.0.0.exe`](./dist-electron/Roja%20Opticals%20Setup%201.0.0.exe) to install Roja Opticals on any 64-bit Windows laptop.
2. **Launch**: Launch via the **Desktop shortcut** or Windows **Start Menu** (`Roja Opticals`).
3. **Data Safety**: Customer records, orders, prescriptions, and backups are stored in your secure Windows profile at `%APPDATA%\RojaOpticals\data`. App updates and reinstallation preserve your data automatically.

---

### Option 2: Portable Development / CLI Launcher
1. Double-click `launch-local.bat` in the project root:
   - Verifies Node.js.
   - Automatically builds frontend and installs missing dependencies.
   - Starts backend bound to `127.0.0.1:5000` and opens browser.

### Option 3: Command Line Setup & Build
```powershell
# 1. Install dependencies
npm run setup

# 2. Build frontend production bundle
npm run build

# 3. Build standalone Windows Desktop Installer (.exe)
npm run package

# 4. Run automated test suite (67 security, auth, backup, drive, and export tests)
npm test

# 5. Run frontend linter
npm run lint
```

---

## 🔑 First-Run Setup & Account Provisioning

To comply with high security and privacy standards, **no default passwords or hardcoded sample credentials are shipped with this application**.

1. **Single Documented First-Run Master Owner Setup**:
   - On the very first launch, the login screen automatically detects that no owner account exists and presents the **First-Run Shop Setup** screen.
   - Enter your Shop Name, Owner Full Name, Owner Email, and a strong password (minimum 8 characters, uppercase, lowercase, number, and special character).
   - Enter optional Shop Contact details (Phone, Address, GSTIN / Tax Registration) — or configure them anytime in Settings.
   - Once submitted, the setup wizard is **permanently locked**. No subsequent requests can create additional owner accounts through this flow.

2. **Staff Account Provisioning**:
   - The Shop Owner can log in and provision staff members with restricted roles via **Settings**.
   - Staff accounts have access to day-to-day operations (Customers, Prescriptions, Orders, Billing, Omni-Search, Excel Export), but are blocked from deleting records, modifying shop settings, or performing cloud backups.

---

## 🌟 Key Features

- **🔍 Live Omni-Search:** Search customers, orders, inventory items, and invoices in real-time from anywhere in the application with instant dropdown navigation and URL query syncing.
- **📊 Excel Export (.xlsx):** Export full customer directories, linked prescriptions, and financial KPI summaries to standardized Excel spreadsheets directly from Customers and Reports.
- **☁️ Google Drive Cloud Backup (AES-256-GCM):** Optional off-site cloud backups with zero-knowledge encryption using a passphrase known only to the shop owner.
- **💾 Dependable Local Restore:** Validates all backup records before applying changes, automatically creates a pre-restore disk recovery copy (`pre_restore_backup_<timestamp>.json`), and cleanly purges records absent from the backup.
- **🧾 Dynamic Invoice Printing:** Formats customer bills with the shop's genuine address, phone, and GSTIN; automatically omits unconfigured fields without placeholder text.

---

## 🔒 Security & Local Data Architecture

- **Loopback Binding**: The backend binds strictly to `127.0.0.1` by default to prevent unauthorized access over local Wi-Fi networks.
- **Windows User Profile Isolation**: Data is stored per-user in `%APPDATA%\RojaOpticals\data`.
- **Packaging Exclusions**: Installer builder rules strictly exclude `.env`, `.auth_secret`, `local_database`, backups, and test suites.
- **Server-Side Authorization**: Roles (`owner` vs `staff`) are cryptographically verified on every API request.
- **Atomic Storage Engine**: The local database uses atomic staging writes (`.tmp` + rename) and in-memory promise mutexes to serialize concurrent writes and prevent data corruption.
- **Path Traversal Protection**: Table names and record IDs are validated with strict regex and whitelists, rejecting any directory traversal attempts (`../`).
- **Resilient Fallback**: Corrupted files or temporary files in the data directory are safely skipped without breaking API endpoints.
- **Disaster Recovery**: Automatic pre-restore backups and zero-knowledge Google Drive encrypted cloud archives ensure complete data survivability.
