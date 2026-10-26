/**
 * Test script to add a customer with 180-day follow-up due today
 * This tests the 6-month eye checkup reminder system
 */

require('dotenv').config();
const supabase = require('./lib/supabase');

async function addTestCustomer180() {
  console.log('🧪 Creating test customer for 180-day follow-up...\n');

  // Calculate dates
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setDate(today.getDate() - 180);
  
  const created180DaysAgo = sixMonthsAgo.toISOString();
  const todayStr = today.toISOString().slice(0, 10);

  // Create test customer
  const customerData = {
    name: 'Test Customer 180 Days',
    phone: '8888888888',
    email: 'test180days@example.com',
    age: 45,
    created_at: created180DaysAgo,
  };

  console.log('1. Creating customer...');
  console.log('   Name:', customerData.name);
  console.log('   Phone:', customerData.phone);
  console.log('   Created date:', created180DaysAgo);
  console.log('   (6 months ago)');
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

  // Create 30-day follow-up (already passed)
  const date30Past = new Date(sixMonthsAgo);
  date30Past.setDate(date30Past.getDate() + 30);
  
  const followup30 = {
    customer_id: customer.id,
    type: '30day',
    title: '30-Day Review',
    description: 'Check if customer is comfortable with glasses',
    due_date: date30Past.toISOString().slice(0, 10),
    priority: 'Medium',
    status: 'Completed',
    done: true,  // Mark as done since it's in the past
    auto_generated: true,
    reminder_key: `30day_${customer.id}`,
    whatsapp_sent: true,
  };

  console.log('2. Creating 30-day follow-up (already completed)...');
  console.log('   Due date:', followup30.due_date);
  console.log('   Status: Done');
  console.log('');

  await supabase.from('followups').insert([followup30]);
  console.log('✅ 30-day follow-up created (marked as done)');
  console.log('');

  // Create 180-day follow-up (due TODAY)
  const followup180 = {
    customer_id: customer.id,
    type: '180day',
    title: '180-Day Eye Checkup',
    description: 'Remind customer about next eye checkup',
    due_date: todayStr,  // Due TODAY!
    priority: 'High',
    status: 'Pending',
    done: false,
    auto_generated: true,
    reminder_key: `180day_${customer.id}`,
    whatsapp_sent: false,
  };

  console.log('3. Creating 180-day follow-up...');
  console.log('   Type:', followup180.type);
  console.log('   Due date:', followup180.due_date, '(TODAY)');
  console.log('   Priority:', followup180.priority);
  console.log('');

  const { error: fu180Error } = await supabase
    .from('followups')
    .insert([followup180]);

  if (fu180Error) {
    console.error('❌ Error creating 180-day follow-up:', fu180Error.message);
    return;
  }

  console.log('✅ 180-day follow-up created (DUE TODAY!)');
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
  console.log('   Created:', sixMonthsAgo.toLocaleDateString(), '(6 months ago)');
  console.log('');
  console.log('📅 Follow-ups Created:');
  console.log('   ✓ 30-Day Review - Done (' + date30Past.toISOString().slice(0, 10) + ')');
  console.log('   ✓ 180-Day Checkup - DUE TODAY! (' + todayStr + ')');
  console.log('');
  console.log('🔍 How to Test:');
  console.log('   1. Go to Dashboard');
  console.log('   2. Check "Follow-ups Today" section');
  console.log('   3. You should see "Test Customer 180 Days"');
  console.log('   4. This tests the 6-month checkup reminder');
  console.log('   5. Click WhatsApp button to send reminder');
  console.log('');
  console.log('═══════════════════════════════════════════════════');

  process.exit(0);
}

// Run the script
addTestCustomer180().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
