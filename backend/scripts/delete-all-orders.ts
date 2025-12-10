/**
 * Script to delete all orders from the database
 * 
 * Usage:
 *   npx ts-node scripts/delete-all-orders.ts
 * 
 * WARNING: This will permanently delete ALL orders and related data!
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables manually (dotenv may not be installed)
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function deleteAllOrders() {
  try {
    console.log('⚠️  WARNING: This will delete ALL orders and related data!');
    console.log('   - All orders');
    console.log('   - All order items');
    console.log('   - All order item add-ons');
    console.log('   - All coupon usages');
    console.log('   - All payments');
    console.log('');

    const confirmation = await question('Type "DELETE ALL" to confirm: ');
    
    if (confirmation !== 'DELETE ALL') {
      console.log('❌ Deletion cancelled.');
      rl.close();
      return;
    }

    console.log('\n🔄 Starting deletion process...\n');

    // Step 1: Delete order item add-ons
    console.log('1. Deleting order item add-ons...');
    const { error: addOnsError } = await supabase
      .from('order_item_add_ons')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using a condition that's always true)
    
    if (addOnsError) {
      console.error('   ❌ Error:', addOnsError.message);
    } else {
      console.log('   ✅ Order item add-ons deleted');
    }

    // Step 2: Delete order items
    console.log('2. Deleting order items...');
    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (itemsError) {
      console.error('   ❌ Error:', itemsError.message);
    } else {
      console.log('   ✅ Order items deleted');
    }

    // Step 3: Delete coupon usages
    console.log('3. Deleting coupon usages...');
    const { error: couponUsagesError } = await supabase
      .from('coupon_usages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (couponUsagesError) {
      console.error('   ❌ Error:', couponUsagesError.message);
    } else {
      console.log('   ✅ Coupon usages deleted');
    }

    // Step 4: Delete payments (if table exists)
    console.log('4. Deleting payments...');
    const { error: paymentsError } = await supabase
      .from('payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (paymentsError) {
      // Table might not exist, that's okay
      if (paymentsError.code !== 'PGRST116') {
        console.error('   ⚠️  Warning:', paymentsError.message);
      } else {
        console.log('   ℹ️  Payments table does not exist, skipping');
      }
    } else {
      console.log('   ✅ Payments deleted');
    }

    // Step 5: Update tables status to available
    console.log('5. Updating table statuses to available...');
    const { error: tablesError } = await supabase
      .from('tables')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('status', 'occupied');
    
    if (tablesError) {
      console.error('   ⚠️  Warning:', tablesError.message);
    } else {
      console.log('   ✅ Table statuses updated');
    }

    // Step 6: Delete orders (this should cascade delete related data if foreign keys are set up)
    console.log('6. Deleting orders...');
    const { data: ordersBeforeDelete } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: false });
    
    const ordersCount = ordersBeforeDelete?.length || 0;
    
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (ordersError) {
      console.error('   ❌ Error:', ordersError.message);
    } else {
      console.log(`   ✅ Orders deleted (count: ${ordersCount})`);
    }

    console.log('\n✅ Deletion process completed!');
    console.log('   All orders and related data have been removed from the database.');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    rl.close();
  }
}

// Run the script
deleteAllOrders()
  .then(() => {
    console.log('\n✨ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

