import { createClient } from '@supabase/supabase-js';

// Public keys — safe for browser
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isRealSupabase = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON &&
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('http') &&
  !SUPABASE_URL.includes('xxxxxxxxxxx') &&
  !SUPABASE_URL.includes('your-project')
);

const SESSION_KEY = 'roja_auth_session';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredSession(session) {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage errors in private browsing modes
  }
}

const authListeners = new Set();

function notifyAuthChange(event, session) {
  authListeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch {
      // Listener error shouldn't crash auth flow
    }
  });
}

function getApiBase() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  return '/api';
}

async function localApiFetch(path, options = {}) {
  const session = getStoredSession();
  const token = session?.access_token || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const base = getApiBase();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    setStoredSession(null);
    notifyAuthChange('SIGNED_OUT', null);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { data: null, error: { message: data?.message || 'Request failed' } };
  }
  return { data, error: null };
}

class LocalClientQueryBuilder {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.columns = '*';
    this.options = {};
    this.filters = {};
    this.payload = null;
    this.isSingle = false;
    this.isHead = false;
  }

  select(columns = '*', options = {}) {
    this.columns = columns;
    this.options = options;
    if (options && options.head) this.isHead = true;
    return this;
  }

  eq(column, value) {
    this.filters[column] = value;
    return this;
  }

  ilike(column, value) {
    this.filters[column] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  gte() {
    return this;
  }

  lte() {
    return this;
  }

  in() {
    return this;
  }

  neq() {
    return this;
  }

  gt() {
    return this;
  }

  lt() {
    return this;
  }

  contains() {
    return this;
  }

  match() {
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  insert(data) {
    this.operation = 'insert';
    this.payload = Array.isArray(data) ? data[0] : data;
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

  async execute() {
    const table = this.table;
    const id = this.filters.id;

    if (this.operation === 'insert') {
      const { data, error } = await localApiFetch(`/${table}`, {
        method: 'POST',
        body: JSON.stringify(this.payload),
      });
      return { data: this.isSingle ? data : (data ? [data] : []), error };
    }

    if (this.operation === 'update') {
      if (id) {
        let endpoint = `/${table}/${id}`;
        let method = 'PUT';

        if (table === 'customers' && this.payload.next_visit_date !== undefined && Object.keys(this.payload).length === 1) {
          endpoint = `/customers/${id}/next-visit`;
          method = 'PATCH';
        } else if (table === 'billing' && this.payload.paid === true) {
          endpoint = `/billing/${id}/pay`;
          method = 'PATCH';
        } else if (table === 'orders' && this.payload.status) {
          endpoint = `/orders/${id}/status`;
          method = 'PATCH';
        } else if (table === 'inventory' && this.payload.stock !== undefined) {
          endpoint = `/inventory/${id}/stock`;
          method = 'PATCH';
        } else if (table === 'followups' && this.payload.done !== undefined) {
          endpoint = `/followups/${id}/done`;
          method = 'PATCH';
        } else if (table === 'followups' && this.payload.status) {
          endpoint = `/followups/${id}/status`;
          method = 'PATCH';
        }

        const { data, error } = await localApiFetch(endpoint, {
          method,
          body: JSON.stringify(this.payload),
        });
        return { data: this.isSingle ? data : (data ? [data] : []), error };
      }
      return { data: null, error: { message: 'ID required for update' } };
    }

    if (this.operation === 'delete') {
      if (id) {
        const { data, error } = await localApiFetch(`/${table}/${id}`, {
          method: 'DELETE',
        });
        return { data, error };
      }
      return { data: null, error: { message: 'ID required for delete' } };
    }

    // Select operation
    let endpoint = `/${table}`;
    if (id && this.isSingle) {
      endpoint = `/${table}/${id}`;
    }

    const { data, error } = await localApiFetch(endpoint);
    if (error) return { data: null, error, count: 0 };

    if (this.isHead) {
      const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
      return { data: null, error: null, count };
    }

    if (this.isSingle) {
      const singleItem = Array.isArray(data) ? data[0] : data;
      return { data: singleItem || null, error: singleItem ? null : { message: 'Not found' } };
    }

    return { data: Array.isArray(data) ? data : (data ? [data] : []), error: null };
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }
}

function createLocalBrowserClient() {
  return {
    from(table) {
      return new LocalClientQueryBuilder(table);
    },
    channel() {
      const ch = {
        on() {
          return ch;
        },
        subscribe(callback) {
          if (typeof callback === 'function') {
            try {
              callback('SUBSCRIBED');
            } catch {
              // Ignore subscriber errors
            }
          }
          return ch;
        },
        unsubscribe() {
          return ch;
        },
      };
      return ch;
    },
    removeChannel() {
      return Promise.resolve();
    },
    removeAllChannels() {
      return Promise.resolve();
    },
    getChannels() {
      return [];
    },
    auth: {
      async getSession() {
        const session = getStoredSession();
        return { data: { session }, error: null };
      },
      async getUser() {
        const session = getStoredSession();
        return { data: { user: session?.user || null }, error: null };
      },
      onAuthStateChange(callback) {
        const initialSession = getStoredSession();
        try {
          callback('INITIAL_SESSION', initialSession);
        } catch {
          // Ignore initial callback error
        }
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
      async signInWithPassword({ email, password }) {
        const base = getApiBase();
        try {
          const res = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const result = await res.json();
          if (!res.ok) {
            return {
              data: { session: null, user: null },
              error: { message: result.message || 'Login failed' },
            };
          }
          const session = {
            access_token: result.access_token,
            user: result.user,
          };
          setStoredSession(session);
          notifyAuthChange('SIGNED_IN', session);
          return {
            data: { session, user: result.user },
            error: null,
          };
        } catch {
          return {
            data: { session: null, user: null },
            error: { message: 'Unable to connect to local application server' },
          };
        }
      },
      async signOut() {
        const base = getApiBase();
        try {
          await fetch(`${base}/auth/logout`, { method: 'POST' });
        } catch {
          // Ignore logout network failures
        }
        setStoredSession(null);
        notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      },
      async updateUser(updates) {
        const session = getStoredSession();
        if (session && session.user) {
          const updatedUser = {
            ...session.user,
            user_metadata: { ...(session.user.user_metadata || {}), ...(updates.data || {}) },
          };
          session.user = updatedUser;
          setStoredSession(session);
          notifyAuthChange('USER_UPDATED', session);
          return { data: { user: updatedUser }, error: null };
        }
        return { data: { user: null }, error: null };
      },
    },
  };
}

export const supabase = (import.meta.env.VITE_DIRECT_SUPABASE === 'true' && isRealSupabase)
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : createLocalBrowserClient();
