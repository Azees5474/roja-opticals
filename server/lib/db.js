/**
 * db.js - Unified Database Client for Roja Opticals
 * ──────────────────────────────────────────────────────────
 * Provides a resilient dual-mode database client:
 * 1. Online Mode (Supabase): Uses cloud Supabase when configured and mirrors all
 *    mutations to local storage. Falls back to local storage if offline.
 * 2. Standalone Laptop-Local Mode: Uses 100% local JSON database. Zero cloud dependencies.
 *
 * Exposes a chainable query builder compatible with Supabase PostgREST syntax,
 * including relationship joins (e.g. customers(name, phone)), filters, sorting,
 * atomic mutations, and local authentication.
 */

const crypto = require('crypto');
const localDb = require('./localDb');
const localAuth = require('./localAuth');

const isLocalOnly = Boolean(
  process.env.LOCAL_MODE === 'true' ||
  process.env.NODE_ENV === 'test' ||
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_URL.includes('your-project') ||
  process.env.SUPABASE_URL.includes('xxxxxxxxxxx') ||
  process.env.SUPABASE_URL.includes('placeholder')
);

let realSupabase = null;

if (!isLocalOnly) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    realSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    console.warn('[Db] Failed to initialize Supabase client; falling back to local mode:', err.message);
    realSupabase = null;
  }
}

/**
 * Local Query Builder implementing PostgREST chaining over local JSON storage
 */
class LocalQueryBuilder {
  constructor(table) {
    this.table = table;
    this.operation = 'select'; // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    this.columns = '*';
    this.options = {};
    this.payload = null;
    this.filters = []; // array of filter functions
    this.sorters = []; // array of sorting configs
    this.limitCount = null;
    this.isSingle = false;
  }

  select(columns = '*', options = {}) {
    this.columns = columns;
    this.options = options;
    return this;
  }

  eq(column, value) {
    this.filters.push(row => String(row[column]) === String(value));
    return this;
  }

  in(column, values) {
    const set = new Set((values || []).map(String));
    this.filters.push(row => set.has(String(row[column])));
    return this;
  }

  lte(column, value) {
    this.filters.push(row => row[column] != null && row[column] <= value);
    return this;
  }

  gte(column, value) {
    this.filters.push(row => row[column] != null && row[column] >= value);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.sorters.push({ column, ascending });
    return this;
  }

  limit(count) {
    this.limitCount = parseInt(count, 10);
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  insert(data) {
    this.operation = 'insert';
    this.payload = Array.isArray(data) ? data : [data];
    return this;
  }

  update(updates) {
    this.operation = 'update';
    this.payload = updates;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  upsert(data, options = {}) {
    this.operation = 'upsert';
    this.payload = Array.isArray(data) ? data : [data];
    this.options = options;
    return this;
  }

  async execute() {
    try {
      if (this.operation === 'insert') {
        const created = [];
        for (const item of this.payload) {
          const id = item.id ? String(item.id) : crypto.randomUUID();
          const record = {
            ...item,
            id,
            created_at: item.created_at || new Date().toISOString(),
          };
          const saveRes = await localDb.saveLocal(this.table, id, record);
          if (!saveRes.success) throw new Error(saveRes.error || 'Failed to save record');
          created.push(record);
        }
        return { data: this.isSingle ? (created[0] || null) : created, error: null };
      }

      if (this.operation === 'upsert') {
        const results = [];
        for (const item of this.payload) {
          const id = item.id ? String(item.id) : crypto.randomUUID();
          const { data: existing } = await localDb.readLocal(this.table, id);
          const record = {
            ...(existing || {}),
            ...item,
            id,
            updated_at: new Date().toISOString(),
          };
          const saveRes = await localDb.saveLocal(this.table, id, record);
          if (!saveRes.success) throw new Error(saveRes.error || 'Failed to upsert record');
          results.push(record);
        }
        return { data: this.isSingle ? (results[0] || null) : results, error: null };
      }

      if (this.operation === 'update') {
        const { data: all } = await localDb.readAllLocal(this.table);
        const matching = all.filter(row => this.filters.every(fn => fn(row)));
        const updatedList = [];
        for (const record of matching) {
          const updateRes = await localDb.updateLocal(this.table, record.id, this.payload);
          if (updateRes.success) {
            updatedList.push(updateRes.data);
          }
        }
        return { data: this.isSingle ? (updatedList[0] || null) : updatedList, error: null };
      }

      if (this.operation === 'delete') {
        const { data: all } = await localDb.readAllLocal(this.table);
        const matching = all.filter(row => this.filters.every(fn => fn(row)));
        for (const record of matching) {
          await localDb.deleteLocal(this.table, record.id);
        }
        return { data: null, error: null };
      }

      // ── SELECT Operation ──
      const { data: all } = await localDb.readAllLocal(this.table);
      let rows = all.filter(row => this.filters.every(fn => fn(row)));

      // Join customer information if requested (e.g. customers(name), customers(name, phone))
      if (typeof this.columns === 'string' && this.columns.includes('customers(')) {
        const { data: customers } = await localDb.readAllLocal('customers');
        const customerMap = new Map((customers || []).map(c => [String(c.id), c]));

        rows = rows.map(r => {
          const c = r.customer_id ? customerMap.get(String(r.customer_id)) : null;
          return {
            ...r,
            customers: c ? { id: c.id, name: c.name || '', phone: c.phone || '' } : null,
          };
        });
      }

      // Sort
      for (const { column, ascending } of this.sorters) {
        rows.sort((a, b) => {
          const valA = a[column];
          const valB = b[column];
          if (valA === valB) return 0;
          if (valA == null) return ascending ? 1 : -1;
          if (valB == null) return ascending ? -1 : 1;
          return (valA < valB ? -1 : 1) * (ascending ? 1 : -1);
        });
      }

      // Count mode ({ count: 'exact', head: true })
      if (this.options && this.options.head) {
        return { count: rows.length, data: null, error: null };
      }

      // Limit
      if (this.limitCount != null) {
        rows = rows.slice(0, this.limitCount);
      }

      if (this.isSingle) {
        if (rows.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        }
        return { data: rows[0], error: null };
      }

      return { data: rows, error: null, count: rows.length };
    } catch (err) {
      console.error(`[LocalQueryBuilder] Execution error (${this.table}):`, err.message);
      return { data: null, error: { message: err.message } };
    }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }
}

/**
 * DualModeQueryBuilder wraps both LocalQueryBuilder and Supabase QueryBuilder.
 * When Supabase is configured and reachable, it mirrors queries and auto-syncs mutations to localDb.
 * If Supabase is unreachable (fetch failed, network down, 5xx), it seamlessly falls back to localDb.
 */
class DualModeQueryBuilder {
  constructor(table, realSupabase) {
    this.table = table;
    this.localBuilder = new LocalQueryBuilder(table);
    this.supabaseBuilder = realSupabase ? realSupabase.from(table) : null;
    this.mutationType = null;
    this.mutationData = null;
  }

  select(columns = '*', options = {}) {
    this.localBuilder.select(columns, options);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.select === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.select(columns, options); } catch {}
    }
    return this;
  }

  insert(data) {
    this.mutationType = 'insert';
    this.mutationData = data;
    this.localBuilder.insert(data);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.insert === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.insert(data); } catch {}
    }
    return this;
  }

  upsert(data, options = {}) {
    this.mutationType = 'upsert';
    this.mutationData = data;
    this.localBuilder.upsert(data, options);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.upsert === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.upsert(data, options); } catch {}
    }
    return this;
  }

  update(updates) {
    this.mutationType = 'update';
    this.mutationData = updates;
    this.localBuilder.update(updates);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.update === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.update(updates); } catch {}
    }
    return this;
  }

  delete() {
    this.mutationType = 'delete';
    this.localBuilder.delete();
    if (this.supabaseBuilder && typeof this.supabaseBuilder.delete === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.delete(); } catch {}
    }
    return this;
  }

  eq(column, value) {
    this.localBuilder.eq(column, value);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.eq === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.eq(column, value); } catch {}
    }
    return this;
  }

  in(column, values) {
    this.localBuilder.in(column, values);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.in === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.in(column, values); } catch {}
    }
    return this;
  }

  lte(column, value) {
    this.localBuilder.lte(column, value);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.lte === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.lte(column, value); } catch {}
    }
    return this;
  }

  gte(column, value) {
    this.localBuilder.gte(column, value);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.gte === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.gte(column, value); } catch {}
    }
    return this;
  }

  order(column, options = {}) {
    this.localBuilder.order(column, options);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.order === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.order(column, options); } catch {}
    }
    return this;
  }

  limit(count) {
    this.localBuilder.limit(count);
    if (this.supabaseBuilder && typeof this.supabaseBuilder.limit === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.limit(count); } catch {}
    }
    return this;
  }

  single() {
    this.localBuilder.single();
    if (this.supabaseBuilder && typeof this.supabaseBuilder.single === 'function') {
      try { this.supabaseBuilder = this.supabaseBuilder.single(); } catch {}
    }
    return this;
  }

  async execute() {
    if (!this.supabaseBuilder) {
      return this.localBuilder.execute();
    }

    try {
      const res = await this.supabaseBuilder;
      if (res && res.error) {
        const msg = String(res.error.message || '');
        if (msg.includes('fetch failed') || msg.includes('Failed to fetch') || msg.includes('ECONNREFUSED')) {
          console.error(`[Db] Supabase cloud connection error for ${this.table}: ${msg}`);
          return {
            data: null,
            error: {
              message: 'Cloud database is currently unreachable. Please check your network connection or switch to Local Mode.',
            },
          };
        }
      } else if (res && res.data && this.mutationType) {
        // In cloud mode, mirror successful mutations locally for offline backup
        const records = Array.isArray(res.data) ? res.data : [res.data];
        for (const r of records) {
          if (r && r.id) {
            localDb.saveLocal(this.table, r.id, r).catch(() => {});
          }
        }
      }
      return res;
    } catch (err) {
      console.error(`[Db] Supabase network exception for ${this.table}:`, err.message);
      return {
        data: null,
        error: {
          message: 'Cloud database is currently unreachable. Please check your network connection or switch to Local Mode.',
        },
      };
    }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }
}

/**
 * Resilient Database Proxy that coordinates Supabase and local storage
 */
class DatabaseClient {
  constructor() {
    this.realSupabase = realSupabase;
    this.isLocal = isLocalOnly || !realSupabase;
  }

  from(table) {
    if (this.isLocal || !this.realSupabase) {
      return new LocalQueryBuilder(table);
    }
    return new DualModeQueryBuilder(table, this.realSupabase);
  }

  get auth() {
    const self = this;
    return {
      async getUser(token) {
        if (!token) return { data: { user: null }, error: new Error('No token provided') };

        // 1. Try local HMAC token verification first
        const localUser = localAuth.verifySessionToken(token);
        if (localUser) {
          return { data: { user: localUser }, error: null };
        }

        // 2. If Supabase is available, verify with Supabase
        if (self.realSupabase && !self.isLocal) {
          try {
            return await self.realSupabase.auth.getUser(token);
          } catch (err) {
            return { data: { user: null }, error: err };
          }
        }

        return { data: { user: null }, error: new Error('Invalid token') };
      },

      async signInWithPassword({ email, password }) {
        // 1. Try local authentication
        const localRes = await localAuth.authenticateLocal(email, password, localDb);
        if (localRes.success) {
          return {
            data: {
              session: { access_token: localRes.token },
              user: localRes.user,
            },
            error: null,
          };
        }

        // 2. If Supabase is configured, try Supabase auth
        if (self.realSupabase && !self.isLocal) {
          try {
            return await self.realSupabase.auth.signInWithPassword({ email, password });
          } catch (err) {
            return { data: { session: null, user: null }, error: err };
          }
        }

        return { data: { session: null, user: null }, error: new Error(localRes.message || 'Invalid credentials') };
      },

      async signOut() {
        if (self.realSupabase && !self.isLocal) {
          try {
            await self.realSupabase.auth.signOut();
          } catch {}
        }
        return { error: null };
      },

      async updateUser(updates) {
        if (self.realSupabase && !self.isLocal) {
          try {
            return await self.realSupabase.auth.updateUser(updates);
          } catch (err) {
            return { data: { user: null }, error: err };
          }
        }
        return { data: { user: null }, error: null };
      },
    };
  }
}

const db = new DatabaseClient();

module.exports = db;
