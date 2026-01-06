-- Migration: Add branch_id to tables that should be branch-level instead of tenant-level
-- This migration adds branch_id to: taxes, menus, variation_groups, add_on_groups, categories

-- Add branch_id to taxes table
ALTER TABLE taxes 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to menus table
ALTER TABLE menus 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to variation_groups table
ALTER TABLE variation_groups 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to add_on_groups table
ALTER TABLE add_on_groups 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_taxes_branch_id ON taxes(branch_id);
CREATE INDEX IF NOT EXISTS idx_menus_branch_id ON menus(branch_id);
CREATE INDEX IF NOT EXISTS idx_variation_groups_branch_id ON variation_groups(branch_id);
CREATE INDEX IF NOT EXISTS idx_add_on_groups_branch_id ON add_on_groups(branch_id);
CREATE INDEX IF NOT EXISTS idx_categories_branch_id ON categories(branch_id);

-- Update unique constraints to include branch_id where applicable
-- For menus: tenant_id + menu_type should be unique per branch
-- Drop the existing unique constraint (it's a constraint, not just an index)
ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_tenant_id_menu_type_key;
DROP INDEX IF EXISTS idx_menus_tenant_menu_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menus_tenant_branch_menu_type ON menus(tenant_id, branch_id, menu_type) WHERE deleted_at IS NULL;

-- For taxes: tax_code should be unique per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_tenant_branch_tax_code ON taxes(tenant_id, branch_id, tax_code) WHERE deleted_at IS NULL;

