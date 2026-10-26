/**
 * Auto-sync Middleware
 * Automatically saves all Supabase operations to local disk
 */

const localDb = require('../lib/localDb');

/**
 * Intercept Supabase responses and save to local storage
 */
function createAutoSyncWrapper(supabase) {
  const originalFrom = supabase.from.bind(supabase);
  
  supabase.from = function(table) {
    const query = originalFrom(table);
    
    // Wrap insert
    const originalInsert = query.insert.bind(query);
    query.insert = function(data) {
      const result = originalInsert(data);
      
      // Intercept the response
      const originalThen = result.then.bind(result);
      result.then = function(onSuccess, onError) {
        return originalThen((response) => {
          // Save to local storage after successful insert
          if (response.data && !response.error) {
            const records = Array.isArray(response.data) ? response.data : [response.data];
            records.forEach(record => {
              if (record && record.id) {
                localDb.saveLocal(table, record.id, record).catch(err => {
                  console.error(`Auto-sync failed for ${table}/${record.id}:`, err.message);
                });
              }
            });
          }
          return onSuccess ? onSuccess(response) : response;
        }, onError);
      };
      
      return result;
    };
    
    // Wrap update
    const originalUpdate = query.update.bind(query);
    query.update = function(data) {
      const result = originalUpdate(data);
      
      const originalThen = result.then ? result.then.bind(result) : null;
      if (originalThen) {
        result.then = function(onSuccess, onError) {
          return originalThen((response) => {
            // Save to local storage after successful update
            if (response.data && !response.error) {
              const records = Array.isArray(response.data) ? response.data : [response.data];
              records.forEach(record => {
                if (record && record.id) {
                  localDb.saveLocal(table, record.id, record).catch(err => {
                    console.error(`Auto-sync failed for ${table}/${record.id}:`, err.message);
                  });
                }
              });
            }
            return onSuccess ? onSuccess(response) : response;
          }, onError);
        };
      }
      
      return result;
    };
    
    // Wrap delete
    const originalDelete = query.delete.bind(query);
    query.delete = function() {
      const result = originalDelete();
      
      // Store the ID for deletion (we need to track it before the query executes)
      let deleteId = null;
      
      const originalEq = result.eq ? result.eq.bind(result) : null;
      if (originalEq) {
        result.eq = function(column, value) {
          if (column === 'id') {
            deleteId = value;
          }
          return originalEq(column, value);
        };
      }
      
      const originalThen = result.then ? result.then.bind(result) : null;
      if (originalThen) {
        result.then = function(onSuccess, onError) {
          return originalThen((response) => {
            // Delete from local storage after successful delete
            if (!response.error && deleteId) {
              localDb.deleteLocal(table, deleteId).catch(err => {
                console.error(`Auto-sync delete failed for ${table}/${deleteId}:`, err.message);
              });
            }
            return onSuccess ? onSuccess(response) : response;
          }, onError);
        };
      }
      
      return result;
    };
    
    return query;
  };
  
  return supabase;
}

/**
 * Express middleware to enable auto-sync for a request
 */
function enableAutoSync(req, res, next) {
  // Auto-sync is always enabled
  next();
}

module.exports = {
  createAutoSyncWrapper,
  enableAutoSync,
};
