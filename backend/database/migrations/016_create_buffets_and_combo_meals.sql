-- Create buffets and combo_meals tables
-- Migration: 016_create_buffets_and_combo_meals.sql

-- ============================================
-- BUFFETS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS buffets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  price_per_person DECIMAL(10, 2) NOT NULL,
  max_persons INTEGER,
  min_persons INTEGER,
  duration INTEGER, -- Duration in minutes
  menu_types JSONB DEFAULT '[]'::jsonb,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(tenant_id, name)
);

-- Create indexes for buffets
CREATE INDEX IF NOT EXISTS idx_buffets_tenant_id ON buffets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buffets_is_active ON buffets(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buffets_display_order ON buffets(display_order);

-- ============================================
-- COMBO MEALS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS combo_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  food_item_ids JSONB DEFAULT '[]'::jsonb,
  menu_types JSONB DEFAULT '[]'::jsonb,
  discount_percentage DECIMAL(5, 2),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(tenant_id, name)
);

-- Create indexes for combo_meals
CREATE INDEX IF NOT EXISTS idx_combo_meals_tenant_id ON combo_meals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_combo_meals_is_active ON combo_meals(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_combo_meals_display_order ON combo_meals(display_order);





