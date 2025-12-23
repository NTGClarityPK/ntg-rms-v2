-- Add category field to add_ons table
ALTER TABLE add_ons ADD COLUMN category VARCHAR(255);

-- Add index for better query performance
CREATE INDEX idx_add_ons_category ON add_ons(category);

