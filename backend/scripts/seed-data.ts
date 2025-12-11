/**
 * Script to seed the database with comprehensive sample data
 * 
 * Usage:
 *   npx ts-node scripts/seed-data.ts
 * 
 * This will create:
 *   - Taxes (VAT, Service Charge, etc.)
 *   - Categories with images (Food, Beverages, Desserts)
 *   - Food Items with images, variations, labels
 *   - Ingredients and inventory
 *   - Recipes linking food items to ingredients
 *   - Stock transactions
 *   - Add-ons and add-on groups
 *   - Customers with addresses
 *   - Tables
 *   - Employees with auth accounts
 *   - Orders with order items and payments (50+ orders for vibrant dashboard)
 */

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

interface SeedData {
  tenantId: string;
  branchId: string;
  counterId: string;
  cashierId: string;
  taxIds: string[];
  categoryIds: string[];
  foodItemIds: string[];
  foodItemMap: Map<string, string>;
  customerIds: string[];
  ingredientIds: string[];
  ingredientMap: Map<string, string>;
}

interface Credentials {
  role: string;
  name: string;
  email: string;
  password: string;
}

async function createNewTenant(): Promise<{ tenantId: string; ownerCredentials: Credentials }> {
  // Generate unique subdomain based on timestamp
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const subdomain = `seed-${timestamp}-${randomSuffix}`;
  
  // Simple memorizable credentials
  const ownerEmail = 'owner@restaurant.com';
  const ownerPassword = 'owner123';

  // Create tenant owner auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });

  if (authError) {
    throw new Error(`Failed to create tenant owner auth user: ${authError.message}`);
  }

  // Create a new tenant for seed data
  const { data: newTenant, error: createError } = await supabase
    .from('tenants')
    .insert({
      name_en: 'Seed Data Restaurant',
      name_ar: 'مطعم بيانات تجريبية',
      subdomain: subdomain,
      email: ownerEmail,
      default_currency: 'IQD',
      is_active: true,
    })
    .select('id')
    .single();

  if (createError) {
    // Clean up auth user if tenant creation fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`Failed to create tenant: ${createError.message}`);
  }

  // Create tenant owner user record
  const { error: userError } = await supabase
    .from('users')
    .insert({
      tenant_id: newTenant.id,
      supabase_auth_id: authData.user.id,
      email: ownerEmail,
      name_en: 'Restaurant Owner',
      name_ar: 'مالك المطعم',
      role: 'tenant_owner',
      is_active: true,
    });

  if (userError) {
    console.error(`⚠️  Warning: Failed to create tenant owner user record: ${userError.message}`);
  }

  console.log(`✅ Created new tenant: ${newTenant.id} (${subdomain})`);
  
  return {
    tenantId: newTenant.id,
    ownerCredentials: {
      role: 'Tenant Owner',
      name: 'Restaurant Owner',
      email: ownerEmail,
      password: ownerPassword,
    },
  };
}

async function getOrCreateBranch(tenantId: string): Promise<string> {
  const { data: branches, error } = await supabase
    .from('branches')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch branch: ${error.message}`);
  }

  if (branches) {
    console.log(`✅ Using existing branch: ${branches.id}`);
    return branches.id;
  }

  const { data: newBranch, error: createError } = await supabase
    .from('branches')
    .insert({
      tenant_id: tenantId,
      name_en: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      code: 'MAIN-001',
      address_en: '123 Main Street, Baghdad',
      address_ar: 'شارع الرئيسي 123، بغداد',
      city: 'Baghdad',
      country: 'Iraq',
      is_active: true,
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Failed to create branch: ${createError.message}`);
  }

  console.log(`✅ Created new branch: ${newBranch.id}`);
  return newBranch.id;
}

async function getOrCreateCounter(branchId: string): Promise<string> {
  const { data: counters, error } = await supabase
    .from('counters')
    .select('id')
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch counter: ${error.message}`);
  }

  if (counters) {
    console.log(`✅ Using existing counter: ${counters.id}`);
    return counters.id;
  }

  const { data: newCounter, error: createError } = await supabase
    .from('counters')
    .insert({
      branch_id: branchId,
      name: 'Counter 1',
      code: 'CNT-001',
      is_active: true,
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Failed to create counter: ${createError.message}`);
  }

  console.log(`✅ Created new counter: ${newCounter.id}`);
  return newCounter.id;
}

async function createEmployeeWithAuth(
  tenantId: string,
  branchId: string,
  role: string,
  nameEn: string,
  nameAr: string,
  email: string,
  password: string,
  employeeId: string
): Promise<{ userId: string; credentials: Credentials }> {
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
  });

  if (authError) {
    throw new Error(`Failed to create auth user for ${role}: ${authError.message}`);
  }

  // Create employee record
  const { data: employee, error: createError } = await supabase
    .from('users')
    .insert({
      tenant_id: tenantId,
      supabase_auth_id: authData.user.id,
      email: email,
      name_en: nameEn,
      name_ar: nameAr,
      role: role,
      employee_id: employeeId,
      is_active: true,
    })
    .select('id')
    .single();

  if (createError) {
    // Clean up auth user if employee creation fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`Failed to create employee: ${createError.message}`);
  }

  // Assign employee to branch
  await supabase.from('user_branches').insert({
    user_id: employee.id,
    branch_id: branchId,
  });

  console.log(`   ✅ Created ${role}: ${nameEn} (${email})`);

  return {
    userId: employee.id,
    credentials: {
      role: role.charAt(0).toUpperCase() + role.slice(1),
      name: nameEn,
      email: email,
      password: password,
    },
  };
}

async function createEmployees(tenantId: string, branchId: string): Promise<{ cashierId: string; allCredentials: Credentials[] }> {
  console.log('\n👤 Creating employees with auth accounts...');

  const credentials: Credentials[] = [];

  // Create Cashier
  const cashier = await createEmployeeWithAuth(
    tenantId,
    branchId,
    'cashier',
    'John Cashier',
    'جون كاشير',
    'cashier@restaurant.com',
    'cashier123',
    'EMP-001'
  );
  credentials.push(cashier.credentials);

  // Create Manager
  const manager = await createEmployeeWithAuth(
    tenantId,
    branchId,
    'manager',
    'Sarah Manager',
    'سارة مدير',
    'manager@restaurant.com',
    'manager123',
    'EMP-002'
  );
  credentials.push(manager.credentials);

  // Create Waiter
  const waiter = await createEmployeeWithAuth(
    tenantId,
    branchId,
    'waiter',
    'Ahmed Waiter',
    'أحمد نادل',
    'waiter@restaurant.com',
    'waiter123',
    'EMP-003'
  );
  credentials.push(waiter.credentials);

  // Create Kitchen Staff
  const kitchenStaff = await createEmployeeWithAuth(
    tenantId,
    branchId,
    'kitchen_staff',
    'Mohammed Chef',
    'محمد شيف',
    'chef@restaurant.com',
    'chef123',
    'EMP-004'
  );
  credentials.push(kitchenStaff.credentials);

  // Create Delivery Staff
  const deliveryStaff = await createEmployeeWithAuth(
    tenantId,
    branchId,
    'delivery',
    'Ali Delivery',
    'علي توصيل',
    'delivery@restaurant.com',
    'delivery123',
    'EMP-005'
  );
  credentials.push(deliveryStaff.credentials);

  return {
    cashierId: cashier.userId,
    allCredentials: credentials,
  };
}

async function seedTables(branchId: string): Promise<void> {
  console.log('\n🪑 Seeding tables...');

  for (let i = 1; i <= 15; i++) {
    const { error } = await supabase.from('tables').insert({
      branch_id: branchId,
      table_number: i.toString(),
      seating_capacity: i <= 5 ? 2 : i <= 10 ? 4 : 6,
      table_type: i <= 2 ? 'vip' : 'regular',
      status: 'available',
    });

    if (error && !error.message.includes('duplicate')) {
      console.error(`   ❌ Failed to create table ${i}:`, error.message);
    }
  }

  console.log(`   ✅ Created 15 tables`);
}

async function seedTaxes(tenantId: string): Promise<string[]> {
  console.log('\n📊 Seeding taxes...');

  const taxes = [
    {
      tenant_id: tenantId,
      name: 'VAT',
      tax_code: 'VAT-001',
      rate: 5.0,
      is_active: true,
      applies_to: 'order',
      applies_to_delivery: true,
      applies_to_service_charge: false,
    },
    {
      tenant_id: tenantId,
      name: 'Service Charge',
      tax_code: 'SRV-001',
      rate: 10.0,
      is_active: true,
      applies_to: 'order',
      applies_to_delivery: false,
      applies_to_service_charge: true,
    },
    {
      tenant_id: tenantId,
      name: 'City Tax',
      tax_code: 'CITY-001',
      rate: 2.0,
      is_active: true,
      applies_to: 'order',
      applies_to_delivery: false,
      applies_to_service_charge: false,
    },
  ];

  const taxIds: string[] = [];

  for (const tax of taxes) {
    const { data: existing } = await supabase
      .from('taxes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tax_code', tax.tax_code)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      console.log(`   ⏭️  Tax "${tax.name}" already exists`);
      taxIds.push(existing.id);
      continue;
    }

    const { data: newTax, error } = await supabase
      .from('taxes')
      .insert(tax)
      .select('id')
      .single();

    if (error) {
      console.error(`   ❌ Failed to create tax "${tax.name}":`, error.message);
      continue;
    }

    console.log(`   ✅ Created tax: ${tax.name} (${tax.rate}%)`);
    taxIds.push(newTax.id);
  }

  return taxIds;
}

async function seedCategories(tenantId: string): Promise<string[]> {
  console.log('\n📁 Seeding categories...');

  const categories = [
    {
      tenant_id: tenantId,
      name_en: 'Appetizers & Starters',
      name_ar: 'المقبلات والمشهيات',
      description_en: 'Delicious starters to begin your meal',
      description_ar: 'مشهيات لذيذة لبدء وجبتك',
      image_url: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
      category_type: 'food',
      display_order: 1,
      is_active: true,
    },
    {
      tenant_id: tenantId,
      name_en: 'Main Courses',
      name_ar: 'الأطباق الرئيسية',
      description_en: 'Hearty main dishes and grilled specialties',
      description_ar: 'أطباق رئيسية شهية ومشويات',
      image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
      category_type: 'food',
      display_order: 2,
      is_active: true,
    },
    {
      tenant_id: tenantId,
      name_en: 'Traditional Iraqi Dishes',
      name_ar: 'الأطباق العراقية التقليدية',
      description_en: 'Authentic Iraqi cuisine and specialties',
      description_ar: 'أطباق عراقية أصيلة ومميزة',
      image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
      category_type: 'food',
      display_order: 3,
      is_active: true,
    },
    {
      tenant_id: tenantId,
      name_en: 'Beverages',
      name_ar: 'المشروبات',
      description_en: 'Fresh juices, teas, and soft drinks',
      description_ar: 'عصائر طازجة وشاي ومشروبات غازية',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800',
      category_type: 'beverage',
      display_order: 4,
      is_active: true,
    },
    {
      tenant_id: tenantId,
      name_en: 'Desserts & Sweets',
      name_ar: 'الحلويات والحلى',
      description_en: 'Traditional sweets and modern desserts',
      description_ar: 'حلويات تقليدية وحلى حديثة',
      image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800',
      category_type: 'dessert',
      display_order: 5,
      is_active: true,
    },
    {
      tenant_id: tenantId,
      name_en: 'Breakfast Specials',
      name_ar: 'وجبات الإفطار',
      description_en: 'Traditional breakfast items',
      description_ar: 'أطباق إفطار تقليدية',
      image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
      category_type: 'food',
      display_order: 6,
      is_active: true,
    },
  ];

  const categoryIds: string[] = [];

  for (const category of categories) {
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name_en', category.name_en)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      console.log(`   ⏭️  Category "${category.name_en}" already exists`);
      categoryIds.push(existing.id);
      continue;
    }

    const { data: newCategory, error } = await supabase
      .from('categories')
      .insert(category)
      .select('id')
      .single();

    if (error) {
      console.error(`   ❌ Failed to create category "${category.name_en}":`, error.message);
      continue;
    }

    console.log(`   ✅ Created category: ${category.name_en}`);
    categoryIds.push(newCategory.id);
  }

  return categoryIds;
}

async function seedFoodItems(tenantId: string, categoryIds: string[]): Promise<{ foodItemIds: string[]; foodItemMap: Map<string, string> }> {
  console.log('\n🍽️  Seeding food items...');

  const foodItems = [
    // Appetizers (categoryIds[0])
    {
      tenant_id: tenantId,
      category_id: categoryIds[0],
      name_en: 'Hummus',
      name_ar: 'حمص',
      description_en: 'Creamy chickpea dip with tahini, olive oil, and fresh herbs',
      description_ar: 'غمسة الحمص الكريمية مع الطحينة وزيت الزيتون والأعشاب الطازجة',
      image_url: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800',
      base_price: 5000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 1,
      is_active: true,
      labels: ['vegetarian', 'popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[0],
      name_en: 'Fattoush Salad',
      name_ar: 'سلطة فتوش',
      description_en: 'Fresh mixed salad with crispy bread, vegetables, and tangy dressing',
      description_ar: 'سلطة مختلطة طازجة مع خبز مقرمش وخضار وصلصة لاذعة',
      image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
      base_price: 6000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 2,
      is_active: true,
      labels: ['vegetarian', 'healthy'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[0],
      name_en: 'Mutabal',
      name_ar: 'متبل',
      description_en: 'Smoky eggplant dip with tahini and garlic',
      description_ar: 'غمسة الباذنجان المدخن مع الطحينة والثوم',
      image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800',
      base_price: 5500,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 3,
      is_active: true,
      labels: ['vegetarian'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[0],
      name_en: 'Kibbeh',
      name_ar: 'كبة',
      description_en: 'Crispy bulgur shells filled with spiced meat',
      description_ar: 'قشور البرغل المقرمشة محشوة باللحم المتبل',
      image_url: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=800',
      base_price: 8000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 4,
      is_active: true,
      labels: ['popular', 'halal'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[0],
      name_en: 'Sambousek',
      name_ar: 'سمبوسك',
      description_en: 'Crispy pastries filled with cheese or meat',
      description_ar: 'معجنات مقرمشة محشوة بالجبن أو اللحم',
      image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
      base_price: 7000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 5,
      is_active: true,
      labels: ['popular'],
    },
    // Main Courses (categoryIds[1])
    {
      tenant_id: tenantId,
      category_id: categoryIds[1],
      name_en: 'Grilled Chicken',
      name_ar: 'دجاج مشوي',
      description_en: 'Tender marinated grilled chicken with rice and salad',
      description_ar: 'دجاج مشوي طري متبل مع أرز وسلطة',
      image_url: 'data:image/jpeg;base64,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',
      base_price: 15000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 1,
      is_active: true,
      labels: ['popular', 'halal'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[1],
      name_en: 'Grilled Lamb Chops',
      name_ar: 'قطع لحم ضأن مشوية',
      description_en: 'Succulent lamb chops marinated in Middle Eastern spices',
      description_ar: 'قطع لحم ضأن طرية متبلة بالبهارات الشرق أوسطية',
      image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxMSEhUTExMVFhUXFxcaGBcYFxcWFxUXFRcXFhYXFhcYHSggGBolHRcVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lICUtLS0tLS0tLy0vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAMIBAwMBIgACEQEDEQH/xAAcAAACAgMBAQAAAAAAAAAAAAAFBgMEAAIHAQj/xAA9EAABAwIFAQYEBAQFBAMAAAABAgMRACEEBRIxQVEGEyJhcYEykaGxQsHR8BQjUmIVM4Lh8QdDcrIWNFP/xAAZAQADAQEBAAAAAAAAAAAAAAAAAQIDBAX/xAAmEQACAgICAgICAgMAAAAAAAAAAQIRAyESMUFRBBMyYSKRQnGB/9oADAMBAAIRAxEAPwDquKwzrR1Nm3I4ouyoqQCoQSLjpWzuxqvgH1LB1JiDA86YEjogVpqtXqnBBna9Vyu1Aic1vE1WU5FSJXagAPnuGtIpZeprzFRUDSjjUqSaiRLRXcNVnDWrr/lVN3FCsWTROo1qFVSOLnrVDHZkptQkEA0h0M+GdApsyDHJFqTcCwFJCtUzRVkLHwiKuMqLjBjFjO1rKXgzqGogmPShOU5mV4p1a1eBMBAm0RJPz+1IfanCrbUXVySdiNx70yZLhQcOCZkim5tspR3sZsf2oaQoCbnpQftJnzxbJYMHrSO8mX4k2VT/AIbCgtgRuKhTlI2njUUL/Zzt24hJTifiB3pxw3aArAUkSDQI9lmVJUCJ1T9aKZXlwZQEC4HWmud9mS0FW8561XX2gSlwCd6xTIjakrOMhf7wvIkxsKcnJLQOjpqcfNbDGilPs9inHGwVApUNwbGijjqkgyKtTtWFFvFdoWWworVZJgkAm+0WHpV5nGoWAoGQRINcaz/MHWz3bKlALUqRO+pUxeujZHhFNMNoUSVBNz5m9TDI5OjXJiUYpjIHxWd5QmDW6VEc1pZjQYTWVQbxBq/hxqE0xHlRuVaLQqm44KAISisqTVWUDCdROngc/bmpapYrFBCVuE2SLe3+9NCBuPxMud2nZMavXgVMVSQKBYHEz4juoyfeiyLqFMRaXEipHHIFQoT4q3eTSAqPqmheIw80YUioHEVLGLr2AB4qjicnTBVG1MbsCgmfvOhsluPOazZSRQ7OJZdSVAXBIPtXnaXAB5oobSJ60J7DpKlOkmJVcU7IbAECoW0NdCd2XwTmGs6ZEWmtne0C+8NwE8Cr/azFhCAIvSh3ZgKPNQ5VpHRigqtjezmLOIGhyx6Hn0o0y0lKIG0Vz5jFDmjWGzNQAAVboapT9ili9FRvAFzFq07DenzCphIFKPZtS0YhxSo0Lv6Gmlp2rhVaIy30y8kVWzTM28OnUs+nnUvegCTxS9gse1isRKrpQYAO0g71ojNIM4DGrxDeooU2jgmxIqR7OmUgo1DVFgefSp8fmaANEgJikt4hThUmFKTOnqfSm5Ja8lKF7LWL7SlggkC+9WcN2l79C9OwH1OwpZLWLklxlOnzOw/KreEdDeEUsJCSpRAHWLfespSpOzWEU5JA1gh3Fon4UqnyhNzXUmcXItBtauVZMJDqjY6Smek3NFuyOaBp4lxZIAte3/NRidF/JV/8OgYbHBRKSPEOKINiar4Jba/5iIM1cmuhHEeaakbeKdq0mspgbKWTua8CBWTWpNAGxrK1msoAt47GJSkkqAHJJi1IfaXtGHh3bfwD6x+VKeZ9oHcQZWokTYCyR6CtMKSaTY6GrLMRYU1YZe1JmXiwpuwV0immAT5rdyoxUqlACTTERLAAk0JxWKkwNq2xuIKz5VTKDWbZSQHzVnESVIWIHEb0PyfPRiVqaWIUmxHWi3aDFFlkrHH1pW7PY1BeGpuFqvqHnWL1KgvZN2ay1xOLeWqQmYA4inGawI5r2KtRoEC86ydOISQSQeD0paxPZ11pNvGB0p5ihOZZ621aZPSs5xj2zfHKfS2IaY1wUx1m0VO4xaUGfKtMxcL7hXsT0oViscrDrgmRzUI6Gg0zjlJMXFFMuzlSVgapB3Sdx6UtpzMOCw3+leKcSqJMEbHaqr0NU1tDjnGeaiEgSkG/nQHDo8aktSmZMA71XDoVzJ+/nXuCcKX990GPpb1pwty2KSio0kF15c6pI/nAnlPIH60dyzJylSXysHSkgI67XPyoZgnAg+M+LcDepsZmLJTqUVakfhSd/anCfFuyJwtBvPHO9YgJg0ldpcQWwhttQBQPYHmirD6lFTqiru0iQgiJPAE7mk3HvFzEiCoblU9CIIIiNjTyuy/jRpNhPAPJbbSlQ1K+I+qtqI5Z2fS+la9RKhNgYA8qGZVm6W1qJSkg2g9NhV5/PihpQb0jVwN4rJyaXQSi3bYd7KZ0w1KNSwQk6goyJB4O1MWC7UNOIUoBQKTBSRfyPpXEsvfcOKbMeGZhW1r11rDPNPI1Fekn8NuNxNPHObVWjkhBN76GjAY9LqQU1cBpbxOYpablBH9o5NQYHtCDddjWzyqOmV9Le4jWVVrVbBYxDolJq3WiaatGLTTpnoRXtaajXtMRw/CMkp96PZfhalwGXQkW5o3hMHFSMky7C+GmTBtQkVSwjMCiIm0VSEXmm5odmOIkwNhV3Eu6G45NBlJJokCNBW8VulqpUtUgAHaXKziGwgGBIJ8wKF5d2RUhzvW1pFoufhimHtFiiwyVgTBSD6EgW86H4bPcO2VpWCFiITySbxB+9RJRvZcIctm+LxfcDxyqLEjqapNdpmlXAsDB6pPnQrM1d6ourSoT8KSSPh6DmhWa4pptmAhSXVm8wAocpjrUbNuEUOyMzCyEpTM0qZzlh1lWhRMmQnZPpRbJcWww2FFzxuJ/lpO9hBj3qFOKWpO+kSq+oX86JR9lRddCS5jktrKCSCNiR9D50Gx7Til94JI9JApmznLFrX3oHgRF4sozsZqxkRW8VpbBIXOpNkhBHTrUcXRTkn2IbuYrQoCIvfzpgVgluthaDvB/4q72n7LI0oKQUrO4PlVPLn3WVIbcgJ/CQd43mn0VC1s1w6zq0mxFFG2AohR1Ai1hN+PT1rfHYNLg1Cyh9alyrEJ7wd7ZMEKsTFrGBf5UL2VLqyRla0kKWDEwQJuOTNaY5xCSCkIGoHQCTNjuo9PLn50exmUreKFNgqQdISUCU+KDBKZ0nrMRUGJyRlvWXtJUiDpMpm3hg76f7RFyZk3pOLIUkxWOduIsp0qvcE7zcwOBt9K2zbFNuMOYhkjv9JC0bkJ2CweTpioMdkK31a2kaUzxJHoJuaNdmsj7onUdUphQIixG1va9ZNqPR0ctUc2/jXOsVM1i19Zqz2hYQy+ptvxJsU9Ug/hPmP0qihp0pKg2opG5iwrerWjncq7YRw2Nc1AC5Owp9yHEnuXEGCsDUjzj4k1zfAZoppJT3YBP47z6UX7NZgpOIbc1SkHxSfwqsayamn1SI5N/6GtGfJcslCkq4EzVjDYfW4nvXClIuY3pWzvDqbeUlKvEFKIg3CSZHtBFXckz9bKgowqDsq9EXezSMuSOgF9Ldk6kncKIIB6UzdnswL7esxuRbyrnWL7YF91JLfhtKRx1pt7J5m2VFttJSk+ITYmd61xtKWujPLBuNvsbKyvJrK6TkFlnDwBV3DM3qwjDVaaaiKSQjRKatttyRWiU3q5hGvETwKYEOZQSB0FUg3U2IEkmvEikM8Sit9NepFbFNAhd7UsBxIRq89HKiNq5piMOouqUSPDa8z/zTRnWKcZffXfUQAnmE8lPSgjObKMuLCLWSnSI/wB65pyVno44NQVdHmCa1uIWpRKUzEk7elZmmAw6XFLfClEiUAFSQnVtvxUb6lkhap8Q3CSke3WsUtelSdJAULlYvG9pFO6QuCfQAzN5IeSElfdNxBvcncp1DbrTLiHkPJSlhYukFQO5MwDbY+VDWn2SkoWnXIJjVGkegvQzIMShrEFNwCQUqEHSJ89yKLvTI4aGXG5X3kYcuKlA1E6gEyLkedCWm3MOhLiCUrWSJ5Ug31KHTgVNnCVhRUVKlRUBqICl2mBNhxzUGYoca06wQIABNxHEKFqV1sajfkmzDNe9T/mHvJ8SY2jaTtS7m2PK3knuz4E6IHHMkVP/ABqASY+1B3sRqUdHN5NSuTZbSXY0Zdju+SUjcGDeDRvL8GdcMgKcA8RVP8sCDqJPhFjMkHjqKV+yXZ/FFQdbGhEiXXAdAk7gbuHyG/lXQHMezhyUMpnkkpSC4rgrjfew49draohXLSNXMtLPwLdViXL6krUhU23EzpEbHgXqnmuNOGQUuuIeccdTOsBRSdNzCYEBImBuQJ3ohisWphClq0qecTfgNhWyUgcbz51zzMmy7dR2Ji59/sPpUXukNQpWHm8aVOIhUJUJGk7iSDI42ojjsbEAGCbT5daR8ncIUYnTYccC5+dSdoM8IjQVa4gFOwvB1eUSKz4OUqNHNKPJjW92xabcGGUxqW2kjUEphSosTYqkfnQfHZo7KTKA2TAQYASFRrmB4jbm9VE48rQFvYdpKktOqDinClb5a0z8AkuTa9gBHFD38wwyjrb1lZSEpSQYSo/EoT5kn2rslHRyxkmHkHDPwhARq4CTvPNx9K0f7NNqhKFhJIPiIOkEdTSk0phKyTq1AKuFxDkggxyBBtzNHstzBTilLK1FKY1XSkQQQISVeL2msnpbHKS8l7tXlDnetPpuVMp1RypMpJ+gpbffUg+JJHtTwz2gQ8UNKCUBCDClKSCrkynjarD2XJWNgQed6zjxFFq20J+WZnpUCCJ4/SmtGO74pW2pTbiSPANlRyDVFfZlrWFWkcD9KzE5cseJuUqG3lFUap32P2H7VrCQFJkgXNZSG32oSBDrY1iyvWsp8n7Fwh6O3hFjWwTcDpW4EgViRua6zhNWxJ8qutWRPWqLGxvtVsLlr03pDKy01pFalyvAaALDYqRbdQoVA2k1aSq1NAc+7U4FanXFGyA3AMWmdqVEoSGpUnxCYBvJ2k10rtlhFrZIbsbH25FcozfMVIUAWjCRHT3rlnFqTO7FkTx0y05m7zaEp73adhtO9C8Xmc/EpR81GbUMGZIJuNJnkcVrjUJWJ1Das3fk2UkujZT8EKQEnUSm5BiPLpWiVJCwkAKMwn+pSvLpvQrDMEfESN7b23n5XplyDIHWC3jHVI06SpCQSVLC0kJJEQE3nfbihulsjk2+jMThz34bKkrAGk93KrblI8UFWom/X0imbBtltsgNud4FJSe8IIBWCU6m7kkATF7HbalPMs4S2vvAYWSSSCIT8hvQ/wD+SOLVrBUY2FwB5gD5+wqorWxydPQ6Z/leGdDilsOKWnUFqbSWUpg2WoC3UeK/2AzJnsvwypawq3XQRpU6oERFyG4UEkHb1pQxzmLWsgpeSTEDSuTNkiAJMyLcyKnZceb0pUtKlqkmDrUhMxqc02SLjn1q1GSWjHlFumdAfzrVKoOudQ8ZKEExcJIkn1MeVCsFi9Tsq2HiJJ3i9B1EpGhRAWUpUEyCpeuCIiYMEGDECtAytzbqQUm0aVFNybdDvsZrNqRspIL5tnfeKKp2896WscpazKQbjqbcnyq+0ygEBRAm0AAkRzfj9aIIebQqyRHBNYcmjWogXLsCpF1WAE+sja3ub3paxryg7qUFDUARMg6FJ8JA6EGaaO1eap0aEWK9/JPPzpTxWBWmCoWnTMzskED5ER6eVdWC3/JnJne0onrDayoFM2+3p+96KZflai4htUJCiLx4hAkX3Aq5lqFhKQUwIm4A3AgwBf8AfWiC2kLkE+LrMEHqKU5ysFCKQObbwrL5D6Vfy0kSEhwPLOyigkJEA7TuKo45DKld42FxKNIWddtUq1GABaLCt8XgVJ/EFgTvxPmKIZXhQvQgx4lAHgXNU56RKxJlztFgnVON92mzaEBI/DJNxPvXScFlgbbShOwA9Nrx5TSTm2avN4psoUFICx/LAnwzCkmRvz7V1lCQRMRSxxtETjxdiuvLwFatNzuajew1Gcfj2kkoklWkkJAkkATN4Ee9LORdoH1r7pxsEKWpSiYSkhVwSDtbzpZHxNIRlI3U0gnxNpJ5MVlVXMQ/J0hpSSSUmVJlJMpsQTtHN69qfsK+qR2NVvYfevNMD1/KqycchXO5HyqYvpVYKHT9a6lkg+mcJ62gBJP9RrTDOad9iYqR7y2AgetDceqIE/B/7GqYy27ExWoFe4V0OAW8VbLbIpAbNmKtYR4qJBTpva8yOtVEVIhsa0ri6Zj33pgXH8PKSDSJnuRJXNh8q6B3oIobjcESCd6GrHF0cozDsulcWAgRtQl7sYDtIrqGKYi2xO1p86E5rghpK1LUlKRJAiD5H3rGWjVOznn/AMPDRLnxFKSQFXFwQZE3ETvbk7UVwGUPvAuYsuMMwQk6dSyq1yFSEgC17zI9NT2gKsSyQkaWtQKiiVr1AybWTEm4phd7QMqEbWhSfw2TFyYUogQLnc81l/FuzoXKKpIVsfkrK1pGhBSL94pbhUubQpKiYveyh7cXcHgm2pWhtJnlA0BKREAoSAeJuozzU7uIY+FIECfEq5MybxG3nQ7McTrAgmEoVpAMBPXrY3+c0+TCgO/jVIUTFwoEKAIgC4KQVFRVMkmd9gK3azTW1KAJWSFKccUVkai4pR1KjidUbgeVZkGZuL8LqfBMhMJhGnYExJ5k+e0WrXF5Z3qQlKbJBII03PxSpQ43uekUNgvZcwbenQW1hPwqI1EBJGlIW4rV4oB2FwNvIVjMLodWlEqSqdKhKdZgqJBFhsTB49CaMZU0lQBdkEJAgARKfiuJCo6g7wai7Qvh5OmSsGPi2GkkJAvfYWtceVJFSQqY8O4chTjZgxEmVXvBjY1UzHOlOJCUjTffk025kttYW24fHpAiBAEWAUZmN5A/1G1c/cw60/EKqMU3sznJo2SmVXJPrRYIGjn/AHodhnBMDc7VIcUQVBRgD5n5USTYRaQYbzHSAJG3yqdGIQuNQSfP9aWA8VGyT5VOytQ3TbypPGx80wyXGxqhREdCYETtyRWmVY8oX3sLWlCrjVeIsSLzB+1UkOp/EN+KuZe2lPihX8zwoSgAKVpEmCdhveDtsalxMskbaaLKc4WqEnxKCpSd4Ez4f09ab+13ashhvDtqhS2wXCDBSmB4LbE/YedKGTMISVOTASSTJ+HmDW+NehxThgqXpKZgwkAQI4MAW4qlaOjGuTTfgasjxDaQokFS1JSjgmFQFIMzHhIkiNoEVK1nCCG1BKiV6hqUQVQAPgncSYkm5BgWpYbwa9ASlR8RStaAnxElUIvFxeYnp5UX7PZQ8VHUVEJhJUonSNyEDpJ4HrQ1aCT/AJOyXEMP6j/MTvHiI1SLGfD1Fe0yYfI1FMr+IkzeeTeddZU/WxfYh6/h2j+H5SPsakbwaOB9VfrV4JSOAPag/aDtBh8IkFznYCJrFpLs88zMscGhCZKiYSBNzxW7afANZmLqPn5e9c0f7QrxbodblKQrwcbfuKfspUtTSde5ufy/fnXR8dPbZVUQh5YdKwfamHAZoh4RIkGCZ2I4NLucO92nSPjWD/pT19TS3hnl4dYUiT/UOD5etbcqZVWdMNaldDsuzEOpBB/UHofOrZmrTsmi0l41dYuKBYLFFS3EqbUnQRBOywRuk0faX4bXIG3WnYqKz2XBRKpIkARwIJMx50rdvWzhWC8gkgkI0wCEyD4trmdO9NjCJT3ikqQtaRqTqkpibAjpJuKCduDpwTkSRKJHxG6xNyepHyrPJ+DNMf5o41kGbutEnRq1QSImT4gJHO4rDgcdinVr7pthrVIS5paWokkEEJmV2kzAAA60xsaEoKW0wogAnYlSjYADoDAidp9RWXtLwjmpydHeDwHUSDfUs3GkwAIPUdL80ZUdjV7NsT2YxY0anW3CdElKQkNpMaZPxK3A+EG3NVHezTmv/wC6jTBSUgE6yFAG9oJJET8704LxTYPxJlaArUDpFt/EUjUdxAtve1DjhVSpTS0ghJSIN9SoAkpEdRMH4ZuauqeibtbATfZVzUqXdaQBqb0qSJIEAKTv7D2NUscl1pwJeZ7toABKEuwWkk/FJEPOKgST1gREhhxHfJYStspU6dIIkKTM7JCYUoTeJjaqLeTvOpKn3UAJEqSYaB+IgI3hMRe0wek1Sf6JlG92DcM8FJUteMTsvQ0lMR4ToC0kK0gEgketyd6z+StrVqRjFyYKiWxptNkhJEgSYNt9hVLGYdgLKW3ZAElwmATAkDfzAneK3weJSLIjTaCblUb6vfiolJmkYx8ldnsohKoD6tRNoRCNiQCpRMyY9L1jOVrUka5MSPkYomziFETvfePtRnK2SEwqDeR1AIBg+hn2ilByn+RGSMYfiKyuz4OwivGuyt709pwgPFSIwscT0q2Zpic32ZgyPlxVbGZS82sEICm/xWuPMU2vaXHC2ndMgnUUXNilJB+K+9Cs+xZRqw7LK3BohSyhwpSYsrvB8UAD3G+9JfoTmqKr2TtJQVqgJG56Tag2bMBbjTaFJ0HT8N9KZidQtJmbc1FgsUVBSSpxTYEqCP6UeIwDaYSfzpkwvZxDrfeMrIDiUqaNwtvYkKINzIgjyottmany0Bu2mC7pA0bOKSCP/AKg/UfIVrkyUyFuCYCQJskHkm94An2FFsbgXXcP/PBS42qCSJB2GoRuCCKWkf5gNylMwPxLJ5j2+1FNqjswv0OzWKZZCFnUoXPhkKVKkgoiPCfiUCDeFAxIND8vz9RdIBLYBKvxEApiDp1bxzQzMdYiDCYMiRaLn2qPJknWbAlZjfabVKb/AKCVXSHRGNEXeAPTQKyh5ydFrTYc9ABWUvs/RNM6F2o7fssApZUlxcTa4F4vXKc1zZ7HHvHTF1QkbAJ/Pe9ddwvZHLm5Iw6VExJUVrJi/Ko5q+xkWBQIGFaSOmgc1mq7bOFNI572dy7ShtPkJ9Tc/eugYVQA8gJ+XH2FXW2MMNkIHtVhIRwE/Kt45UhuViw7hlKJcV8RNh08/YVDicCY0pF+T+X60fzfPMPhWyt1SQBxAv6CuaZ9/wBVVKlOGQB/cQP0qXmXhWCYyYXUwZTJ67+L0pry7MkqF/0I9a5N2S7ZqW5GKWVJUbKP/bP6da6A6wRBSd7yOZE+9aY8nLob2NRb5FxWza4pXw2fKaMLt0Ikg+o3FH8PmjbgkxfkbVsppioKNvzzVbPMIp7Duto061oUlOqYBIsTF7b+3FaJRNwZHlW6XCOaoRyh7ClCi22UgJVHeGZUoSDHIgg7FPFBChbWq8qJUZhO6oE/IAelO/ajCBLxVCQkwRcgz4iueADba/iVSRjsSNZB+tcE01Kj0MdNWJeZuYhDgIWv+2CfSw2G1XcP2qdCVtqQo2AFyIMQpRvckyfc+xs4QK8RIAmBbpc1V/g2/Ijj9avnWqG1vsG4fta8PiU4okiRIPhiCAoyQI0wIiZJmL5ie1DziS2UhDWnQEEzAEGdSQklUgmfvVpzBp1Egeo61SztlGgW03BnmOlUpXoiSa2UVKSQEgzJvNxzPrtW6MOFNmFFJmxNvh6eXpUDbQiEcGZ5B+dWGcAs7U6M7t7Lra3IAb0i/wCKSCPY01ZS8FW1AqG8deaAYPLHIIjjeinZvs4tuFOHUdRIFwAObUk6Wge+xiwmNSpzu0ocJkgq0kITABuo2MyNpqnnTzrOJCoV3ZZKUxMBwq5/usmmXC4cj6W2jrSxju0iVPBp2ENpcWh5s3VLStSFgi+hYif3Ll0YyBeXuEOhxICyVTKhAK1EylKd9z9KbMZiFrR3WjQ4sHWJCg2g2KpFpI2HnXLznKi6t9KABqlKUqWgNncFOk/EIvwZNhwy9nMU/h0KddZccQ8orW7q1OogaQVN76YHBnyG1TGNWiIOg1iMqaKmykae7SpECIW2sEKQvrMzPWpcny5LDSWkklKdUFW/iUVcetXcOEuALQQpJuFAyCOoNXmcNWlGmuwbisIFIKVCUkEH0pAzLLe4cKkqKhECfiA6Tsa6a+lSYCUhQnxeKClMHxAQdV4tagL+B/iEFWhSCSqAoEEpCiEqIO2oQY4mKlo0jJoR25dEXiefLg0wYNCUjTFhvqHMbiqWKyVaCSmUny5qk5jX2/i8Q9BUOLrRssifYwKzRIMCTWUBbx7JEkqSehvFeVNfoLXs7avHBNgrUrnyqtiHlbhRHUUFQtaR4hHn+dW8OtJ2Mnzrg5tnBRcRiyo3FVM7z0Ydsq8t529q1zDMA0gkqE+UVyXtbnxfXpB8A+p9eaqCcnSCiHPs5cxS9Sj4eAfvQpKa0S79KkFdajxVIZKw6UHyrqP/AE/7TBWnDOq3/wAtR4P9B8unyrmKYNT4aUqkTbas26fJdjO84thJ3i30oQ7g1oJLaik/T3GxqfsdnasYxcDvG4Ss2lXRd+sH3FFMQyLgXPPMevnXampK0AKwnaBxv/MBEfiTt8v0o9g+0YUPwq+/vyKDYzCAiPOguLy4gyLEdDf6U02iqTHXHljEoKVgifekXNOxLiSVMLCx/Sr9dxVD/H8Q2oJTDgG+rj/ULz86OZf2vQbOAtnzun5i/wAxQ6l2OLcehExxew6iHGnAnyTqTPJlP7tVFePbkiQDbcXHp0rtCcQ06mfCoHkQftVDE9nWHOE+4/So+pGqzPycgVjhwFEg+k8fKqbjDjpvMcDgV2IdjWuA39vvU7XZMJ+FA9oqlCiXks5NluXQsNnciQI3/cU2ZflA2tbfki30pxGVFH/bI84/OvQ0Bx9KKaE5IEYfKyOken+9XmMIUkREXm1z6GbVcBrdCqKJsF57m7eEa7xcm8JSN1K3jyFjJpDwyDmeIccMNJCQFQJ1SI0k2k236AV0nNMlZxSQl1GoAyLkQduKhwuQtsgJbSlKb2A560ONkeRTT2eaTpCW5KPhJgzt4o2B/SirOBX/AFGjzOC6xPMCB8qsJw8U6KsGZdg9AI0gSZMACT1Mc1deaXA0FIMidQJBTPiFtjEwetXUsV6WadCsHYrCn4kwD+K11AAwJF+eKxvLTuLggWPBE7WvwP8ASKIpZEzF4j2qZbOpJEC/USJ4kTejiOxexWXA8UDx2Rg8U/uMA1RVgoEXO+9DQ1I5o52dEnw1ldCOBFe0h2A8JmWsSdQHSJmt31o3SYPTb6VQU2sXSZHnFqXu0udBpJvKuB514qTbpGQM7ZZ5ctosefIUmA1ji1LUVG5NzW6G+tepjxrHGgN0eVWWmzWrTdXGWqicxmzSKuNorxpmiGFw5JAFcc5jGb/p2txLxt/KIhZJgdUwOSD966a42OP350l5BhktpFOGXPhSdPP3FdXxMn+DJvZA81NwPSh2YMnYC5pmRhhAmJj2E9Kr4jCTNdvEdiNiMnSCSBuZ99r+1DMVlY6fSnp7CUNxmCkG3G3Hv5UUOxBSS2olsrSBykkEmeetF2s+xSOQqBfUOekiKt/wiEmE+Nw9JUlPU+f2q4jK5sRfnf7GkUygnte8n4mUn0UR9watt9tB+JpY9FA/pXjuVAnawqJ3J9h+/KkGgrhe2TR3K0f+QkfSaM4bOG3NlIX6RNJr2UW96rv5WRFuaLYUjogeb/ordPdHyrmxwzgMal7f1H9a9w+LxDcaXFG5srxD60cw4HS+4HFeKZpUy/tLeHAUkfiF0/LimTC5klQmQR1F6pSTJcWjV3DkbVqgGiKFJVyK2DA606FZWCa2CKshoda27sdR86YiqGqkSipSUj8Q+dRl9HWjQHoTUbjNe/xaOteHGo86LQEBw9ZU38ajzrKWh7OQZlmASkq1QIrnWY40vLKuNh5Cr2f5iVq0D4Rv5mhrLJNcHx8XBc5dgatpM1dYw5qTD4eKINMU8mUKIGmBVxlipmsPVptmuOeSyiNtuiuXIvNQMs0ay/D1ldiYWwCvKjWFxWlQINxx1oaxhAY3mi2FwYT5Hk7mtI2naM2NDLoUkKFSaKFZc8EHSdj14NGbmvaxZFONgVl4cWtVbEYBKhBE+XFE3CBUIRPp8q0oYIdyZBgkRHS32qNeFjYWo09cxxVdaKVDsEfw4nao14cEn97UYbYvVfuN/epaHYMdwu1RPYPa3NFXWSCPQ1qtG3vUtDsDqwQ1C3H51VXlwjbZVMGjxD0rQt2P/lSoqxddywFR80/lVP8AgFoSCkkGeLU3Fkah6VCcONPv+dKh8hfGNxCCoWVG0i/zFSf486AJb3/u/wBqOHCDV6ioV4AED1ooVoDK7SOCf5Rt/d/tWq+0btv5W/8Acf0owvLU+K29ary0QLUUwtAN3PsQZhKRHqfzqsrN8UeQNtk9aZlZamTbcVp/ho6cfbaimFoWTmOLP4+vA/SvP43FR/mH5D34po/w9PTzrZOAT08qdBYqKxmL/wD0PyH6V5TenCJ6VlFBZ85Nbn1NXmaysrDIQggxvV5nevKyuDIMvIqUVlZXOxlrB70yZaL1lZTiTIPYcVcm1ZWVvHozIWLk0zoPhHqKysrt+F5GTOVqk/8Ar+dZWV6AyPg1quvKykB6jf2qJAtXtZSA1eFx6Go8QPh9ayspMaNFi49KgcHxetZWVDKPDuPSozsf3zWVlAG53HpWsWP75rKygD0/lWn4R61lZQBtyK0T+dZWUCNf0NeDn2rKyhjNTWVlZSA//9k=',
      base_price: 25000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 2,
      is_active: true,
      labels: ['halal', 'chefs_special'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[1],
      name_en: 'Grilled Fish',
      name_ar: 'سمك مشوي',
      description_en: 'Fresh grilled fish with lemon and herbs',
      description_ar: 'سمك طازج مشوي مع الليمون والأعشاب',
      image_url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800',
      base_price: 20000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 3,
      is_active: true,
      labels: ['healthy'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[1],
      name_en: 'Mixed Grill Platter',
      name_ar: 'مشاوي مشكلة',
      description_en: 'Assorted grilled meats: chicken, kebab, and kofta',
      description_ar: 'مشاوي متنوعة: دجاج وكباب وكفتة',
      image_url: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800',
      base_price: 30000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 4,
      is_active: true,
      labels: ['popular', 'halal'],
    },
    // Traditional Iraqi Dishes (categoryIds[2])
    {
      tenant_id: tenantId,
      category_id: categoryIds[2],
      name_en: 'Masgouf',
      name_ar: 'مسكوف',
      description_en: 'Traditional Iraqi grilled fish, slow-cooked over open fire',
      description_ar: 'سمك عراقي مشوي تقليدي مطبوخ ببطء على نار مفتوحة',
      image_url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800',
      base_price: 22000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 1,
      is_active: true,
      labels: ['popular', 'chefs_special'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[2],
      name_en: 'Kebab',
      name_ar: 'كباب',
      description_en: 'Traditional Iraqi kebab with spiced minced meat',
      description_ar: 'كباب عراقي تقليدي مع لحم مفروم متبل',
      image_url: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=800',
      base_price: 18000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 2,
      is_active: true,
      labels: ['popular', 'halal'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[2],
      name_en: 'Dolma',
      name_ar: 'دولمة',
      description_en: 'Stuffed vegetables with rice and meat in tomato sauce',
      description_ar: 'خضار محشوة بالأرز واللحم في صلصة الطماطم',
      image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800',
      base_price: 12000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 3,
      is_active: true,
      labels: ['popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[2],
      name_en: 'Biryani',
      name_ar: 'برياني',
      description_en: 'Fragrant spiced rice with tender meat',
      description_ar: 'أرز معطر بالبهارات مع لحم طري',
      image_url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
      base_price: 16000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 4,
      is_active: true,
      labels: ['popular', 'halal'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[2],
      name_en: 'Quzi',
      name_ar: 'قوزي',
      description_en: 'Slow-cooked lamb with spiced rice and nuts',
      description_ar: 'لحم ضأن مطبوخ ببطء مع أرز متبل ومكسرات',
      image_url: 'https://www.hungrypaprikas.com/wp-content/uploads/2021/04/Quzi-6.jpg',
      base_price: 35000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 5,
      is_active: true,
      labels: ['chefs_special', 'halal'],
    },
    // Beverages (categoryIds[3])
    {
      tenant_id: tenantId,
      category_id: categoryIds[3],
      name_en: 'Fresh Orange Juice',
      name_ar: 'عصير برتقال طازج',
      description_en: 'Freshly squeezed orange juice',
      description_ar: 'عصير برتقال معصور طازج',
      image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800',
      base_price: 3000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 1,
      is_active: true,
      labels: ['healthy'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[3],
      name_en: 'Fresh Lemonade',
      name_ar: 'ليمونادة طازجة',
      description_en: 'Refreshing homemade lemonade',
      description_ar: 'ليمونادة منعشة محلية الصنع',
      image_url: 'data:image/jpeg;base64,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',
      base_price: 2500,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 2,
      is_active: true,
      labels: ['healthy'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[3],
      name_en: 'Iraqi Tea',
      name_ar: 'شاي عراقي',
      description_en: 'Traditional strong Iraqi tea',
      description_ar: 'شاي عراقي قوي تقليدي',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800',
      base_price: 2000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 3,
      is_active: true,
      labels: ['popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[3],
      name_en: 'Ayran',
      name_ar: 'عيران',
      description_en: 'Refreshing yogurt drink',
      description_ar: 'مشروب لبن منعش',
      image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800',
      base_price: 2000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 4,
      is_active: true,
      labels: ['healthy'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[3],
      name_en: 'Fresh Pomegranate Juice',
      name_ar: 'عصير رمان طازج',
      description_en: 'Freshly squeezed pomegranate juice',
      description_ar: 'عصير رمان معصور طازج',
      image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800',
      base_price: 4000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 5,
      is_active: true,
      labels: ['healthy', 'popular'],
    },
    // Desserts (categoryIds[4])
    {
      tenant_id: tenantId,
      category_id: categoryIds[4],
      name_en: 'Baklava',
      name_ar: 'بقلاوة',
      description_en: 'Sweet pastry with nuts and honey syrup',
      description_ar: 'معجنات حلوة مع المكسرات وشراب العسل',
      image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800',
      base_price: 4000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 1,
      is_active: true,
      labels: ['popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[4],
      name_en: 'Kunafa',
      name_ar: 'كنافة',
      description_en: 'Sweet cheese pastry with syrup',
      description_ar: 'معجنات جبن حلوة مع شراب',
      image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800',
      base_price: 5000,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 2,
      is_active: true,
      labels: ['popular', 'chefs_special'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[4],
      name_en: 'Ice Cream',
      name_ar: 'آيس كريم',
      description_en: 'Creamy vanilla ice cream',
      description_ar: 'آيس كريم فانيليا كريمي',
      image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800',
      base_price: 2500,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 3,
      is_active: true,
      labels: ['popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[4],
      name_en: 'Umm Ali',
      name_ar: 'أم علي',
      description_en: 'Traditional Egyptian bread pudding',
      description_ar: 'بودنغ الخبز المصري التقليدي',
      image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800',
      base_price: 3500,
      stock_type: 'unlimited',
      menu_type: 'all_day',
      display_order: 4,
      is_active: true,
      labels: ['popular'],
    },
    // Breakfast (categoryIds[5])
    {
      tenant_id: tenantId,
      category_id: categoryIds[5],
      name_en: 'Ful Medames',
      name_ar: 'فول مدمس',
      description_en: 'Traditional fava beans with olive oil and lemon',
      description_ar: 'فول تقليدي مع زيت الزيتون والليمون',
      image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
      base_price: 4000,
      stock_type: 'unlimited',
      menu_type: 'breakfast',
      display_order: 1,
      is_active: true,
      labels: ['vegetarian', 'popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[5],
      name_en: 'Eggs with Pastrami',
      name_ar: 'بيض مع بسطرمة',
      description_en: 'Scrambled eggs with spiced pastrami',
      description_ar: 'بيض مخفوق مع بسطرمة متبلة',
      image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
      base_price: 6000,
      stock_type: 'unlimited',
      menu_type: 'breakfast',
      display_order: 2,
      is_active: true,
      labels: ['popular'],
    },
    {
      tenant_id: tenantId,
      category_id: categoryIds[5],
      name_en: 'Labneh with Olive Oil',
      name_ar: 'لبنة بزيت الزيتون',
      description_en: 'Creamy strained yogurt with olive oil',
      description_ar: 'لبن كريمي مصفى مع زيت الزيتون',
      image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
      base_price: 3500,
      stock_type: 'unlimited',
      menu_type: 'breakfast',
      display_order: 3,
      is_active: true,
      labels: ['vegetarian', 'healthy'],
    },
  ];

  const foodItemIds: string[] = [];
  const foodItemMap = new Map<string, string>(); // name_en -> id

  for (const item of foodItems) {
    const { data: existing } = await supabase
      .from('food_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name_en', item.name_en)
      .is('deleted_at', null)
      .maybeSingle();

    let itemId: string;
    const labels = item.labels || [];

    if (existing) {
      console.log(`   ⏭️  Food item "${item.name_en}" already exists`);
      itemId = existing.id;
    } else {
      // Remove labels from item before inserting
      const { labels: _, ...itemData } = item;
    const { data: newItem, error } = await supabase
      .from('food_items')
        .insert(itemData)
      .select('id')
      .single();

    if (error) {
      console.error(`   ❌ Failed to create food item "${item.name_en}":`, error.message);
      continue;
    }

      itemId = newItem.id;
    console.log(`   ✅ Created food item: ${item.name_en} (${item.base_price} IQD)`);
    }

    foodItemIds.push(itemId);
    foodItemMap.set(item.name_en, itemId);

    // Add labels
    for (const label of labels) {
      await supabase.from('food_item_labels').upsert({
        food_item_id: itemId,
        label: label,
      }, { onConflict: 'food_item_id,label' });
    }
  }

  return { foodItemIds, foodItemMap };
}

async function seedCustomers(tenantId: string): Promise<string[]> {
  console.log('\n👥 Seeding customers...');

  const customers = [
    {
      tenant_id: tenantId,
      name_en: 'Ahmed Ali',
      name_ar: 'أحمد علي',
      phone: '+9647501234567',
      email: 'ahmed.ali@example.com',
      preferred_language: 'ar',
      total_orders: 15,
      total_spent: 250000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Sarah Johnson',
      name_ar: 'سارة جونسون',
      phone: '+9647501234568',
      email: 'sarah.johnson@example.com',
      preferred_language: 'en',
      total_orders: 8,
      total_spent: 120000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Mohammed Hassan',
      name_ar: 'محمد حسن',
      phone: '+9647501234569',
      email: 'mohammed.hassan@example.com',
      preferred_language: 'ar',
      total_orders: 22,
      total_spent: 380000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Emily Brown',
      name_ar: 'إيميلي براون',
      phone: '+9647501234570',
      email: 'emily.brown@example.com',
      preferred_language: 'en',
      total_orders: 5,
      total_spent: 75000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Fatima Al-Zahra',
      name_ar: 'فاطمة الزهراء',
      phone: '+9647501234571',
      email: 'fatima.zahra@example.com',
      preferred_language: 'ar',
      total_orders: 12,
      total_spent: 180000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Omar Khaled',
      name_ar: 'عمر خالد',
      phone: '+9647501234572',
      email: 'omar.khaled@example.com',
      preferred_language: 'ar',
      total_orders: 18,
      total_spent: 320000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Layla Mahmoud',
      name_ar: 'ليلى محمود',
      phone: '+9647501234573',
      email: 'layla.mahmoud@example.com',
      preferred_language: 'ar',
      total_orders: 10,
      total_spent: 150000,
    },
    {
      tenant_id: tenantId,
      name_en: 'David Wilson',
      name_ar: 'ديفيد ويلسون',
      phone: '+9647501234574',
      email: 'david.wilson@example.com',
      preferred_language: 'en',
      total_orders: 7,
      total_spent: 110000,
    },
    {
      tenant_id: tenantId,
      name_en: 'Noor Ibrahim',
      name_ar: 'نور إبراهيم',
      phone: '+9647501234575',
      email: 'noor.ibrahim@example.com',
      preferred_language: 'ar',
      total_orders: 14,
      total_spent: 220000,
    },
    {
      tenant_id: tenantId,
      name_en: 'James Anderson',
      name_ar: 'جيمس أندرسون',
      phone: '+9647501234576',
      email: 'james.anderson@example.com',
      preferred_language: 'en',
      total_orders: 9,
      total_spent: 140000,
    },
  ];

  const customerIds: string[] = [];

  for (const customer of customers) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', customer.phone)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      console.log(`   ⏭️  Customer "${customer.name_en}" already exists`);
      customerIds.push(existing.id);
      continue;
    }

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert(customer)
      .select('id')
      .single();

    if (error) {
      console.error(`   ❌ Failed to create customer "${customer.name_en}":`, error.message);
      continue;
    }

    console.log(`   ✅ Created customer: ${customer.name_en}`);
    customerIds.push(newCustomer.id);
  }

  return customerIds;
}

async function seedIngredients(tenantId: string): Promise<{ ingredientIds: string[]; ingredientMap: Map<string, string> }> {
  console.log('\n🥬 Seeding ingredients...');

  const ingredients = [
    { name_en: 'Chicken', name_ar: 'دجاج', category: 'meats', unit_of_measurement: 'kg', current_stock: 50, minimum_threshold: 10, cost_per_unit: 8000 },
    { name_en: 'Lamb', name_ar: 'لحم ضأن', category: 'meats', unit_of_measurement: 'kg', current_stock: 30, minimum_threshold: 5, cost_per_unit: 15000 },
    { name_en: 'Beef', name_ar: 'لحم بقري', category: 'meats', unit_of_measurement: 'kg', current_stock: 25, minimum_threshold: 5, cost_per_unit: 12000 },
    { name_en: 'Fish', name_ar: 'سمك', category: 'meats', unit_of_measurement: 'kg', current_stock: 20, minimum_threshold: 5, cost_per_unit: 10000 },
    { name_en: 'Rice', name_ar: 'أرز', category: 'grains', unit_of_measurement: 'kg', current_stock: 100, minimum_threshold: 20, cost_per_unit: 2000 },
    { name_en: 'Chickpeas', name_ar: 'حمص', category: 'legumes', unit_of_measurement: 'kg', current_stock: 40, minimum_threshold: 10, cost_per_unit: 3000 },
    { name_en: 'Eggplant', name_ar: 'باذنجان', category: 'vegetables', unit_of_measurement: 'kg', current_stock: 15, minimum_threshold: 5, cost_per_unit: 1500 },
    { name_en: 'Tomatoes', name_ar: 'طماطم', category: 'vegetables', unit_of_measurement: 'kg', current_stock: 30, minimum_threshold: 10, cost_per_unit: 2000 },
    { name_en: 'Onions', name_ar: 'بصل', category: 'vegetables', unit_of_measurement: 'kg', current_stock: 25, minimum_threshold: 5, cost_per_unit: 1000 },
    { name_en: 'Garlic', name_ar: 'ثوم', category: 'vegetables', unit_of_measurement: 'kg', current_stock: 10, minimum_threshold: 2, cost_per_unit: 5000 },
    { name_en: 'Tahini', name_ar: 'طحينة', category: 'condiments', unit_of_measurement: 'kg', current_stock: 20, minimum_threshold: 5, cost_per_unit: 6000 },
    { name_en: 'Olive Oil', name_ar: 'زيت زيتون', category: 'condiments', unit_of_measurement: 'liter', current_stock: 50, minimum_threshold: 10, cost_per_unit: 8000 },
    { name_en: 'Lemon', name_ar: 'ليمون', category: 'vegetables', unit_of_measurement: 'kg', current_stock: 20, minimum_threshold: 5, cost_per_unit: 1500 },
    { name_en: 'Parsley', name_ar: 'بقدونس', category: 'vegetables', unit_of_measurement: 'bunch', current_stock: 50, minimum_threshold: 10, cost_per_unit: 500 },
    { name_en: 'Mint', name_ar: 'نعناع', category: 'vegetables', unit_of_measurement: 'bunch', current_stock: 40, minimum_threshold: 10, cost_per_unit: 500 },
    { name_en: 'Bulgur', name_ar: 'برغل', category: 'grains', unit_of_measurement: 'kg', current_stock: 30, minimum_threshold: 5, cost_per_unit: 2500 },
    { name_en: 'Flour', name_ar: 'طحين', category: 'grains', unit_of_measurement: 'kg', current_stock: 80, minimum_threshold: 20, cost_per_unit: 1500 },
    { name_en: 'Yogurt', name_ar: 'لبن', category: 'dairy', unit_of_measurement: 'kg', current_stock: 40, minimum_threshold: 10, cost_per_unit: 3000 },
    { name_en: 'Cheese', name_ar: 'جبن', category: 'dairy', unit_of_measurement: 'kg', current_stock: 20, minimum_threshold: 5, cost_per_unit: 7000 },
    { name_en: 'Spices Mix', name_ar: 'بهارات', category: 'spices', unit_of_measurement: 'kg', current_stock: 15, minimum_threshold: 3, cost_per_unit: 10000 },
  ];

  const ingredientIds: string[] = [];
  const ingredientMap = new Map<string, string>();

  for (const ing of ingredients) {
    const { data: existing } = await supabase
      .from('ingredients')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name_en', ing.name_en)
      .is('deleted_at', null)
      .maybeSingle();

    let ingredientId: string;

    if (existing) {
      console.log(`   ⏭️  Ingredient "${ing.name_en}" already exists`);
      ingredientId = existing.id;
    } else {
      const { data: newIng, error } = await supabase
        .from('ingredients')
        .insert({
          tenant_id: tenantId,
          ...ing,
          storage_location: 'Main Storage',
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`   ❌ Failed to create ingredient "${ing.name_en}":`, error.message);
        continue;
      }

      ingredientId = newIng.id;
      console.log(`   ✅ Created ingredient: ${ing.name_en} (${ing.current_stock} ${ing.unit_of_measurement})`);
    }

    ingredientIds.push(ingredientId);
    ingredientMap.set(ing.name_en, ingredientId);
  }

  return { ingredientIds, ingredientMap };
}

async function seedRecipes(tenantId: string, foodItemMap: Map<string, string>, ingredientMap: Map<string, string>): Promise<void> {
  console.log('\n📝 Seeding recipes...');

  const recipes = [
    { foodItem: 'Hummus', ingredients: [{ name: 'Chickpeas', quantity: 0.5, unit: 'kg' }, { name: 'Tahini', quantity: 0.1, unit: 'kg' }, { name: 'Lemon', quantity: 0.1, unit: 'kg' }, { name: 'Garlic', quantity: 0.05, unit: 'kg' }] },
    { foodItem: 'Grilled Chicken', ingredients: [{ name: 'Chicken', quantity: 0.3, unit: 'kg' }, { name: 'Rice', quantity: 0.2, unit: 'kg' }, { name: 'Spices Mix', quantity: 0.02, unit: 'kg' }] },
    { foodItem: 'Kebab', ingredients: [{ name: 'Beef', quantity: 0.25, unit: 'kg' }, { name: 'Onions', quantity: 0.1, unit: 'kg' }, { name: 'Spices Mix', quantity: 0.02, unit: 'kg' }] },
    { foodItem: 'Masgouf', ingredients: [{ name: 'Fish', quantity: 0.5, unit: 'kg' }, { name: 'Lemon', quantity: 0.15, unit: 'kg' }, { name: 'Onions', quantity: 0.1, unit: 'kg' }] },
    { foodItem: 'Fattoush Salad', ingredients: [{ name: 'Tomatoes', quantity: 0.2, unit: 'kg' }, { name: 'Onions', quantity: 0.1, unit: 'kg' }, { name: 'Parsley', quantity: 2, unit: 'bunch' }, { name: 'Mint', quantity: 1, unit: 'bunch' }, { name: 'Lemon', quantity: 0.1, unit: 'kg' }, { name: 'Olive Oil', quantity: 0.05, unit: 'liter' }] },
    { foodItem: 'Biryani', ingredients: [{ name: 'Rice', quantity: 0.3, unit: 'kg' }, { name: 'Chicken', quantity: 0.25, unit: 'kg' }, { name: 'Spices Mix', quantity: 0.03, unit: 'kg' }, { name: 'Onions', quantity: 0.15, unit: 'kg' }] },
  ];

  for (const recipe of recipes) {
    const foodItemId = foodItemMap.get(recipe.foodItem);
    if (!foodItemId) continue;

    for (const ing of recipe.ingredients) {
      const ingredientId = ingredientMap.get(ing.name);
      if (!ingredientId) continue;

      await supabase.from('recipes').upsert({
        food_item_id: foodItemId,
        ingredient_id: ingredientId,
        quantity: ing.quantity,
        unit: ing.unit,
      }, { onConflict: 'food_item_id,ingredient_id' });
    }
    console.log(`   ✅ Created recipe for: ${recipe.foodItem}`);
  }
}

async function seedStockTransactions(tenantId: string, branchId: string, ingredientMap: Map<string, string>, userId: string): Promise<void> {
  console.log('\n📦 Seeding stock transactions...');

  const transactions = [
    { ingredient: 'Chicken', type: 'purchase', quantity: 50, unit_cost: 8000, supplier: 'Fresh Meat Co.' },
    { ingredient: 'Lamb', type: 'purchase', quantity: 30, unit_cost: 15000, supplier: 'Fresh Meat Co.' },
    { ingredient: 'Rice', type: 'purchase', quantity: 100, unit_cost: 2000, supplier: 'Grain Suppliers' },
    { ingredient: 'Chickpeas', type: 'purchase', quantity: 40, unit_cost: 3000, supplier: 'Legume Market' },
    { ingredient: 'Tahini', type: 'purchase', quantity: 20, unit_cost: 6000, supplier: 'Condiment Store' },
    { ingredient: 'Olive Oil', type: 'purchase', quantity: 50, unit_cost: 8000, supplier: 'Oil Importers' },
  ];

  for (const trans of transactions) {
    const ingredientId = ingredientMap.get(trans.ingredient);
    if (!ingredientId) continue;

    const totalCost = trans.quantity * trans.unit_cost;
    const transactionDate = new Date();
    transactionDate.setDate(transactionDate.getDate() - Math.floor(Math.random() * 30));

    await supabase.from('stock_transactions').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      ingredient_id: ingredientId,
      transaction_type: trans.type,
      quantity: trans.quantity,
      unit_cost: trans.unit_cost,
      total_cost: totalCost,
      supplier_name: trans.supplier,
      transaction_date: transactionDate.toISOString(),
      created_by: userId,
    });
  }

  console.log(`   ✅ Created ${transactions.length} stock transactions`);
}

async function seedAddOns(tenantId: string): Promise<{ addOnGroupIds: string[]; addOnIds: string[] }> {
  console.log('\n➕ Seeding add-ons...');

  // Create Add-on Groups
  const addOnGroups = [
    { name_en: 'Extra Toppings', name_ar: 'إضافات إضافية', selection_type: 'multiple', is_required: false },
    { name_en: 'Spice Level', name_ar: 'مستوى الحرارة', selection_type: 'single', is_required: true },
    { name_en: 'Side Dishes', name_ar: 'أطباق جانبية', selection_type: 'multiple', is_required: false },
  ];

  const addOnGroupIds: string[] = [];
  const addOnIds: string[] = [];

  for (const group of addOnGroups) {
    const { data: newGroup, error: groupError } = await supabase
      .from('add_on_groups')
      .insert({
        tenant_id: tenantId,
        ...group,
        display_order: addOnGroupIds.length + 1,
        is_active: true,
      })
      .select('id')
      .single();

    if (groupError) {
      console.error(`   ❌ Failed to create add-on group "${group.name_en}":`, groupError.message);
      continue;
    }

    addOnGroupIds.push(newGroup.id);
    console.log(`   ✅ Created add-on group: ${group.name_en}`);

    // Create Add-ons for each group
    let addOns: Array<{ name_en: string; name_ar: string; price: number }> = [];
    
    if (group.name_en === 'Extra Toppings') {
      addOns = [
        { name_en: 'Extra Cheese', name_ar: 'جبن إضافي', price: 1000 },
        { name_en: 'Extra Olives', name_ar: 'زيتون إضافي', price: 500 },
        { name_en: 'Extra Nuts', name_ar: 'مكسرات إضافية', price: 1500 },
      ];
    } else if (group.name_en === 'Spice Level') {
      addOns = [
        { name_en: 'Mild', name_ar: 'خفيف', price: 0 },
        { name_en: 'Medium', name_ar: 'متوسط', price: 0 },
        { name_en: 'Hot', name_ar: 'حار', price: 0 },
        { name_en: 'Extra Hot', name_ar: 'حار جداً', price: 0 },
      ];
    } else if (group.name_en === 'Side Dishes') {
      addOns = [
        { name_en: 'French Fries', name_ar: 'بطاطس مقلية', price: 2000 },
        { name_en: 'Rice', name_ar: 'أرز', price: 1500 },
        { name_en: 'Salad', name_ar: 'سلطة', price: 1500 },
      ];
    }

    for (const addOn of addOns) {
      const { data: newAddOn, error: addOnError } = await supabase
        .from('add_ons')
        .insert({
          add_on_group_id: newGroup.id,
          ...addOn,
          display_order: addOnIds.length + 1,
          is_active: true,
        })
        .select('id')
        .single();

      if (addOnError) {
        console.error(`   ❌ Failed to create add-on "${addOn.name_en}":`, addOnError.message);
        continue;
      }

      addOnIds.push(newAddOn.id);
    }
  }

  return { addOnGroupIds, addOnIds };
}

async function seedFoodItemVariations(foodItemMap: Map<string, string>): Promise<void> {
  console.log('\n📏 Seeding food item variations...');

  const variations = [
    { foodItem: 'Fresh Orange Juice', variations: [
      { group: 'Size', name: 'Small', price: 0 },
      { group: 'Size', name: 'Medium', price: 500 },
      { group: 'Size', name: 'Large', price: 1000 },
    ]},
    { foodItem: 'Fresh Lemonade', variations: [
      { group: 'Size', name: 'Small', price: 0 },
      { group: 'Size', name: 'Medium', price: 500 },
      { group: 'Size', name: 'Large', price: 1000 },
    ]},
    { foodItem: 'Grilled Chicken', variations: [
      { group: 'Portion', name: 'Half', price: -5000 },
      { group: 'Portion', name: 'Full', price: 0 },
      { group: 'Portion', name: 'Family', price: 10000 },
    ]},
    { foodItem: 'Ice Cream', variations: [
      { group: 'Size', name: 'Single Scoop', price: 0 },
      { group: 'Size', name: 'Double Scoop', price: 1500 },
      { group: 'Size', name: 'Triple Scoop', price: 3000 },
    ]},
  ];

  for (const item of variations) {
    const foodItemId = foodItemMap.get(item.foodItem);
    if (!foodItemId) continue;

    for (const variation of item.variations) {
      await supabase.from('food_item_variations').upsert({
        food_item_id: foodItemId,
        variation_group: variation.group,
        variation_name: variation.name,
        price_adjustment: variation.price,
        display_order: item.variations.indexOf(variation) + 1,
      }, { onConflict: 'food_item_id,variation_group,variation_name' });
    }
    console.log(`   ✅ Created variations for: ${item.foodItem}`);
  }
}

async function linkAddOnsToFoodItems(foodItemMap: Map<string, string>, addOnGroupIds: string[]): Promise<void> {
  console.log('\n🔗 Linking add-ons to food items...');

  // Get add-on groups
  const { data: extraToppingsGroup } = await supabase
    .from('add_on_groups')
    .select('id')
    .eq('name_en', 'Extra Toppings')
    .single();

  const { data: spiceLevelGroup } = await supabase
    .from('add_on_groups')
    .select('id')
    .eq('name_en', 'Spice Level')
    .single();

  const { data: sideDishesGroup } = await supabase
    .from('add_on_groups')
    .select('id')
    .eq('name_en', 'Side Dishes')
    .single();

  // Link add-ons to appropriate food items
  const links = [
    { foodItem: 'Kebab', groups: [spiceLevelGroup?.id, sideDishesGroup?.id] },
    { foodItem: 'Grilled Chicken', groups: [spiceLevelGroup?.id, sideDishesGroup?.id] },
    { foodItem: 'Masgouf', groups: [spiceLevelGroup?.id, sideDishesGroup?.id] },
    { foodItem: 'Biryani', groups: [spiceLevelGroup?.id] },
    { foodItem: 'Hummus', groups: [extraToppingsGroup?.id] },
    { foodItem: 'Mutabal', groups: [extraToppingsGroup?.id] },
  ];

  for (const link of links) {
    const foodItemId = foodItemMap.get(link.foodItem);
    if (!foodItemId) continue;

    for (const groupId of link.groups) {
      if (!groupId) continue;
      await supabase.from('food_item_add_on_groups').upsert({
        food_item_id: foodItemId,
        add_on_group_id: groupId,
      }, { onConflict: 'food_item_id,add_on_group_id' });
    }
    console.log(`   ✅ Linked add-ons to: ${link.foodItem}`);
  }
}

async function seedCustomerAddresses(customerIds: string[]): Promise<void> {
  console.log('\n📍 Seeding customer addresses...');

  const addresses = [
    { customerIndex: 0, label: 'Home', address_en: 'Al-Karada, Street 14, Building 25', address_ar: 'الكَرادة، شارع 14، بناية 25', city: 'Baghdad', is_default: true },
    { customerIndex: 1, label: 'Work', address_en: 'Al-Mansour, Business District, Office 301', address_ar: 'المنصور، المنطقة التجارية، مكتب 301', city: 'Baghdad', is_default: false },
    { customerIndex: 2, label: 'Home', address_en: 'Al-Jadriya, University Area, Apartment 5', address_ar: 'الجادرية، منطقة الجامعة، شقة 5', city: 'Baghdad', is_default: true },
    { customerIndex: 3, label: 'Home', address_en: 'Al-Zawraa, Residential Complex, Block 3', address_ar: 'الزوراء، مجمع سكني، بلوك 3', city: 'Baghdad', is_default: true },
  ];

  for (const addr of addresses) {
    if (addr.customerIndex >= customerIds.length) continue;

    await supabase.from('customer_addresses').insert({
      customer_id: customerIds[addr.customerIndex],
      address_label: addr.label,
      address_en: addr.address_en,
      address_ar: addr.address_ar,
      city: addr.city,
      country: 'Iraq',
      is_default: addr.is_default,
    });
  }

  console.log(`   ✅ Created ${addresses.length} customer addresses`);
}

async function generateOrderNumber(tenantId: string, branchId: string, orderDate?: Date): Promise<string> {
  const date = orderDate || new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Get count of orders on the specified date (or today if not specified)
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .gte('order_date', startOfDay.toISOString())
    .lte('order_date', endOfDay.toISOString());

  const orderNum = ((count || 0) + 1).toString().padStart(4, '0');
  return `ORD-${dateStr}-${orderNum}`;
}

async function seedOrders(
  seedData: SeedData,
  foodItemIds: string[]
): Promise<void> {
  console.log('\n📦 Seeding orders...');

  const orderStatuses = ['pending', 'preparing', 'ready', 'served', 'completed'];
  const paymentStatuses = ['unpaid', 'paid', 'partial'];
  const orderTypes = ['dine_in', 'takeaway', 'delivery'];
  const paymentMethods = ['cash', 'card', 'mobile_wallet'];

  // Create 50 sample orders for vibrant dashboard
  for (let i = 0; i < 50; i++) {
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * 30)); // Random date in last 30 days
    orderDate.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0);

    const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
    const paymentStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
    const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
    const customerId = seedData.customerIds[Math.floor(Math.random() * seedData.customerIds.length)];

    // Select 1-4 random food items
    const numItems = Math.floor(Math.random() * 4) + 1;
    const selectedItems = [];
    for (let j = 0; j < numItems; j++) {
      const itemId = foodItemIds[Math.floor(Math.random() * foodItemIds.length)];
      if (!selectedItems.find((si) => si.id === itemId)) {
        selectedItems.push({
          id: itemId,
          quantity: Math.floor(Math.random() * 3) + 1,
        });
      }
    }

    // Calculate totals
    let subtotal = 0;
    const orderItemsData = [];

    for (const selectedItem of selectedItems) {
      const { data: foodItem } = await supabase
        .from('food_items')
        .select('base_price')
        .eq('id', selectedItem.id)
        .single();

      if (foodItem) {
        const unitPrice = foodItem.base_price;
        const quantity = selectedItem.quantity;
        const itemSubtotal = unitPrice * quantity;
        subtotal += itemSubtotal;

        orderItemsData.push({
          food_item_id: selectedItem.id,
          quantity,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          discount_amount: 0,
          tax_amount: 0,
        });
      }
    }

    // Calculate tax (5% VAT)
    const taxAmount = subtotal * 0.05;
    const discountAmount = 0;
    const deliveryCharge = orderType === 'delivery' ? 2000 : 0;
    const totalAmount = subtotal + taxAmount + deliveryCharge - discountAmount;

    const orderNumber = await generateOrderNumber(seedData.tenantId, seedData.branchId, orderDate);

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        tenant_id: seedData.tenantId,
        branch_id: seedData.branchId,
        counter_id: seedData.counterId,
        customer_id: customerId,
        cashier_id: seedData.cashierId,
        order_number: orderNumber,
        token_number: `T${String(i + 1).padStart(3, '0')}`,
        order_type: orderType,
        status,
        payment_status: paymentStatus,
        payment_timing: 'pay_after',
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        delivery_charge: deliveryCharge,
        total_amount: totalAmount,
        order_date: orderDate.toISOString(),
        placed_at: orderDate.toISOString(),
        created_at: orderDate.toISOString(),
        updated_at: orderDate.toISOString(),
        paid_at: paymentStatus === 'paid' ? orderDate.toISOString() : null,
        completed_at: status === 'completed' ? orderDate.toISOString() : null,
      })
      .select('id')
      .single();

    if (orderError) {
      console.error(`   ❌ Failed to create order ${i + 1}:`, orderError.message);
      continue;
    }

    // Create order items
    for (const itemData of orderItemsData) {
      const { data: orderItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          food_item_id: itemData.food_item_id,
          quantity: itemData.quantity,
          unit_price: itemData.unit_price,
          subtotal: itemData.subtotal,
          discount_amount: itemData.discount_amount,
          tax_amount: itemData.tax_amount,
        })
        .select('id')
        .single();

      if (itemError) {
        console.error(`   ❌ Failed to create order item:`, itemError.message);
      }
    }

    // Create payment if order is paid
    if (paymentStatus === 'paid') {
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: order.id,
        payment_method: paymentMethod,
        amount: totalAmount,
        status: 'completed',
        paid_at: orderDate.toISOString(),
      });

      if (paymentError) {
        console.error(`   ❌ Failed to create payment:`, paymentError.message);
      }
    }

    if ((i + 1) % 10 === 0) {
      console.log(`   ✅ Created ${i + 1} orders...`);
  }
  }
  console.log(`   ✅ Created 50 orders total`);
}

async function seedData() {
  const allCredentials: Credentials[] = [];

  try {
    console.log('🌱 Starting comprehensive seed data process...\n');

    // Create new tenant for seed data
    const { tenantId, ownerCredentials } = await createNewTenant();
    allCredentials.push(ownerCredentials);

    // Get or create branch
    const branchId = await getOrCreateBranch(tenantId);

    // Get or create counter
    const counterId = await getOrCreateCounter(branchId);

    // Create employees with auth accounts
    const { cashierId, allCredentials: employeeCredentials } = await createEmployees(tenantId, branchId);
    allCredentials.push(...employeeCredentials);

    // Seed tables
    await seedTables(branchId);

    // Seed taxes
    const taxIds = await seedTaxes(tenantId);

    // Seed categories
    const categoryIds = await seedCategories(tenantId);

    // Seed food items
    const { foodItemIds, foodItemMap } = await seedFoodItems(tenantId, categoryIds);

    // Seed ingredients
    const { ingredientIds, ingredientMap } = await seedIngredients(tenantId);

    // Seed recipes
    await seedRecipes(tenantId, foodItemMap, ingredientMap);

    // Seed stock transactions
    await seedStockTransactions(tenantId, branchId, ingredientMap, cashierId);

    // Seed add-ons
    const { addOnGroupIds } = await seedAddOns(tenantId);

    // Link add-ons to food items
    await linkAddOnsToFoodItems(foodItemMap, addOnGroupIds);

    // Seed food item variations
    await seedFoodItemVariations(foodItemMap);

    // Seed customers
    const customerIds = await seedCustomers(tenantId);

    // Seed customer addresses
    await seedCustomerAddresses(customerIds);

    // Seed orders
    const seedData: SeedData = {
      tenantId,
      branchId,
      counterId,
      cashierId,
      taxIds,
      categoryIds,
      foodItemIds,
      foodItemMap,
      customerIds,
      ingredientIds,
      ingredientMap,
    };

    await seedOrders(seedData, foodItemIds);

    // Verify orders were created
    console.log('\n🔍 Verifying orders...');
    const { data: createdOrders, error: verifyError } = await supabase
      .from('orders')
      .select('id, order_number, status, order_date, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (verifyError) {
      console.error(`   ⚠️  Warning: Could not verify orders: ${verifyError.message}`);
    } else {
      console.log(`   ✅ Verified ${createdOrders?.length || 0} orders in database`);
      if (createdOrders && createdOrders.length > 0) {
        console.log(`   📋 Sample orders:`);
        createdOrders.slice(0, 3).forEach((o: any) => {
          console.log(`      - ${o.order_number} (${o.status}) - ${o.order_date || o.created_at}`);
        });
      }
    }

    console.log('\n✨ Seed data process completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Tenant ID: ${tenantId}`);
    console.log(`   - Taxes: ${taxIds.length}`);
    console.log(`   - Categories: ${categoryIds.length} (with images)`);
    console.log(`   - Food Items: ${foodItemIds.length} (with images, labels, and descriptions)`);
    console.log(`   - Food Item Variations: Multiple items with size/portion options`);
    console.log(`   - Ingredients: ${ingredientIds.length} (with stock levels)`);
    console.log(`   - Recipes: Linking food items to ingredients`);
    console.log(`   - Stock Transactions: Historical purchase records`);
    console.log(`   - Add-on Groups: 3 groups with multiple options`);
    console.log(`   - Add-ons Linked: To various food items`);
    console.log(`   - Customers: ${customerIds.length} (with addresses and order history)`);
    console.log(`   - Tables: 15 (various sizes and types)`);
    console.log(`   - Orders: 50 (for vibrant dashboard)`);
    console.log(`   - Employees: ${employeeCredentials.length + 1} (including owner with auth accounts)`);
    console.log(`\n⚠️  IMPORTANT: Make sure you're logged in with the tenant ID above!`);
    console.log(`   Use the credentials below to log in and see the orders.`);

    // Display credentials
    console.log('\n🔐 Login Credentials:');
    console.log('═'.repeat(80));
    allCredentials.forEach((cred, index) => {
      console.log(`\n${index + 1}. ${cred.role}`);
      console.log(`   Name: ${cred.name}`);
      console.log(`   Email: ${cred.email}`);
      console.log(`   Password: ${cred.password}`);
    });
    console.log('\n' + '═'.repeat(80));
    console.log('\n⚠️  Please save these credentials securely!');
    console.log('   Users should change their passwords on first login.');

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
seedData()
  .then(() => {
    console.log('\n✨ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });