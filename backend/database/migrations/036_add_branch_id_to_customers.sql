-- Migration: Add branch_id to customers table
-- This makes customers branch-specific

-- Add branch_id to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);

-- Update unique constraint for phone to be per branch (if needed)
-- Note: Phone uniqueness might need to be per branch, but we'll keep it tenant-wide for now
-- If you want phone to be unique per branch, you would need to:
-- ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_branch_phone 
-- ON customers(tenant_id, branch_id, phone) WHERE deleted_at IS NULL;

