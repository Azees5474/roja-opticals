import { useState, useEffect } from 'react'
import { Eye, EyeOff, Mail, Lock, Shield, Store, User, Phone, MapPin, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function Login({ onLogin }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [name, setName]           = useState('')
  const [shopName, setShopName]   = useState('Roja Opticals')
  const [shopPhone, setShopPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopGstin, setShopGstin] = useState('')
  const [showShopDetails, setShowShopDetails] = useState(false)
  const [showPass, setShowPass]   = useState(false)
  const [remember, setRemember]   = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)

  useEffect(() => {
    // Check if initial master owner provisioning is required
    fetch('/api/auth/setup-status')
      .then(res => res.json())
      .then(data => {
        if (data && data.setupNeeded) {
          setSetupNeeded(true)
        }
      })
      .catch(() => {
        // Fall back to normal login if status check is unreachable
      })
  }, [])

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (authError) {
      setError(authError.message || 'Invalid email or password')
      return
    }

    onLogin(data.user)
  }

  const handleSetupSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPass) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/setup-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || 'Shop Owner',
          shopName: shopName.trim() || 'Roja Opticals',
          shopPhone: shopPhone.trim(),
          shopAddress: shopAddress.trim(),
          shopGstin: shopGstin.trim(),
        }),
      })

      const result = await res.json()
      setLoading(false)

      if (!res.ok) {
        setError(result.message || 'Owner setup failed.')
        return
      }

      // Store local session in browser client
      if (result.access_token) {
        localStorage.setItem('roja_auth_session', JSON.stringify({
          access_token: result.access_token,
          user: result.user,
        }))
      }

      onLogin(result.user)
    } catch {
      setLoading(false)
      setError('Unable to connect to local server for first-run setup.')
    }
  }

  return (
    <div className="login-wrapper">
      {/* Left Panel */}
      <div className="login-left">
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#667eea"/>
              <path d="M6 16a10 10 0 0 1 20 0" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="16" r="4" fill="white"/>
            </svg>
          </div>
          <div>
            <div className="login-brand-name">RojaOpticals</div>
            <div className="login-brand-sub">OPTICALS</div>
          </div>
        </div>

        {/* Animated 3D Eyeglasses Illustration */}
        <div className="eyeglass-3d-container">
          <div className="eyeglass-3d">
            {/* Left Lens with 3D depth */}
            <div className="lens-group lens-left-3d">
              <div className="lens-outer">
                <div className="lens-inner"></div>
                <div className="lens-shine-1"></div>
                <div className="lens-shine-2"></div>
              </div>
            </div>
            
            {/* Right Lens with 3D depth */}
            <div className="lens-group lens-right-3d">
              <div className="lens-outer">
                <div className="lens-inner"></div>
                <div className="lens-shine-1"></div>
                <div className="lens-shine-2"></div>
              </div>
            </div>
            
            {/* Bridge */}
            <div className="bridge bridge-3d">
              <div className="bridge-top"></div>
              <div className="bridge-bottom"></div>
            </div>
            
            {/* Left Temple (arm) */}
            <div className="temple temple-left-3d">
              <div className="temple-segment temple-segment-1"></div>
              <div className="temple-segment temple-segment-2"></div>
              <div className="temple-segment temple-segment-3"></div>
            </div>
            
            {/* Right Temple (arm) */}
            <div className="temple temple-right-3d">
              <div className="temple-segment temple-segment-1"></div>
              <div className="temple-segment temple-segment-2"></div>
              <div className="temple-segment temple-segment-3"></div>
            </div>
            
            {/* Decorative screws */}
            <div className="screw screw-left"></div>
            <div className="screw screw-right"></div>
          </div>
          
          {/* Floating particles */}
          <div className="particle particle-1"></div>
          <div className="particle particle-2"></div>
          <div className="particle particle-3"></div>
          <div className="particle particle-4"></div>
          <div className="particle particle-5"></div>
          <div className="particle particle-6"></div>
          
          {/* Light rays */}
          <div className="light-ray light-ray-1"></div>
          <div className="light-ray light-ray-2"></div>
          <div className="light-ray light-ray-3"></div>
        </div>

        <div className="login-left-bottom">
          <h2>Manage your optical shop smarter.</h2>
          <p>The complete management solution designed for clarity, precision, and trust in high-volume optical retail.</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="login-right">
        <div className="login-form-box">
          {setupNeeded ? (
            <>
              <h1>First-Run Shop Setup</h1>
              <p className="login-subtitle">Create your Master Owner account to secure this installation.</p>

              <form onSubmit={handleSetupSubmit} className="login-form">
                <div className="form-group">
                  <label>Shop Name</label>
                  <div className="input-wrap">
                    <Store className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      placeholder="Roja Opticals"
                      value={shopName}
                      onChange={e => setShopName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Owner Full Name</label>
                  <div className="input-wrap">
                    <User className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type="text"
                      placeholder="Shop Owner"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Owner Email</label>
                  <div className="input-wrap">
                    <Mail className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type="email"
                      placeholder="owner@rojaopticals.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Master Password (min 8 chars, mixed case, number, symbol)</label>
                  <div className="input-wrap">
                    <Lock className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="Create master password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pass"
                      onClick={() => setShowPass(!showPass)}
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Confirm Master Password</label>
                  <div className="input-wrap">
                    <Lock className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="Re-enter master password"
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ margin: '14px 0 10px 0' }}>
                  <button
                    type="button"
                    onClick={() => setShowShopDetails(!showShopDetails)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                    }}
                  >
                    {showShopDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showShopDetails ? 'Hide Shop Contact & Tax Details' : '+ Add Shop Phone, Address & Tax ID (Optional)'}
                  </button>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    You can enter these now or configure them anytime later in Settings.
                  </p>
                </div>

                {showShopDetails && (
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #e2e8f0' }}>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label>Shop Contact Phone</label>
                      <div className="input-wrap">
                        <Phone className="input-icon" size={16} strokeWidth={1.8} />
                        <input
                          type="text"
                          placeholder="e.g. +91 98765 43210"
                          value={shopPhone}
                          onChange={e => setShopPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label>Shop Address</label>
                      <div className="input-wrap">
                        <MapPin className="input-icon" size={16} strokeWidth={1.8} />
                        <input
                          type="text"
                          placeholder="e.g. Shop #4, Commercial Street"
                          value={shopAddress}
                          onChange={e => setShopAddress(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>GSTIN / Tax Registration</label>
                      <div className="input-wrap">
                        <FileText className="input-icon" size={16} strokeWidth={1.8} />
                        <input
                          type="text"
                          placeholder="e.g. 33AAAAA0000A1Z5"
                          value={shopGstin}
                          onChange={e => setShopGstin(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? 'Initializing Shop...' : 'CREATE OWNER ACCOUNT & START'}
                </button>
              </form>

              <div className="secure-note">
                <Shield size={13} strokeWidth={1.5} />
                Master owner credentials will be stored locally with scrypt encryption.
              </div>
            </>
          ) : (
            <>
              <h1>Welcome back</h1>
              <p className="login-subtitle">Sign in to continue to your shop dashboard.</p>

              <form onSubmit={handleLoginSubmit} className="login-form">
                <div className="form-group">
                  <label>Email</label>
                  <div className="input-wrap">
                    <Mail className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type="email"
                      placeholder="owner@your-shop.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Password</label>
                  <div className="input-wrap">
                    <Lock className="input-icon" size={16} strokeWidth={1.8} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pass"
                      onClick={() => setShowPass(!showPass)}
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {error && <div className="login-error">{error}</div>}

                <div className="form-options">
                  <label className="remember-label">
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                    <span>Remember me</span>
                  </label>
                </div>

                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? 'Signing in...' : 'LOGIN'}
                </button>
              </form>

              <div className="secure-note">
                <Shield size={13} strokeWidth={1.5} />
                Secure access for authorized staff only.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
