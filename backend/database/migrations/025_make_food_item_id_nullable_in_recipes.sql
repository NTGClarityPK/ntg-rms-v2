-- Make food_item_id nullable in recipes table to support add-on recipes
ALTER TABLE recipes 
ALTER COLUMN food_item_id DROP NOT NULL;

-- Add constraint to ensure either food_item_id or add_on_id is set (but not both)
-- Drop the constraint if it exists first
ALTER TABLE recipes
DROP CONSTRAINT IF EXISTS check_recipe_reference;

ALTER TABLE recipes
ADD CONSTRAINT check_recipe_reference 
CHECK (
  (food_item_id IS NOT NULL AND add_on_id IS NULL) OR
  (food_item_id IS NULL AND add_on_id IS NOT NULL)
);


