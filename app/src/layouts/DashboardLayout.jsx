import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard, Users,
  CreditCard, PhoneCall, BarChart2, Package, ClipboardList,
  Settings, UserCircle, Eye, Bell, HelpCircle,
  Search, LogOut, Menu, X, CheckCircle2, Clock,
  AlertTriangle, Info, ChevronRight
} from 'lucide-react'
import { api } from '../lib/api'
import AnimatedBackground from '../components/AnimatedBackground'
import ScrollIndicator from '../components/ScrollIndicator'
import './DashboardLayout.css'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers',  icon: Users,            label: 'Customers' },
  { to: '/inventory',  icon: Package,          label: 'Inventory' },
  { to: '/orders',     icon: ClipboardList,    label: 'Orders' },
  { to: '/billing',    icon: CreditCard,       label: 'Billing' },
  { to: '/follow-ups', icon: PhoneCall,        label: 'Follow-ups' },
  { to: '/reports',    icon: BarChart2,        label: 'Reports' },
]

const NOTIFICATIONS = [
  { id: 1, icon: CheckCircle2, color: '#059669', bg: '#d1fae5', title: 'Order Ready',        desc: 'James Wilson\'s order is ready for pickup.',   time: '5 min ago',  read: false },
  { id: 2, icon: Clock,        color: '#d97706', bg: '#fef3c7', title: 'Follow-up Due',       desc: 'Lisa Thorne\'s annual eye exam is due today.',  time: '1 hr ago',   read: false },
  { id: 3, icon: AlertTriangle,color: '#dc2626', bg: '#fee2e2', title: 'Payment Pending',     desc: 'Invoice INV-002 for Michael Chen is unpaid.',   time: '2 hrs ago',  read: true  },
  { id: 4, icon: Info,         color: '#2563eb', bg: '#dbeafe', title: 'New Customer',        desc: 'Priya Sharma was added to the system.',         time: 'Yesterday',  read: true  },
]

const HELP_LINKS = [
  { label: 'How to add a customer',       desc: 'Step-by-step guide for adding new customers.' },
  { label: 'Recording prescriptions',     desc: 'How to enter OD/OS prescription values.' },
  { label: 'Generating invoices',         desc: 'Create and print billing invoices.' },
  { label: 'Managing follow-ups',         desc: 'Track and complete customer follow-up tasks.' },
  { label: 'Contact support',             desc: 'Reach us at support@rojaopticals.com' },
]

export default function DashboardLayout({ onLogout, user }) {
  const role = String(user?.app_metadata?.role || user?.role || 'staff').toLowerCase()
  const isOwner = role === 'owner'
  const displayRole = isOwner ? 'Owner' : 'Staff'
  const displayName = user?.user_metadata?.name || user?.name || (isOwner ? 'Shop Owner' : 'Staff Member')
  const displayEmail = user?.email || (isOwner ? 'owner@rojaopticals.com' : 'staff@rojaopticals.com')

  const bottomItems = [
    { to: '/settings',      icon: Settings,   label: 'Settings' },
    { to: '/owner-profile', icon: UserCircle, label: isOwner ? 'Owner Profile' : 'Staff Profile' },
  ]

  const [search, setSearch]                     = useState('')
  const [searchResults, setSearchResults]       = useState({ customers: [], orders: [], inventory: [], pages: [] })
  const [searchLoading, setSearchLoading]       = useState(false)
  const [searchOpen, setSearchOpen]             = useState(false)
  const [sidebarOpen, setSidebarOpen]           = useState(false)
  const [notifOpen, setNotifOpen]               = useState(false)
  const [helpOpen, setHelpOpen]                 = useState(false)
  const [profileOpen, setProfileOpen]           = useState(false)
  const [notifications, setNotifications]       = useState(NOTIFICATIONS)

  const notifRef      = useRef(null)
  const helpRef       = useRef(null)
  const profileRef    = useRef(null)
  const searchWrapRef = useRef(null)

  const navigate = useNavigate()

  const unread = notifications.filter(n => !n.read).length

  // Debounced search queries across customers, orders, inventory, and pages
  useEffect(() => {
    const query = search.trim().toLowerCase()
    if (!query) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const cleanNum = query.replace(/\D/g, '')

        const [custRes, ordRes, invRes] = await Promise.allSettled([
          api.get('/customers'),
          api.get('/orders'),
          api.get('/inventory'),
        ])

        const customers = custRes.status === 'fulfilled' && Array.isArray(custRes.value) ? custRes.value : []
        const orders = ordRes.status === 'fulfilled' && Array.isArray(ordRes.value) ? ordRes.value : []
        const inventory = invRes.status === 'fulfilled' && Array.isArray(invRes.value) ? invRes.value : []

        const matchedCustomers = customers.filter(c => 
          (c.name || '').toLowerCase().includes(query) ||
          (cleanNum.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(cleanNum)) ||
          (c.email || '').toLowerCase().includes(query) ||
          (c.customer_id || c.id || '').toString().toLowerCase().includes(query)
        ).slice(0, 5)

        const matchedOrders = orders.filter(o => 
          (o.customer_name || '').toLowerCase().includes(query) ||
          (o.product || '').toLowerCase().includes(query) ||
          (o.id || '').toString().toLowerCase().includes(query)
        ).slice(0, 4)

        const matchedInventory = inventory.filter(i => 
          (i.name || '').toLowerCase().includes(query) ||
          (i.brand || '').toLowerCase().includes(query) ||
          (i.sku || '').toLowerCase().includes(query)
        ).slice(0, 4)

        const allNavPages = [
          { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/customers', label: 'Customers Directory', icon: Users },
          { to: '/inventory', label: 'Inventory Stock', icon: Package },
          { to: '/orders', label: 'Orders Management', icon: ClipboardList },
          { to: '/billing', label: 'Billing & Invoices', icon: CreditCard },
          { to: '/follow-ups', label: 'Follow-ups & Recalls', icon: PhoneCall },
          { to: '/reports', label: 'Reports & Export', icon: BarChart2 },
          { to: '/settings', label: 'Settings & Cloud Backup', icon: Settings },
          { to: '/owner-profile', label: isOwner ? 'Owner Profile' : 'Staff Profile', icon: UserCircle },
        ]

        const matchedPages = allNavPages.filter(p => 
          p.label.toLowerCase().includes(query)
        ).slice(0, 3)

        if (!cancelled) {
          setSearchResults({
            customers: matchedCustomers,
            orders: matchedOrders,
            inventory: matchedInventory,
            pages: matchedPages,
          })
        }
      } catch (err) {
        console.warn('Topbar search query error:', err)
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 180)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, isOwner])

  const hasResults =
    searchResults.customers.length > 0 ||
    searchResults.orders.length > 0 ||
    searchResults.inventory.length > 0 ||
    searchResults.pages.length > 0

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const trimmed = search.trim()
    if (!trimmed) return
    setSearchOpen(false)
    navigate(`/customers?q=${encodeURIComponent(trimmed)}`)
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current      && !notifRef.current.contains(e.target))      setNotifOpen(false)
      if (helpRef.current       && !helpRef.current.contains(e.target))       setHelpOpen(false)
      if (profileRef.current    && !profileRef.current.contains(e.target))    setProfileOpen(false)
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const markRead    = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))

  const closeAll = () => { setNotifOpen(false); setHelpOpen(false); setProfileOpen(false) }

  const toggleNotif   = () => { const o = !notifOpen; closeAll(); setNotifOpen(o) }
  const toggleHelp    = () => { const o = !helpOpen;  closeAll(); setHelpOpen(o) }
  const toggleProfile = () => { const o = !profileOpen; closeAll(); setProfileOpen(o) }

  return (
    <div className="app-layout">
      <AnimatedBackground />
      
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Eye size={18} color="white" />
          </div>
          <div>
            <div className="sidebar-brand-name">RojaOpticals</div>
            <div className="sidebar-brand-sub">OPTICALS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {bottomItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button className="sidebar-link sidebar-logout" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.8} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="main-area">
        <ScrollIndicator />
        
        {/* Topbar */}
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="search-wrap" ref={searchWrapRef}>
            <form className="search-form" onSubmit={handleSearchSubmit}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search customers, orders, inventory, or pages... (Press Enter)"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  if (!searchOpen && e.target.value.trim()) setSearchOpen(true)
                }}
                onFocus={() => {
                  if (search.trim()) setSearchOpen(true)
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false)
                    e.currentTarget.blur()
                  }
                }}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => {
                    setSearch('')
                    setSearchOpen(false)
                  }}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
              <button type="submit" className="search-submit-btn" title="Search everywhere" aria-label="Search">
                <ChevronRight size={16} />
              </button>
            </form>

            {/* Live Search Results Dropdown */}
            {searchOpen && search.trim() && (
              <div className="search-results-dropdown">
                {searchLoading ? (
                  <div className="search-dropdown-loading">
                    <div className="search-spinner" />
                    <span>Searching Roja Opticals database…</span>
                  </div>
                ) : hasResults ? (
                  <div className="search-results-body">
                    {/* Customers Category */}
                    {searchResults.customers.length > 0 && (
                      <div className="search-category-group">
                        <div className="search-category-header">
                          <Users size={13} />
                          <span>Customers</span>
                          <span className="search-category-count">{searchResults.customers.length}</span>
                        </div>
                        {searchResults.customers.map(c => (
                          <div
                            key={c.id}
                            className="search-result-item"
                            onClick={() => {
                              setSearchOpen(false)
                              navigate(`/customers?q=${encodeURIComponent(c.name || c.phone || '')}`)
                            }}
                          >
                            <div className="search-avatar">
                              {(c.name || 'C')[0].toUpperCase()}
                            </div>
                            <div className="search-item-info">
                              <div className="search-item-title">{c.name}</div>
                              <div className="search-item-meta">
                                {c.phone && <span>📞 {c.phone}</span>}
                                {c.email && <span>✉️ {c.email}</span>}
                              </div>
                            </div>
                            <ChevronRight size={14} className="search-item-arrow" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Orders Category */}
                    {searchResults.orders.length > 0 && (
                      <div className="search-category-group">
                        <div className="search-category-header">
                          <ClipboardList size={13} />
                          <span>Orders</span>
                          <span className="search-category-count">{searchResults.orders.length}</span>
                        </div>
                        {searchResults.orders.map(o => (
                          <div
                            key={o.id}
                            className="search-result-item"
                            onClick={() => {
                              setSearchOpen(false)
                              navigate(`/orders?q=${encodeURIComponent(o.customer_name || o.product || o.id || '')}`)
                            }}
                          >
                            <div className="search-item-badge">#{String(o.id).slice(0, 6)}</div>
                            <div className="search-item-info">
                              <div className="search-item-title">{o.customer_name || 'Customer Order'}</div>
                              <div className="search-item-meta">
                                <span>{o.product}</span>
                                {o.amount && <span>₹{Number(o.amount).toLocaleString('en-IN')}</span>}
                                <span className={`search-status-tag status-${(o.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                  {o.status}
                                </span>
                              </div>
                            </div>
                            <ChevronRight size={14} className="search-item-arrow" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inventory Category */}
                    {searchResults.inventory.length > 0 && (
                      <div className="search-category-group">
                        <div className="search-category-header">
                          <Package size={13} />
                          <span>Inventory</span>
                          <span className="search-category-count">{searchResults.inventory.length}</span>
                        </div>
                        {searchResults.inventory.map(i => (
                          <div
                            key={i.id}
                            className="search-result-item"
                            onClick={() => {
                              setSearchOpen(false)
                              navigate(`/inventory?q=${encodeURIComponent(i.name || i.sku || '')}`)
                            }}
                          >
                            <div className="search-item-icon-box">
                              <Package size={14} color="#0d9488" />
                            </div>
                            <div className="search-item-info">
                              <div className="search-item-title">{i.name}</div>
                              <div className="search-item-meta">
                                <span>{i.brand}</span>
                                <span className="mono">{i.sku}</span>
                                <span className="search-stock-tag">Stock: {i.stock}</span>
                              </div>
                            </div>
                            <ChevronRight size={14} className="search-item-arrow" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Pages Category */}
                    {searchResults.pages.length > 0 && (
                      <div className="search-category-group">
                        <div className="search-category-header">
                          <Eye size={13} />
                          <span>Pages & Navigation</span>
                        </div>
                        {searchResults.pages.map(p => (
                          <div
                            key={p.to}
                            className="search-result-item"
                            onClick={() => {
                              setSearchOpen(false)
                              navigate(p.to)
                            }}
                          >
                            <div className="search-item-icon-box">
                              <p.icon size={14} color="#6366f1" />
                            </div>
                            <div className="search-item-info">
                              <div className="search-item-title">{p.label}</div>
                              <div className="search-item-meta">
                                <span>Jump to {p.to}</span>
                              </div>
                            </div>
                            <ChevronRight size={14} className="search-item-arrow" />
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      className="search-dropdown-footer"
                      onClick={() => {
                        setSearchOpen(false)
                        navigate(`/customers?q=${encodeURIComponent(search.trim())}`)
                      }}
                    >
                      <span>Press <kbd>↵ Enter</kbd> to search <strong>&ldquo;{search}&rdquo;</strong> in Customers</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                ) : (
                  <div className="search-empty-state">
                    <Search size={24} className="search-empty-icon" />
                    <div className="search-empty-text">No records found matching &ldquo;{search}&rdquo;</div>
                    <button
                      type="button"
                      className="search-empty-btn"
                      onClick={() => {
                        setSearchOpen(false)
                        navigate(`/customers?q=${encodeURIComponent(search.trim())}`)
                      }}
                    >
                      Search for &ldquo;{search}&rdquo; in Customers page <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="topbar-actions">

            {/* ── Notifications ── */}
            <div className="topbar-dropdown-wrap" ref={notifRef}>
              <button className="icon-btn notif-btn" title="Notifications" onClick={toggleNotif}>
                <Bell size={18} strokeWidth={1.8} />
                {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notifOpen && (
                <div className="dropdown notif-dropdown">
                  <div className="dropdown-header">
                    <span>Notifications</span>
                    {unread > 0 && (
                      <button className="dropdown-action-link" onClick={markAllRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notif-list">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className={`notif-item${n.read ? ' read' : ''}`}
                        onClick={() => markRead(n.id)}
                      >
                        <div className="notif-icon" style={{ background: n.bg }}>
                          <n.icon size={14} color={n.color} />
                        </div>
                        <div className="notif-body">
                          <div className="notif-title">{n.title}</div>
                          <div className="notif-desc">{n.desc}</div>
                          <div className="notif-time">{n.time}</div>
                        </div>
                        {!n.read && <div className="notif-unread-dot" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Help ── */}
            <div className="topbar-dropdown-wrap" ref={helpRef}>
              <button className="icon-btn" title="Help" onClick={toggleHelp}>
                <HelpCircle size={18} strokeWidth={1.8} />
              </button>

              {helpOpen && (
                <div className="dropdown help-dropdown">
                  <div className="dropdown-header">
                    <span>Help & Support</span>
                  </div>
                  <div className="help-list">
                    {HELP_LINKS.map((h, i) => (
                      <div key={i} className="help-item">
                        <div>
                          <div className="help-title">{h.label}</div>
                          <div className="help-desc">{h.desc}</div>
                        </div>
                        <ChevronRight size={14} color="#9ca3af" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Profile ── */}
            <div className="topbar-dropdown-wrap" ref={profileRef}>
              <button className="icon-btn avatar-btn" title="Profile" onClick={toggleProfile}>
                <UserCircle size={22} strokeWidth={1.5} />
              </button>

              {profileOpen && (
                <div className="dropdown profile-dropdown">
                  <div className="profile-dropdown-top">
                    <div className="profile-avatar-sm">
                      <UserCircle size={32} color="#0d9488" />
                    </div>
                    <div>
                      <div className="profile-name">{displayName}</div>
                      <div className="profile-email">{displayEmail}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isOwner ? '#0d9488' : '#6b7280', textTransform: 'uppercase', marginTop: 2, letterSpacing: '0.05em' }}>
                        Role: {displayRole}
                      </div>
                    </div>
                  </div>
                  <div className="dropdown-divider" />
                  <button className="profile-menu-item" onClick={() => { navigate('/owner-profile'); closeAll() }}>
                    <UserCircle size={15} /> {isOwner ? 'Owner Profile' : 'My Profile'}
                  </button>
                  <button className="profile-menu-item" onClick={() => { navigate('/settings'); closeAll() }}>
                    <Settings size={15} /> Settings
                  </button>
                  <div className="dropdown-divider" />
                  <button className="profile-menu-item logout-item" onClick={handleLogout}>
                    <LogOut size={15} /> Logout
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
