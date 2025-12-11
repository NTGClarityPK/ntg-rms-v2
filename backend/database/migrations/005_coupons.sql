-- Coupons table
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_amount DECIMAL(10, 2) DEFAULT 0,
    max_discount_amount DECIMAL(10, 2),
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, code)
);

-- Coupon usage tracking (to ensure one coupon per user)
CREATE TABLE coupon_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coupon_id, customer_id)
);

-- Indexes
CREATE INDEX idx_coupons_tenant_code ON coupons(tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_coupons_active ON coupons(tenant_id, is_active, valid_from, valid_until) WHERE deleted_at IS NULL;
CREATE INDEX idx_coupon_usages_coupon_customer ON coupon_usages(coupon_id, customer_id);
CREATE INDEX idx_coupon_usages_tenant ON coupon_usages(tenant_id);

-- Enable RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons
CREATE POLICY "Users can view coupons for their tenant"
    ON coupons FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can manage coupons for their tenant"
    ON coupons FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- RLS Policies for coupon_usages
CREATE POLICY "Users can view coupon usages for their tenant"
    ON coupon_usages FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "Users can manage coupon usages for their tenant"
    ON coupon_usages FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Insert default coupon code "5" with value 5 IQD for all existing tenants
-- This creates a sample coupon that can be used for testing
DO $$
DECLARE
    tenant_record RECORD;
BEGIN
    FOR tenant_record IN SELECT id FROM tenants WHERE deleted_at IS NULL
    LOOP
        -- Check if coupon already exists for this tenant
        IF NOT EXISTS (
            SELECT 1 FROM coupons 
            WHERE tenant_id = tenant_record.id 
            AND code = '5' 
            AND deleted_at IS NULL
        ) THEN
            INSERT INTO coupons (
                tenant_id,
                code,
                discount_type,
                discount_value,
                min_order_amount,
                is_active,
                valid_from
            ) VALUES (
                tenant_record.id,
                '5',
                'fixed',
                5.00,
                5.00,
                true,
                NOW()
            );
        END IF;
    END LOOP;
END $$;

