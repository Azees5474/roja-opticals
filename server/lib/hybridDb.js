/**
 * Hybrid Database - Online + Offline
 * Automatically saves to both Supabase (online) and local disk (offline)
 * Falls back to local when Supabase is unavailable
 */

const supabase = require('./supabase');
const localDb = require('./localDb');

// Track online/offline status
let isOnline = true;
let lastSupabaseCheck = Date.now();

/**
 * Check if Supabase is available
 */
async function checkSupabaseStatus() {
  // Cache check for 30 seconds
  if (Date.now() - lastSupabaseCheck < 30000) {
    return isOnline;
  }
  
  try {
    const { error } = await supabase.from('customers').select('id').limit(1);
    isOnline = !error;
    lastSupabaseCheck = Date.now();
    return isOnline;
  } catch (err) {
    isOnline = false;
    lastSupabaseCheck = Date.now();
    return false;
  }
}

/**
 * INSERT - Save to both Supabase and local disk
 */
async function insert(table, records) {
  const isArray = Array.isArray(records);
  const data = isArray ? records : [records];
  
  console.log(`[Hybrid] INSERT ${table}: ${data.length} record(s)`);
  
  let supabaseResult = null;
  let localResult = null;
  
  // Try Supabase first
  const online = await checkSupabaseStatus();
  
  if (online) {
    try {
      const { data: supaData, error } = await supabase
        .from(table)
        .insert(data)
        .select();
      
      if (!error && supaData) {
        supabaseResult = supaData;
        console.log(`✅ Supabase: ${table} saved (${supaData.length} records)`);
        
        // Save to local as backup
        for (const record of supaData) {
          await localDb.saveLocal(table, record.id, record);
        }
      } else {
        console.warn(`⚠️  Supabase insert failed:`, error?.message);
      }
    } catch (err) {
      console.error(`❌ Supabase error:`, err.message);
      isOnline = false;
    }
  }
  
  // If Supabase failed, save locally only
  if (!supabaseResult) {
    console.log(`📴 Offline mode: Saving to local storage only`);
    const localRecords = [];
    
    for (const record of data) {
      const id = record.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const recordWithId = { ...record, id, _offline: true, _created_locally: new Date().toISOString() };
      await localDb.saveLocal(table, id, recordWithId);
      localRecords.push(recordWithId);
    }
    
    localResult = localRecords;
  }
  
  const result = supabaseResult || localResult;
  return {
    data: isArray ? result : result[0],
    error: null,
    _source: supabaseResult ? 'supabase' : 'local',
    _offline: !supabaseResult,
  };
}

/**
 * SELECT - Read from Supabase, fallback to local
 */
async function select(table, options = {}) {
  console.log(`[Hybrid] SELECT ${table}`);
  
  const online = await checkSupabaseStatus();
  
  if (online) {
    try {
      let query = supabase.from(table).select(options.select || '*');
      
      if (options.eq) {
        for (const [key, value] of Object.entries(options.eq)) {
          query = query.eq(key, value);
        }
      }
      
      if (options.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending !== false });
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const { data, error } = await query;
      
      if (!error && data) {
        console.log(`✅ Supabase: ${table} retrieved (${data.length} records)`);
        
        // Update local cache
        for (const record of data) {
          await localDb.saveLocal(table, record.id, record);
        }
        
        return { data, error: null, _source: 'supabase' };
      }
    } catch (err) {
      console.error(`❌ Supabase read error:`, err.message);
      isOnline = false;
    }
  }
  
  // Fallback to local
  console.log(`📴 Reading from local storage`);
  const { data } = await localDb.readAllLocal(table);
  
  // Apply filters locally
  let filtered = data;
  
  if (options.eq) {
    for (const [key, value] of Object.entries(options.eq)) {
      filtered = filtered.filter(r => r[key] === value);
    }
  }
  
  if (options.order) {
    const { column, ascending = true } = options.order;
    filtered.sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });
  }
  
  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  
  return { data: filtered, error: null, _source: 'local', _offline: true };
}

/**
 * UPDATE - Update in both Supabase and local
 */
async function update(table, id, updates) {
  console.log(`[Hybrid] UPDATE ${table}/${id}`);
  
  const online = await checkSupabaseStatus();
  
  if (online) {
    try {
      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (!error && data) {
        console.log(`✅ Supabase: ${table}/${id} updated`);
        await localDb.saveLocal(table, id, data);
        return { data, error: null, _source: 'supabase' };
      }
    } catch (err) {
      console.error(`❌ Supabase update error:`, err.message);
      isOnline = false;
    }
  }
  
  // Fallback to local
  console.log(`📴 Updating local storage only`);
  const result = await localDb.updateLocal(table, id, { ...updates, _updated_offline: true });
  return { ...result, _source: 'local', _offline: true };
}

/**
 * DELETE - Delete from both Supabase and local
 */
async function deleteRecord(table, id) {
  console.log(`[Hybrid] DELETE ${table}/${id}`);
  
  const online = await checkSupabaseStatus();
  
  if (online) {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (!error) {
        console.log(`✅ Supabase: ${table}/${id} deleted`);
      }
    } catch (err) {
      console.error(`❌ Supabase delete error:`, err.message);
    }
  }
  
  await localDb.deleteLocal(table, id);
  return { error: null };
}

/**
 * Sync offline records to Supabase when back online
 */
async function syncOfflineRecords() {
  const online = await checkSupabaseStatus();
  
  if (!online) {
    console.log('📴 Still offline, skipping sync');
    return { synced: 0, failed: 0 };
  }
  
  console.log('🔄 Syncing offline records to Supabase...');
  
  const tables = ['customers', 'prescriptions', 'followups', 'billing', 'orders'];
  let synced = 0;
  let failed = 0;
  
  for (const table of tables) {
    const { data: records } = await localDb.readAllLocal(table);
    const offlineRecords = records.filter(r => r._offline || r._created_locally);
    
    for (const record of offlineRecords) {
      try {
        // Remove local-only flags
        const { _offline, _created_locally, _updated_offline, ...cleanRecord } = record;
        
        // Try to upsert to Supabase
        const { error } = await supabase.from(table).upsert(cleanRecord);
        
        if (!error) {
          // Update local to remove offline flag
          await localDb.saveLocal(table, record.id, cleanRecord);
          synced++;
          console.log(`✅ Synced: ${table}/${record.id}`);
        } else {
          failed++;
          console.error(`❌ Sync failed: ${table}/${record.id}`, error.message);
        }
      } catch (err) {
        failed++;
        console.error(`❌ Sync error: ${table}/${record.id}`, err.message);
      }
    }
  }
  
  console.log(`🔄 Sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

/**
 * Get sync status
 */
async function getSyncStatus() {
  const online = await checkSupabaseStatus();
  const tables = ['customers', 'prescriptions', 'followups', 'billing', 'orders'];
  
  let offlineRecords = 0;
  
  for (const table of tables) {
    const { data: records } = await localDb.readAllLocal(table);
    offlineRecords += records.filter(r => r._offline || r._created_locally).length;
  }
  
  return {
    online,
    offlineRecords,
    lastCheck: new Date(lastSupabaseCheck).toISOString(),
  };
}

module.exports = {
  insert,
  select,
  update,
  delete: deleteRecord,
  checkSupabaseStatus,
  syncOfflineRecords,
  getSyncStatus,
};
