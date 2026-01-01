-- Migration to assign roles to existing users based on their current role field
-- This ensures existing users (especially tenant owners) get proper RBAC roles

-- Assign manager role to all tenant_owner users
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'tenant_owner'
AND r.name = 'manager'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign manager role to all users with role = 'manager'
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'manager'
AND r.name = 'manager'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign cashier role to all users with role = 'cashier'
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'cashier'
AND r.name = 'cashier'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign kitchen_staff role to all users with role = 'kitchen_staff'
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'kitchen_staff'
AND r.name = 'kitchen_staff'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign waiter role to all users with role = 'waiter'
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'waiter'
AND r.name = 'waiter'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Assign delivery role to all users with role = 'delivery'
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT 
    u.id,
    r.id,
    NOW()
FROM users u
CROSS JOIN roles r
WHERE u.role = 'delivery'
AND r.name = 'delivery'
AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;







