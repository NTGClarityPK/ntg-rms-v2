-- Migration: Remove table and variation foreign key constraints
-- This allows orders to reference any table number and variations without requiring pre-existing records

-- Drop foreign key constraint on orders.table_id
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_table_id_fkey;

-- Drop foreign key constraint on reservations.table_id (if exists)
ALTER TABLE reservations 
DROP CONSTRAINT IF EXISTS reservations_table_id_fkey;

-- Drop foreign key constraint on order_items.variation_id
ALTER TABLE order_items 
DROP CONSTRAINT IF EXISTS order_items_variation_id_fkey;

-- Note: 
-- - table_id can still be used to store table numbers/references but won't enforce referential integrity
-- - variation_id can reference any variation ID without requiring it to exist in food_item_variations
-- This allows flexibility for POS systems where tables and variations can be any value

