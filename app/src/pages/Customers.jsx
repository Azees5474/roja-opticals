import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Plus, Phone, Mail, Eye, Pencil, Trash2, Loader, X,
  FileText, User, Hash, UsersRound, FileSpreadsheet, Download,
  CheckCircle2, AlertCircle, Shield
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import './PageCommon.css'
import './Customers.css'

const emptyRx = {
  date: '', doctor: '',
  right_sph: '', right_cyl: '', right_axis: '',
  left_sph: '',  left_cyl: '',  left_axis: '',
}

const COLS = '40px 1.4fr 130px 1fr 60px 110px 110px'

const normalizePhone = (value = '') => value.replace(/\D/g, '')
const shortCustomerId = (id = '') => id.toString().replace(/-/g, '').slice(-8).toUpperCase()

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ customer, onClose, onEditRequest }) {
  const [tab, setTab] = useState('profile')

  const [rxList,      setRxList]      = useState([])
  const [rxLoading,   setRxLoading]   = useState(false)
  const [showRxForm,  setShowRxForm]  = useState(false)
  const [rxForm,      setRxForm]      = useState(emptyRx)
  const [rxSaving,    setRxSaving]    = useState(false)
  const [rxError,     setRxError]     = useState('')

  const [bills,       setBills]       = useState([])
  const [billLoading, setBillLoading] = useState(false)

  // NEW — follow-up data for this customer
  const [fuList,      setFuList]      = useState([])
  const [fuLoading,   setFuLoading]   = useState(false)
  const [nextVisit,   setNextVisit]   = useState(customer.next_visit_date || '')
  const [nvSaving,    setNvSaving]    = useState(false)
  const [nvSaved,     setNvSaved]     = useState(false)

  // Fetch prescriptions when tab opens
  useEffect(() => {
    if (tab !== 'prescriptions') return
    let cancelled = false
    const fetchRx = async () => {
      setRxLoading(true)
      const { data } = await supabase.from('prescriptions')
        .select('*').eq('customer_id', customer.id).order('date', { ascending: false })
      if (!cancelled) { setRxList(data || []); setRxLoading(false) }
    }
    fetchRx()
    return () => { cancelled = true }
  }, [tab, customer.id])

  // Fetch billing when tab opens
  useEffect(() => {
    if (tab !== 'billing') return
    let cancelled = false
    const fetchBills = async () => {
      setBillLoading(true)
      const { data } = await supabase.from('billing')
        .select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })
      if (!cancelled) { setBills(data || []); setBillLoading(false) }
    }
    fetchBills()
    return () => { cancelled = true }
  }, [tab, customer.id])

  // NEW — fetch follow-ups when tab opens
  useEffect(() => {
    if (tab !== 'followups') return
    let cancelled = false
    supabase.from('followups').select('*').eq('customer_id', customer.id).order('due_date', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) { setFuList(data || []); setFuLoading(false) }
      })
    return () => { cancelled = true }
  }, [tab, customer.id])

  const saveNextVisit = async () => {
    setNvSaving(true)
    await supabase.from('customers').update({ next_visit_date: nextVisit || null }).eq('id', customer.id)
    setNvSaving(false); setNvSaved(true)
    setTimeout(() => setNvSaved(false), 2000)
  }

  const saveRx = async (e) => {
    e.preventDefault()
    setRxError('')
    setRxSaving(true)
    const { error } = await supabase.from('prescriptions').insert([{
      customer_id: customer.id,
      date:       rxForm.date     || null,
      doctor:     rxForm.doctor   || null,
      right_sph:  rxForm.right_sph  || null,
      right_cyl:  rxForm.right_cyl  || null,
      right_axis: rxForm.right_axis ? parseInt(rxForm.right_axis) : null,
      left_sph:   rxForm.left_sph   || null,
      left_cyl:   rxForm.left_cyl   || null,
      left_axis:  rxForm.left_axis  ? parseInt(rxForm.left_axis)  : null,
    }])
    setRxSaving(false)
    if (error) { setRxError(error.message); return }
    setRxForm(emptyRx)
    setShowRxForm(false)
    // Refresh list
    const { data } = await supabase.from('prescriptions')
      .select('*').eq('customer_id', customer.id).order('date', { ascending: false })
    setRxList(data || [])
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Customer Profile</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* ── Customer card always visible ── */}
        <div className="view-customer-card">
          <div className="view-avatar"><User size={28} color="#0d9488" /></div>
          <div className="view-customer-info">
            <div className="view-customer-name">{customer.name}</div>
            <div className="view-customer-meta">
              <span><Phone size={12} /> {customer.phone}</span>
              {customer.email && <span><Mail size={12} /> {customer.email}</span>}
              {customer.age   && <span>Age: {customer.age}</span>}
              <span>Joined: {customer.created_at?.slice(0, 10)}</span>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="profile-tabs" style={{ marginTop: 18 }}>
          {[['profile','Profile'],['prescriptions','Prescriptions'],['billing','Billing'],['followups','Follow-ups']].map(([key, label]) => (
            <button
              key={key}
              className={`profile-tab${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >{label}</button>
          ))}
        </div>

        {/* ── Profile Tab ── */}
        {tab === 'profile' && (
          <div>
            <div className="modal-section-title"><User size={14} /> Customer Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', background:'#f9fafb', borderRadius:10, padding:'16px', border:'1.5px solid #f1f5f9' }}>
              {[
                ['Full Name',    customer.name],
                ['Phone',        customer.phone],
                ['Email',        customer.email || '—'],
                ['Age',          customer.age   || '—'],
                ['Date Joined',  customer.created_at?.slice(0, 10) || '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize:11.5, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{val}</div>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn-primary" onClick={() => { onClose(); onEditRequest(customer) }}>
                <Pencil size={14} /> Edit Customer
              </button>
              <button className="btn-cancel" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ── Prescriptions Tab ── */}
        {tab === 'prescriptions' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div className="modal-section-title" style={{ marginBottom:0 }}><FileText size={14} /> Prescription History</div>
              <button className="btn-primary" style={{ fontSize:12, padding:'6px 14px' }} onClick={() => setShowRxForm(v => !v)}>
                <Plus size={13} /> {showRxForm ? 'Cancel' : 'Add Prescription'}
              </button>
            </div>

            {showRxForm && (
              <form onSubmit={saveRx} style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
                {rxError && <div className="modal-error">{rxError}</div>}
                <div className="modal-fields" style={{ marginBottom:10 }}>
                  <div className="field"><label>Date</label><input type="date" value={rxForm.date} onChange={e => setRxForm({...rxForm, date: e.target.value})} /></div>
                  <div className="field"><label>Doctor</label><input placeholder="Dr. Mehta" value={rxForm.doctor} onChange={e => setRxForm({...rxForm, doctor: e.target.value})} /></div>
                </div>
                <div className="rx-grid">
                  <div className="rx-grid-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
                  {[['right','Right Eye (OD)'],['left','Left Eye (OS)']].map(([s, label]) => (
                    <div key={s} className="rx-grid-row">
                      <div className="rx-eye-label">{label}</div>
                      <div><input placeholder="-1.50" value={rxForm[`${s}_sph`]}  onChange={e => setRxForm({...rxForm, [`${s}_sph`]:  e.target.value})} /></div>
                      <div><input placeholder="-0.50" value={rxForm[`${s}_cyl`]}  onChange={e => setRxForm({...rxForm, [`${s}_cyl`]:  e.target.value})} /></div>
                      <div><input type="number" placeholder="90" value={rxForm[`${s}_axis`]} onChange={e => setRxForm({...rxForm, [`${s}_axis`]: e.target.value})} /></div>
                    </div>
                  ))}
                </div>
                <div className="modal-actions" style={{ marginTop:12 }}>
                  <button type="button" className="btn-cancel" onClick={() => { setShowRxForm(false); setRxForm(emptyRx); setRxError('') }}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={rxSaving}>
                    {rxSaving ? <><Loader size={13} className="spin" /> Saving...</> : 'Save Prescription'}
                  </button>
                </div>
              </form>
            )}

            {rxLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 0', color:'#6b7280', fontSize:14 }}>
                <Loader size={15} className="spin" /> Loading prescriptions...
              </div>
            ) : rxList.length === 0 ? (
              <div className="rx-empty">No prescriptions recorded for this customer.</div>
            ) : (
              <div className="rx-history">
                {rxList.map((rx, idx) => (
                  <div key={rx.id} className="rx-card">
                    <div className="rx-card-header">
                      <span className="rx-card-num">Prescription #{rxList.length - idx}</span>
                      <span className="rx-card-date">{rx.date || '—'}</span>
                      {rx.doctor && <span className="rx-card-doctor">{rx.doctor}</span>}
                    </div>
                    <div className="rx-view-grid">
                      <div className="rx-view-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
                      {[['right','Right Eye (OD)'],['left','Left Eye (OS)']].map(([s, label]) => (
                        <div key={s} className="rx-view-row">
                          <div className="rx-eye-label">{label}</div>
                          <div>{rx[`${s}_sph`]  || '—'}</div>
                          <div>{rx[`${s}_cyl`]  || '—'}</div>
                          <div>{rx[`${s}_axis`] != null ? rx[`${s}_axis`] + '°' : '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Billing Tab ── */}
        {tab === 'billing' && (
          <div>
            <div className="modal-section-title"><FileText size={14} /> Invoice History</div>
            {billLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 0', color:'#6b7280', fontSize:14 }}>
                <Loader size={15} className="spin" /> Loading invoices...
              </div>
            ) : bills.length === 0 ? (
              <div className="rx-empty">No invoices found for this customer.</div>
            ) : (
              <div>
                {bills.map(bill => (
                  <div key={bill.id} className="invoice-mini">
                    <div className="invoice-mini-left">
                      <div style={{ fontWeight:600, color:'#111827', marginBottom:3 }}>
                        Invoice #{bill.id?.toString().slice(-6).toUpperCase() || bill.id}
                      </div>
                      <div style={{ fontSize:12, color:'#9ca3af' }}>
                        {bill.created_at?.slice(0, 10) || '—'}
                        {bill.discount ? ` · Discount: ₹${bill.discount}` : ''}
                        {bill.gst      ? ` · GST: ₹${bill.gst}` : ''}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div className="invoice-mini-amount">₹{bill.total ?? bill.subtotal ?? '—'}</div>
                      <span className={`status-badge ${bill.paid ? 'badge-green' : 'badge-orange'}`}>
                        {bill.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Follow-ups Tab ── */}
        {tab === 'followups' && (
          <div>
            {/* Next Visit Date */}
            <div className="modal-section-title" style={{ marginBottom: 12 }}>
              📅 Next Visit Date
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:10, marginBottom:20 }}>
              <input
                type="date"
                value={nextVisit}
                onChange={e => setNextVisit(e.target.value)}
                style={{ flex:1, padding:'8px 12px', border:'1.5px solid #e5e7eb', borderRadius:8, fontSize:14, outline:'none', background:'#fff' }}
              />
              {nextVisit && (
                <button
                  onClick={() => setNextVisit('')}
                  style={{ padding:'6px 10px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer' }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={saveNextVisit}
                disabled={nvSaving}
                className="btn-primary"
                style={{ padding:'8px 16px', fontSize:13 }}
              >
                {nvSaving ? <><Loader size={13} className="spin" /> Saving...</> : nvSaved ? '✅ Saved!' : 'Save'}
              </button>
            </div>

            {/* Purchase schedule summary */}
            {customer.last_purchase_date && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                {[
                  ['🛒 Last Purchase',   customer.last_purchase_date],
                  ['📋 30-Day Review',   (() => { const d = new Date(customer.last_purchase_date); d.setDate(d.getDate()+30);  return d.toISOString().slice(0,10) })()],
                  ['👁 180-Day Checkup', (() => { const d = new Date(customer.last_purchase_date); d.setDate(d.getDate()+180); return d.toISOString().slice(0,10) })()],
                  ['📅 Next Visit',      nextVisit || customer.next_visit_date || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:'#f9fafb', border:'1.5px solid #f1f5f9', borderRadius:10, padding:'10px 14px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up history */}
            <div className="modal-section-title" style={{ marginBottom: 12 }}>
              🔔 Follow-up History
            </div>
            {fuLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 0', color:'#6b7280', fontSize:14 }}>
                <Loader size={15} className="spin" /> Loading follow-ups...
              </div>
            ) : fuList.length === 0 ? (
              <div className="rx-empty">No follow-ups recorded for this customer.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:280, overflowY:'auto' }}>
                {fuList.map(f => {
                  const statusColor = { Pending:'#fde68a', Due:'#fca5a5', Completed:'#86efac', Skipped:'#e5e7eb', Cancelled:'#fecaca' }
                  return (
                    <div key={f.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#f9fafb', border:'1.5px solid #f1f5f9', borderRadius:10 }}>
                      <div>
                        <div style={{ fontSize:13.5, fontWeight:600, color: f.done ? '#9ca3af' : '#111827', textDecoration: f.done ? 'line-through' : 'none' }}>
                          {f.title || f.type}
                          {f.auto_generated && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:'#0d9488', background:'#ccfbf1', padding:'1px 7px', borderRadius:20 }}>Auto</span>}
                        </div>
                        <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                          Due: {f.due_date || '—'}
                          {f.completed_at && ` · Completed: ${f.completed_at.slice(0,10)}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11.5, fontWeight:600, color:'#374151', background: statusColor[f.status] || '#e5e7eb', padding:'2px 10px', borderRadius:20 }}>
                          {f.status || (f.done ? 'Completed' : 'Pending')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Customers() {
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || searchParams.get('search') || ''
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery)
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState(urlQuery)

  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery)
    setSearch(urlQuery)
  }

  // Modals
  const [showAdd,      setShowAdd]      = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [editCustomer, setEditCustomer] = useState(null)

  // Add form
  const [custForm, setCustForm] = useState({ name: '', phone: '', email: '', age: '' })
  const [rxForm,   setRxForm]   = useState(emptyRx)
  const [addRx,    setAddRx]    = useState(false)
  const [addError, setAddError] = useState('')
  const [saving,   setSaving]   = useState(false)

  // Edit form
  const [editForm,    setEditForm]    = useState({ name: '', phone: '', email: '', age: '' })
  const [editError,   setEditError]   = useState('')
  const [editSaving,  setEditSaving]  = useState(false)
  const [editSuccess, setEditSuccess] = useState(false)

  // ── Excel Export State ─────────────────────────────────
  const [showExport, setShowExport] = useState(false)
  const [exportScope, setExportScope] = useState('all') // 'all' | 'filtered'
  const [exportType, setExportType] = useState('both') // 'details' | 'both'
  const [includePhone, setIncludePhone] = useState(true)
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportSuccess, setExportSuccess] = useState('')

  // ── Fetch ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    supabase.from('customers').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setCustomers(data)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (!error) setCustomers(data)
  }, [])

  const query = search.trim().toLowerCase()
  const phoneQuery = normalizePhone(search)
  const filtered = customers.filter(c => {
    if (!query) return true
    const id = String(c.customer_id || c.id || '')
    return c.name?.toLowerCase().includes(query)
      || id.toLowerCase().includes(query)
      || shortCustomerId(id).toLowerCase().includes(query)
      || (phoneQuery.length > 0 && normalizePhone(c.phone).includes(phoneQuery))
  })

  // ── Edit ───────────────────────────────────────────────
  const openEdit = (c) => {
    setEditCustomer(c)
    setEditForm({ name: c.name, phone: c.phone, email: c.email || '', age: c.age || '' })
    setEditError('')
    setEditSuccess(false)
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setEditError('')
    setEditSaving(true)
    const { error } = await supabase.from('customers').update({
      name:  editForm.name,
      phone: editForm.phone,
      email: editForm.email || null,
      age:   editForm.age   ? Number(editForm.age) : null,
    }).eq('id', editCustomer.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setEditSuccess(true)
    await reload()
    setTimeout(() => { setEditCustomer(null); setEditSuccess(false) }, 1200)
  }

  // ── Delete ─────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm('Delete this customer and all their data?')) return
    await supabase.from('customers').delete().eq('id', id)
    setCustomers(prev => prev.filter(c => c.id !== id))
  }

  // ── Add ────────────────────────────────────────────────
  const closeAdd = () => {
    setShowAdd(false); setAddError('')
    setCustForm({ name: '', phone: '', email: '', age: '' })
    setRxForm(emptyRx); setAddRx(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault(); setAddError(''); setSaving(true)
    
    try {
      // Use API to create customer (this will send welcome message)
      const newCust = await api.post('/customers', {
        name: custForm.name,
        phone: custForm.phone,
        email: custForm.email || null,
        age: custForm.age ? Number(custForm.age) : null
      })

      // Check if welcome message was sent
      if (newCust.welcomeMessage && newCust.welcomeMessage.success) {
        console.log('Welcome message prepared:', newCust.welcomeMessage)
        
        // Auto-open WhatsApp with pre-filled message (no confirmation needed!)
        if (newCust.welcomeMessage.url) {
          console.log('Opening WhatsApp automatically...')
          window.open(newCust.welcomeMessage.url, '_blank')
        }
      }

      // Add prescription if provided
      if (addRx && (rxForm.right_sph || rxForm.left_sph || rxForm.doctor)) {
        const { error: rxErr } = await supabase.from('prescriptions').insert([{
          customer_id: newCust.id,
          date:       rxForm.date     || null,
          doctor:     rxForm.doctor   || null,
          right_sph:  rxForm.right_sph  || null,
          right_cyl:  rxForm.right_cyl  || null,
          right_axis: rxForm.right_axis ? parseInt(rxForm.right_axis) : null,
          left_sph:   rxForm.left_sph   || null,
          left_cyl:   rxForm.left_cyl   || null,
          left_axis:  rxForm.left_axis  ? parseInt(rxForm.left_axis)  : null,
        }])
        if (rxErr) { 
          setAddError('Customer saved, prescription failed: ' + rxErr.message)
          setSaving(false)
          return
        }
      }

      setSaving(false)
      closeAdd()
      reload()
    } catch (err) {
      setAddError(err.message || 'Failed to create customer')
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header customers-header">
        <div><h1>Customers</h1><p>Manage all your optical shop customers.</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary"
            onClick={() => {
              setExportError('')
              setExportSuccess('')
              setShowExport(true)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileSpreadsheet size={16} color="#0d9488" /> Export to Excel
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Customer</button>
        </div>
      </div>

      <section className="customer-search-panel">
        <div className="customer-search-copy">
          <div className="customer-search-icon"><UsersRound size={20} /></div>
          <div><strong>Find a customer instantly</strong><span>Use a name, phone number, or customer ID.</span></div>
        </div>
        <div className="search-bar customer-search-bar">
          <Search size={17} className="search-ic" />
          <input
            type="search"
            placeholder="Search by name, phone, or customer ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search customers by name, phone, or customer ID"
          />
          {search && <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear customer search"><X size={15} /></button>}
        </div>
        <div className="customer-search-status">
          <Hash size={14} /> {query ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} found` : `${customers.length} customers in your directory`}
        </div>
      </section>

      <div className="table-card">
        <div className="tbl-head" style={{ gridTemplateColumns: COLS }}>
          <div>#</div><div>Name / Customer ID</div><div>Phone</div><div>Email</div><div>Age</div><div>Added</div><div>Actions</div>
        </div>
        {loading ? (
          <div className="empty-row" style={{ display:'flex', alignItems:'center', gap:8 }}><Loader size={16} className="spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-row">No customers found.</div>
        ) : filtered.map((c, i) => (
          <div key={c.id} className="tbl-row customer-row" style={{ gridTemplateColumns: COLS, '--row-index': i }}>
            <div className="muted">{i + 1}</div>
            <div className="customer-name-cell">
              <span className="clickable-name" onClick={() => setViewCustomer(c)}>{c.name}</span>
              <span className="customer-id"><Hash size={10} /> {shortCustomerId(c.customer_id || c.id)}</span>
            </div>
            <div className="muted"><Phone size={12} /> {c.phone}</div>
            <div className="muted"><Mail size={12} /> {c.email || '—'}</div>
            <div>{c.age || '—'}</div>
            <div className="muted">{c.created_at?.slice(0, 10)}</div>
            <div className="actions-cell">
              <button className="icon-action blue"  title="View"   onClick={() => setViewCustomer(c)}><Eye    size={14} /></button>
              <button className="icon-action green" title="Edit"   onClick={() => openEdit(c)}><Pencil size={14} /></button>
              <button className="icon-action red"   title="Delete" onClick={() => handleDelete(c.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── PROFILE MODAL ── */}
      {viewCustomer && (
        <ProfileModal
          customer={viewCustomer}
          onClose={() => setViewCustomer(null)}
          onEditRequest={(c) => { setViewCustomer(null); openEdit(c) }}
        />
      )}

      {/* ── ADD MODAL ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Customer</h2>
              <button className="modal-close" onClick={closeAdd}><X size={18} /></button>
            </div>
            {addError && <div className="modal-error">{addError}</div>}
            <form onSubmit={handleAdd}>
              <div className="modal-section-title"><User size={14} /> Customer Information</div>
              <div className="modal-fields">
                <div className="field"><label>Full Name *</label><input required placeholder="John Doe" value={custForm.name} onChange={e => setCustForm({...custForm, name: e.target.value})} /></div>
                <div className="field"><label>Phone *</label><input required placeholder="9XXXXXXXXX" value={custForm.phone} onChange={e => setCustForm({...custForm, phone: e.target.value})} /></div>
                <div className="field"><label>Email</label><input type="email" placeholder="email@example.com" value={custForm.email} onChange={e => setCustForm({...custForm, email: e.target.value})} /></div>
                <div className="field"><label>Age</label><input type="number" placeholder="30" min={1} max={120} value={custForm.age} onChange={e => setCustForm({...custForm, age: e.target.value})} /></div>
              </div>
              <div className="rx-toggle-row">
                <label className="rx-toggle-label">
                  <input type="checkbox" checked={addRx} onChange={e => setAddRx(e.target.checked)} />
                  <FileText size={14} /><span>Also add eye prescription for this customer</span>
                </label>
              </div>
              {addRx && (
                <>
                  <div className="modal-section-title" style={{ marginTop: 4 }}><FileText size={14} /> Prescription Details</div>
                  <div className="modal-fields">
                    <div className="field"><label>Date</label><input type="date" value={rxForm.date} onChange={e => setRxForm({...rxForm, date: e.target.value})} /></div>
                    <div className="field"><label>Doctor</label><input placeholder="Dr. Mehta" value={rxForm.doctor} onChange={e => setRxForm({...rxForm, doctor: e.target.value})} /></div>
                  </div>
                  <div className="rx-grid">
                    <div className="rx-grid-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
                    {[['right','Right Eye (OD)'],['left','Left Eye (OS)']].map(([s, label]) => (
                      <div key={s} className="rx-grid-row">
                        <div className="rx-eye-label">{label}</div>
                        <div><input placeholder="-1.50" value={rxForm[`${s}_sph`]}  onChange={e => setRxForm({...rxForm, [`${s}_sph`]:  e.target.value})} /></div>
                        <div><input placeholder="-0.50" value={rxForm[`${s}_cyl`]}  onChange={e => setRxForm({...rxForm, [`${s}_cyl`]:  e.target.value})} /></div>
                        <div><input type="number" placeholder="90" value={rxForm[`${s}_axis`]} onChange={e => setRxForm({...rxForm, [`${s}_axis`]: e.target.value})} /></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button type="button" className="btn-cancel" onClick={closeAdd}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <><Loader size={14} className="spin" /> Saving...</> : addRx ? 'Save Customer & Prescription' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editCustomer && (
        <div className="modal-overlay" onClick={() => setEditCustomer(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Customer</h2>
              <button className="modal-close" onClick={() => setEditCustomer(null)}><X size={18} /></button>
            </div>
            {editSuccess ? <div className="modal-success">✅ Customer updated!</div> : (
              <form onSubmit={handleEdit}>
                {editError && <div className="modal-error">{editError}</div>}
                <div className="modal-fields">
                  <div className="field"><label>Full Name *</label><input required value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} /></div>
                  <div className="field"><label>Phone *</label><input required value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} /></div>
                  <div className="field"><label>Email</label><input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} /></div>
                  <div className="field"><label>Age</label><input type="number" value={editForm.age} onChange={e => setEditForm({...editForm, age: e.target.value})} /></div>
                </div>
                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button type="button" className="btn-cancel" onClick={() => setEditCustomer(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={editSaving}>
                    {editSaving ? <><Loader size={14} className="spin" /> Saving...</> : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* ── EXCEL EXPORT MODAL ── */}
      {showExport && (
        <div className="modal-overlay" onClick={() => !exporting && setShowExport(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={20} color="#0d9488" />
                <h2 style={{ margin: 0, fontSize: 18 }}>Export Customer Data to Excel (.xlsx)</h2>
              </div>
              <button className="modal-close" onClick={() => !exporting && setShowExport(false)}><X size={18} /></button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: 0 }}>
                Generate an Excel workbook (.xlsx) downloaded locally to your laptop. Prescriptions and Customers will be saved into separate sheets linked by Customer ID.
              </p>

              {exportError && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: 6, fontSize: '0.85rem', marginBottom: 14 }}>
                  <AlertCircle size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  {exportError}
                </div>
              )}
              {exportSuccess && (
                <div style={{ background: '#ecfdf5', color: '#065f46', padding: '10px 12px', borderRadius: 6, fontSize: '0.85rem', marginBottom: 14 }}>
                  <CheckCircle2 size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  {exportSuccess}
                </div>
              )}

              {/* Scope Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Export Scope
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_scope"
                      value="all"
                      checked={exportScope === 'all'}
                      onChange={() => setExportScope('all')}
                    />
                    <span>All Customers ({customers.length})</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_scope"
                      value="filtered"
                      checked={exportScope === 'filtered'}
                      onChange={() => setExportScope('filtered')}
                      disabled={filtered.length === customers.length}
                    />
                    <span>Current Filtered Results ({filtered.length})</span>
                  </label>
                </div>
              </div>

              {/* Data Content Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Workbook Content
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_type"
                      value="both"
                      checked={exportType === 'both'}
                      onChange={() => setExportType('both')}
                    />
                    <span>Customers with Prescriptions (Separate linked sheets)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_type"
                      value="details"
                      checked={exportType === 'details'}
                      onChange={() => setExportType('details')}
                    />
                    <span>Customer details only (No prescriptions sheet)</span>
                  </label>
                </div>
              </div>

              {/* Privacy / Sensitivity Controls */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                  <Shield size={15} color="#0d9488" /> Privacy & Sensitivity Options
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includePhone}
                    onChange={(e) => setIncludePhone(e.target.checked)}
                  />
                  <span>Include customer phone numbers (uncheck to redact for privacy)</span>
                </label>
              </div>

              {/* Optional Date Range */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Optional Date Range (Registration Date)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <small style={{ color: '#64748b', fontSize: '0.75rem' }}>From</small>
                    <input
                      type="date"
                      value={exportDateFrom}
                      onChange={(e) => setExportDateFrom(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <small style={{ color: '#64748b', fontSize: '0.75rem' }}>To</small>
                    <input
                      type="date"
                      value={exportDateTo}
                      onChange={(e) => setExportDateTo(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowExport(false)}
                  disabled={exporting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true)
                    setExportError('')
                    setExportSuccess('')
                    try {
                      const targetCustomers = exportScope === 'filtered' ? filtered : customers
                      const customerIds = exportScope === 'filtered' ? targetCustomers.map(c => c.id) : null

                      const res = await api.download('/export/customers', {
                        search: exportScope === 'filtered' ? search : undefined,
                        customerIds,
                        includePhone,
                        includePrescriptions: exportType === 'both',
                        dateFrom: exportDateFrom || undefined,
                        dateTo: exportDateTo || undefined,
                      }, `roja_customers_${new Date().toISOString().slice(0, 10)}.xlsx`)

                      setExportSuccess(`Downloaded ${res.filename} successfully!`)
                      setTimeout(() => {
                        setShowExport(false)
                        setExportSuccess('')
                      }, 2000)
                    } catch (err) {
                      setExportError(err.message || 'Failed to generate Excel export')
                    } finally {
                      setExporting(false)
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {exporting ? <><Loader size={14} className="spin" /> Generating .xlsx...</> : <><Download size={14} /> Download Excel (.xlsx)</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
