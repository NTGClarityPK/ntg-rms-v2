-- ============================================
-- RESET DATABASE AND RUN MIGRATIONS
-- ============================================
-- This script will:
-- 1. Drop all existing tables, functions, triggers, and policies
-- 2. Prepare database for fresh migrations
--
-- WARNING: This will DELETE ALL DATA!
-- Only run this in development or when you want to start fresh.
-- ============================================

-- ============================================
-- STEP 1: DROP ALL FUNCTIONS FIRST
-- ============================================
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS get_current_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS handle_new_auth_user() CASCADE;

-- ============================================
-- STEP 2: DROP ALL TABLES (CASCADE automatically drops triggers and policies)
-- ============================================
-- Using CASCADE ensures all dependent objects (triggers, policies, foreign keys) are dropped
DROP TABLE IF EXISTS tax_applications CASCADE;
DROP TABLE IF EXISTS taxes CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS stock_transactions CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS coupon_usages CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_item_add_ons CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS food_item_discounts CASCADE;
DROP TABLE IF EXISTS food_item_labels CASCADE;
DROP TABLE IF EXISTS food_item_add_on_groups CASCADE;
DROP TABLE IF EXISTS add_ons CASCADE;
DROP TABLE IF EXISTS add_on_groups CASCADE;
DROP TABLE IF EXISTS food_item_variations CASCADE;
DROP TABLE IF EXISTS food_items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS counters CASCADE;
DROP TABLE IF EXISTS user_branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ============================================
-- STEP 3: Now run the migrations
-- ============================================
-- The migrations will be run in order:
-- 1. 001_initial_schema.sql
-- 2. 002_auto_create_user_trigger.sql (optional)
-- 3. 003_menu_items_junction.sql (optional)
-- 4. 004_coupons.sql
-- 5. 005_remove_table_constraints.sql
--
-- Copy and paste the contents of those files below, or run them separately in Supabase SQL Editor.
