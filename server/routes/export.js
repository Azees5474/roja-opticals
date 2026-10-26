/**
 * export.js
 * ──────────────────────────────────────────────────────────
 * Excel (.xlsx) Export API Routes (Staff & Owner)
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { exportCustomersWorkbook, exportReportsWorkbook, getSafeExportFilename } = require('../lib/excelExport');

// POST /api/export/customers — Export customers (with optional prescriptions) to Excel
router.post('/customers', async (req, res) => {
  try {
    const {
      search,
      includePhone = true,
      includePrescriptions = true,
      dateFrom,
      dateTo,
      customerIds,
    } = req.body || {};

    // 1. Fetch customers from database
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false });

    if (dateFrom) {
      const fromIso = dateFrom.includes('T') ? dateFrom : `${dateFrom}T00:00:00.000Z`;
      query = query.gte('created_at', fromIso);
    }
    if (dateTo) {
      const toIso = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
      query = query.lte('created_at', toIso);
    }

    const { data: rawCustomers, error: custError } = await query;
    if (custError) {
      console.error('[Export API] Customers fetch error:', custError.message);
      return res.status(500).json({ message: 'Failed to retrieve customers for export' });
    }

    let customers = rawCustomers || [];

    // Filter by specific customer IDs if provided
    if (Array.isArray(customerIds) && customerIds.length > 0) {
      const idSet = new Set(customerIds.map(String));
      customers = customers.filter((c) => idSet.has(String(c.id)) || idSet.has(String(c.customer_id)));
    }

    // Apply client-side search query if specified
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter((c) => {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').includes(q);
        const emailMatch = (c.email || '').toLowerCase().includes(q);
        const idMatch = (c.customer_id || c.id || '').toLowerCase().includes(q);
        return nameMatch || phoneMatch || emailMatch || idMatch;
      });
    }

    // 2. Fetch prescriptions if requested
    let prescriptions = [];
    if (includePrescriptions && customers.length > 0) {
      const validIds = customers.map((c) => c.id).filter(Boolean);
      if (validIds.length > 0) {
        const { data: rxData, error: rxError } = await supabase
          .from('prescriptions')
          .select('*')
          .in('customer_id', validIds)
          .order('date', { ascending: false });

        if (!rxError && rxData) {
          prescriptions = rxData;
        }
      }
    }

    // 3. Generate native .xlsx workbook buffer
    const buffer = await exportCustomersWorkbook({
      customers,
      prescriptions,
      options: {
        includePhone: Boolean(includePhone),
        includePrescriptions: Boolean(includePrescriptions),
      },
    });

    const filename = getSafeExportFilename('roja_customers_export');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[Export API] Customer export error:', err.message);
    res.status(500).json({ message: 'Error generating customer Excel export: ' + err.message });
  }
});

// POST /api/export/reports — Export analytics & report data to Excel
router.post('/reports', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body || {};

    let billingQuery = supabase.from('billing').select('*').order('created_at', { ascending: false });

    if (dateFrom) {
      const fromIso = dateFrom.includes('T') ? dateFrom : `${dateFrom}T00:00:00.000Z`;
      billingQuery = billingQuery.gte('created_at', fromIso);
    }
    if (dateTo) {
      const toIso = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
      billingQuery = billingQuery.lte('created_at', toIso);
    }

    const { data: billing, error: billError } = await billingQuery;
    if (billError) {
      console.error('[Export API] Billing fetch error:', billError.message);
      return res.status(500).json({ message: 'Failed to retrieve billing records for report' });
    }

    const bills = billing || [];
    const totalRev = bills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
    const ordersCount = bills.length;
    const avgOrderVal = ordersCount > 0 ? Math.round(totalRev / ordersCount) : 0;

    const { count: newCustCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    const kpis = {
      monthlyRevenue: totalRev,
      totalOrders: ordersCount,
      newCustomers: newCustCount || 0,
      avgOrderValue: avgOrderVal,
    };

    // Calculate monthly summary
    const monthlyMap = new Map();
    for (const b of bills) {
      const d = b.created_at ? new Date(b.created_at) : new Date();
      const mKey = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      monthlyMap.set(mKey, (monthlyMap.get(mKey) || 0) + (Number(b.total) || 0));
    }

    const monthlySales = Array.from(monthlyMap.entries()).map(([month, sales]) => ({
      month,
      sales: Math.round(sales),
    }));

    const buffer = await exportReportsWorkbook({
      kpis,
      monthlySales,
      billing: bills,
    });

    const filename = getSafeExportFilename('roja_financial_reports');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[Export API] Report export error:', err.message);
    res.status(500).json({ message: 'Error generating report Excel export: ' + err.message });
  }
});

module.exports = router;
