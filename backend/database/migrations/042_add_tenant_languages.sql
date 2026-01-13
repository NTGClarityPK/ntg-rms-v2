-- Migration: Add Tenant-Specific Language Management
-- This migration creates a table to track which languages each tenant has enabled
-- Tenants start with only English enabled and can add additional languages

-- ============================================
-- TENANT LANGUAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS tenant_languages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(code),
    enabled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, language_code),
    CONSTRAINT tenant_languages_code_check CHECK (char_length(language_code) >= 2 AND char_length(language_code) <= 10)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tenant_languages_tenant ON tenant_languages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_languages_code ON tenant_languages(language_code);
CREATE INDEX IF NOT EXISTS idx_tenant_languages_tenant_code ON tenant_languages(tenant_id, language_code);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE tenant_languages ENABLE ROW LEVEL SECURITY;

-- Users can only see languages for their tenant
CREATE POLICY tenant_languages_tenant_isolation ON tenant_languages
    FOR ALL
    USING (
        tenant_id = get_current_tenant_id()
        OR current_setting('app.is_super_admin', true)::BOOLEAN = true
    );

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to automatically enable English for new tenants
CREATE OR REPLACE FUNCTION enable_english_for_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
    -- Automatically enable English for new tenants
    INSERT INTO tenant_languages (tenant_id, language_code)
    VALUES (NEW.id, 'en')
    ON CONFLICT (tenant_id, language_code) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enable_english_for_new_tenant
    AFTER INSERT ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION enable_english_for_new_tenant();

-- ============================================
-- MIGRATE EXISTING TENANTS
-- ============================================

-- Enable English for all existing tenants
INSERT INTO tenant_languages (tenant_id, language_code)
SELECT DISTINCT id, 'en'
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_languages tl WHERE tl.tenant_id = tenants.id AND tl.language_code = 'en'
)
ON CONFLICT (tenant_id, language_code) DO NOTHING;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE tenant_languages IS 'Tracks which languages each tenant has enabled. Tenants start with only English and can add additional languages.';
COMMENT ON COLUMN tenant_languages.enabled_at IS 'Timestamp when the language was enabled for this tenant';

