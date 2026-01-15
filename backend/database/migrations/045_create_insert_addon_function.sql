-- Migration: Add tenant_id to add_ons table and create function to insert add-ons
-- This fixes the "Could not find the 'tenant_id' column" error

-- ============================================
-- ADD TENANT_ID COLUMN TO ADD_ONS TABLE
-- ============================================

-- Add tenant_id column to add_ons table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'add_ons' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE add_ons ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Populate tenant_id from add_on_groups for existing records (including newly added column)
UPDATE add_ons ao
SET tenant_id = aog.tenant_id
FROM add_on_groups aog
WHERE ao.add_on_group_id = aog.id
  AND ao.tenant_id IS NULL;

-- Make tenant_id NOT NULL (will fail silently if constraint already exists or column doesn't exist)
DO $$
BEGIN
    ALTER TABLE add_ons ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- Constraint might already exist or column doesn't exist, ignore
        NULL;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_add_ons_tenant_id ON add_ons(tenant_id);

-- ============================================
-- UPDATE RLS POLICY
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS tenant_isolation_add_ons ON add_ons;

-- Create new policy that uses tenant_id directly
CREATE POLICY tenant_isolation_add_ons ON add_ons
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR current_setting('app.is_super_admin', true)::BOOLEAN = true
    );

-- ============================================
-- CREATE INSERT FUNCTION
-- ============================================

-- Drop existing function if it exists (in case return type changed)
DROP FUNCTION IF EXISTS insert_addon(UUID, TEXT, DECIMAL, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS insert_addon(UUID, TEXT, NUMERIC, BOOLEAN, INTEGER);

-- Function to insert an add-on and return the created record
CREATE OR REPLACE FUNCTION insert_addon(
    p_add_on_group_id UUID,
    p_name TEXT,
    p_price DECIMAL(10,2) DEFAULT 0,
    p_is_active BOOLEAN DEFAULT true,
    p_display_order INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    add_on_group_id UUID,
    tenant_id UUID,
    name TEXT,
    price DECIMAL(10,2),
    is_active BOOLEAN,
    display_order INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_result RECORD;
BEGIN
    -- Get tenant_id from add_on_groups
    SELECT aog.tenant_id INTO v_tenant_id
    FROM add_on_groups aog
    WHERE aog.id = p_add_on_group_id
      AND aog.deleted_at IS NULL;
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Add-on group not found or deleted';
    END IF;
    
    -- Insert the add-on with tenant_id
    INSERT INTO add_ons (
        add_on_group_id,
        tenant_id,
        name,
        price,
        is_active,
        display_order
    ) VALUES (
        p_add_on_group_id,
        v_tenant_id,
        p_name,
        p_price,
        p_is_active,
        p_display_order
    )
    RETURNING 
        add_ons.id,
        add_ons.add_on_group_id,
        add_ons.tenant_id,
        add_ons.name,
        add_ons.price,
        add_ons.is_active,
        add_ons.display_order,
        add_ons.created_at,
        add_ons.updated_at
    INTO v_result;
    
    -- Return the created record
    RETURN QUERY SELECT 
        v_result.id,
        v_result.add_on_group_id,
        v_result.tenant_id,
        v_result.name,
        v_result.price,
        v_result.is_active,
        v_result.display_order,
        v_result.created_at,
        v_result.updated_at;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION insert_addon(UUID, TEXT, DECIMAL, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_addon(UUID, TEXT, DECIMAL, BOOLEAN, INTEGER) TO service_role;

COMMENT ON FUNCTION insert_addon IS 'Inserts an add-on directly into the database, bypassing PostgREST schema validation. This fixes schema cache issues where PostgREST incorrectly expects a tenant_id column.';

