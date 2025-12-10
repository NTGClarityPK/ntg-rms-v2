# Database Migrations

This directory contains SQL migration files for the RMS database schema.

## Setup Instructions

### First Time Setup

1. Open your Supabase project dashboard
2. Navigate to SQL Editor
3. Execute the migration files in order:
   - `001_initial_schema.sql` - Creates all tables, indexes, RLS policies, and triggers
   - `002_auto_create_user_trigger.sql` (optional) - Backup function for auto-creating users

### Reset Database (⚠️ Deletes All Data)

If you need to reset the database and start fresh:

1. See `RESET_DATABASE.md` for detailed instructions
2. Quick reset:
   - Run `000_reset_and_migrate.sql` to drop everything
   - Then run `001_initial_schema.sql` to recreate
   - Optionally run `002_auto_create_user_trigger.sql`

## Migration Files

### 000_reset_and_migrate.sql
**⚠️ WARNING: This deletes all data!**
Drops all existing tables, triggers, functions, and policies. Use this before running migrations to start fresh.

### 001_initial_schema.sql
Creates the complete database schema including:
- All tables (tenants, branches, users, orders, menu items, inventory, etc.)
- Indexes for performance
- Row Level Security (RLS) policies for tenant isolation
- Triggers for automatic `updated_at` timestamp updates

### 002_auto_create_user_trigger.sql
Creates a backup function to automatically create user records when Supabase Auth users are created.
**Note**: Supabase doesn't allow direct triggers on `auth.users`, so this function should be called via webhooks or manually from application code.

## Why Supabase Doesn't Auto-Link

**Supabase Auth and your custom tables are separate systems:**
- Supabase Auth manages authentication (login, signup, password reset)
- Your custom `users` table stores application-specific user data (role, tenant_id, etc.)
- **Supabase does NOT automatically create records in your custom tables**

**You must manually create the user record:**
1. When a user signs up, create them in Supabase Auth
2. Then create a corresponding record in your `users` table
3. Link them via `supabase_auth_id`

The application signup endpoint handles this automatically. If it fails, the login endpoint will auto-create the user record as a fallback.

## Important Notes

- **RLS Policies**: All tables have RLS enabled for tenant isolation
- **Service Role Key**: The backend uses the service role key which bypasses RLS. Always filter by `tenant_id` in your queries.
- **Tenant Isolation**: The `get_current_tenant_id()` function is used in RLS policies to filter data by tenant.

## Testing RLS

After running migrations, test that RLS is working:
1. Create a test tenant
2. Create data for that tenant
3. Try to access data from another tenant (should be blocked by RLS)

