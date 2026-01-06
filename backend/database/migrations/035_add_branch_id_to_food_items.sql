-- Migration: Add branch_id to food_items table
-- This migration makes food_items branch-level instead of tenant-level

-- Add branch_id to food_items table
ALTER TABLE food_items 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_food_items_branch_id ON food_items(branch_id);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_food_items_tenant_branch_category 
ON food_items(tenant_id, branch_id, category_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_food_items_tenant_branch_active 
ON food_items(tenant_id, branch_id, is_active) 
WHERE deleted_at IS NULL;

