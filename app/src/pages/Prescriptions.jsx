import { useState, useEffect } from 'react'
import { Search, Plus, Eye, Pencil, X, Loader, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './PageCommon.css'
import './Customers.css'

// ── Rx grid input table (declared outside component to avoid re-mount) ──
function RxGrid({ f, update }) {
  return (
    <div className="rx-grid">
      <div className="rx-grid-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
      {[['right', 'Right Eye (OD)'], ['left', 'Left Eye (OS)']].map(([side, label]) => (
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

const emptyForm = {
  customer_name: '', date: '', doctor: '',
  right_sph: '', right_cyl: '', right_axis: '',
  left_sph: '',  left_cyl: '',  left_axis: '',
}

export default function Prescriptions() {
  const [rxList, setRxList]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [viewRx, setViewRx]       = useState(null)
  const [editRx, setEditRx]       = useState(null)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  // ── Fetch ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    supabase
      .from('prescriptions')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setRxList(data.map(r => ({ ...r, customer_name: r.customers?.name || '' })))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = async () => {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })
    if (!error) setRxList(data.map(r => ({ ...r, customer_name: r.customers?.name || '' })))
  }

  const filtered = rxList.filter(r =>
    (r.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.doctor || '').toLowerCase().includes(search.toLowerCase())
  )

  // ── Resolve customer ───────────────────────────────────
  const resolveCustomer = async (name) => {
    const { data: ex } = await supabase.from('customers').select('id').ilike('name', name).limit(1)
    if (ex && ex.length > 0) return { id: ex[0].id, error: null }
    const { data, error } = await supabase.from('customers').insert([{ name, phone: 'N/A' }]).select().single()
    return { id: data?.id ?? null, error }
  }

  // ── Add ────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { id: customerId, error: ce } = await resolveCustomer(form.customer_name)
    if (ce) { setError(ce.message); setSaving(false); return }
    const { error } = await supabase.from('prescriptions').insert([{
      customer_id: customerId,
      date: form.date || null, doctor: form.doctor || null,
      right_sph: form.right_sph || null, right_cyl: form.right_cyl || null, right_axis: form.right_axis ? parseInt(form.right_axis) : null,
      left_sph:  form.left_sph  || null, left_cyl:  form.left_cyl  || null, left_axis:  form.left_axis  ? parseInt(form.left_axis)  : null,
    }])
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true)
    await reload()
    setTimeout(() => { setShowAdd(false); setSuccess(false); setForm(emptyForm) }, 1200)
  }

  // ── Edit ───────────────────────────────────────────────
  const openEdit = (rx) => {
    setEditRx(rx)
    setForm({
      customer_name: rx.customer_name,
      date: rx.date || '', doctor: rx.doctor || '',
      right_sph: rx.right_sph || '', right_cyl: rx.right_cyl || '', right_axis: rx.right_axis ?? '',
      left_sph: rx.left_sph || '', left_cyl: rx.left_cyl || '', left_axis: rx.left_axis ?? '',
    })
    setError('')
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error } = await supabase.from('prescriptions').update({
      date: form.date || null, doctor: form.doctor || null,
      right_sph: form.right_sph || null, right_cyl: form.right_cyl || null, right_axis: form.right_axis ? parseInt(form.right_axis) : null,
      left_sph:  form.left_sph  || null, left_cyl:  form.left_cyl  || null, left_axis:  form.left_axis  ? parseInt(form.left_axis)  : null,
    }).eq('id', editRx.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true)
    await reload()
    setTimeout(() => { setEditRx(null); setSuccess(false); setForm(emptyForm) }, 1200)
  }

  // ── Delete ─────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm('Delete this prescription?')) return
    await supabase.from('prescriptions').delete().eq('id', id)
    setRxList(prev => prev.filter(r => r.id !== id))
  }

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Prescriptions</h1><p>View and manage customer eye prescriptions.</p></div>
        <button className="btn-primary" onClick={() => { setShowAdd(true); setForm(emptyForm); setError(''); setSuccess(false) }}>
          <Plus size={16} /> Add Prescription
        </button>
      </div>

      <div className="search-bar">
        <Search size={15} className="search-ic" />
        <input type="text" placeholder="Search by customer or doctor..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-card">
        <div className="tbl-head" style={{ gridTemplateColumns: '36px 1.2fr 100px 90px 90px 80px 90px 90px 80px 90px' }}>
          <div>#</div><div>Customer</div><div>Date</div>
          <div>R-Sph</div><div>R-Cyl</div><div>R-Ax</div>
          <div>L-Sph</div><div>L-Cyl</div><div>L-Ax</div>
          <div>Actions</div>
        </div>
        {loading ? (
          <div className="empty-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader size={16} className="spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-row">No prescriptions found.</div>
        ) : (
          filtered.map((r, i) => (
            <div key={r.id} className="tbl-row" style={{ gridTemplateColumns: '36px 1.2fr 100px 90px 90px 80px 90px 90px 80px 90px' }}>
              <div className="muted">{i + 1}</div>
              <div>
                <strong>{r.customer_name}</strong>
                {r.doctor && <div className="muted" style={{ fontSize: 11 }}>{r.doctor}</div>}
              </div>
              <div className="muted">{r.date || '—'}</div>
              <div>{r.right_sph || '—'}</div><div>{r.right_cyl || '—'}</div><div>{r.right_axis != null ? r.right_axis + '°' : '—'}</div>
              <div>{r.left_sph  || '—'}</div><div>{r.left_cyl  || '—'}</div><div>{r.left_axis  != null ? r.left_axis  + '°' : '—'}</div>
              <div className="actions-cell">
                <button className="icon-action blue" title="View" onClick={() => setViewRx(r)}><Eye size={14} /></button>
                <button className="icon-action green" title="Edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                <button className="icon-action red" title="Delete" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── ADD MODAL ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Prescription</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            {success ? <div className="modal-success">✅ Prescription saved!</div> : (
              <form onSubmit={handleAdd}>
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-fields">
                  <div className="field">
                    <label>Customer Name *</label>
                    <input required placeholder="John Doe" value={form.customer_name} onChange={e => updateForm('customer_name', e.target.value)} />
                  </div>
                  <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => updateForm('date', e.target.value)} /></div>
                  <div className="field full"><label>Doctor</label><input placeholder="Dr. Mehta" value={form.doctor} onChange={e => updateForm('doctor', e.target.value)} /></div>
                </div>
                <RxGrid f={form} update={updateForm} />
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? <><Loader size={14} className="spin" /> Saving...</> : 'Save Prescription'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editRx && (
        <div className="modal-overlay" onClick={() => setEditRx(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Prescription — {editRx.customer_name}</h2>
              <button className="modal-close" onClick={() => setEditRx(null)}><X size={18} /></button>
            </div>
            {success ? <div className="modal-success">✅ Updated successfully!</div> : (
              <form onSubmit={handleEdit}>
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-fields">
                  <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => updateForm('date', e.target.value)} /></div>
                  <div className="field"><label>Doctor</label><input placeholder="Dr. Mehta" value={form.doctor} onChange={e => updateForm('doctor', e.target.value)} /></div>
                </div>
                <RxGrid f={form} update={updateForm} />
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn-cancel" onClick={() => setEditRx(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? <><Loader size={14} className="spin" /> Saving...</> : 'Update'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      {viewRx && (
        <div className="modal-overlay" onClick={() => setViewRx(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Prescription — {viewRx.customer_name}</h2>
              <button className="modal-close" onClick={() => setViewRx(null)}><X size={18} /></button>
            </div>
            <div className="view-customer-card" style={{ marginBottom: 16 }}>
              <div className="view-customer-info">
                <div className="view-customer-meta">
                  {viewRx.date   && <span>📅 {viewRx.date}</span>}
                  {viewRx.doctor && <span>👨‍⚕️ {viewRx.doctor}</span>}
                </div>
              </div>
            </div>
            <div className="rx-view-grid">
              <div className="rx-view-head"><div></div><div>Sph</div><div>Cyl</div><div>Axis</div></div>
              {[['right', 'Right Eye (OD)'], ['left', 'Left Eye (OS)']].map(([side, label]) => (
                <div key={side} className="rx-view-row">
                  <div className="rx-eye-label">{label}</div>
                  <div>{viewRx[`${side}_sph`]  || '—'}</div>
                  <div>{viewRx[`${side}_cyl`]  || '—'}</div>
                  <div>{viewRx[`${side}_axis`] != null ? viewRx[`${side}_axis`] + '°' : '—'}</div>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-cancel" onClick={() => setViewRx(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
