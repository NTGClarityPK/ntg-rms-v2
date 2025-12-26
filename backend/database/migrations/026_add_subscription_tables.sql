-- Migration: Add subscription management tables
-- Creates subscriptions, subscription_usage, and invoices tables

-- ============================================
-- SUBSCRIPTION MANAGEMENT
-- ============================================

-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL, -- 'starter', 'business', 'enterprise'
    status VARCHAR(20) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'cancelled'
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_method_last4 VARCHAR(4), -- Last 4 digits of card
    payment_method_brand VARCHAR(20), -- Card brand (visa, mastercard, etc.)
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id) -- One subscription per tenant
);

-- Subscription usage tracking (current metrics)
CREATE TABLE subscription_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    branches_used INTEGER DEFAULT 0,
    users_used INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    storage_used_mb INTEGER DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subscription_id) -- One usage record per subscription
);

-- Invoices table
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'paid', 'pending', 'failed'
    invoice_number VARCHAR(100) UNIQUE,
    invoice_pdf_url TEXT,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscription_usage_subscription_id ON subscription_usage(subscription_id);
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);

-- Enable RLS on subscriptions table
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access subscriptions for their tenant
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- Enable RLS on subscription_usage table
ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access usage for their tenant's subscription
CREATE POLICY tenant_isolation_subscription_usage ON subscription_usage
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM subscriptions s 
            WHERE s.id = subscription_usage.subscription_id 
            AND (s.tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true)
        )
    );

-- Enable RLS on invoices table
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access invoices for their tenant
CREATE POLICY tenant_isolation_invoices ON invoices
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

-- Create function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(tenant_uuid UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
    invoice_num VARCHAR(100);
    tenant_count INTEGER;
BEGIN
    -- Get count of invoices for this tenant
    SELECT COALESCE(COUNT(*), 0) INTO tenant_count
    FROM invoices
    WHERE tenant_id = tenant_uuid;
    
    -- Generate invoice number: INV-{YYYYMMDD}-{####}
    invoice_num := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((tenant_count + 1)::TEXT, 4, '0');
    
    RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;


