/**
 * Script to delete all data for a specific tenant including Supabase auth users
 * 
 * Usage:
 *   npx ts-node scripts/delete-tenant-data.ts
 * 
 * WARNING: This will permanently delete ALL data for the specified tenant!
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables manually
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

const TENANT_ID = '32a6ac93-7f44-4ac5-92e8-8403dd2e52e5';

async function deleteTenantData() {
  try {
    // First, verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, email, subdomain')
      .eq('id', TENANT_ID)
      .single();

    if (tenantError || !tenant) {
      console.error(`❌ Tenant with ID ${TENANT_ID} not found.`);
      rl.close();
      return;
    }

    console.log('⚠️  WARNING: This will permanently delete ALL data for tenant:');
    console.log(`   - Tenant ID: ${tenant.id}`);
    console.log(`   - Name: ${tenant.name || 'N/A'}`);
    console.log(`   - Email: ${tenant.email || 'N/A'}`);
    console.log(`   - Subdomain: ${tenant.subdomain || 'N/A'}`);
    console.log('');
    console.log('This includes:');
    console.log('   - All users and their Supabase auth accounts');
    console.log('   - All branches, counters, tables');
    console.log('   - All categories, food items, ingredients');
    console.log('   - All orders, payments, customers');
    console.log('   - All inventory, recipes, stock transactions');
    console.log('   - All taxes, add-ons, coupons');
    console.log('   - All other tenant-related data');
    console.log('');

    const confirmation = await question('Type "DELETE TENANT" to confirm: ');
    
    if (confirmation !== 'DELETE TENANT') {
      console.log('❌ Deletion cancelled.');
      rl.close();
      return;
    }

    console.log('\n🔄 Starting deletion process...\n');

    // Step 1: Get all users for this tenant
    console.log('1. Fetching users for tenant...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, supabase_auth_id')
      .eq('tenant_id', TENANT_ID);

    if (usersError) {
      console.error('   ❌ Error fetching users:', usersError.message);
    } else {
      console.log(`   ✅ Found ${users?.length || 0} users`);
    }

    // Step 2: Delete Supabase auth users
    if (users && users.length > 0) {
      console.log('\n2. Deleting Supabase auth users...');
      let deletedAuthUsers = 0;
      let failedAuthUsers = 0;

      for (const user of users) {
        if (user.supabase_auth_id) {
          try {
            const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
              user.supabase_auth_id
            );
            if (authDeleteError) {
              console.error(`   ⚠️  Failed to delete auth user for ${user.email}:`, authDeleteError.message);
              failedAuthUsers++;
            } else {
              deletedAuthUsers++;
            }
          } catch (error) {
            console.error(`   ⚠️  Error deleting auth user for ${user.email}:`, error);
            failedAuthUsers++;
          }
        }
      }

      console.log(`   ✅ Deleted ${deletedAuthUsers} auth users`);
      if (failedAuthUsers > 0) {
        console.log(`   ⚠️  Failed to delete ${failedAuthUsers} auth users`);
      }
    } else {
      console.log('\n2. No users found, skipping auth user deletion');
    }

    // Step 3: Delete order-related data first (to avoid foreign key issues)
    console.log('\n3. Deleting order-related data...');
    
    // Get all orders for this tenant
    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      console.log(`   ℹ️  Found ${orders.length} orders to delete`);

      // Get all order items for these orders (batch if needed)
      console.log('   - Fetching order items...');
      let allOrderItems: any[] = [];
      const BATCH_SIZE = 1000; // Process orders in batches
      
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('id')
          .in('order_id', batch);
        
        if (orderItems) {
          allOrderItems = allOrderItems.concat(orderItems);
        }
      }

      if (allOrderItems.length > 0) {
        const orderItemIds = allOrderItems.map(oi => oi.id);
        console.log(`   ℹ️  Found ${allOrderItems.length} order items`);

        // Delete order item add-ons in bulk (batch if needed)
        console.log('   - Deleting order item add-ons...');
        for (let i = 0; i < orderItemIds.length; i += BATCH_SIZE) {
          const batch = orderItemIds.slice(i, i + BATCH_SIZE);
          const { error: addOnsError } = await supabase
            .from('order_item_add_ons')
            .delete()
            .in('order_item_id', batch);
          
          if (addOnsError) {
            console.error(`   ⚠️  Error deleting order item add-ons (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, addOnsError.message);
          }
        }
        console.log(`   ✅ Deleted order item add-ons`);
      } else {
        console.log('   ℹ️  No order items found');
      }

      // Delete order items (batch if needed)
      console.log('   - Deleting order items...');
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { error: orderItemsError } = await supabase
          .from('order_items')
          .delete()
          .in('order_id', batch);
        
        if (orderItemsError) {
          console.error(`   ⚠️  Error deleting order items (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, orderItemsError.message);
        }
      }
      console.log(`   ✅ Deleted order items`);

      // Delete payments (batch if needed)
      console.log('   - Deleting payments...');
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { error: paymentsError } = await supabase
          .from('payments')
          .delete()
          .in('order_id', batch);
        
        if (paymentsError) {
          console.error(`   ⚠️  Error deleting payments (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, paymentsError.message);
        }
      }
      console.log(`   ✅ Deleted payments`);

      // Delete coupon usages (batch if needed)
      console.log('   - Deleting coupon usages...');
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { error: couponUsagesError } = await supabase
          .from('coupon_usages')
          .delete()
          .in('order_id', batch);
        
        if (couponUsagesError) {
          console.error(`   ⚠️  Error deleting coupon usages (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, couponUsagesError.message);
        }
      }
      console.log(`   ✅ Deleted coupon usages`);

      // Delete deliveries (batch if needed)
      console.log('   - Deleting deliveries...');
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { error: deliveriesError } = await supabase
          .from('deliveries')
          .delete()
          .in('order_id', batch);
        
        if (deliveriesError) {
          console.error(`   ⚠️  Error deleting deliveries (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, deliveriesError.message);
        }
      }
      console.log(`   ✅ Deleted deliveries`);

      // Delete orders (batch if needed)
      console.log('   - Deleting orders...');
      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batch = orderIds.slice(i, i + BATCH_SIZE);
        const { error: ordersError } = await supabase
          .from('orders')
          .delete()
          .in('id', batch);
        
        if (ordersError) {
          console.error(`   ⚠️  Error deleting orders (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, ordersError.message);
        }
      }
      console.log(`   ✅ Deleted ${orders.length} orders and related data`);
    } else {
      console.log('   ℹ️  No orders found');
    }

    // Step 4: Delete reservations
    console.log('\n4. Deleting reservations...');
    const { data: reservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (reservations && reservations.length > 0) {
      await supabase
        .from('reservations')
        .delete()
        .eq('tenant_id', TENANT_ID);
      console.log(`   ✅ Deleted ${reservations.length} reservations`);
    } else {
      console.log('   ℹ️  No reservations found');
    }

    // Step 5: Delete recipes (before food items)
    console.log('\n5. Deleting recipes...');
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (foodItems && foodItems.length > 0) {
      const foodItemIds = foodItems.map(f => f.id);
      await supabase
        .from('recipes')
        .delete()
        .in('food_item_id', foodItemIds);
      console.log(`   ✅ Deleted recipes for ${foodItems.length} food items`);
    }

    // Step 6: Delete stock transactions
    console.log('\n6. Deleting stock transactions...');
    const { data: stockTrans } = await supabase
      .from('stock_transactions')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (stockTrans && stockTrans.length > 0) {
      await supabase
        .from('stock_transactions')
        .delete()
        .eq('tenant_id', TENANT_ID);
      console.log(`   ✅ Deleted ${stockTrans.length} stock transactions`);
    }

    // Step 7: Delete food item labels and add-on groups
    console.log('\n7. Deleting food item labels and add-on groups...');
    if (foodItems && foodItems.length > 0) {
      const foodItemIds = foodItems.map(f => f.id);
      await supabase
        .from('food_item_labels')
        .delete()
        .in('food_item_id', foodItemIds);
      
      await supabase
        .from('food_item_add_on_groups')
        .delete()
        .in('food_item_id', foodItemIds);
      
      await supabase
        .from('food_item_discounts')
        .delete()
        .in('food_item_id', foodItemIds);
    }

    // Step 8: Delete add-ons (after unlinking from food items)
    console.log('\n8. Deleting add-ons...');
    const { data: addOnGroups } = await supabase
      .from('add_on_groups')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (addOnGroups && addOnGroups.length > 0) {
      const groupIds = addOnGroups.map(g => g.id);
      await supabase
        .from('add_ons')
        .delete()
        .in('add_on_group_id', groupIds);
      
      await supabase
        .from('add_on_groups')
        .delete()
        .eq('tenant_id', TENANT_ID);
      console.log(`   ✅ Deleted ${addOnGroups.length} add-on groups`);
    }

    // Step 9: Delete customer addresses
    console.log('\n9. Deleting customer addresses...');
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (customers && customers.length > 0) {
      const customerIds = customers.map(c => c.id);
      await supabase
        .from('customer_addresses')
        .delete()
        .in('customer_id', customerIds);
      console.log(`   ✅ Deleted addresses for ${customers.length} customers`);
    }

    // Step 10: Delete tax applications
    console.log('\n10. Deleting tax applications...');
    const { data: taxes } = await supabase
      .from('taxes')
      .select('id')
      .eq('tenant_id', TENANT_ID);

    if (taxes && taxes.length > 0) {
      const taxIds = taxes.map(t => t.id);
      await supabase
        .from('tax_applications')
        .delete()
        .in('tax_id', taxIds);
    }

    // Step 11: Delete the tenant (this will cascade delete most remaining data)
    console.log('\n11. Deleting tenant (this will cascade delete remaining data)...');
    const { error: deleteTenantError } = await supabase
      .from('tenants')
      .delete()
      .eq('id', TENANT_ID);

    if (deleteTenantError) {
      console.error('   ❌ Error deleting tenant:', deleteTenantError.message);
      throw deleteTenantError;
    }

    console.log('   ✅ Tenant deleted successfully');

    console.log('\n✅ Deletion process completed!');
    console.log(`   All data for tenant ${TENANT_ID} has been removed from the database.`);
    console.log(`   All associated Supabase auth users have been deleted.`);

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
deleteTenantData()
  .then(() => {
    console.log('\n✨ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

