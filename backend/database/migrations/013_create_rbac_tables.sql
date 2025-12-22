-- Role-Based Access Control (RBAC) Migration
-- Supports multiple roles per user with fixed viewing and editing capabilities

-- ============================================
-- ROLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE, -- manager, cashier, kitchen_staff, waiter, delivery
    display_name_en VARCHAR(255) NOT NULL,
    display_name_ar VARCHAR(255),
    description TEXT,
    is_system_role BOOLEAN DEFAULT false, -- System roles cannot be deleted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource VARCHAR(100) NOT NULL, -- orders, menu, employees, inventory, reports, settings, etc.
    action VARCHAR(50) NOT NULL, -- view, create, update, delete
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(resource, action)
);

-- ============================================
-- ROLE PERMISSIONS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- ============================================
-- USER ROLES JUNCTION TABLE (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- ============================================
-- INSERT DEFAULT ROLES
-- ============================================
INSERT INTO roles (name, display_name_en, display_name_ar, is_system_role) VALUES
    ('manager', 'Manager', 'مدير', true),
    ('cashier', 'Cashier', 'كاشير', true),
    ('kitchen_staff', 'Kitchen Staff', 'طاقم المطبخ', true),
    ('waiter', 'Waiter', 'نادل', true),
    ('delivery', 'Delivery', 'توصيل', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- INSERT DEFAULT PERMISSIONS
-- ============================================
INSERT INTO permissions (resource, action, description) VALUES
    -- Orders
    ('orders', 'view', 'View orders'),
    ('orders', 'create', 'Create new orders'),
    ('orders', 'update', 'Update existing orders'),
    ('orders', 'delete', 'Delete orders'),
    -- Menu
    ('menu', 'view', 'View menu items'),
    ('menu', 'create', 'Create menu items'),
    ('menu', 'update', 'Update menu items'),
    ('menu', 'delete', 'Delete menu items'),
    -- Employees
    ('employees', 'view', 'View employees'),
    ('employees', 'create', 'Create employees'),
    ('employees', 'update', 'Update employees'),
    ('employees', 'delete', 'Delete employees'),
    -- Inventory
    ('inventory', 'view', 'View inventory'),
    ('inventory', 'create', 'Create inventory items'),
    ('inventory', 'update', 'Update inventory items'),
    ('inventory', 'delete', 'Delete inventory items'),
    -- Reports
    ('reports', 'view', 'View reports'),
    ('reports', 'export', 'Export reports'),
    -- Settings
    ('settings', 'view', 'View settings'),
    ('settings', 'update', 'Update settings'),
    -- Restaurant/Branches
    ('restaurant', 'view', 'View restaurant/branch information'),
    ('restaurant', 'create', 'Create branches'),
    ('restaurant', 'update', 'Update branches'),
    ('restaurant', 'delete', 'Delete branches'),
    -- Customers
    ('customers', 'view', 'View customers'),
    ('customers', 'create', 'Create customers'),
    ('customers', 'update', 'Update customers'),
    ('customers', 'delete', 'Delete customers'),
    -- Deliveries
    ('deliveries', 'view', 'View deliveries'),
    ('deliveries', 'assign', 'Assign deliveries'),
    ('deliveries', 'update', 'Update delivery status'),
    -- Reservations
    ('reservations', 'view', 'View reservations'),
    ('reservations', 'create', 'Create reservations'),
    ('reservations', 'update', 'Update reservations'),
    ('reservations', 'delete', 'Delete reservations')
ON CONFLICT (resource, action) DO NOTHING;

-- ============================================
-- ASSIGN DEFAULT PERMISSIONS TO ROLES
-- ============================================

-- Manager: Full access to everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Cashier: Orders (full), Menu (view), Customers (view/create/update), Reports (view)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'cashier'
AND (
    (p.resource = 'orders' AND p.action IN ('view', 'create', 'update', 'delete')) OR
    (p.resource = 'menu' AND p.action = 'view') OR
    (p.resource = 'customers' AND p.action IN ('view', 'create', 'update')) OR
    (p.resource = 'reports' AND p.action = 'view')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Kitchen Staff: Orders (view/update), Menu (view), Inventory (view)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'kitchen_staff'
AND (
    (p.resource = 'orders' AND p.action IN ('view', 'update')) OR
    (p.resource = 'menu' AND p.action = 'view') OR
    (p.resource = 'inventory' AND p.action = 'view')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Waiter: Orders (view/create/update), Menu (view), Customers (view/create/update), Reservations (view/create/update)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'waiter'
AND (
    (p.resource = 'orders' AND p.action IN ('view', 'create', 'update')) OR
    (p.resource = 'menu' AND p.action = 'view') OR
    (p.resource = 'customers' AND p.action IN ('view', 'create', 'update')) OR
    (p.resource = 'reservations' AND p.action IN ('view', 'create', 'update'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Delivery: Orders (view/update), Deliveries (view/assign/update), Customers (view)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'delivery'
AND (
    (p.resource = 'orders' AND p.action IN ('view', 'update')) OR
    (p.resource = 'deliveries' AND p.action IN ('view', 'assign', 'update')) OR
    (p.resource = 'customers' AND p.action = 'view')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Roles: All users in tenant can view, only managers can modify
CREATE POLICY tenant_isolation_roles ON roles
    FOR SELECT
    USING (true); -- All authenticated users can view roles

CREATE POLICY tenant_managers_modify_roles ON roles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
            AND r.name = 'manager'
        )
    );

-- Permissions: All users can view
CREATE POLICY tenant_isolation_permissions ON permissions
    FOR SELECT
    USING (true);

-- Role Permissions: All users can view
CREATE POLICY tenant_isolation_role_permissions ON role_permissions
    FOR SELECT
    USING (true);

-- User Roles: Users can view their own roles, managers can modify
CREATE POLICY tenant_isolation_user_roles ON user_roles
    FOR SELECT
    USING (
        user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
            AND r.name = 'manager'
        )
    );

CREATE POLICY tenant_managers_modify_user_roles ON user_roles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
            AND r.name = 'manager'
        )
    );

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTION: Get user permissions
-- ============================================
CREATE OR REPLACE FUNCTION get_user_permissions(user_uuid UUID)
RETURNS TABLE(resource VARCHAR, action VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.resource, p.action
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if user has permission
-- ============================================
CREATE OR REPLACE FUNCTION user_has_permission(user_uuid UUID, resource_name VARCHAR, action_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM get_user_permissions(user_uuid) up
        WHERE up.resource = resource_name
        AND up.action = action_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


