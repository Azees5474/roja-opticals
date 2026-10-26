/**
 * Sync Existing Data to Local Storage
 * Downloads all existing data from Supabase and saves locally
 */

require('dotenv').config();
const supabase = require('./lib/supabase');
const localDb = require('./lib/localDb');

async function syncTable(tableName) {
  console.log(`\n📥 Syncing ${tableName}...`);
  
  const { data, error } = await supabase
    .from(tableName)
    .select('*');
  
  if (error) {
    console.error(`❌ Error fetching ${tableName}:`, error.message);
    return 0;
  }
  
  if (!data || data.length === 0) {
    console.log(`   No records found in ${tableName}`);
    return 0;
  }
  
  let saved = 0;
  for (const record of data) {
    if (record.id) {
      const result = await localDb.saveLocal(tableName, record.id, record);
      if (result.success) saved++;
    }
  }
  
  console.log(`✅ ${tableName}: ${saved}/${data.length} records synced`);
  return saved;
}

async function syncAllData() {
  console.log('🔄 Starting full database sync to local storage...');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Initialize local DB
  await localDb.initLocalDb();
  
  const tables = [
    'customers',
    'prescriptions',
    'followups',
    'billing',
    'orders',
    'inventory',
    'whatsapp_messages',
  ];
  
  let totalSynced = 0;
  
  for (const table of tables) {
    const count = await syncTable(table);
    totalSynced += count;
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🎉 Sync complete! ${totalSynced} total records saved locally`);
  console.log('═══════════════════════════════════════════════════\n');
  
  // Show statistics
  const stats = await localDb.getDbStats();
  console.log('📊 Local Database Statistics:');
  Object.entries(stats).forEach(([table, count]) => {
    console.log(`   ${table.padEnd(20)} ${count} records`);
  });
  
  console.log('\n✅ All existing data is now stored locally!');
  console.log('📁 Location: server/local_database/');
  console.log('\n💡 From now on, all new data will auto-sync to local storage.');
  
  process.exit(0);
}

syncAllData().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
