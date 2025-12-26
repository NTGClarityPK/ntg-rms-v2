-- Migration: Add buffet_id and combo_meal_id to order_items table
-- This allows order_items to reference buffets and combo meals in addition to food items

-- Make food_item_id nullable (since it won't be required for buffets/combo meals)
ALTER TABLE order_items
  ALTER COLUMN food_item_id DROP NOT NULL;

-- Add buffet_id column
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS buffet_id UUID REFERENCES buffets(id) ON DELETE RESTRICT;

-- Add combo_meal_id column
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS combo_meal_id UUID REFERENCES combo_meals(id) ON DELETE RESTRICT;

-- Add a check constraint to ensure at least one of food_item_id, buffet_id, or combo_meal_id is set
ALTER TABLE order_items
  ADD CONSTRAINT order_items_item_type_check 
  CHECK (
    (food_item_id IS NOT NULL)::int + 
    (buffet_id IS NOT NULL)::int + 
    (combo_meal_id IS NOT NULL)::int = 1
  );

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_order_items_buffet_id ON order_items(buffet_id);
CREATE INDEX IF NOT EXISTS idx_order_items_combo_meal_id ON order_items(combo_meal_id);



