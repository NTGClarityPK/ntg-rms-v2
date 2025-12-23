-- Make food_item_id nullable to support add-on recipes
ALTER TABLE recipes 
ALTER COLUMN food_item_id DROP NOT NULL;

-- Add add_on_id to recipes table to support recipes for add-ons
ALTER TABLE recipes 
ADD COLUMN IF NOT EXISTS add_on_id UUID REFERENCES add_ons(id) ON DELETE CASCADE;

-- Add constraint to ensure either food_item_id or add_on_id is set (but not both)
ALTER TABLE recipes
ADD CONSTRAINT check_recipe_reference 
CHECK (
  (food_item_id IS NOT NULL AND add_on_id IS NULL) OR
  (food_item_id IS NULL AND add_on_id IS NOT NULL)
);

-- Create index for add_on_id
CREATE INDEX IF NOT EXISTS idx_recipes_add_on_id ON recipes(add_on_id);

-- Update RLS policy if needed (recipes already have RLS enabled)
-- The existing policy should work since it checks tenant_id through food_items
-- We may need to add a policy that also checks through add_ons

