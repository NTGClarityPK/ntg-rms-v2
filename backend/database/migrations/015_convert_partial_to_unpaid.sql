-- Migration to convert all orders with 'partial' payment status to 'unpaid'
-- This removes support for partial payments from the system

UPDATE orders
SET payment_status = 'unpaid'
WHERE payment_status = 'partial';

-- Verify the update (optional - can be removed after verification)
-- SELECT COUNT(*) as remaining_partial_orders 
-- FROM orders 
-- WHERE payment_status = 'partial';




