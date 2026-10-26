/**
 * Test script to add a customer with backdated follow-ups
 * This helps test the 30-day and 180-day follow-up system
 */

require('dotenv').config();
const supabase = require('./lib/supabase');

async function addTestCustomer() {
  console.log('🧪 Creating test customer with backdated follow-ups...\n');

  // Calculate dates
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const created30DaysAgo = thirtyDaysAgo.toISOString();
  const todayStr = today.toISOString().slice(0, 10);

  // Create test customer
  const customerData = {
    name: 'Test Customer 30 Days',
    phone: '9999999999',
    email: 'test30days@example.com',
    age: 35,
    created_at: created30DaysAgo,
  };

  console.log('1. Creating customer...');
  console.log('   Name:', customerData.name);
  console.log('   Phone:', customerData.phone);
  console.log('   Created date:', created30DaysAgo);
  console.log('');

  const { data: customer, error: custError } = await supabase
    .from('customers')
    .insert([customerData])
    .select()
    .single();

  if (custError) {
    console.error('❌ Error creating customer:', custError.message);
    return;
  }

  console.log('✅ Customer created with ID:', customer.id);
  console.log('');

  // Create 30-day follow-up (due TODAY)
  const followup30 = {
    customer_id: customer.id,
    type: '30day',
    title: '30-Day Review',
    description: 'Check if customer is comfortable with glasses',
    due_date: todayStr,  // Due TODAY!
    priority: 'High',
    status: 'Pending',
    done: false,
    auto_generated: true,
    reminder_key: `30day_${customer.id}`,
    whatsapp_sent: false,
  };

  console.log('2. Creating 30-day follow-up...');
  console.log('   Type:', followup30.type);
  console.log('   Due date:', followup30.due_date, '(TODAY)');
  console.log('   Priority:', followup30.priority);
  console.log('');

  const { error: fu30Error } = await supabase
    .from('followups')
    .insert([followup30]);

  if (fu30Error) {
    console.error('❌ Error creating 30-day follow-up:', fu30Error.message);
    return;
  }

  console.log('✅ 30-day follow-up created (DUE TODAY!)');
  console.log('');

  // Create 180-day follow-up (150 days from today)
  const date180 = new Date(today);
  date180.setDate(today.getDate() + 150);
  const date180Str = date180.toISOString().slice(0, 10);

  const followup180 = {
    customer_id: customer.id,
    type: '180day',
    title: '180-Day Eye Checkup',
    description: 'Remind customer about next eye checkup',
    due_date: date180Str,
    priority: 'Medium',
    status: 'Pending',
    done: false,
    auto_generated: true,
    reminder_key: `180day_${customer.id}`,
    whatsapp_sent: false,
  };

  console.log('3. Creating 180-day follow-up...');
  console.log('   Type:', followup180.type);
  console.log('   Due date:', followup180.due_date);
  console.log('');

  const { error: fu180Error } = await supabase
    .from('followups')
    .insert([followup180]);

  if (fu180Error) {
    console.error('❌ Error creating 180-day follow-up:', fu180Error.message);
    return;
  }

  console.log('✅ 180-day follow-up created');
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════');
  console.log('🎉 TEST CUSTOMER CREATED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('📋 Customer Details:');
  console.log('   ID:', customer.id);
  console.log('   Name:', customer.name);
  console.log('   Phone:', customer.phone);
  console.log('   Created:', thirtyDaysAgo.toLocaleDateString());
  console.log('');
  console.log('📅 Follow-ups Created:');
  console.log('   ✓ 30-Day Review - DUE TODAY! (' + todayStr + ')');
  console.log('   ✓ 180-Day Checkup - Due ' + date180.toLocaleDateString());
  console.log('');
  console.log('🔍 How to Test:');
  console.log('   1. Go to Dashboard');
  console.log('   2. Check "Follow-ups Today" section');
  console.log('   3. You should see "Test Customer 30 Days"');
  console.log('   4. Click the WhatsApp button (📱) to test');
  console.log('');
  console.log('   OR');
  console.log('');
  console.log('   1. Go to Follow-ups page');
  console.log('   2. Filter by "Due Today" or "Pending"');
  console.log('   3. Find "Test Customer 30 Days"');
  console.log('   4. Test WhatsApp reminder and mark as done');
  console.log('');
  console.log('═══════════════════════════════════════════════════');

  process.exit(0);
}

// Run the script
addTestCustomer().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
