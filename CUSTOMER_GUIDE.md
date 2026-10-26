# 👓 Roja Opticals — Customer & Shop Owner Guide

A complete, practical guide to installing, configuring, running, and backing up your Roja Opticals system on Windows.

---

## 1. Overview & Architecture

Roja Opticals is a desktop application engineered specifically for optical retail stores and clinics.

- **100% Offline Capability:** Your live database is stored locally on your laptop. It does not require an active internet connection for daily billing, customer records, inventory, or prescriptions.
- **Data Privacy & Storage Location:** All shop data is saved securely in your Windows user profile:
  ```text
  %APPDATA%\RojaOpticals\data
  ```
  *(Full Windows path: `C:\Users\<YourUsername>\AppData\Roaming\RojaOpticals\data`)*
- **Data Preservation:** Updating the application or reinstalling will never delete or overwrite your customer data or database files.

---

## 2. Installation on Windows

### Installing the Desktop App
1. Locate the installer executable: `Roja Opticals Setup 1.0.0.exe`.
2. Double-click to start installation.
3. Choose your desired install location (default is recommended) and click **Install**.
4. Once installation completes, launch **Roja Opticals** from the Desktop shortcut or Start Menu.

> [!NOTE]
> If Windows Defender SmartScreen displays *"Windows protected your PC"*, click **More info** followed by **Run anyway**. This is standard for newly built internal enterprise installers.

---

## 3. First-Run Master Owner Setup

When launching Roja Opticals for the very first time on a new laptop, the application automatically detects that no owner account exists and displays the **First-Run Shop Setup** screen.

### Setting Up Your Master Account:
1. **Shop Name:** Enter your optical business name (e.g., *Roja Opticals*).
2. **Owner Full Name:** Enter the primary shop proprietor or doctor name.
3. **Owner Email:** Enter your official business or personal email address.
4. **Master Password:** Create a strong password (minimum 8 characters with at least one uppercase letter, lowercase letter, number, and special symbol).
5. **Shop Contact & Tax Details (Optional):**
   - Click **+ Add Shop Phone, Address & Tax ID** to enter your shop contact number, physical address, and GSTIN / Tax ID.
   - *Note: You can also enter or edit these details at any time later in Settings.*
6. Click **CREATE OWNER ACCOUNT & START**.

### Setup Permanent Lock:
- Once your Master Owner account is created, the first-run wizard is **permanently locked**.
- No additional owner accounts can ever be created through the setup screen.
- **Staff Accounts:** The shop owner can add staff members from the **Settings** page. Staff members have daily operational access (Customers, Prescriptions, Orders, Billing) but are blocked from deleting records or altering shop settings.

---

## 4. Daily Operations

### 🔍 Omni-Search Bar
Use the search bar at the top of the window to instantly search across all records:
- **Instant Dropdown:** Search customers, orders, inventory items, and invoices in real-time.
- **Direct Navigation:** Click any search result to open that customer, order, or item directly.
- **Deep Filtering:** Press **Enter** to open the full page with your search filter pre-applied.

### 👓 Customer & Prescription Management
- Record customer contact details, age, visit history, and prescription notes (Sph, Cyl, Axis, Addition, PD).
- Set reminders for upcoming follow-up appointments (30-day comfort reviews, 180-day routine checkups).

### 🧾 Invoices & Receipts
- Generate itemized bills with subtotal, discount, GST, and payment status.
- Click the **Print** icon to generate customer invoices.
- Invoices dynamically display your configured shop name, address, phone, and GSTIN. If any contact or tax field is unconfigured, it is cleanly omitted without showing placeholder text.

### 📊 Excel Data Export
- Export your customer records, prescriptions, and financial KPI summaries to standardized Excel spreadsheets (`.xlsx`) directly from **Customers** and **Reports**.

---

## 5. Backup & Recovery

Regular backups protect your business against laptop theft, hardware failure, or liquid damage.

### Local Backups (Automatic & Manual)
- Manual backups can be created at any time from **Settings → Database Backups**.
- Backups are stored on your local drive at:
  ```text
  %APPDATA%\RojaOpticals\backups
  ```
- **Dependable Restore:**
  - When restoring from a backup, the system **automatically creates a pre-restore safety copy** on disk (`pre_restore_backup_<timestamp>.json`) before applying any changes.
  - The restore engine validates all tables and record IDs before touching live files.
  - Records present on disk but absent from the backup are cleanly removed so your restored state is an exact match.
  - In the unlikely event of an interruption, changes are automatically rolled back to your pre-restore snapshot.

### Cloud Backups (Optional Google Drive)
For off-site disaster recovery, you can connect an optional Google Drive account in **Settings**:
- Backups are encrypted locally with **AES-256-GCM (Zero-Knowledge encryption)** before upload.
- Backups are uploaded into a dedicated `Roja Opticals Backups` folder in your private Google Drive.
- **Passphrase Security:** You choose a secret encryption passphrase when creating a cloud backup. The passphrase is never stored on disk or sent to the cloud. You will need this passphrase to restore the backup.

---

## 6. Internet Access & Cloud Credentials Summary

| Feature | Internet Required? | Accounts / Credentials Needed |
| :--- | :---: | :--- |
| **Shop Management** *(Customers, Billing, Inventory)* | ❌ **No (100% Offline)** | None (Laptop-Local) |
| **Excel Export (.xlsx)** | ❌ **No (100% Offline)** | None |
| **Local Backup & Restore** | ❌ **No (100% Offline)** | None |
| **WhatsApp Messages via wa.me** | 🌐 **Yes** *(at time of sending)* | Free WhatsApp Web or Desktop App |
| **Google Drive Cloud Backup** *(Optional)* | 🌐 **Yes** *(during sync only)* | Free Google Cloud OAuth Client ID |
| **Twilio SMS / WhatsApp API** *(Optional)* | 🌐 **Yes** *(during send)* | Twilio Account SID & Token |

---

## 7. Moving to a Replacement Laptop

If you purchase a new laptop or need to transfer your Roja Opticals installation:

### Method A: Transfer via Local Folder Copy (Fastest)
1. Install **Roja Opticals** on the new laptop.
2. On your old laptop, open Windows File Explorer and navigate to:
   ```text
   %APPDATA%\RojaOpticals
   ```
3. Copy the `data` folder onto a USB flash drive.
4. On the new laptop, paste the `data` folder into `%APPDATA%\RojaOpticals\data`.
5. Launch Roja Opticals on the new laptop — all customers, bills, inventory, and your owner login are immediately available.

### Method B: Restore via Backup File
1. On your old laptop, go to **Settings → Database Backups** and click **Create Backup**.
2. Copy the generated `.json` backup file from `%APPDATA%\RojaOpticals\backups` to a USB drive.
3. On the new laptop, install Roja Opticals and complete the First-Run Setup.
4. Copy the backup file into `%APPDATA%\RojaOpticals\backups` on the new laptop.
5. In **Settings**, select the backup file and click **Restore**.

### Method C: Restore via Google Drive
1. Install Roja Opticals on the new laptop and complete the First-Run Setup.
2. In **Settings → Google Drive**, enter your Google OAuth Client credentials and click **Connect Google Drive**.
3. Click **View Backups & Restore**.
4. Select your latest backup from Google Drive, enter your secret encryption passphrase, and click **Restore Database**.

---

## 8. Technical Support & Safety Tips

- **BitLocker Drive Encryption:** For maximum customer data privacy, enable Windows BitLocker on your shop laptop (`Start Menu → Manage BitLocker`). This prevents unauthorized access to customer files if the physical laptop is stolen.
- **Strong Master Password:** Keep your Master Owner password written in a secure physical location (e.g., your store safe).
- **Weekly Off-Site Backup:** Save a local backup copy to an external USB flash drive or your connected Google Drive once a week.
