-- Add waiter_email column to orders table
-- This stores the email of the user who created/took the order
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS waiter_email VARCHAR(255);

-- Add index for filtering orders by waiter email
CREATE INDEX IF NOT EXISTS idx_orders_waiter_email ON orders(waiter_email);


