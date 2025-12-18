/**
 * Script to create default coupon "5" for a specific tenant
 * 
 * Usage:
 *   npx ts-node scripts/create-default-coupon.ts
 * 
 * This will create a default coupon code "5" with value 5 IQD for all tenants
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
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

async function createDefaultCoupons() {
  try {
    console.log('🔄 Creating default coupons for all tenants...\n');

    // Get all active tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name, email')
      .is('deleted_at', null);

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`);
    }

    if (!tenants || tenants.length === 0) {
      console.log('⚠️  No tenants found.');
      return;
    }

    console.log(`Found ${tenants.length} tenant(s).\n`);

    let created = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      // Check if coupon already exists
      const { data: existing } = await supabase
        .from('coupons')
        .select('id, code')
        .eq('tenant_id', tenant.id)
        .eq('code', '5')
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        console.log(`⏭️  Tenant "${tenant.name || tenant.email}" - Coupon "5" already exists`);
        skipped++;
        continue;
      }

      // Create default coupon
      const { error: insertError } = await supabase
        .from('coupons')
        .insert({
          tenant_id: tenant.id,
          code: '5',
          discount_type: 'fixed',
          discount_value: 5.00,
          min_order_amount: 5.00,
          is_active: true,
          valid_from: new Date().toISOString(),
        });

      if (insertError) {
        console.error(`❌ Failed to create coupon for tenant "${tenant.name || tenant.email}":`, insertError.message);
        continue;
      }

      console.log(`✅ Created coupon "5" for tenant "${tenant.name || tenant.email}"`);
      created++;
    }

    console.log(`\n✨ Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${tenants.length}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
createDefaultCoupons()
  .then(() => {
    console.log('\n✨ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

