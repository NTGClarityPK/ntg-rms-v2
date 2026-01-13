-- Migration: Fix customer phone uniqueness to be per tenant instead of global
-- This ensures that phone numbers are unique per tenant, not globally across all tenants

-- Drop the global unique constraint on phone
-- PostgreSQL creates a unique constraint with the name 'customers_phone_key' when using UNIQUE in column definition
DO $$
BEGIN
    -- Drop the constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customers_phone_key'
    ) THEN
        ALTER TABLE customers DROP CONSTRAINT customers_phone_key;
    END IF;
    
    -- Also check for any other unique constraints/indexes on phone column alone
    -- (in case it was created with a different name)
    DECLARE
        idx_record RECORD;
    BEGIN
        FOR idx_record IN 
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'customers' 
            AND indexdef LIKE '%UNIQUE%'
            AND (
                indexdef LIKE '%phone%' 
                AND indexdef NOT LIKE '%tenant_id%'
                AND indexdef NOT LIKE '%branch_id%'
            )
        LOOP
            EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx_record.indexname);
        END LOOP;
    END;
END $$;

-- Create unique indexes per tenant (and optionally per branch)
-- This ensures phone numbers are unique per tenant, and per tenant+branch when branch_id is provided
-- The indexes respect soft deletes (only applies to non-deleted records)

-- For customers with branch_id: unique per tenant + branch + phone
-- This allows the same phone number in different branches of the same tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_branch_phone_unique 
ON customers(tenant_id, branch_id, phone) 
WHERE deleted_at IS NULL AND branch_id IS NOT NULL;

-- For customers without branch_id: unique per tenant + phone
-- This ensures phone uniqueness across the entire tenant when no branch is specified
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_phone_unique 
ON customers(tenant_id, phone) 
WHERE deleted_at IS NULL AND branch_id IS NULL;

-- Note: The service layer checks for uniqueness per tenant (and optionally per branch when branchId is provided)
-- These indexes ensure the database constraint matches the application logic:
-- - When branch_id is provided: phone must be unique per tenant+branch combination
-- - When branch_id is NULL: phone must be unique per tenant
-- This prevents global uniqueness while allowing proper tenant and branch isolation

