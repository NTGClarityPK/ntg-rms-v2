-- Create menus table to store menu names
-- This table stores the display names for menu types

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  menu_type VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(tenant_id, menu_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_menus_tenant_menu_type ON menus(tenant_id, menu_type);

-- Add RLS (Row Level Security) policies if using Supabase
-- ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role to access all menus
-- CREATE POLICY "Service role can access all menus" ON menus
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);
