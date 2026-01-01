-- Create variation_groups table
CREATE TABLE IF NOT EXISTS variation_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create variations table
CREATE TABLE IF NOT EXISTS variations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variation_group_id UUID NOT NULL REFERENCES variation_groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    recipe_multiplier DECIMAL(10, 4) DEFAULT 1.0 NOT NULL,
    pricing_adjustment DECIMAL(12, 2) DEFAULT 0 NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add variation_id to food_item_variations (optional reference to variations table)
-- Keep existing variation_group and variation_name for backward compatibility
ALTER TABLE food_item_variations 
ADD COLUMN IF NOT EXISTS variation_id UUID REFERENCES variations(id) ON DELETE SET NULL;

-- Add recipe_multiplier to food_item_variations (for custom variations not in variations table)
ALTER TABLE food_item_variations 
ADD COLUMN IF NOT EXISTS recipe_multiplier DECIMAL(10, 4) DEFAULT 1.0;

-- Enable RLS
ALTER TABLE variation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE variations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for variation_groups
CREATE POLICY tenant_isolation_variation_groups ON variation_groups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM tenants t
            WHERE t.id = variation_groups.tenant_id
            AND t.id = current_setting('app.current_tenant_id', true)::UUID
        )
    );

-- RLS Policies for variations
CREATE POLICY tenant_isolation_variations ON variations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM variation_groups vg
            JOIN tenants t ON t.id = vg.tenant_id
            WHERE vg.id = variations.variation_group_id
            AND t.id = current_setting('app.current_tenant_id', true)::UUID
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_variation_groups_tenant_id ON variation_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_variation_groups_deleted_at ON variation_groups(deleted_at);
CREATE INDEX IF NOT EXISTS idx_variations_variation_group_id ON variations(variation_group_id);
CREATE INDEX IF NOT EXISTS idx_variations_deleted_at ON variations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_food_item_variations_variation_id ON food_item_variations(variation_id);

-- Create updated_at triggers
CREATE TRIGGER update_variation_groups_updated_at 
    BEFORE UPDATE ON variation_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variations_updated_at 
    BEFORE UPDATE ON variations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();





