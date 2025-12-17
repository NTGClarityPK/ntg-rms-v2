-- Migration: Consolidate description_en and description_ar into single description field
-- This migration consolidates description fields in categories and food_items tables

-- Categories table
DO $$
BEGIN
    -- Add new description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'categories' AND column_name = 'description') THEN
        ALTER TABLE categories ADD COLUMN description TEXT;
    END IF;

    -- Migrate data: use description_en if available, otherwise description_ar, otherwise NULL
    UPDATE categories
    SET description = COALESCE(description_en, description_ar)
    WHERE description IS NULL;

    -- Drop old columns
    ALTER TABLE categories DROP COLUMN IF EXISTS description_en;
    ALTER TABLE categories DROP COLUMN IF EXISTS description_ar;
END $$;

-- Food Items table
DO $$
BEGIN
    -- Add new description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'food_items' AND column_name = 'description') THEN
        ALTER TABLE food_items ADD COLUMN description TEXT;
    END IF;

    -- Migrate data: use description_en if available, otherwise description_ar, otherwise NULL
    UPDATE food_items
    SET description = COALESCE(description_en, description_ar)
    WHERE description IS NULL;

    -- Drop old columns
    ALTER TABLE food_items DROP COLUMN IF EXISTS description_en;
    ALTER TABLE food_items DROP COLUMN IF EXISTS description_ar;
END $$;

