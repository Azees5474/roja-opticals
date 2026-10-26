import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, Printer, Eye, X, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './PageCommon.css'

export default function Billing() {
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || searchParams.get('search') || ''
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery)
  const [bills, setBills]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState(urlQuery)

  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery)
    setSearch(urlQuery)
  }
  const [showAdd, setShowAdd]     = useState(false)
  const [viewBill, setViewBill]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [shop, setShop]           = useState(null)
  const [form, setForm]           = useState({ customer_name: '', items: '1', subtotal: '', discount: '0', gst: '0' })

  const total = (parseFloat(form.subtotal) || 0) - (parseFloat(form.discount) || 0) + (parseFloat(form.gst) || 0)

  // ── Fetch ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    supabase
      .from('billing')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setBills(data.map(b => ({ ...b, customer_name: b.customers?.name || '' })))
        setLoading(false)
      })

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data && data.shop) {
          setShop(data.shop)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  const reload = async () => {
    const { data, error } = await supabase.from('billing').select('*, customers(name)').order('created_at', { ascending: false })
    if (!error) setBills(data.map(b => ({ ...b, customer_name: b.customers?.name || '' })))
  }

  const filtered = bills.filter(b =>
    (b.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.id || '').toString().includes(search)
  )

  const totalRevenue = bills.filter(b => b.paid).reduce((s, b) => s + (b.total || 0), 0)
  const pendingAmt   = bills.filter(b => !b.paid).reduce((s, b) => s + (b.total || 0), 0)

  // ── Resolve customer ───────────────────────────────────
  const resolveCustomer = async (name) => {
    const { data: ex } = await supabase.from('customers').select('id').ilike('name', name).limit(1)
    if (ex && ex.length > 0) return { id: ex[0].id, error: null }
    const { data, error } = await supabase.from('customers').insert([{ name, phone: 'N/A' }]).select().single()
    return { id: data?.id ?? null, error }
  }

  // ── Generate Invoice ───────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { id: customerId, error: ce } = await resolveCustomer(form.customer_name)
    if (ce) { setError(ce.message); setSaving(false); return }
    const { error } = await supabase.from('billing').insert([{
      customer_id: customerId,
      items: Number(form.items), subtotal: Number(form.subtotal),
      discount: Number(form.discount), gst: Number(form.gst), total, paid: false,
    }])
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true)
    await reload()
    setTimeout(() => { setShowAdd(false); setSuccess(false); setForm({ customer_name: '', items: '1', subtotal: '', discount: '0', gst: '0' }) }, 1200)
  }

  // ── Mark Paid + trigger auto follow-ups ──────────────────
  const markPaid = async (id) => {
    const { data: bill } = await supabase.from('billing').update({ paid: true }).eq('id', id).select('*, customers(name, phone)').single()
    if (!bill) return
    setBills(prev => prev.map(b => b.id === id ? { ...b, paid: true } : b))
    if (viewBill?.id === id) setViewBill(prev => ({ ...prev, paid: true }))

    // Trigger automatic follow-ups — 30-day and 180-day
    const purchaseDate = bill.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)
    const customerId   = bill.customer_id
    if (!customerId) return

    // Update customer's last_purchase_date
    await supabase.from('customers').update({ last_purchase_date: purchaseDate }).eq('id', customerId)

    const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }

    for (const [days, type, title] of [[30, '30-Day Review', '30-Day Review'], [180, '180-Day Eye Checkup', '180-Day Eye Checkup']]) {
      const reminderKey = `${customerId}_${days}day_${purchaseDate}`
      const dueDate     = addDays(purchaseDate, days)
      // Check not already created
      const { data: existing } = await supabase.from('followups').select('id').eq('reminder_key', reminderKey).limit(1)
      if (!existing || existing.length === 0) {
        await supabase.from('followups').insert([{
          customer_id:    customerId,
          type,
          title,
          description:    `Auto-generated ${type} after purchase on ${purchaseDate}`,
          due_date:       dueDate,
          priority:       'Medium',
          done:           false,
          reminder_key:   reminderKey,
          auto_generated: true,
        }])
      }
    }
  }

  // ── Print ──────────────────────────────────────────────
  const handlePrint = (bill) => {
    const win = window.open('', '_blank')
    const shopName = shop?.name || 'Roja Opticals'
    const escapeHtml = (str) =>
      String(str || '').replace(
        /[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
      )

    const addressHtml = shop?.address ? `<p style="margin:2px 0;font-size:12px;color:#4b5563">${escapeHtml(shop.address)}</p>` : ''
    const phoneHtml = shop?.phone ? `<p style="margin:2px 0;font-size:12px;color:#4b5563">Phone: ${escapeHtml(shop.phone)}</p>` : ''
    const gstinHtml = shop?.gstin ? `<p style="margin:2px 0;font-size:12px;color:#4b5563">GSTIN: ${escapeHtml(shop.gstin)}</p>` : ''

    win.document.write(`
      <html><head><title>Invoice ${bill.id}</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:500px;margin:auto}
      h2{color:#0d9488;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:16px}
      td,th{padding:8px 12px;border:1px solid #e5e7eb;font-size:14px}th{background:#f9fafb}
      .total{font-size:18px;font-weight:700;color:#0d9488}.status{padding:4px 12px;border-radius:20px;font-size:12px}</style>
      </head><body>
      <h2>${escapeHtml(shopName)}</h2>
      ${addressHtml}
      ${phoneHtml}
      ${gstinHtml}
      <p style="color:#6b7280;font-size:13px;margin-top:12px">Invoice #${bill.id?.toString().slice(0,8).toUpperCase()}</p>
      <table>
        <tr><th>Customer</th><td>${escapeHtml(bill.customer_name)}</td></tr>
        <tr><th>Date</th><td>${bill.created_at?.slice(0, 10)}</td></tr>
        <tr><th>Items</th><td>${escapeHtml(bill.items)}</td></tr>
        <tr><th>Subtotal</th><td>₹${bill.subtotal}</td></tr>
        <tr><th>Discount</th><td>-₹${bill.discount}</td></tr>
        <tr><th>GST</th><td>₹${bill.gst}</td></tr>
        <tr><th>Total</th><td class="total">₹${bill.total?.toFixed(2)}</td></tr>
        <tr><th>Status</th><td>${bill.paid ? '✅ Paid' : '⏳ Unpaid'}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:12px;color:#9ca3af;text-align:center">Thank you for your business!</p>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Billing</h1><p>Manage invoices and payments.</p></div>
        <button className="btn-primary" onClick={() => { setShowAdd(true); setError(''); setSuccess(false) }}>
          <Plus size={16} /> Generate Invoice
        </button>
      </div>

      <div className="stats-row">
        <div className="mini-stat green"><div className="mini-label">Collected</div><div className="mini-value">₹{totalRevenue.toFixed(0)}</div></div>
        <div className="mini-stat orange"><div className="mini-label">Pending</div><div className="mini-value">₹{pendingAmt.toFixed(0)}</div></div>
        <div className="mini-stat blue"><div className="mini-label">Total Invoices</div><div className="mini-value">{bills.length}</div></div>
      </div>

      <div className="search-bar">
        <Search size={15} className="search-ic" />
        <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-card">
        <div className="tbl-head" style={{ gridTemplateColumns: '1fr 110px 80px 90px 90px 90px 80px 90px' }}>
          <div>Customer</div><div>Date</div><div>Items</div>
          <div>Subtotal</div><div>Discount</div><div>Total</div><div>Status</div><div>Actions</div>
        </div>
        {loading ? (
          <div className="empty-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader size={16} className="spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-row">No invoices found.</div>
        ) : (
          filtered.map(b => (
            <div key={b.id} className="tbl-row" style={{ gridTemplateColumns: '1fr 110px 80px 90px 90px 90px 80px 90px' }}>
              <div><strong>{b.customer_name}</strong></div>
              <div className="muted">{b.created_at?.slice(0, 10)}</div>
              <div>{b.items}</div>
              <div>₹{b.subtotal}</div>
              <div className="text-red">-₹{b.discount}</div>
              <div><strong>₹{b.total?.toFixed(2)}</strong></div>
              <div>
                <span className={`status-badge ${b.paid ? 'badge-green' : 'badge-orange'}`}>
                  {b.paid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
              <div className="actions-cell">
                <button className="icon-action blue" title="View" onClick={() => setViewBill(b)}><Eye size={14} /></button>
                <button className="icon-action teal" title="Print" onClick={() => handlePrint(b)}><Printer size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── GENERATE INVOICE MODAL ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Generate Invoice</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            {success ? <div className="modal-success">✅ Invoice generated!</div> : (
              <form onSubmit={handleAdd}>
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-fields">
                  <div className="field full">
                    <label>Customer Name *</label>
                    <input required placeholder="John Doe" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} />
                  </div>
                  <div className="field"><label>No. of Items</label><input type="number" min={1} value={form.items} onChange={e => setForm({...form, items: e.target.value})} /></div>
                  <div className="field"><label>Subtotal (₹) *</label><input required type="number" placeholder="1500" value={form.subtotal} onChange={e => setForm({...form, subtotal: e.target.value})} /></div>
                  <div className="field"><label>Discount (₹)</label><input type="number" placeholder="0" value={form.discount} onChange={e => setForm({...form, discount: e.target.value})} /></div>
                  <div className="field"><label>GST (₹)</label><input type="number" placeholder="0" value={form.gst} onChange={e => setForm({...form, gst: e.target.value})} /></div>
                  <div className="field"><label>Total</label><input readOnly value={`₹ ${total.toFixed(2)}`} style={{ background: '#f3f4f6', fontWeight: 700 }} /></div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? <><Loader size={14} className="spin" /> Saving...</> : 'Generate'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW INVOICE MODAL ── */}
      {viewBill && (
        <div className="modal-overlay" onClick={() => setViewBill(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invoice Details</h2>
              <button className="modal-close" onClick={() => setViewBill(null)}><X size={18} /></button>
            </div>
            <div className="invoice-view">
              {[
                ['Customer',  viewBill.customer_name],
                ['Date',      viewBill.created_at?.slice(0, 10)],
                ['Items',     viewBill.items],
                ['Subtotal',  `₹${viewBill.subtotal}`],
                ['Discount',  `-₹${viewBill.discount}`],
                ['GST',       `₹${viewBill.gst}`],
                ['Total',     `₹${viewBill.total?.toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k} className="invoice-row">
                  <span className="invoice-key">{k}</span>
                  <span className="invoice-val">{v}</span>
                </div>
              ))}
              <div className="invoice-row">
                <span className="invoice-key">Status</span>
                <span className={`status-badge ${viewBill.paid ? 'badge-green' : 'badge-orange'}`}>
                  {viewBill.paid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              {!viewBill.paid && (
                <button className="btn-primary" style={{ background: '#059669' }} onClick={() => markPaid(viewBill.id)}>
                  ✓ Mark as Paid
                </button>
              )}
              <button className="btn-cancel" onClick={() => handlePrint(viewBill)}><Printer size={14} /> Print</button>
              <button className="btn-cancel" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
