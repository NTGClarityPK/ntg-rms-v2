-- Create order_tables junction table to support multiple tables per order
CREATE TABLE IF NOT EXISTS order_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(order_id, table_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_order_tables_order_id ON order_tables(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tables_table_id ON order_tables(table_id);

-- Migrate existing data: if an order has table_id, create an entry in order_tables
-- Only migrate if the table_id exists in the tables table to avoid foreign key violations
INSERT INTO order_tables (order_id, table_id)
SELECT o.id, o.table_id
FROM orders o
INNER JOIN tables t ON o.table_id = t.id
WHERE o.table_id IS NOT NULL
  AND o.order_type = 'dine_in'
  AND o.deleted_at IS NULL
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_tables ot WHERE ot.order_id = o.id AND ot.table_id = o.table_id
  );

