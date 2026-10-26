import { useEffect, useState } from 'react'
import { User, Mail, Phone, Shield, CheckCircle2, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './PageCommon.css'
import './Settings.css'

export default function OwnerProfile({ user: propUser }) {
  const [profile, setProfile] = useState({
    name: 'Shop Member',
    email: 'member@rojaopticals.com',
    phone: '9876543210',
    role: 'staff',
    shopName: 'Roja Opticals',
    joined: '2022-01-15',
  })

  const [pass, setPass]           = useState({ current: '', newp: '', confirm: '' })
  const [profileSaved, setProfileSaved] = useState(false)
  const [passLoading, setPassLoading]   = useState(false)
  const [passMsg, setPassMsg]           = useState({ text: '', ok: true })
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    async function loadUser() {
      let user = propUser
      if (!user) {
        const { data } = await supabase.auth.getUser()
        user = data?.user
      }
      if (!user) return

      const authoritativeRole = user.app_metadata?.role || user.role || 'staff'
      setProfile(current => ({
        ...current,
        name: user.user_metadata?.name || user.name || current.name,
        email: user.email || current.email,
        phone: user.user_metadata?.phone || current.phone,
        shopName: user.user_metadata?.shopName || current.shopName,
        role: authoritativeRole,
        joined: user.created_at?.slice(0, 10) || current.joined,
      }))
    }
    loadUser()
  }, [propUser])

  const handleSaveProfile = async () => {
    setProfileError('')
    const { error } = await supabase.auth.updateUser({
      data: {
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        shopName: profile.shopName.trim(),
      },
    })
    if (error) { setProfileError(error.message); return }
    setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500)
  }

  // ── Update password ───────────────────────────────────
  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setPassMsg({ text: '', ok: true })

    if (!pass.newp) { setPassMsg({ text: 'Enter a new password.', ok: false }); return }
    if (pass.newp !== pass.confirm) { setPassMsg({ text: 'Passwords do not match.', ok: false }); return }
    if (pass.newp.length < 6) { setPassMsg({ text: 'Password must be at least 6 characters.', ok: false }); return }

    setPassLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pass.newp })
    setPassLoading(false)

    if (error) {
      setPassMsg({ text: error.message, ok: false })
    } else {
      setPassMsg({ text: '✅ Password updated successfully!', ok: true })
      setPass({ current: '', newp: '', confirm: '' })
    }
  }

  const isOwner = String(profile.role).toLowerCase() === 'owner'
  const displayRoleTitle = isOwner ? 'Owner Profile' : 'Staff Profile'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{displayRoleTitle}</h1>
          <p>Manage your personal account details.</p>
        </div>
        <button className="btn-primary" onClick={handleSaveProfile}>
          {profileSaved ? <><CheckCircle2 size={15} /> Saved!</> : 'Save Changes'}
        </button>
      </div>

      {profileSaved && (
        <div className="save-toast"><CheckCircle2 size={16} /> Profile saved successfully.</div>
      )}
      {profileError && <div className="alert-banner" role="alert">{profileError}</div>}

      <div className="settings-grid">
        {/* Profile Info */}
        <div className="settings-card">
          <h2>Profile Information</h2>
          <div className="profile-avatar-row">
            <div className="profile-avatar"><User size={36} color="#0d9488" /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{profile.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                {profile.role} · {profile.shopName}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Member since {profile.joined}</div>
            </div>
          </div>
          <div className="settings-fields" style={{ marginTop: 20 }}>
            {[
              { label: 'Full Name', key: 'name',  Icon: User },
              { label: 'Email',     key: 'email', Icon: Mail },
              { label: 'Phone',     key: 'phone', Icon: Phone },
              { label: 'Role',      key: 'role',  Icon: Shield },
            ].map(({ label, key }) => (
              <div key={key} className="settings-field">
                <label htmlFor={`profile-${key}`}>{label}</label>
                <input
                  id={`profile-${key}`}
                  value={profile[key]}
                  onChange={e => setProfile({ ...profile, [key]: e.target.value })}
                  readOnly={key === 'role' || key === 'email'}
                  style={key === 'role' || key === 'email' ? { background: '#f3f4f6', cursor: 'default' } : {}}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Change Password */}
        <div className="settings-card">
          <h2>Change Password</h2>
          <form onSubmit={handleUpdatePassword}>
            <div className="settings-fields" style={{ gridTemplateColumns: '1fr' }}>
              {[
                { label: 'Current Password',      key: 'current' },
                { label: 'New Password',          key: 'newp' },
                { label: 'Confirm New Password',  key: 'confirm' },
              ].map(({ label, key }) => (
                <div key={key} className="settings-field">
                  <label>{label}</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={pass[key]}
                    onChange={e => setPass({ ...pass, [key]: e.target.value })}
                  />
                </div>
              ))}
              {passMsg.text && (
                <div style={{ fontSize: 13, color: passMsg.ok ? '#059669' : '#dc2626', padding: '6px 0' }}>
                  {passMsg.text}
                </div>
              )}
              <button type="submit" className="btn-primary" style={{ marginTop: 4 }} disabled={passLoading}>
                {passLoading ? <><Loader size={14} className="spin" /> Updating...</> : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

        {/* Security */}
        <div className="settings-card">
          <h2>Security</h2>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0' }}>
            <div style={{ width: 36, height: 36, background: '#d1fae5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={18} color="#059669" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Account Secured</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                Authoritative role: <strong style={{ textTransform: 'capitalize' }}>{profile.role}</strong>. Protected by server session validation.
              </div>
            </div>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
            Local authentication credentials and sessions are securely managed server-side.
          </p>
        </div>
      </div>
    </div>
  )
}
