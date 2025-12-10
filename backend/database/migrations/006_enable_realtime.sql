-- Enable Supabase Realtime for orders table
-- This allows real-time updates to be broadcast to all connected clients

-- First, ensure the publication exists (Supabase creates this by default, but check anyway)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Enable Realtime for orders table
-- Use IF NOT EXISTS equivalent by checking if table is already in publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
END $$;

-- Also enable for order_items if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    END IF;
END $$;

-- Verify the tables are in the publication
SELECT 
    pubname as publication,
    tablename as table_name
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('orders', 'order_items');

