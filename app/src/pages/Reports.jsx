import { useState, useEffect } from 'react'
import { RefreshCw, FileSpreadsheet, Loader, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import './PageCommon.css'
import './Reports.css'

const PIE_COLORS = ['#667eea', '#764ba2', '#f093fb', '#fde68a', '#5eead4']

export default function Reports() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({
    monthlyRevenue: 0,
    totalOrders: 0,
    newCustomers: 0,
    avgOrderValue: 0
  })
  const [monthlySales, setMonthlySales] = useState([])
  const [categoryData, setCategoryData] = useState([])
  const [dailyOrders, setDailyOrders] = useState([])
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [exportError, setExportError] = useState('')

  // Fetch all report data
  const fetchReportData = async () => {
    setLoading(true)
    
    try {
      // Get current month start and end
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const monthStart = new Date(currentYear, currentMonth, 1).toISOString()
      const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString()

      // Fetch this month's billing data
      const { data: monthlyBilling } = await supabase
        .from('billing')
        .select('total, created_at')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)

      // Calculate KPIs
      const monthlyRev = (monthlyBilling || []).reduce((sum, b) => sum + (b.total || 0), 0)
      const ordersCount = (monthlyBilling || []).length
      const avgValue = ordersCount > 0 ? monthlyRev / ordersCount : 0

      // Fetch new customers this month
      const { count: newCust } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)

      setKpis({
        monthlyRevenue: Math.round(monthlyRev),
        totalOrders: ordersCount,
        newCustomers: newCust || 0,
        avgOrderValue: Math.round(avgValue)
      })

      // Fetch last 7 months sales
      const monthsData = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
        
        const { data } = await supabase
          .from('billing')
          .select('total')
          .gte('created_at', start)
          .lte('created_at', end)

        const total = (data || []).reduce((sum, b) => sum + (b.total || 0), 0)
        monthsData.push({
          month: d.toLocaleDateString('en-IN', { month: 'short' }),
          sales: Math.round(total)
        })
      }
      setMonthlySales(monthsData)

      // Fetch category distribution (mock data - you can enhance this)
      setCategoryData([
        { name: 'Frames', value: 38 },
        { name: 'Lenses', value: 32 },
        { name: 'Contact Lenses', value: 20 },
        { name: 'Accessories', value: 10 },
      ])

      // Fetch last 7 days orders
      const daysData = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString()
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString()
        
        const { count } = await supabase
          .from('billing')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd)

        daysData.push({
          day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          orders: count || 0
        })
      }
      setDailyOrders(daysData)

      setLastUpdate(new Date())
    } catch (error) {
      console.error('Error fetching report data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => { void fetchReportData() }, 0)
    return () => clearTimeout(timer)
  }, [])

  // Real-time subscription to billing table
  useEffect(() => {
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'billing'
      }, () => {
        console.log('[Reports] Real-time update detected, refreshing data...')
        fetchReportData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReportData()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Real-time analytics and performance overview for Roja Opticals.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="last-update">
            Last updated: {lastUpdate.toLocaleTimeString('en-IN')}
          </span>
          <button
            className="btn-secondary"
            onClick={async () => {
              setExporting(true)
              setExportMsg('')
              setExportError('')
              try {
                const res = await api.download('/export/reports', {}, `roja_reports_${new Date().toISOString().slice(0, 10)}.xlsx`)
                setExportMsg(`Downloaded ${res.filename} successfully!`)
                setTimeout(() => setExportMsg(''), 4000)
              } catch (err) {
                setExportError(err.message || 'Export failed')
                setTimeout(() => setExportError(''), 4000)
              } finally {
                setExporting(false)
              }
            }}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {exporting ? <Loader size={16} className="spin" /> : <FileSpreadsheet size={16} color="#0d9488" />}
            {exporting ? 'Generating...' : 'Export to Excel'}
          </button>
          <button 
            className="btn-primary" 
            onClick={fetchReportData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div style={{ background: '#ecfdf5', color: '#065f46', padding: '10px 14px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', border: '1px solid #6ee7b7' }}>
          <CheckCircle2 size={16} /> {exportMsg}
        </div>
      )}
      {exportError && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', border: '1px solid #f87171' }}>
          <AlertCircle size={16} /> {exportError}
        </div>
      )}

      <div className="realtime-badge">
        <div className="pulse-dot"></div>
        <span>Live Data</span>
      </div>

      <div className="report-kpis">
        {[
          { label: 'Monthly Revenue', value: `₹${kpis.monthlyRevenue.toLocaleString('en-IN')}`, sub: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) },
          { label: 'Total Orders', value: kpis.totalOrders.toString(), sub: 'This month' },
          { label: 'New Customers', value: kpis.newCustomers.toString(), sub: 'This month' },
          { label: 'Avg Order Value', value: `₹${kpis.avgOrderValue.toLocaleString('en-IN')}`, sub: 'This month' },
        ].map((k, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="report-grid">
        <div className="report-chart-card">
          <h2>Monthly Sales (Last 7 Months)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <Tooltip 
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} 
                formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Sales']}
              />
              <Bar dataKey="sales" fill="url(#colorGradient)" radius={[6,6,0,0]} />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="report-chart-card">
          <h2>Sales by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie 
                data={categoryData} 
                cx="50%" 
                cy="50%" 
                innerRadius={60} 
                outerRadius={90} 
                paddingAngle={3} 
                dataKey="value"
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="report-chart-card">
          <h2>Daily Orders (Last 7 Days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyOrders}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <Tooltip 
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} 
                formatter={(value) => [value, 'Orders']}
              />
              <Line 
                type="monotone" 
                dataKey="orders" 
                stroke="#667eea" 
                strokeWidth={3} 
                dot={{ fill: '#667eea', r: 5, strokeWidth: 2, stroke: '#fff' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
