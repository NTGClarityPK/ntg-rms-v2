-- Migration: Add menu_items junction table for many-to-many relationship
-- between menus (menu_type) and food_items
-- This allows a food item to be part of multiple menus

-- Create menu_items junction table
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    menu_type VARCHAR(50) NOT NULL, -- all_day, breakfast, lunch, dinner, kids_special
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(menu_type, food_item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_id ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_type ON menu_items(menu_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_food_item_id ON menu_items(food_item_id);

-- Enable RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access menu_items for their tenant
CREATE POLICY tenant_isolation_menu_items ON menu_items
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- Create trigger to update updated_at
CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing data from food_items.menu_type to menu_items
-- This preserves existing menu assignments
INSERT INTO menu_items (tenant_id, menu_type, food_item_id, display_order, created_at, updated_at)
SELECT 
    fi.tenant_id,
    fi.menu_type,
    fi.id,
    fi.display_order,
    fi.created_at,
    fi.updated_at
FROM food_items fi
WHERE fi.menu_type IS NOT NULL
  AND fi.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM menu_items mi 
    WHERE mi.menu_type = fi.menu_type 
      AND mi.food_item_id = fi.id
  )
ON CONFLICT (menu_type, food_item_id) DO NOTHING;

