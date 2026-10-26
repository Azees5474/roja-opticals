import { useState, useEffect } from 'react'
import {
  CheckCircle2, Send, Clock, MessageSquare, Cloud, CloudUpload,
  CloudDownload, Key, ShieldCheck, AlertCircle, RefreshCw,
  Lock, Eye, EyeOff, Settings as SettingsIcon, LogOut, Check,
  AlertTriangle
} from 'lucide-react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import './PageCommon.css'
import './Settings.css'

export default function Settings({ user }) {
  const [shop, setShop] = useState({
    name: 'Roja Opticals',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  })

  const [notif, setNotif] = useState({
    orderReady: true,
    followupDue: true,
    lowStock: true,
    billing: false,
  })

  const [saved, setSaved] = useState(false)
  const [whatsappSettings, setWhatsappSettings] = useState(null)
  const [running, setRunning] = useState(false)
  const [runMessage, setRunMessage] = useState('')
  const [error, setError] = useState('')

  // Current user role
  const [userRole, setUserRole] = useState(user?.app_metadata?.role || user?.role || '')

  // ── Google Drive State ────────────────────────────────────
  const [driveStatus, setDriveStatus] = useState(null)
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveError, setDriveError] = useState('')
  const [driveSuccess, setDriveSuccess] = useState('')

  // Modals
  const [showDriveConfig, setShowDriveConfig] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)

  // Drive Config form
  const [clientIdInput, setClientIdInput] = useState('')
  const [clientSecretInput, setClientSecretInput] = useState('')

  // Backup Form
  const [backupPassphrase, setBackupPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [showPassphraseText, setShowPassphraseText] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgressMsg, setBackupProgressMsg] = useState('')

  // Restore Form
  const [backupsList, setBackupsList] = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState(null)
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreProgressMsg, setRestoreProgressMsg] = useState('')

  // Retention and Auto-Backup
  const [retentionCount, setRetentionCount] = useState(10)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)

  async function loadUserRole() {
    try {
      const { data } = await supabase.auth.getSession()
      const role = data.session?.user?.app_metadata?.role || data.session?.user?.role || 'staff'
      setUserRole(role)
    } catch {
      setUserRole('staff')
    }
  }

  async function loadWhatsAppSettings() {
    try {
      const data = await api.get('/whatsapp/settings')
      setWhatsappSettings(data)
    } catch (err) {
      console.warn('Failed to load WhatsApp settings:', err.message)
    }
  }

  async function loadShopSettings() {
    try {
      const data = await api.get('/settings')
      if (Object.keys(data.shop || {}).length) setShop(current => ({ ...current, ...data.shop }))
      if (Object.keys(data.notifications || {}).length) setNotif(current => ({ ...current, ...data.notifications }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadDriveStatus() {
    try {
      setDriveLoading(true)
      const data = await api.get('/drive/status')
      setDriveStatus(data)
      setRetentionCount(data.retentionCount || 10)
      setAutoBackupEnabled(Boolean(data.autoBackupEnabled))
      if (data.clientIdConfigured) {
        setClientIdInput('••••••••••••••••')
      }
    } catch (err) {
      console.warn('Google Drive status check error:', err.message)
    } finally {
      setDriveLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUserRole()
      void loadWhatsAppSettings()
      void loadShopSettings()
      void loadDriveStatus()
    }, 0)

    // Listen for OAuth popup completion
    const handleAuthMessage = (event) => {
      if (event.data?.type === 'GOOGLE_DRIVE_AUTH_SUCCESS') {
        setDriveSuccess('Google Drive connected successfully!')
        void loadDriveStatus()
        setTimeout(() => setDriveSuccess(''), 4000)
      } else if (event.data?.type === 'GOOGLE_DRIVE_AUTH_ERROR') {
        setDriveError('Google authorization was not completed: ' + (event.data.error || 'Denied'))
      }
    }
    window.addEventListener('message', handleAuthMessage)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('message', handleAuthMessage)
    }
  }, [])

  // ── Drive Actions ─────────────────────────────────────────

  const handleConnectDrive = async () => {
    setDriveError('')
    setDriveSuccess('')
    try {
      const { authUrl } = await api.get('/drive/auth-url')
      if (!authUrl) throw new Error('Could not generate authorization URL.')

      // Open OAuth popup
      const width = 560
      const height = 650
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2
      const popup = window.open(
        authUrl,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
      )

      // Fallback check if popup was closed
      const checkPopup = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup)
          void loadDriveStatus()
        }
      }, 1000)
    } catch (err) {
      setDriveError(err.message || 'Failed to start Google Drive authorization. Check your Client credentials.')
    }
  }

  const handleSaveDriveConfig = async (e) => {
    e.preventDefault()
    setDriveError('')
    try {
      await api.post('/drive/config', {
        clientId: clientIdInput,
        clientSecret: clientSecretInput,
      })
      setShowDriveConfig(false)
      setDriveSuccess('Google OAuth credentials saved successfully!')
      setTimeout(() => setDriveSuccess(''), 3000)
      void loadDriveStatus()
    } catch (err) {
      setDriveError(err.message || 'Failed to save Google OAuth configuration')
    }
  }

  const handleDisconnectDrive = async () => {
    if (!window.confirm('Disconnect Google Drive? Existing backups on your Drive will remain safe, but automated cloud backups will stop.')) {
      return
    }
    setDriveError('')
    try {
      await api.post('/drive/disconnect')
      setDriveSuccess('Google Drive disconnected safely.')
      setTimeout(() => setDriveSuccess(''), 3000)
      void loadDriveStatus()
    } catch (err) {
      setDriveError(err.message || 'Failed to disconnect Google Drive')
    }
  }

  const handleTriggerBackup = async (e) => {
    e.preventDefault()
    if (!backupPassphrase || backupPassphrase.length < 4) {
      setDriveError('Encryption passphrase must be at least 4 characters long.')
      return
    }
    if (backupPassphrase !== confirmPassphrase) {
      setDriveError('Passphrase and confirmation do not match.')
      return
    }

    setBackingUp(true)
    setBackupProgressMsg('Taking snapshot of local database and encrypting with AES-256-GCM...')
    setDriveError('')

    try {
      const res = await api.post('/drive/backup', {
        passphrase: backupPassphrase,
        retentionCount: Number(retentionCount),
      })

      setBackupProgressMsg('')
      setBackingUp(false)
      setShowBackupModal(false)
      setBackupPassphrase('')
      setConfirmPassphrase('')
      setDriveSuccess(`Encrypted backup "${res.file?.name}" successfully uploaded to Google Drive!`)
      setTimeout(() => setDriveSuccess(''), 5000)
      void loadDriveStatus()
    } catch (err) {
      setBackingUp(false)
      setBackupProgressMsg('')
      setDriveError(err.message || 'Backup upload failed')
    }
  }

  const handleOpenRestoreModal = async () => {
    setShowRestoreModal(true)
    setSelectedBackup(null)
    setRestorePassphrase('')
    setRestoreConfirmChecked(false)
    setDriveError('')
    setLoadingBackups(true)
    try {
      const res = await api.get('/drive/backups')
      setBackupsList(res.files || [])
    } catch (err) {
      setDriveError(err.message || 'Failed to fetch backups list from Google Drive')
    } finally {
      setLoadingBackups(false)
    }
  }

  const handleExecuteRestore = async (e) => {
    e.preventDefault()
    if (!selectedBackup) {
      setDriveError('Please select a backup from the list.')
      return
    }
    if (!restorePassphrase) {
      setDriveError('Please enter the encryption passphrase for this backup.')
      return
    }
    if (!restoreConfirmChecked) {
      setDriveError('Please check the confirmation box acknowledging database restoration.')
      return
    }

    setRestoring(true)
    setRestoreProgressMsg('Downloading encrypted backup from Google Drive...')
    setDriveError('')

    try {
      const res = await api.post('/drive/restore', {
        fileId: selectedBackup.id,
        passphrase: restorePassphrase,
        confirm: true,
      })

      setRestoring(false)
      setRestoreProgressMsg('')
      setShowRestoreModal(false)
      setSelectedBackup(null)
      setRestorePassphrase('')
      setRestoreConfirmChecked(false)

      const totalRestored = Object.values(res.restored || {}).reduce((a, b) => a + b, 0)
      setDriveSuccess(`Database restored successfully (${totalRestored} records across ${Object.keys(res.restored || {}).length} tables). Pre-restore safety backup: ${res.preRestoreBackup}`)
      setTimeout(() => setDriveSuccess(''), 6000)
    } catch (err) {
      setRestoring(false)
      setRestoreProgressMsg('')
      setDriveError(err.message || 'Restore failed. Any in-progress changes were safely rolled back.')
    }
  }

  const handleSaveRetentionSettings = async (newRetention, newAuto) => {
    try {
      await api.put('/drive/settings', {
        retentionCount: newRetention,
        autoBackupEnabled: newAuto,
      })
      setDriveSuccess('Drive settings updated.')
      setTimeout(() => setDriveSuccess(''), 2500)
      void loadDriveStatus()
    } catch (err) {
      setDriveError(err.message || 'Failed to update Drive settings')
    }
  }

  // ── Existing Settings Handlers ────────────────────────────

  const handleWhatsAppToggle = async (field) => {
    const updated = { ...whatsappSettings, [field]: !whatsappSettings[field] }
    setWhatsappSettings(updated)
    try {
      await api.put('/whatsapp/settings', updated)
      setError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Failed to update WhatsApp settings:', err.message)
      setError(err.message || 'Owner access required to change WhatsApp settings.')
      setWhatsappSettings(whatsappSettings)
    }
  }

  const handleRunScheduler = async () => {
    setRunning(true)
    setRunMessage('Processing...')
    try {
      await api.post('/whatsapp/run-now')
      setRunMessage('✓ Scheduler triggered successfully! Check console for details.')
      setTimeout(() => setRunMessage(''), 5000)
    } catch (err) {
      setRunMessage('✗ Failed to trigger scheduler: ' + err.message)
      setTimeout(() => setRunMessage(''), 5000)
    } finally {
      setRunning(false)
    }
  }

  const handleShopChange = (field, val) => setShop({ ...shop, [field]: val })

  const handleSave = async () => {
    try {
      const data = await api.put('/settings', { shop, notifications: notif })
      setShop(current => ({ ...current, ...data.shop }))
      setNotif(current => ({ ...current, ...data.notifications }))
      setError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    }
  }

  const isOwner = userRole === 'owner'

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Settings</h1><p>Configure shop profile, notifications, and cloud backups.</p></div>
        <button className="btn-primary" onClick={handleSave}>
          {saved ? <><CheckCircle2 size={15} /> Saved!</> : 'Save Changes'}
        </button>
      </div>

      {saved && (
        <div className="save-toast">
          <CheckCircle2 size={16} /> Settings saved successfully.
        </div>
      )}
      {error && <div className="alert-banner" role="alert">{error}</div>}
      {driveError && (
        <div className="alert-banner" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171' }} role="alert">
          <AlertCircle size={16} style={{ display: 'inline', marginRight: 6 }} />
          {driveError}
        </div>
      )}
      {driveSuccess && (
        <div className="save-toast" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' }}>
          <CheckCircle2 size={16} /> {driveSuccess}
        </div>
      )}

      <div className="settings-grid">
        {/* ── GOOGLE DRIVE BACKUP & RESTORE CARD ── */}
        <div className="settings-card full-span-card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #0284c7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '8px', borderRadius: '8px' }}>
                <Cloud size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, padding: 0, border: 'none', fontSize: 16 }}>Google Drive Cloud Backup (AES-256 Encrypted)</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Optional secondary cloud backup destination. Your working database always stays safe on this laptop.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {driveStatus?.connected ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                  <Check size={14} /> Connected: {driveStatus.email || 'Google Account'}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                  Not Connected
                </span>
              )}
            </div>
          </div>

          {!isOwner ? (
            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: '0.9rem', color: '#64748b' }}>
              <ShieldCheck size={16} style={{ display: 'inline', marginRight: 6, color: '#0284c7' }} />
              Google Drive backup and restore operations are restricted to the <strong>Shop Owner</strong> account.
            </div>
          ) : (
            <div>
              {/* Drive Status Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '16px' }}>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>ENCRYPTION STANDARD</small>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock size={13} color="#059669" /> AES-256-GCM (Zero-Knowledge)
                  </span>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>TARGET DRIVE FOLDER</small>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
                    📁 Roja Opticals Backups
                  </span>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>LAST SUCCESSFUL CLOUD BACKUP</small>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
                    {driveStatus?.lastBackupTime ? new Date(driveStatus.lastBackupTime).toLocaleString('en-IN') : 'None recorded'}
                  </span>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>PERMISSION SCOPE</small>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
                    drive.file (App files only)
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                {driveStatus?.connected ? (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => setShowBackupModal(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7' }}
                    >
                      <CloudUpload size={16} /> Back Up Now to Drive
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={handleOpenRestoreModal}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <CloudDownload size={16} /> View Backups & Restore
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={() => setShowDriveConfig(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <SettingsIcon size={15} /> Credentials
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={handleDisconnectDrive}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
                    >
                      <LogOut size={15} /> Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-primary"
                      onClick={handleConnectDrive}
                      disabled={driveLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7' }}
                    >
                      <Cloud size={16} /> Connect Google Drive
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={() => setShowDriveConfig(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <SettingsIcon size={15} /> Setup OAuth Client ID
                    </button>
                  </>
                )}
              </div>

              {/* Retention Policy & Controls */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor="retention-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                    Backup Retention:
                  </label>
                  <select
                    id="retention-select"
                    value={retentionCount}
                    onChange={(e) => {
                      const count = Number(e.target.value)
                      setRetentionCount(count)
                      handleSaveRetentionSettings(count, autoBackupEnabled)
                    }}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value={5}>Keep latest 5 backups</option>
                    <option value={10}>Keep latest 10 backups (Recommended)</option>
                    <option value={30}>Keep latest 30 backups</option>
                    <option value={0}>Unlimited (Do not auto-delete)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label className="toggle-switch" style={{ width: 36, height: 20 }}>
                    <input
                      type="checkbox"
                      checked={autoBackupEnabled}
                      onChange={(e) => {
                        const val = e.target.checked
                        setAutoBackupEnabled(val)
                        handleSaveRetentionSettings(retentionCount, val)
                      }}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                    Enable scheduled daily cloud backup (Requires laptop to be powered on)
                  </span>
                </div>
              </div>

              {/* Zero-knowledge explanation */}
              <div style={{ marginTop: '12px', background: '#eff6ff', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.5 }}>
                <Key size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                <strong>Zero-Knowledge Encryption Notice:</strong> Backup payloads are strongly encrypted with AES-256-GCM using your personal passphrase before being sent to Google Drive. The encryption key is derived locally and never leaves your laptop. If you lose your passphrase, backup contents cannot be restored by anyone.
              </div>
            </div>
          )}
        </div>

        {/* ── BACKUP MODAL ── */}
        {showBackupModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudUpload size={20} color="#0284c7" />
                  <h3 style={{ margin: 0 }}>Create Encrypted Cloud Backup</h3>
                </div>
                <button className="modal-close" onClick={() => !backingUp && setShowBackupModal(false)}>✕</button>
              </div>

              <form onSubmit={handleTriggerBackup} style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: 0 }}>
                  Enter a secret passphrase to encrypt your database backup. You will need this exact passphrase to restore the backup in the future.
                </p>

                <div className="settings-field" style={{ marginBottom: 12 }}>
                  <label>Encryption Passphrase</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassphraseText ? 'text' : 'password'}
                      value={backupPassphrase}
                      onChange={(e) => setBackupPassphrase(e.target.value)}
                      placeholder="Enter minimum 4 characters"
                      required
                      minLength={4}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphraseText(!showPassphraseText)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                    >
                      {showPassphraseText ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="settings-field" style={{ marginBottom: 16 }}>
                  <label>Confirm Passphrase</label>
                  <input
                    type={showPassphraseText ? 'text' : 'password'}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Re-enter passphrase"
                    required
                  />
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '10px 12px', borderRadius: 6, fontSize: '0.8rem', color: '#92400e', marginBottom: 16 }}>
                  <AlertTriangle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  <strong>Important:</strong> Do not forget this passphrase. For security reasons, Roja Opticals does not store your passphrase on the server or in the cloud.
                </div>

                {backingUp && (
                  <div style={{ padding: '10px', background: '#f0fdf4', color: '#166534', borderRadius: 6, fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} className="spin" />
                    <span>{backupProgressMsg || 'Uploading backup...'}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowBackupModal(false)} disabled={backingUp}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ background: '#0284c7' }} disabled={backingUp}>
                    {backingUp ? 'Encrypting & Uploading...' : 'Start Backup'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── RESTORE MODAL ── */}
        {showRestoreModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudDownload size={20} color="#0284c7" />
                  <h3 style={{ margin: 0 }}>Restore from Google Drive Backup</h3>
                </div>
                <button className="modal-close" onClick={() => !restoring && setShowRestoreModal(false)}>✕</button>
              </div>

              <div style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: 0 }}>
                  Select an encrypted backup from your Google Drive folder. A local pre-restore safety snapshot will automatically be taken before any changes are applied.
                </p>

                {loadingBackups ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
                    <div>Loading backups from Google Drive...</div>
                  </div>
                ) : backupsList.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: '#64748b' }}>
                    No backups found in your "Roja Opticals Backups" folder. Create a backup first.
                  </div>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Backup File</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Created Date</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Size</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Select</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupsList.map((f) => (
                          <tr
                            key={f.id}
                            onClick={() => setSelectedBackup(f)}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              background: selectedBackup?.id === f.id ? '#e0f2fe' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontWeight: 500 }}>{f.name}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>
                              {f.createdTime ? new Date(f.createdTime).toLocaleString('en-IN') : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                              {f.size ? `${(f.size / 1024).toFixed(1)} KB` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <input
                                type="radio"
                                name="selected_backup"
                                checked={selectedBackup?.id === f.id}
                                onChange={() => setSelectedBackup(f)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedBackup && (
                  <form onSubmit={handleExecuteRestore} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                    <div style={{ marginBottom: 12, fontSize: '0.88rem' }}>
                      <strong>Selected:</strong> {selectedBackup.name}
                    </div>

                    <div className="settings-field" style={{ marginBottom: 12 }}>
                      <label>Decryption Passphrase for this Backup</label>
                      <input
                        type="password"
                        value={restorePassphrase}
                        onChange={(e) => setRestorePassphrase(e.target.value)}
                        placeholder="Enter the passphrase used when creating this backup"
                        required
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={restoreConfirmChecked}
                          onChange={(e) => setRestoreConfirmChecked(e.target.checked)}
                          required
                          style={{ marginTop: 2 }}
                        />
                        <span>
                          I confirm that I want to restore from this cloud backup. I understand this will update current records. The system will create an automatic local pre-restore safety snapshot beforehand.
                        </span>
                      </label>
                    </div>

                    {restoring && (
                      <div style={{ padding: '10px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, fontSize: '0.85rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <RefreshCw size={16} className="spin" />
                        <span>{restoreProgressMsg || 'Restoring database safely...'}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowRestoreModal(false)} disabled={restoring}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" style={{ background: '#0284c7' }} disabled={restoring || !restoreConfirmChecked}>
                        {restoring ? 'Verifying & Restoring...' : 'Restore Database'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DRIVE CONFIG MODAL ── */}
        {showDriveConfig && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SettingsIcon size={18} color="#0284c7" />
                  <h3 style={{ margin: 0 }}>Configure Google OAuth Client</h3>
                </div>
                <button className="modal-close" onClick={() => setShowDriveConfig(false)}>✕</button>
              </div>

              <form onSubmit={handleSaveDriveConfig} style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>
                  Enter your Google Cloud Console OAuth 2.0 Client credentials. Credentials are saved locally on this laptop in your secure per-user AppData storage.
                </p>

                <div className="settings-field" style={{ marginBottom: 12 }}>
                  <label>OAuth Client ID</label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                    required
                  />
                </div>

                <div className="settings-field" style={{ marginBottom: 14 }}>
                  <label>OAuth Client Secret</label>
                  <input
                    type="password"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder="Enter Google Client Secret"
                    required
                  />
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, fontSize: '0.8rem', color: '#475569', marginBottom: 16 }}>
                  <strong>Authorized Redirect URI in Google Cloud Console:</strong>
                  <code style={{ display: 'block', background: '#e2e8f0', padding: '4px 6px', borderRadius: 4, marginTop: 4, color: '#0f172a' }}>
                    http://127.0.0.1:5000/api/drive/callback
                  </code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowDriveConfig(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ background: '#0284c7' }}>
                    Save Credentials
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── SHOP INFORMATION ── */}
        <div className="settings-card">
          <h2>Shop Information</h2>
          <div className="settings-fields">
            {[
              { label: 'Shop Name', key: 'name' },
              { label: 'Phone',     key: 'phone' },
              { label: 'Email',     key: 'email' },
              { label: 'GSTIN',     key: 'gstin' },
            ].map(({ label, key }) => (
              <div key={key} className="settings-field">
                <label htmlFor={`shop-${key}`}>{label}</label>
                <input id={`shop-${key}`} value={shop[key]} onChange={e => handleShopChange(key, e.target.value)} />
              </div>
            ))}
            <div className="settings-field full">
              <label htmlFor="shop-address">Address</label>
              <textarea id="shop-address" rows={2} value={shop.address} onChange={e => handleShopChange('address', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── NOTIFICATIONS ── */}
        <div className="settings-card">
          <h2>Notifications</h2>
          <div className="toggle-list">
            {[
              { key: 'orderReady',  label: 'Order Ready alerts' },
              { key: 'followupDue', label: 'Follow-up due reminders' },
              { key: 'lowStock',    label: 'Low stock warnings' },
              { key: 'billing',     label: 'Payment confirmations' },
            ].map(({ key, label }) => (
              <div key={key} className="toggle-row">
                <span>{label}</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={notif[key]} onChange={() => setNotif({...notif, [key]: !notif[key]})} />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* ── PREFERENCES ── */}
        <div className="settings-card">
          <h2>Preferences</h2>
          <div className="settings-fields">
            <div className="settings-field">
              <label>Currency</label>
              <select value={shop.currency} onChange={e => handleShopChange('currency', e.target.value)}>
                <option value="INR">INR – Indian Rupee</option>
                <option value="USD">USD – US Dollar</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Timezone</label>
              <select value={shop.timezone} onChange={e => handleShopChange('timezone', e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── WHATSAPP AUTOMATION ── */}
        {whatsappSettings && (
          <div className="settings-card whatsapp-automation">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MessageSquare size={20} />
              <h2 style={{ margin: 0, padding: 0, border: 'none' }}>WhatsApp Automation</h2>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
              Automated follow-up messages are sent daily at 9:00 AM for due customers.
            </p>

            <div className="toggle-list">
              <div className="toggle-row">
                <span>
                  <strong>Master Switch</strong>
                  <small style={{ display: 'block', color: '#666' }}>Enable all WhatsApp reminders</small>
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.enabled}
                    onChange={() => handleWhatsAppToggle('enabled')}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-row">
                <span>
                  Welcome Messages
                  <small style={{ display: 'block', color: '#666' }}>Send when new customer is registered</small>
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.welcome_message !== false}
                    onChange={() => handleWhatsAppToggle('welcome_message')}
                    disabled={!whatsappSettings.enabled}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-row">
                <span>
                  30-Day Review Messages
                  <small style={{ display: 'block', color: '#666' }}>Check comfort with new glasses</small>
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.review_30day}
                    onChange={() => handleWhatsAppToggle('review_30day')}
                    disabled={!whatsappSettings.enabled}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-row">
                <span>
                  180-Day Checkup Messages
                  <small style={{ display: 'block', color: '#666' }}>6-month eye exam reminder</small>
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.checkup_180day}
                    onChange={() => handleWhatsAppToggle('checkup_180day')}
                    disabled={!whatsappSettings.enabled}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
              <button
                className="btn-primary"
                onClick={handleRunScheduler}
                disabled={running}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {running ? <Clock size={16} /> : <Send size={16} />}
                {running ? 'Processing...' : 'Run Scheduler Now (Manual Trigger)'}
              </button>
              {runMessage && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  borderRadius: '6px',
                  background: runMessage.startsWith('✓') ? '#d1fae5' : '#fee2e2',
                  color: runMessage.startsWith('✓') ? '#065f46' : '#991b1b',
                  fontSize: '0.9rem'
                }}>
                  {runMessage}
                </div>
              )}
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '12px', textAlign: 'center' }}>
                <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Automatic run: Daily at 9:00 AM IST
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
