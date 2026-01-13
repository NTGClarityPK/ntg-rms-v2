-- Migration: Ensure Supported Languages Are Active
-- This migration ensures that all four main languages (en, ar, ku, fr) are active in supported_languages table

-- Ensure all four languages are active
UPDATE supported_languages
SET is_active = true,
    updated_at = NOW()
WHERE code IN ('en', 'ar', 'ku', 'fr')
  AND is_active = false;

-- Insert languages if they don't exist (shouldn't happen, but just in case)
INSERT INTO supported_languages (code, name, native_name, is_active, is_default, rtl)
VALUES
    ('en', 'English', 'English', true, true, false),
    ('ar', 'Arabic', 'العربية', true, false, true),
    ('ku', 'Kurdish', 'کوردی', true, false, true),
    ('fr', 'French', 'Français', true, false, false)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    native_name = EXCLUDED.native_name,
    is_active = true, -- Ensure they are active
    rtl = EXCLUDED.rtl,
    updated_at = NOW();

-- Ensure only English is the default language
UPDATE supported_languages
SET is_default = false,
    updated_at = NOW()
WHERE code != 'en' AND is_default = true;

-- Ensure English is the default
UPDATE supported_languages
SET is_default = true,
    updated_at = NOW()
WHERE code = 'en' AND is_default = false;

