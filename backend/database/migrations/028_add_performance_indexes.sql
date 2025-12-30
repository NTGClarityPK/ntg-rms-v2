-- Migration: Add performance indexes for common query patterns
-- This migration adds indexes to improve query performance for frequently accessed columns
-- Created as part of Phase 1 refactoring
-- 
-- NOTE: This migration assumes all tables from 001_initial_schema.sql have been created.
-- Run this migration after all schema migrations are complete.

-- ============================================
-- ORDERS TABLE INDEXES
-- ============================================
-- Only create indexes if the orders table and required columns exist

DO $$
BEGIN
  -- Check if orders table exists and has required columns
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'orders'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'tenant_id'
  ) THEN
    -- Index for filtering orders by tenant, branch, and date (most common query pattern)
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch_date 
      ON orders(tenant_id, branch_id, created_at DESC);

    -- Index for filtering orders by status
    CREATE INDEX IF NOT EXISTS idx_orders_status 
      ON orders(tenant_id, status, created_at DESC);

    -- Index for filtering orders by payment status
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status 
      ON orders(tenant_id, payment_status, created_at DESC);

    -- Index for order number lookups
    CREATE INDEX IF NOT EXISTS idx_orders_order_number 
      ON orders(tenant_id, order_number);
  END IF;
END $$;

-- ============================================
-- ORDER ITEMS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'order_items'
  ) THEN
    -- Index for joining order items with orders
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
      ON order_items(order_id);

    -- Index for filtering order items by food item
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_items' AND column_name = 'food_item_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_order_items_food_item_id 
        ON order_items(food_item_id) 
        WHERE food_item_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================
-- FOOD ITEMS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'food_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'food_items' AND column_name = 'tenant_id'
  ) THEN
    -- Index for filtering food items by tenant, category, and active status
    CREATE INDEX IF NOT EXISTS idx_food_items_tenant_category_active 
      ON food_items(tenant_id, category_id, is_active, display_order);

    -- Index for menu type filtering
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'food_items' AND column_name = 'menu_type'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_food_items_menu_type 
        ON food_items(tenant_id, menu_type) 
        WHERE menu_type IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================
-- CATEGORIES TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'categories'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categories' AND column_name = 'tenant_id'
  ) THEN
    -- Index for category hierarchy queries
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'parent_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_categories_parent 
        ON categories(tenant_id, parent_id, display_order) 
        WHERE parent_id IS NOT NULL;
    END IF;

    -- Index for active categories
    CREATE INDEX IF NOT EXISTS idx_categories_active 
      ON categories(tenant_id, is_active, display_order);
  END IF;
END $$;

-- ============================================
-- INGREDIENTS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ingredients'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ingredients' AND column_name = 'tenant_id'
  ) THEN
    -- Index for filtering ingredients by category and status
    CREATE INDEX IF NOT EXISTS idx_ingredients_category_status 
      ON ingredients(tenant_id, category, is_active);

    -- Index for low stock queries
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ingredients' 
      AND column_name IN ('current_stock', 'minimum_threshold')
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock 
        ON ingredients(tenant_id, is_active) 
        WHERE current_stock <= minimum_threshold;
    END IF;
  END IF;
END $$;

-- ============================================
-- RECIPES TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'recipes'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'tenant_id'
  ) THEN
    -- Index for recipe lookups by food item
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'recipes' AND column_name = 'food_item_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_recipes_food_item 
        ON recipes(tenant_id, food_item_id) 
        WHERE food_item_id IS NOT NULL;
    END IF;
  END IF;

  -- Index for recipe lookups by ingredient
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'recipe_ingredients'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_recipes_ingredient 
      ON recipe_ingredients(recipe_id, ingredient_id);
  END IF;
END $$;

-- ============================================
-- USERS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'users'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    -- Index for user lookups by tenant and role
    CREATE INDEX IF NOT EXISTS idx_users_tenant_role 
      ON users(tenant_id, role, is_active);

    -- Index for email lookups
    CREATE INDEX IF NOT EXISTS idx_users_email 
      ON users(email) 
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================
-- BRANCHES TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'branches'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' AND column_name = 'tenant_id'
  ) THEN
    -- Index for branch lookups by tenant
    CREATE INDEX IF NOT EXISTS idx_branches_tenant_active 
      ON branches(tenant_id, is_active);
  END IF;
END $$;

-- ============================================
-- CUSTOMERS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'customers'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'tenant_id'
  ) THEN
    -- Index for customer lookups by tenant
    CREATE INDEX IF NOT EXISTS idx_customers_tenant 
      ON customers(tenant_id, created_at DESC) 
      WHERE deleted_at IS NULL;

    -- Index for customer phone/email lookups
    CREATE INDEX IF NOT EXISTS idx_customers_contact 
      ON customers(tenant_id, phone, email) 
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================
-- COUPONS TABLE INDEXES
-- ============================================
-- Note: Some indexes may already exist from migration 005_coupons.sql
-- Using IF NOT EXISTS to avoid errors if they already exist

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'coupons'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'coupons' AND column_name = 'tenant_id'
  ) THEN
    -- Index for active coupon lookups (using valid_from and valid_until)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'coupons' 
      AND column_name IN ('valid_from', 'valid_until')
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_coupons_active_validity 
        ON coupons(tenant_id, is_active, valid_from, valid_until)
        WHERE deleted_at IS NULL;
    END IF;

    -- Index for coupon code lookups (may already exist from 005_coupons.sql)
    CREATE INDEX IF NOT EXISTS idx_coupons_code_lookup 
      ON coupons(tenant_id, code) 
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================
-- STOCK TRANSACTIONS TABLE INDEXES
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'stock_transactions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stock_transactions' AND column_name = 'tenant_id'
  ) THEN
    -- Index for stock transaction history queries
    CREATE INDEX IF NOT EXISTS idx_stock_transactions_ingredient_date 
      ON stock_transactions(tenant_id, ingredient_id, created_at DESC);
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================
-- These indexes are designed to optimize the most common query patterns:
-- 1. Tenant-based filtering (all tables)
-- 2. Date-based sorting (orders, transactions)
-- 3. Status filtering (orders, food items, categories)
-- 4. Foreign key joins (order_items, recipes)
-- 5. Soft delete filtering (where deleted_at IS NULL)

-- Note: Indexes on foreign keys and frequently filtered columns significantly
-- improve query performance, especially as data volume grows.

