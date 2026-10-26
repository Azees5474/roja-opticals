import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, DollarSign, FileText, PhoneCall,
  TrendingUp, TrendingDown, ArrowRight,
  UserPlus, Receipt, X, Loader, User
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import FloatingParticles from '../components/FloatingParticles'
import './Dashboard.css'
import './Customers.css'
import './PageCommon.css'

// ── today's date string yyyy-mm-dd ────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)

// ── last N days labels ────────────────────────────────────
function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

// ── Shared helper: find or create customer ────────────────
async function resolveCustomerId(name) {
  const { data: existing } = await supabase
    .from('customers').select('id').ilike('name', name).limit(1)
  if (existing && existing.length > 0) return { id: existing[0].id, error: null }
  const { data: newCust, error } = await supabase
    .from('customers').insert([{ name, phone: 'N/A' }]).select().single()
  return { id: newCust?.id ?? null, error }
}

const emptyRx = {
  date: '', doctor: '',
  right_sph: '', right_cyl: '', right_axis: '',
  left_sph: '',  left_cyl: '',  left_axis: '',
}

// ── Modal: Add Customer + optional Prescription ───────────
function AddCustomerModal({ onClose }) {
  const [custForm, setCustForm] = useState({ name: '', phone: '', email: '', age: '' })
  const [rxForm, setRxForm]     = useState(emptyRx)
  const [addRx, setAddRx]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    
    try {
      // Use API to create customer (handles welcome message)
      const newCustomer = await api.post('/customers', {
        name: custForm.name,
        phone: custForm.phone,
        email: custForm.email || null,
        age: custForm.age ? Number(custForm.age) : null
      })
      
      console.log('Customer created:', newCustomer)
      
      // Handle welcome message if available
      if (newCustomer.welcomeMessage?.success) {
        const wm = newCustomer.welcomeMessage
        console.log('Welcome message:', wm)
        
        // If using wa.me method, open WhatsApp in new tab
        if (wm.method === 'wa.me' && wm.url) {
          console.log('Opening WhatsApp URL:', wm.url)
          window.open(wm.url, '_blank')
        } else if (wm.method === 'twilio') {
          console.log('Welcome message sent via Twilio automatically!')
        }
      }
      
      // Add prescription if requested
      if (addRx && (rxForm.right_sph || rxForm.left_sph || rxForm.doctor)) {
        const { error: rxErr } = await supabase.from('prescriptions').insert([{
          customer_id: newCustomer.id,
          date: rxForm.date || null,
          doctor: rxForm.doctor || null,
          right_sph: rxForm.right_sph || null,
          right_cyl: rxForm.right_cyl || null,
          right_axis: rxForm.right_axis ? parseInt(rxForm.right_axis) : null,
          left_sph: rxForm.left_sph || null,
          left_cyl: rxForm.left_cyl || null,
          left_axis: rxForm.left_axis ? parseInt(rxForm.left_axis) : null,
        }])
        
        if (rxErr) {
          setError('Customer saved, prescription failed: ' + rxErr.message)
          setSaving(false)
          return
        }
      }
      
      setSaving(false)
      setSuccess(true)
      setTimeout(onClose, 1200)
      
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Add Customer" onClose={onClose}>
      {success ? <div className="modal-success">✅ {addRx ? 'Customer & prescription saved!' : 'Customer added!'}</div> : (
        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-section-title"><User size={14} /> Customer Information</div>
          <div className="modal-fields">
            <div className="field"><label>Full Name *</label><input required placeholder="John Doe" value={custForm.name} onChange={e => setCustForm({...custForm, name: e.target.value})} /></div>
            <div className="field"><label>Phone *</label><input required placeholder="9XXXXXXXXX" value={custForm.phone} onChange={e => setCustForm({...custForm, phone: e.target.value})} /></div>
            <div className="field"><label>Email</label><input type="email" placeholder="email@example.com" value={custForm.email} onChange={e => setCustForm({...custForm, email: e.target.value})} /></div>
            <div className="field"><label>Age</label><input type="number" placeholder="30" value={custForm.age} onChange={e => setCustForm({...custForm, age: e.target.value})} /></div>
          </div>
          <div className="rx-toggle-row">
            <label className="rx-toggle-label">
              <input type="checkbox" checked={addRx} onChange={e => setAddRx(e.target.checked)} />
              <FileText size={14} /><span>Also add eye prescription</span>
            </label>
          </div>
          {addRx && (
            <>
              <div className="modal-section-title" style={{ marginTop: 4 }}><FileText size={14} /> Prescription</div>
              <div className="modal-fields">
                <div className="field"><label>Date</label><input type="date" value={rxForm.date} onChange={e => setRxForm({...rxForm, date: e.target.value})} /></div>
                <div className="field"><label>Doctor</label><input placeholder="Dr. Mehta" value={rxForm.doctor} onChange={e => setRxForm({...rxForm, doctor: e.target.value})} /></div>
              </div>
              <RxInputGrid f={rxForm} update={(k,v) => setRxForm(p => ({...p,[k]:v}))} />
            </>
          )}
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={14} className="spin" /> Saving...</> : addRx ? 'Save Customer & Prescription' : 'Add Customer'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

// ── Modal: Add Prescription ───────────────────────────────
function AddPrescriptionModal({ onClose }) {
  const [form, setForm]   = useState({ customer_name: '', date: '', right_sph: '', right_cyl: '', right_axis: '', left_sph: '', left_cyl: '', left_axis: '', doctor: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    const { id: customerId, error: ce } = await resolveCustomerId(form.customer_name)
    if (ce) { setError(ce.message); setSaving(false); return }
    const { error } = await supabase.from('prescriptions').insert([{
      customer_id: customerId, date: form.date || null, doctor: form.doctor || null,
      right_sph: form.right_sph || null, right_cyl: form.right_cyl || null, right_axis: form.right_axis ? parseInt(form.right_axis) : null,
      left_sph: form.left_sph || null, left_cyl: form.left_cyl || null, left_axis: form.left_axis ? parseInt(form.left_axis) : null,
    }])
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true); setTimeout(onClose, 1200)
  }

  return (
    <ModalShell title="Add Prescription" onClose={onClose}>
      {success ? <div className="modal-success">✅ Prescription saved!</div> : (
        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-fields">
            <div className="field"><label>Customer Name *</label><input required placeholder="John Doe" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} /></div>
            <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            <div className="field full"><label>Doctor</label><input placeholder="Dr. Mehta" value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})} /></div>
          </div>
          <RxInputGrid f={form} update={(k,v) => setForm(p => ({...p,[k]:v}))} />
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={14} className="spin" /> Saving...</> : 'Save Prescription'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

// ── Modal: Generate Invoice ───────────────────────────────
function GenerateInvoiceModal({ onClose }) {
  const [form, setForm]   = useState({ customer_name: '', items: '1', subtotal: '', discount: '0', gst: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const total = (parseFloat(form.subtotal)||0) - (parseFloat(form.discount)||0) + (parseFloat(form.gst)||0)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    const { id: customerId, error: ce } = await resolveCustomerId(form.customer_name)
    if (ce) { setError(ce.message); setSaving(false); return }
    const { error } = await supabase.from('billing').insert([{
      customer_id: customerId, items: Number(form.items), subtotal: Number(form.subtotal),
      discount: Number(form.discount), gst: Number(form.gst), total, paid: false,
    }])
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true); setTimeout(onClose, 1200)
  }

  return (
    <ModalShell title="Generate Invoice" onClose={onClose}>
      {success ? <div className="modal-success">✅ Invoice generated!</div> : (
        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-fields">
            <div className="field full"><label>Customer Name *</label><input required placeholder="John Doe" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} /></div>
            <div className="field"><label>No. of Items</label><input type="number" value={form.items} onChange={e => setForm({...form, items: e.target.value})} /></div>
            <div className="field"><label>Subtotal (₹) *</label><input required type="number" placeholder="1500" value={form.subtotal} onChange={e => setForm({...form, subtotal: e.target.value})} /></div>
            <div className="field"><label>Discount (₹)</label><input type="number" placeholder="0" value={form.discount} onChange={e => setForm({...form, discount: e.target.value})} /></div>
            <div className="field"><label>GST (₹)</label><input type="number" placeholder="0" value={form.gst} onChange={e => setForm({...form, gst: e.target.value})} /></div>
            <div className="field"><label>Total</label><input readOnly value={`₹ ${total.toFixed(2)}`} style={{ background:'#f3f4f6', fontWeight:700 }} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader size={14} className="spin" /> Saving...</> : 'Generate'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

// ── RxInputGrid (outside component) ──────────────────────
function RxInputGrid({ f, update }) {
  return (
    <div className="rx-grid">
      <div className="rx-grid-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
      {[['right','Right Eye (OD)'],['left','Left Eye (OS)']].map(([side, label]) => (
        <div key={side} className="rx-grid-row">
          <div className="rx-eye-label">{label}</div>
          <div><input placeholder="-1.50" value={f[`${side}_sph`]}  onChange={e => update(`${side}_sph`,  e.target.value)} /></div>
          <div><input placeholder="-0.50" value={f[`${side}_cyl`]}  onChange={e => update(`${side}_cyl`,  e.target.value)} /></div>
          <div><input type="number" placeholder="90" value={f[`${side}_axis`]} onChange={e => update(`${side}_axis`, e.target.value)} /></div>
        </div>
      ))}
    </div>
  )
}

// ── Modal Shell ───────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [activeModal, setActiveModal] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('7D')

  // ── Real-time stats ───────────────────────────────────
  const [stats, setStats] = useState({ customers: 0, sales: 0, prescriptions: 0, followups: 0 })
  const [followupsToday, setFollowupsToday] = useState([])
  const [chartData, setChartData] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  const fetchDashboardData = async () => {
    setLoadingData(true)
    const today = todayStr()

    // ── Stats ──
    const [
      { count: custCount },
      { count: rxCount },
      { count: fuCount },
      { data: billingToday },
    ] = await Promise.all([
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('prescriptions').select('*', { count: 'exact', head: true }),
      supabase.from('followups').select('*', { count: 'exact', head: true }).eq('done', false),
      supabase.from('billing').select('total').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59'),
    ])
    const todaySales = (billingToday || []).reduce((s, b) => s + (b.total || 0), 0)
    setStats({ customers: custCount || 0, sales: todaySales, prescriptions: rxCount || 0, followups: fuCount || 0 })

    // ── Follow-ups today ──
    const { data: fuToday } = await supabase
      .from('followups')
      .select('*, customers(name)')
      .eq('done', false)
      .eq('due_date', today)
      .order('priority', { ascending: true })
      .limit(5)
    setFollowupsToday((fuToday || []).map(f => ({
      ...f,
      customer_name: f.customers?.name || 'Unknown',
    })))

    // ── Chart data ──
    const days = chartPeriod === 'Today' ? 1 : chartPeriod === '7D' ? 7 : 30
    const dateRange = lastNDays(days)
    const startDate = dateRange[0] + 'T00:00:00'
    const { data: billingAll } = await supabase
      .from('billing')
      .select('total, created_at')
      .gte('created_at', startDate)

    // Group by date
    const grouped = {}
    dateRange.forEach(d => { grouped[d] = 0 })
    ;(billingAll || []).forEach(b => {
      const d = b.created_at?.slice(0, 10)
      if (grouped[d] !== undefined) grouped[d] += b.total || 0
    })

    // Format labels
    const chart = dateRange.map(d => {
      const date = new Date(d)
      const label = days === 1
        ? 'Today'
        : days <= 7
          ? date.toLocaleDateString('en-IN', { weekday: 'short' })
          : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      return { day: label, sales: Math.round(grouped[d]) }
    })
    setChartData(chart)
    setLoadingData(false)
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      await fetchDashboardData()
      if (cancelled) return
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod])

  const priorityIcon = (p) => p === 'High' ? '🔴' : p === 'Medium' ? '🟡' : '🟢'

  const statsDisplay = [
    { icon: Users,      label: 'TOTAL CUSTOMERS', value: stats.customers.toLocaleString('en-IN'), trend: '', up: null,  color: '#dbeafe' },
    { icon: DollarSign, label: "TODAY'S SALES",   value: `₹${stats.sales.toLocaleString('en-IN')}`, trend: '', up: null, color: '#fef3c7' },
    { icon: FileText,   label: 'PRESCRIPTIONS',   value: stats.prescriptions.toLocaleString('en-IN'), trend: '', up: null, color: '#d1fae5' },
    { icon: PhoneCall,  label: 'FOLLOW-UPS DUE',  value: stats.followups.toLocaleString('en-IN'),  trend: stats.followups > 0 ? 'Pending' : 'Clear', up: stats.followups > 0 ? false : true, color: '#e9d5ff' },
  ]

  const quickActions = [
    { label: 'Add Customer',     color: '#1e40af', icon: UserPlus,  modal: 'customer' },
    { label: 'Add Prescription', color: '#7c3aed', icon: FileText,  modal: 'prescription' },
    { label: 'Generate Invoice', color: '#0891b2', icon: Receipt,   modal: 'invoice' },
  ]

  return (
    <div className="dashboard">
      <FloatingParticles count={15} />
      
      <div className="dashboard-header">
        <h1>Good morning, Owner 👋</h1>
        <p>Here&apos;s what&apos;s happening in your optical shop today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statsDisplay.map((stat, idx) => (
          <div key={idx} className="stat-card">
            <div className="stat-icon" style={{ background: stat.color }}>
              <stat.icon size={20} strokeWidth={1.8} />
            </div>
            <div className="stat-content">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">
                {loadingData ? <Loader size={18} className="spin" /> : stat.value}
              </div>
            </div>
            {stat.trend && (
              <div className={`stat-trend${stat.up === true ? ' up' : stat.up === false ? ' down' : ''}`}>
                {stat.up === true  && <TrendingUp size={13} />}
                {stat.up === false && <TrendingDown size={13} />}
                <span>{stat.trend}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="dashboard-main">
        <div className="dash-left">
          <section className="dash-section">
            <div className="section-header">
              <h2>Sales Analytics</h2>
              <div className="chart-tabs">
                {['Today','7D','30D'].map(p => (
                  <button key={p} className={`chart-tab${chartPeriod === p ? ' active' : ''}`} onClick={() => setChartPeriod(p)}>{p}</button>
                ))}
              </div>
            </div>
            <div className="chart-container">
              {loadingData ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#9ca3af', gap:8 }}>
                  <Loader size={16} className="spin" /> Loading chart...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} cursor={{ fill: 'rgba(13,148,136,0.05)' }} formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Sales']} />
                    <Bar dataKey="sales" fill="#5eead4" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>

        <div className="dash-right">
          <section className="dash-section">
            <div className="section-header">
              <h2>Follow-ups Today</h2>
              <button className="link-btn" onClick={() => navigate('/follow-ups')}>
                View All <ArrowRight size={14} />
              </button>
            </div>
            <div className="followups-list">
              {loadingData ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, color:'#9ca3af', fontSize:13 }}>
                  <Loader size={14} className="spin" /> Loading...
                </div>
              ) : followupsToday.length === 0 ? (
                <div style={{ color:'#9ca3af', fontSize:13, textAlign:'center', padding:'12px 0' }}>
                  No follow-ups due today 🎉
                </div>
              ) : (
                followupsToday.map((f) => (
                  <div key={f.id} className="followup-item">
                    <div className="followup-icon">{priorityIcon(f.priority)}</div>
                    <div className="followup-info">
                      <div className="followup-name">{f.customer_name}</div>
                      <div className="followup-type">{f.type}</div>
                    </div>
                    <button
                      className="whatsapp-btn-small"
                      onClick={async () => {
                        try {
                          console.log('WhatsApp button clicked for follow-up:', f.id)
                          
                          // Get token from Supabase session
                          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
                          
                          if (sessionError) {
                            console.error('Session error:', sessionError)
                            alert('Authentication error. Please refresh and try again.')
                            return
                          }
                          
                          const token = session?.access_token
                          
                          if (!token) {
                            console.error('No authentication token found')
                            alert('Not authenticated. Please login again.')
                            return
                          }
                          
                          console.log('Fetching WhatsApp URL...')
                          const response = await fetch(`http://localhost:5000/api/followups/${f.id}/whatsapp-url`, {
                            headers: {
                              'Authorization': `Bearer ${token}`,
                            },
                          });
                          
                          console.log('Response status:', response.status)
                          const result = await response.json();
                          console.log('Response data:', result)
                          
                          if (!response.ok) {
                            console.error('API error:', result.message)
                            alert('Failed to prepare WhatsApp message: ' + (result.message || 'Unknown error'))
                            return
                          }
                          
                          if (result.success && result.url) {
                            console.log('Opening WhatsApp URL:', result.url);
                            window.open(result.url, '_blank');
                          } else {
                            console.error('No URL in response:', result)
                            alert('Failed to generate WhatsApp URL')
                          }
                        } catch (err) {
                          console.error('Failed to prepare WhatsApp message:', err);
                          alert('Error: ' + err.message)
                        }
                      }}
                      title="Send WhatsApp reminder"
                    >
                      📱
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="dash-section">
            <div className="section-header"><h2>Quick Actions</h2></div>
            <div className="actions-grid">
              {quickActions.map((action) => (
                <button key={action.label} className="action-btn" style={{ background: action.color }}
                  onClick={() => setActiveModal(action.modal)}>
                  <action.icon size={18} strokeWidth={2} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {activeModal === 'customer'     && <AddCustomerModal     onClose={() => { setActiveModal(null); fetchDashboardData() }} />}
      {activeModal === 'prescription' && <AddPrescriptionModal onClose={() => { setActiveModal(null); fetchDashboardData() }} />}
      {activeModal === 'invoice'      && <GenerateInvoiceModal onClose={() => { setActiveModal(null); fetchDashboardData() }} />}
    </div>
  )
}
