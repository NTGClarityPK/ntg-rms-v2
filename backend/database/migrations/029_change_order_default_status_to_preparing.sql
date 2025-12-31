-- Change default order status from 'pending' to 'preparing'
-- This aligns with the new workflow where orders go directly to preparing

-- Update orders table default
ALTER TABLE orders
ALTER COLUMN status SET DEFAULT 'preparing';

-- Update order_items table default
ALTER TABLE order_items
ALTER COLUMN status SET DEFAULT 'preparing';

-- Note: The check constraint for order_items was already updated in migration 028
-- to include 'served' status

