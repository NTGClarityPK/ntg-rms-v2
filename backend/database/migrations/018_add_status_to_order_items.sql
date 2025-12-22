-- Add status field to order_items table
-- Status can be: 'pending', 'preparing', 'ready'
-- Default is 'pending' for existing items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready'));

-- Update existing order_items to have 'pending' status
UPDATE order_items
SET status = 'pending'
WHERE status IS NULL;

-- Make status NOT NULL after setting defaults
ALTER TABLE order_items
ALTER COLUMN status SET NOT NULL;

-- Add index for faster queries on order_id and status
CREATE INDEX IF NOT EXISTS idx_order_items_order_id_status ON order_items(order_id, status);

