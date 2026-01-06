-- Migration: Add branch_id to inventory-related tables (ingredients and recipes)
-- This migration adds branch_id to make inventory branch-specific

-- Add branch_id to ingredients table
ALTER TABLE ingredients 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add branch_id to recipes table
ALTER TABLE recipes 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ingredients_branch_id ON ingredients(branch_id);
CREATE INDEX IF NOT EXISTS idx_recipes_branch_id ON recipes(branch_id);

-- Update unique constraint for recipes to include branch_id
-- Recipes should be unique per food_item/ingredient combination per branch
-- Drop the existing unique constraint (it's a constraint, not just an index)
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_food_item_id_ingredient_id_key;

-- Create new unique constraints that include branch_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_food_item_ingredient_branch 
ON recipes(food_item_id, ingredient_id, branch_id) 
WHERE food_item_id IS NOT NULL AND branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_add_on_ingredient_branch 
ON recipes(add_on_id, ingredient_id, branch_id) 
WHERE add_on_id IS NOT NULL AND branch_id IS NOT NULL;

