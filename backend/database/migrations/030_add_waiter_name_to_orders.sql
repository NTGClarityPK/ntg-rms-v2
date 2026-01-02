-- Add waiter_name column to orders table
-- This stores the name of the user who created the order
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS waiter_name VARCHAR(255);

-- Create index for waiter_name (optional, for filtering/searching)
CREATE INDEX IF NOT EXISTS idx_orders_waiter_name ON orders(waiter_name);

