-- Migration: Add branch_id to coupons, buffets, and combo_meals tables
-- This migration adds branch_id to make these entities branch-specific

-- Add branch_id to coupons table
ALTER TABLE coupons 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to buffets table
ALTER TABLE buffets 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to combo_meals table
ALTER TABLE combo_meals 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_coupons_branch_id ON coupons(branch_id);
CREATE INDEX IF NOT EXISTS idx_buffets_branch_id ON buffets(branch_id);
CREATE INDEX IF NOT EXISTS idx_combo_meals_branch_id ON combo_meals(branch_id);

-- Update unique constraints to include branch_id where applicable
-- For coupons: code should be unique per branch
-- Drop the existing unique constraint (it's a constraint, not just an index)
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_tenant_id_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_tenant_branch_code 
ON coupons(tenant_id, branch_id, code) 
WHERE deleted_at IS NULL;

-- For buffets: name should be unique per branch
-- Drop the existing unique constraint (it's a constraint, not just an index)
ALTER TABLE buffets DROP CONSTRAINT IF EXISTS buffets_tenant_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_buffets_tenant_branch_name 
ON buffets(tenant_id, branch_id, name) 
WHERE deleted_at IS NULL;

-- For combo_meals: name should be unique per branch
-- Drop the existing unique constraint (it's a constraint, not just an index)
ALTER TABLE combo_meals DROP CONSTRAINT IF EXISTS combo_meals_tenant_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_meals_tenant_branch_name 
ON combo_meals(tenant_id, branch_id, name) 
WHERE deleted_at IS NULL;

