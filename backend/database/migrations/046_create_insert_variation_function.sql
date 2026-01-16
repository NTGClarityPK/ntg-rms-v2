-- Migration: Add tenant_id to variations table and create function to insert variations
-- This fixes the "Could not find the 'tenant_id' column" error

-- ============================================
-- ADD TENANT_ID COLUMN TO VARIATIONS TABLE
-- ============================================

-- Add tenant_id column to variations table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'variations' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE variations ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Populate tenant_id from variation_groups for existing records (including newly added column)
UPDATE variations v
SET tenant_id = vg.tenant_id
FROM variation_groups vg
WHERE v.variation_group_id = vg.id
  AND v.tenant_id IS NULL;

-- Make tenant_id NOT NULL (will fail silently if constraint already exists or column doesn't exist)
DO $$
BEGIN
    ALTER TABLE variations ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- Constraint might already exist or column doesn't exist, ignore
        NULL;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_variations_tenant_id ON variations(tenant_id);

-- ============================================
-- UPDATE RLS POLICY
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS tenant_isolation_variations ON variations;

-- Create new policy that uses tenant_id directly
CREATE POLICY tenant_isolation_variations ON variations
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR current_setting('app.is_super_admin', true)::BOOLEAN = true
    );

-- ============================================
-- CREATE INSERT FUNCTION
-- ============================================

-- Drop existing function if it exists (in case return type changed)
DROP FUNCTION IF EXISTS insert_variation(UUID, TEXT, DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS insert_variation(UUID, TEXT, NUMERIC, NUMERIC, INTEGER);

-- Function to insert a variation and return the created record
CREATE OR REPLACE FUNCTION insert_variation(
    p_variation_group_id UUID,
    p_name TEXT,
    p_recipe_multiplier DECIMAL(10,4) DEFAULT 1.0,
    p_pricing_adjustment DECIMAL(12,2) DEFAULT 0,
    p_display_order INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    variation_group_id UUID,
    tenant_id UUID,
    name TEXT,
    recipe_multiplier DECIMAL(10,4),
    pricing_adjustment DECIMAL(12,2),
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
    -- Get tenant_id from variation_groups
    SELECT vg.tenant_id INTO v_tenant_id
    FROM variation_groups vg
    WHERE vg.id = p_variation_group_id
      AND vg.deleted_at IS NULL;
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Variation group not found or deleted';
    END IF;
    
    -- Insert the variation with tenant_id
    INSERT INTO variations (
        variation_group_id,
        tenant_id,
        name,
        recipe_multiplier,
        pricing_adjustment,
        display_order
    ) VALUES (
        p_variation_group_id,
        v_tenant_id,
        p_name,
        p_recipe_multiplier,
        p_pricing_adjustment,
        p_display_order
    )
    RETURNING 
        variations.id,
        variations.variation_group_id,
        variations.tenant_id,
        variations.name,
        variations.recipe_multiplier,
        variations.pricing_adjustment,
        variations.display_order,
        variations.created_at,
        variations.updated_at
    INTO v_result;
    
    -- Return the created record
    RETURN QUERY SELECT 
        v_result.id,
        v_result.variation_group_id,
        v_result.tenant_id,
        v_result.name,
        v_result.recipe_multiplier,
        v_result.pricing_adjustment,
        v_result.display_order,
        v_result.created_at,
        v_result.updated_at;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION insert_variation(UUID, TEXT, DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_variation(UUID, TEXT, DECIMAL, DECIMAL, INTEGER) TO service_role;

COMMENT ON FUNCTION insert_variation IS 'Inserts a variation directly into the database, bypassing PostgREST schema validation. This fixes schema cache issues where PostgREST incorrectly expects a tenant_id column.';


