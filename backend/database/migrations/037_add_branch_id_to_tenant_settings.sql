-- Migration: Add branch_id to tenant_settings table
-- This migration makes settings branch-specific instead of tenant-wide

-- Add branch_id to tenant_settings table
ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tenant_settings_branch_id ON tenant_settings(branch_id);

-- Drop the existing unique constraint on tenant_id
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_tenant_id_key;

-- For branch-specific settings: Create unique constraint on (tenant_id, branch_id)
-- This works because branch_id will never be NULL for branch-specific settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_settings_tenant_branch 
ON tenant_settings(tenant_id, branch_id) 
WHERE branch_id IS NOT NULL;

-- For tenant-level settings: Create unique constraint on tenant_id where branch_id IS NULL
-- This ensures only one tenant-level setting per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_settings_tenant_only 
ON tenant_settings(tenant_id) 
WHERE branch_id IS NULL;

-- Note: Supabase's upsert with onConflict doesn't work with partial indexes
-- So we'll handle the upsert logic in the service layer

