-- Migration: Change reference_id from UUID to TEXT in stock_transactions
-- This allows reference_id to accept any string value (order numbers, recipe IDs, custom references, etc.)

ALTER TABLE stock_transactions 
ALTER COLUMN reference_id TYPE TEXT;

