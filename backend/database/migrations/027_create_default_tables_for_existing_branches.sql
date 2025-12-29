-- Migration to create default tables for existing branches that don't have tables
-- This ensures all branches have at least 5 tables (or the number specified in totalTables setting)

DO $$
DECLARE
    branch_record RECORD;
    total_tables_count INTEGER;
    table_num INTEGER;
    existing_table_count INTEGER;
    table_number_str TEXT;
BEGIN
    -- Loop through all active branches
    FOR branch_record IN 
        SELECT b.id, b.tenant_id, b.name
        FROM branches b
        WHERE b.deleted_at IS NULL
        AND b.is_active = true
    LOOP
        -- Get the tenant's totalTables setting
        SELECT COALESCE(
            NULLIF((ts.general->>'totalTables')::INTEGER, 0),
            5
        ) INTO total_tables_count
        FROM tenant_settings ts
        WHERE ts.tenant_id = branch_record.tenant_id
        LIMIT 1;
        
        -- If no settings found, default to 5
        IF total_tables_count IS NULL THEN
            total_tables_count := 5;
        END IF;
        
        -- Count existing tables for this branch
        SELECT COUNT(*) INTO existing_table_count
        FROM tables
        WHERE branch_id = branch_record.id
        AND deleted_at IS NULL;
        
        -- Only create tables if the branch has fewer tables than total_tables_count
        IF existing_table_count < total_tables_count THEN
            -- Create tables starting from 1, skipping any that already exist
            FOR table_num IN 1..total_tables_count LOOP
                table_number_str := table_num::TEXT;
                
                -- Check if this table number already exists
                IF NOT EXISTS (
                    SELECT 1 FROM tables 
                    WHERE branch_id = branch_record.id 
                    AND table_number = table_number_str
                    AND deleted_at IS NULL
                ) THEN
                    -- Insert the table
                    INSERT INTO tables (
                        branch_id,
                        table_number,
                        seating_capacity,
                        table_type,
                        status,
                        created_at,
                        updated_at
                    ) VALUES (
                        branch_record.id,
                        table_number_str,
                        4,
                        'regular',
                        'available',
                        NOW(),
                        NOW()
                    );
                END IF;
            END LOOP;
            
            RAISE NOTICE 'Created default tables for branch % (tenant: %)', branch_record.name, branch_record.tenant_id;
        END IF;
    END LOOP;
END $$;

