import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect, Component } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import DashboardLayout from './layouts/DashboardLayout'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Customers = lazy(() => import('./pages/Customers'))
const Billing = lazy(() => import('./pages/Billing'))
const Followups = lazy(() => import('./pages/Followups'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const OwnerProfile = lazy(() => import('./pages/OwnerProfile'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Orders = lazy(() => import('./pages/Orders'))

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore network errors on signout
    }
    setUser(null)
  }

  useEffect(() => {
    // Check existing session on page load
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    const onUnauthorized = () => {
      handleLogout()
    }
    window.addEventListener('roja:unauthorized', onUnauthorized)

    return () => {
      subscription?.unsubscribe?.()
      window.removeEventListener('roja:unauthorized', onUnauthorized)
    }
  }, [])

  // Show loading indicator while verifying session
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#0d9488', fontSize: 15, fontFamily: 'Inter, sans-serif' }}>Loading...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />}
        />
        <Route
          path="/"
          element={user ? <DashboardLayout onLogout={handleLogout} user={user} /> : <Navigate to="/" replace />}
        >
          <Route path="dashboard"     element={<Page><Dashboard /></Page>} />
          <Route path="customers"     element={<Page><Customers /></Page>} />
          <Route path="billing"       element={<Page><Billing /></Page>} />
          <Route path="inventory"     element={<Page><Inventory /></Page>} />
          <Route path="orders"        element={<Page><Orders /></Page>} />
          <Route path="follow-ups"    element={<Page><Followups /></Page>} />
          <Route path="reports"       element={<Page><Reports /></Page>} />
          <Route path="settings"      element={<Page><Settings /></Page>} />
          <Route path="owner-profile" element={<Page><OwnerProfile user={user} /></Page>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[UI ErrorBoundary]:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
          <h2 style={{ color: '#ef4444', marginBottom: 8 }}>Unable to load this section</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 16px',
              background: '#0d9488',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Page({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: 24, color: '#0d9488' }}>Loading…</div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
