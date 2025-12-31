-- Add 'served' status to order_items table
-- This allows order items to be marked as served in the kitchen display

-- Drop the existing check constraint
ALTER TABLE order_items
DROP CONSTRAINT IF EXISTS order_items_status_check;

-- Add new check constraint that includes 'served'
ALTER TABLE order_items
ADD CONSTRAINT order_items_status_check 
CHECK (status IN ('pending', 'preparing', 'ready', 'served'));

