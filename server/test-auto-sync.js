/**
 * Test Auto-Sync Functionality
 * Creates a test customer to verify local storage sync
 */

require('dotenv').config();
const supabase = require('./lib/supabase');
const localDb = require('./lib/localDb');

async function testAutoSync() {
  console.log('🧪 Testing auto-sync to local storage...\n');
  
  // Initialize local DB
  await localDb.initLocalDb();
  
  // Create test customer
  console.log('1. Creating test customer in Supabase...');
  const { data, error } = await supabase
    .from('customers')
    .insert([{
      name: 'Auto-Sync Test Customer',
      phone: '7777777777',
      email: 'autosync@test.com',
      age: 30,
    }])
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error creating customer:', error.message);
    return;
  }
  
  console.log('✅ Customer created in Supabase:', data.id);
  console.log('');
  
  // Wait a moment for auto-sync
  console.log('2. Waiting for auto-sync...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check if saved locally
  console.log('3. Checking local storage...');
  const { success, data: localData } = await localDb.readLocal('customers', data.id);
  
  if (success && localData) {
    console.log('✅ Customer found in local storage!');
    console.log('   Name:', localData.name);
    console.log('   Phone:', localData.phone);
    console.log('   File:', `local_database/customers/${data.id}.json`);
    console.log('');
    console.log('🎉 AUTO-SYNC IS WORKING!');
  } else {
    console.log('❌ Customer NOT found in local storage');
    console.log('   Auto-sync may not be working correctly');
  }
  
  console.log('');
  console.log('4. Checking local database files...');
  const { data: allCustomers } = await localDb.readAllLocal('customers');
  console.log(`   Total customers in local storage: ${allCustomers.length}`);
  
  process.exit(0);
}

testAutoSync().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
