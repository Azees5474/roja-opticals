import { useState, useEffect } from 'react'
import { Plus, Phone, CheckCircle2, Clock, X, Loader, Trash2, MessageCircle, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import './PageCommon.css'
import './Followups.css'

const priorityColors = { High: '#fca5a5', Medium: '#fde68a', Low: '#86efac' }

const FOLLOWUP_TYPES = [
  '30-Day Review',
  '180-Day Eye Checkup',
  'Next Visit',
  'Glasses Ready',
  'Payment Reminder',
  'Custom Follow-up',
]

const todayStr = () => new Date().toISOString().slice(0, 10)
const weekEnd  = () => {
  const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0,10)
}

export default function Followups() {
  const [followups, setFollowups] = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [showAdd, setShowAdd]     = useState(false)
  const [editFu, setEditFu]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const emptyForm = { customer_name: '', type: '30-Day Review', title: '', description: '', due_date: '', priority: 'Medium' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('followups')
      .select('*, customers(name, phone)')
      .order('due_date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setFollowups(data.map(f => ({
          ...f,
          customer_name: f.customers?.name  || '',
          phone:         f.customers?.phone || '',
        })))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = async () => {
    const { data } = await supabase.from('followups').select('*, customers(name, phone)').order('due_date', { ascending: true })
    if (data) setFollowups(data.map(f => ({ ...f, customer_name: f.customers?.name||'', phone: f.customers?.phone||'' })))
  }

  const today   = todayStr()
  const endWeek = weekEnd()

  const tabs = {
    today:    followups.filter(f => !f.done && f.due_date === today),
    week:     followups.filter(f => !f.done && f.due_date > today && f.due_date <= endWeek),
    upcoming: followups.filter(f => !f.done && (f.due_date > endWeek || !f.due_date)),
    completed:followups.filter(f => f.done),
  }

  const pending = followups.filter(f => !f.done)
  const highDue = followups.filter(f => f.priority==='High' && !f.done).length

  const toggle = async (id, current) => {
    await supabase.from('followups').update({ done: !current }).eq('id', id)
    setFollowups(prev => prev.map(f => f.id===id ? {...f, done: !current} : f))
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this follow-up?')) return
    await supabase.from('followups').delete().eq('id', id)
    setFollowups(prev => prev.filter(f => f.id!==id))
  }

  const resolveCustomer = async (name) => {
    const { data: ex } = await supabase.from('customers').select('id').ilike('name', name).limit(1)
    if (ex && ex.length>0) return { id: ex[0].id, error: null }
    const { data, error } = await supabase.from('customers').insert([{ name, phone: 'N/A' }]).select().single()
    return { id: data?.id ?? null, error }
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    const isCustom = form.type === 'Custom Follow-up'
    if (editFu) {
      const { error } = await supabase.from('followups').update({
        type: form.type, title: form.title || form.type,
        description: form.description, due_date: form.due_date || null,
        priority: form.priority,
      }).eq('id', editFu.id)
      setSaving(false)
      if (error) { setError(error.message); return }
    } else {
      const { id: customerId, error: ce } = await resolveCustomer(form.customer_name)
      if (ce) { setError(ce.message); setSaving(false); return }
      const { error } = await supabase.from('followups').insert([{
        customer_id: customerId,
        type:        form.type,
        title:       isCustom ? form.title : form.type,
        description: form.description || null,
        due_date:    form.due_date || null,
        priority:    form.priority,
        done:        false,
      }])
      setSaving(false)
      if (error) { setError(error.message); return }
    }
    setSuccess(true)
    await reload()
    setTimeout(() => {
      setShowAdd(false); setEditFu(null)
      setSuccess(false); setForm(emptyForm)
    }, 1000)
  }

  const openEdit = (f) => {
    setEditFu(f)
    setForm({ customer_name: f.customer_name, type: f.type, title: f.title||'', description: f.description||'', due_date: f.due_date||'', priority: f.priority })
    setError(''); setSuccess(false)
  }

  const handleWhatsApp = async (f) => {
    try {
      const result = await api.get(`/followups/${f.id}/whatsapp-url`)
      if (result.success && result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
        setFollowups(prev => prev.map(x => x.id === f.id ? { ...x, whatsapp_sent: true } : x))
      } else {
        alert('Failed to generate WhatsApp URL')
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const FollowupCard = ({ f }) => (
    <div className={`followup-card${f.done ? ' done' : ''}`}>
      <div className="fu-left">
        <button className="fu-check" onClick={() => toggle(f.id, f.done)} title={f.done ? 'Mark pending' : 'Mark done'}>
          {f.done ? <CheckCircle2 size={18} color="#059669" /> : <Clock size={18} color="#f59e0b" />}
        </button>
        <div>
          <div className={`fu-name${f.done ? ' done-text' : ''}`}>{f.customer_name}</div>
          <div className={`fu-type${f.done ? ' done-text' : ''}`}>{f.type}{f.title && f.title !== f.type ? ` — ${f.title}` : ''}</div>
          {!f.done && (
            <div className="fu-phone">
              <Phone size={12} /> {f.phone || 'N/A'} · Due: {f.due_date || '—'}
            </div>
          )}
          {f.auto_generated && <div className="fu-auto-badge">Auto</div>}
        </div>
      </div>
      <div className="fu-right">
        {!f.done && <span className="status-badge" style={{ background: priorityColors[f.priority] }}>{f.priority}</span>}
        {!f.done && f.phone && f.phone !== 'N/A' && (
          <button className="icon-action whatsapp" title="Send WhatsApp" onClick={() => handleWhatsApp(f)}>
            <MessageCircle size={13} />
          </button>
        )}
        <button className="icon-action green" title="Edit" onClick={() => { openEdit(f); setShowAdd(true) }}>
          <Pencil size={13} />
        </button>
        <button className="icon-action red" title="Delete" onClick={() => handleDelete(f.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )

  const tabList = [
    { key: 'today',    label: `Due Today (${tabs.today.length})` },
    { key: 'week',     label: `This Week (${tabs.week.length})` },
    { key: 'upcoming', label: `Upcoming (${tabs.upcoming.length})` },
    { key: 'completed',label: `Completed (${tabs.completed.length})` },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Follow-ups</h1><p>Stay on top of customer follow-up tasks.</p></div>
        <button className="btn-primary" onClick={() => { setShowAdd(true); setEditFu(null); setForm(emptyForm); setError(''); setSuccess(false) }}>
          <Plus size={16} /> Add Follow-up
        </button>
      </div>

      <div className="stats-row">
        <div className="mini-stat orange"><div className="mini-label">Pending</div><div className="mini-value">{pending.length}</div></div>
        <div className="mini-stat green"><div className="mini-label">Completed</div><div className="mini-value">{tabs.completed.length}</div></div>
        <div className="mini-stat red"><div className="mini-label">High Priority</div><div className="mini-value">{highDue}</div></div>
        <div className="mini-stat blue"><div className="mini-label">Due Today</div><div className="mini-value">{tabs.today.length}</div></div>
      </div>

      {/* Tabs */}
      <div className="fu-tabs">
        {tabList.map(t => (
          <button key={t.key} className={`fu-tab${activeTab===t.key?' active':''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-row" style={{ display:'flex', alignItems:'center', gap:8 }}><Loader size={16} className="spin" /> Loading...</div>
      ) : (
        <div className="followup-cards">
          {tabs[activeTab].length === 0 ? (
            <div className="empty-row">
              {activeTab === 'today' ? 'No follow-ups due today 🎉' :
               activeTab === 'completed' ? 'No completed follow-ups yet.' :
               'Nothing here.'}
            </div>
          ) : (
            tabs[activeTab].map(f => <FollowupCard key={f.id} f={f} />)
          )}
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editFu ? 'Edit Follow-up' : 'Add Follow-up'}</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            {success ? <div className="modal-success">✅ {editFu ? 'Updated!' : 'Follow-up added!'}</div> : (
              <form onSubmit={handleSave}>
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-fields">
                  {!editFu && (
                    <div className="field full">
                      <label>Customer Name *</label>
                      <input required placeholder="James Wilson" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} />
                    </div>
                  )}
                  <div className="field">
                    <label>Type *</label>
                    <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                      {FOLLOWUP_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Due Date</label>
                    <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
                  </div>
                  <div className="field">
                    <label>Priority</label>
                    <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                      {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  {form.type === 'Custom Follow-up' && (
                    <>
                      <div className="field">
                        <label>Title *</label>
                        <input required placeholder="Follow-up title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
                      </div>
                      <div className="field full">
                        <label>Description</label>
                        <input placeholder="Details..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? <><Loader size={14} className="spin" /> Saving...</> : editFu ? 'Save Changes' : 'Add Follow-up'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
