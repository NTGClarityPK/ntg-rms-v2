-- Migration: Add order entity type to translation system
-- This migration adds support for translating order special instructions

-- ============================================
-- UPDATE CHECK CONSTRAINTS
-- ============================================

-- Drop existing check constraint for entity_type
ALTER TABLE translation_metadata 
DROP CONSTRAINT IF EXISTS translation_metadata_entity_type_check;

-- Recreate check constraint with 'order' entity type added
ALTER TABLE translation_metadata 
ADD CONSTRAINT translation_metadata_entity_type_check CHECK (
    entity_type IN (
        'ingredient', 'category', 'food_item', 'addon', 
        'variation', 'addon_group', 'variation_group', 
        'buffet', 'combo_meal', 'menu', 'branch', 'customer',
        'customer_address', 'delivery', 'employee', 'user', 'stock_operation', 
        'invoice', 'tax', 'restaurant',
        'stock_add_reason', 'stock_deduct_reason', 'stock_adjust_reason',
        'order'
    )
);

-- ============================================
-- UPDATE FIELD NAME CHECK CONSTRAINT
-- ============================================

-- Drop existing check constraint for field_name
ALTER TABLE translations 
DROP CONSTRAINT IF EXISTS translations_field_name_check;

-- Recreate check constraint with 'specialInstructions' field added
ALTER TABLE translations 
ADD CONSTRAINT translations_field_name_check CHECK (
    field_name IN (
        'name', 'description', 'title', 'label', 'short_description', 'long_description',
        'address', 'city', 'state', 'country', 'notes', 'storage_location', 'header', 'footer',
        'terms_and_conditions', 'supplier_name', 'reason', 'specialInstructions'
    )
);

-- ============================================
-- UPDATE RLS FUNCTION
-- ============================================

-- Update the check_translation_metadata_access function to handle 'order' entity type
CREATE OR REPLACE FUNCTION check_translation_metadata_access(
    p_entity_type VARCHAR(50),
    p_entity_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN := false;
    v_current_tenant UUID;
    v_table_name TEXT;
    v_query TEXT;
BEGIN
    -- Get current tenant
    v_current_tenant := get_current_tenant_id();
    
    -- Check if super admin
    BEGIN
        IF current_setting('app.is_super_admin', true)::BOOLEAN = true THEN
            RETURN true;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Setting doesn't exist, continue
    END;
    
    -- Map entity types to table names and build appropriate query
    CASE p_entity_type
        WHEN 'ingredient' THEN
            v_table_name := 'ingredients';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'category' THEN
            v_table_name := 'categories';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'food_item' THEN
            v_table_name := 'food_items';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'addon' THEN
            v_table_name := 'add_ons';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I ao JOIN %I aog ON ao.add_on_group_id = aog.id WHERE ao.id = $1 AND aog.tenant_id = $2)', v_table_name, 'add_on_groups');
        WHEN 'addon_group' THEN
            v_table_name := 'add_on_groups';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'variation' THEN
            v_table_name := 'variations';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I v JOIN %I vg ON v.variation_group_id = vg.id WHERE v.id = $1 AND vg.tenant_id = $2)', v_table_name, 'variation_groups');
        WHEN 'variation_group' THEN
            v_table_name := 'variation_groups';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'buffet' THEN
            v_table_name := 'buffets';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'combo_meal' THEN
            v_table_name := 'combo_meals';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'menu' THEN
            v_table_name := 'menus';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'branch' THEN
            v_table_name := 'branches';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'customer' THEN
            v_table_name := 'customers';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'customer_address' THEN
            -- Check through customers table (customer_addresses -> customers -> tenant_id)
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I ca JOIN %I c ON ca.customer_id = c.id WHERE ca.id = $1 AND c.tenant_id = $2)', 'customer_addresses', 'customers');
        WHEN 'delivery' THEN
            -- Check through orders table (deliveries -> orders -> tenant_id)
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I d JOIN %I o ON d.order_id = o.id WHERE d.id = $1 AND o.tenant_id = $2)', 'deliveries', 'orders');
        WHEN 'employee' THEN
            -- Use 'users' table instead of 'employees'
            v_table_name := 'users';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'user' THEN
            -- Use 'users' table for user entity type
            v_table_name := 'users';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'order' THEN
            -- Check through orders table
            v_table_name := 'orders';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL)', v_table_name);
        WHEN 'stock_operation' THEN
            v_table_name := 'stock_operations';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'invoice' THEN
            v_table_name := 'invoices';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'tax' THEN
            v_table_name := 'taxes';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'restaurant' THEN
            -- Use 'tenants' table instead of 'restaurants' - no tenant_id check
            v_table_name := 'tenants';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1)', v_table_name);
        WHEN 'stock_add_reason' THEN
            v_table_name := 'stock_add_reasons';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'stock_deduct_reason' THEN
            v_table_name := 'stock_deduct_reasons';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        WHEN 'stock_adjust_reason' THEN
            v_table_name := 'stock_adjust_reasons';
            v_query := format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', v_table_name);
        ELSE
            RETURN false;
    END CASE;
    
    -- Execute query dynamically with exception handling
    BEGIN
        IF p_entity_type = 'restaurant' THEN
            EXECUTE v_query INTO v_result USING p_entity_id;
        ELSE
            EXECUTE v_query INTO v_result USING p_entity_id, v_current_tenant;
        END IF;
    EXCEPTION 
        WHEN undefined_table THEN
            -- Table doesn't exist yet, deny access by default
            v_result := false;
        WHEN OTHERS THEN
            -- Other errors, deny access for safety
            v_result := false;
    END;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

