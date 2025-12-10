-- Migration: Auto-create user record when Supabase Auth user is created
-- This is a backup mechanism in case the application signup fails

-- Note: This trigger requires access to auth.users which may have restrictions
-- The primary method should still be through the application signup endpoint

-- Function to handle new user creation
-- This will be called by a webhook or can be set up as a database trigger
-- if Supabase allows triggers on auth.users

-- Since Supabase doesn't allow direct triggers on auth.users,
-- we'll create a function that can be called from application code
-- or set up via Supabase webhooks

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_name TEXT;
  default_tenant_id UUID;
BEGIN
  -- Get user email and metadata
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(user_email, '@', 1)
  );

  -- Check if user already exists in users table
  IF EXISTS (SELECT 1 FROM users WHERE supabase_auth_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Try to find an existing tenant by email
  SELECT id INTO default_tenant_id
  FROM tenants
  WHERE email = user_email
  LIMIT 1;

  -- If no tenant exists, create one
  IF default_tenant_id IS NULL THEN
    INSERT INTO tenants (
      name_en,
      name_ar,
      subdomain,
      email,
      is_active
    )
    VALUES (
      user_name || '''s Restaurant',
      user_name || '''s Restaurant',
      lower(regexp_replace(split_part(user_email, '@', 1), '[^a-z0-9]', '', 'g')),
      user_email,
      true
    )
    RETURNING id INTO default_tenant_id;

    -- Handle subdomain uniqueness (simple approach - add timestamp if needed)
    -- In production, you might want a more sophisticated uniqueness check
  END IF;

  -- Create user record
  INSERT INTO users (
    supabase_auth_id,
    email,
    name_en,
    tenant_id,
    role,
    is_active
  )
  VALUES (
    NEW.id,
    user_email,
    user_name,
    default_tenant_id,
    'tenant_owner',
    true
  )
  ON CONFLICT (supabase_auth_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth user creation
    RAISE WARNING 'Failed to create user record: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Supabase doesn't allow direct triggers on auth.users table
-- To use this function, you would need to:
-- 1. Set up a Supabase webhook that calls this function when a user is created
-- 2. Or call this function manually from your application code after creating the auth user
-- 3. Or use Supabase Edge Functions to handle this

-- For now, the application code handles user creation
-- This function is available as a backup/alternative approach

COMMENT ON FUNCTION handle_new_auth_user() IS 
'Backup function to create user record when Supabase Auth user is created. 
Should be called via webhook or manually from application code.';

