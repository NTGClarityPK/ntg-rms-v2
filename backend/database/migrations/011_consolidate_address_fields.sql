-- Migration: Consolidate address_en and address_ar into single address field
-- This migration consolidates address fields in branches and customer_addresses tables

-- Branches table
DO $$
BEGIN
    -- Add new address column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'branches' AND column_name = 'address') THEN
        ALTER TABLE branches ADD COLUMN address TEXT;
    END IF;

    -- Migrate data: use address_en if available, otherwise address_ar, otherwise NULL
    UPDATE branches
    SET address = COALESCE(address_en, address_ar)
    WHERE address IS NULL;

    -- Drop old columns
    ALTER TABLE branches DROP COLUMN IF EXISTS address_en;
    ALTER TABLE branches DROP COLUMN IF EXISTS address_ar;
END $$;

-- Customer Addresses table
DO $$
BEGIN
    -- Add new address column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customer_addresses' AND column_name = 'address') THEN
        ALTER TABLE customer_addresses ADD COLUMN address TEXT NOT NULL DEFAULT '';
    END IF;

    -- Migrate data: use address_en if available, otherwise address_ar, otherwise empty string
    UPDATE customer_addresses
    SET address = COALESCE(NULLIF(address_en, ''), NULLIF(address_ar, ''), '')
    WHERE address IS NULL OR address = '';

    -- Make address NOT NULL after migration (remove default if needed)
    ALTER TABLE customer_addresses ALTER COLUMN address SET NOT NULL;
    ALTER TABLE customer_addresses ALTER COLUMN address DROP DEFAULT;

    -- Drop old columns
    ALTER TABLE customer_addresses DROP COLUMN IF EXISTS address_en;
    ALTER TABLE customer_addresses DROP COLUMN IF EXISTS address_ar;
END $$;

