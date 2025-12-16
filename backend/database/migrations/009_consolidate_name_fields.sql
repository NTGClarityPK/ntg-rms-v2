-- Migration: Consolidate name_en and name_ar into single name column
-- This migration merges the dual language name fields into a single name field
-- that can accept input in any language

-- ============================================
-- TENANTS
-- ============================================
ALTER TABLE tenants ADD COLUMN name VARCHAR(255);
UPDATE tenants SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE tenants ALTER COLUMN name SET NOT NULL;
ALTER TABLE tenants DROP COLUMN name_en;
ALTER TABLE tenants DROP COLUMN name_ar;

-- ============================================
-- BRANCHES
-- ============================================
ALTER TABLE branches ADD COLUMN name VARCHAR(255);
UPDATE branches SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE branches ALTER COLUMN name SET NOT NULL;
ALTER TABLE branches DROP COLUMN name_en;
ALTER TABLE branches DROP COLUMN name_ar;

-- ============================================
-- USERS
-- ============================================
ALTER TABLE users ADD COLUMN name VARCHAR(255);
UPDATE users SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users DROP COLUMN name_en;
ALTER TABLE users DROP COLUMN name_ar;

-- ============================================
-- CATEGORIES
-- ============================================
ALTER TABLE categories ADD COLUMN name VARCHAR(255);
UPDATE categories SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE categories ALTER COLUMN name SET NOT NULL;
ALTER TABLE categories DROP COLUMN name_en;
ALTER TABLE categories DROP COLUMN name_ar;

-- ============================================
-- FOOD ITEMS
-- ============================================
ALTER TABLE food_items ADD COLUMN name VARCHAR(255);
UPDATE food_items SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE food_items ALTER COLUMN name SET NOT NULL;
ALTER TABLE food_items DROP COLUMN name_en;
ALTER TABLE food_items DROP COLUMN name_ar;

-- ============================================
-- ADD-ON GROUPS
-- ============================================
ALTER TABLE add_on_groups ADD COLUMN name VARCHAR(255);
UPDATE add_on_groups SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE add_on_groups ALTER COLUMN name SET NOT NULL;
ALTER TABLE add_on_groups DROP COLUMN name_en;
ALTER TABLE add_on_groups DROP COLUMN name_ar;

-- ============================================
-- ADD-ONS
-- ============================================
ALTER TABLE add_ons ADD COLUMN name VARCHAR(255);
UPDATE add_ons SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE add_ons ALTER COLUMN name SET NOT NULL;
ALTER TABLE add_ons DROP COLUMN name_en;
ALTER TABLE add_ons DROP COLUMN name_ar;

-- ============================================
-- CUSTOMERS
-- ============================================
ALTER TABLE customers ADD COLUMN name VARCHAR(255);
UPDATE customers SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE customers ALTER COLUMN name SET NOT NULL;
ALTER TABLE customers DROP COLUMN name_en;
ALTER TABLE customers DROP COLUMN name_ar;

-- ============================================
-- INGREDIENTS
-- ============================================
ALTER TABLE ingredients ADD COLUMN name VARCHAR(255);
UPDATE ingredients SET name = COALESCE(name_en, name_ar, '');
ALTER TABLE ingredients ALTER COLUMN name SET NOT NULL;
ALTER TABLE ingredients DROP COLUMN name_en;
ALTER TABLE ingredients DROP COLUMN name_ar;

