-- Restaurant Management System Database Schema
-- Multi-tenant architecture with Row Level Security (RLS)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TENANT & BRANCH MANAGEMENT
-- ============================================

-- Tenants table (Restaurant owners)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    logo_url TEXT,
    primary_color VARCHAR(7),
    default_currency VARCHAR(3) DEFAULT 'IQD',
    timezone VARCHAR(50) DEFAULT 'Asia/Baghdad',
    fiscal_year_start DATE,
    vat_number VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Branches table
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    code VARCHAR(50) NOT NULL,
    address_en TEXT,
    address_ar TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Iraq',
    phone VARCHAR(50),
    email VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    manager_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, code)
);

-- ============================================
-- USER MANAGEMENT
-- ============================================

-- Users table (Employees - separate from Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supabase_auth_id UUID UNIQUE, -- Links to Supabase auth.users
    email VARCHAR(255) UNIQUE NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL, -- super_admin, tenant_owner, manager, cashier, kitchen_staff, waiter, delivery
    employee_id VARCHAR(50),
    photo_url TEXT,
    national_id VARCHAR(100),
    date_of_birth DATE,
    employment_type VARCHAR(50), -- full_time, part_time, contract
    joining_date DATE,
    salary DECIMAL(12, 2),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- User branch assignments
CREATE TABLE user_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, branch_id)
);

-- ============================================
-- POS & OPERATIONS
-- ============================================

-- Counters (POS stations)
CREATE TABLE counters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(branch_id, code)
);

-- Tables
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_number VARCHAR(50) NOT NULL,
    seating_capacity INTEGER DEFAULT 4,
    table_type VARCHAR(50) DEFAULT 'regular', -- regular, vip, outdoor
    qr_code TEXT,
    status VARCHAR(50) DEFAULT 'available', -- available, occupied, reserved, out_of_service
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(branch_id, table_number)
);

-- ============================================
-- MENU MANAGEMENT
-- ============================================

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description_en TEXT,
    description_ar TEXT,
    image_url TEXT,
    category_type VARCHAR(50) DEFAULT 'food', -- food, beverage, dessert
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Food Items
CREATE TABLE food_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description_en TEXT,
    description_ar TEXT,
    image_url TEXT,
    base_price DECIMAL(12, 2) NOT NULL,
    stock_type VARCHAR(50) DEFAULT 'unlimited', -- unlimited, limited, daily_limited
    stock_quantity INTEGER DEFAULT 0,
    menu_type VARCHAR(50) DEFAULT 'all_day', -- all_day, breakfast, lunch, dinner, kids_special
    age_limit INTEGER,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Food Item Variations (Size/Options)
CREATE TABLE food_item_variations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    variation_group VARCHAR(255) NOT NULL, -- e.g., "Size"
    variation_name VARCHAR(255) NOT NULL, -- e.g., "Small", "Medium", "Large"
    price_adjustment DECIMAL(12, 2) DEFAULT 0, -- Can be positive or negative
    stock_quantity INTEGER,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add-on Groups
CREATE TABLE add_on_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    selection_type VARCHAR(50) DEFAULT 'multiple', -- single, multiple
    is_required BOOLEAN DEFAULT false,
    min_selections INTEGER DEFAULT 0,
    max_selections INTEGER,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add-ons
CREATE TABLE add_ons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    add_on_group_id UUID NOT NULL REFERENCES add_on_groups(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    price DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Food Item Add-on Groups (Many-to-Many)
CREATE TABLE food_item_add_on_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    add_on_group_id UUID NOT NULL REFERENCES add_on_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(food_item_id, add_on_group_id)
);

-- Food Item Labels (Many-to-Many)
CREATE TABLE food_item_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- spicy, vegetarian, vegan, gluten_free, halal, new, popular, chefs_special
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(food_item_id, label)
);

-- Food Item Discounts
CREATE TABLE food_item_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    discount_type VARCHAR(50) NOT NULL, -- percentage, fixed
    discount_value DECIMAL(12, 2) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reason VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CUSTOMER MANAGEMENT
-- ============================================

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    phone VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    date_of_birth DATE,
    preferred_language VARCHAR(10) DEFAULT 'en', -- en, ar
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(12, 2) DEFAULT 0,
    last_order_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Customer Addresses
CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    address_label VARCHAR(100), -- home, work, other
    address_en TEXT NOT NULL,
    address_ar TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Iraq',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ORDERS
-- ============================================

-- Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    counter_id UUID REFERENCES counters(id) ON DELETE SET NULL,
    table_id UUID, -- No foreign key constraint - allows any table number
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    cashier_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL,
    token_number VARCHAR(50),
    order_type VARCHAR(50) NOT NULL, -- dine_in, takeaway, delivery
    status VARCHAR(50) DEFAULT 'pending', -- pending, preparing, ready, served, completed, cancelled
    payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, paid
    payment_timing VARCHAR(50) DEFAULT 'pay_first', -- pay_first, pay_after
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    delivery_charge DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    special_instructions TEXT,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    placed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE RESTRICT,
    variation_id UUID, -- No foreign key constraint - allows any variation ID
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    subtotal DECIMAL(12, 2) NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order Item Add-ons (Many-to-Many)
CREATE TABLE order_item_add_ons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    add_on_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE RESTRICT,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL, -- cash, card, mobile_wallet, bank_transfer
    payment_provider VARCHAR(50), -- visa, mastercard, zaincash, asia_hawala
    amount DECIMAL(12, 2) NOT NULL,
    transaction_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INVENTORY MANAGEMENT
-- ============================================

-- Ingredients
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category VARCHAR(100), -- vegetables, meats, dairy, spices, etc.
    unit_of_measurement VARCHAR(50) NOT NULL, -- kg, liter, piece, etc.
    current_stock DECIMAL(12, 3) DEFAULT 0,
    minimum_threshold DECIMAL(12, 3) DEFAULT 0,
    cost_per_unit DECIMAL(12, 2) DEFAULT 0,
    storage_location VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Recipes (Food Item - Ingredient relationships)
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(food_item_id, ingredient_id)
);

-- Stock Transactions
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- purchase, usage, adjustment, transfer_in, transfer_out, waste
    quantity DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    reason TEXT,
    supplier_name VARCHAR(255),
    invoice_number VARCHAR(100),
    reference_id UUID, -- Can reference order_id, recipe_id, etc.
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DELIVERY MANAGEMENT
-- ============================================

-- Deliveries
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    delivery_person_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_address_id UUID REFERENCES customer_addresses(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, assigned, out_for_delivery, delivered, cancelled
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,
    actual_delivery_time TIMESTAMP WITH TIME ZONE,
    delivery_charge DECIMAL(12, 2) DEFAULT 0,
    distance_km DECIMAL(8, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- RESERVATIONS
-- ============================================

-- Reservations
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id UUID, -- No foreign key constraint - allows any table number
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255),
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 120,
    number_of_persons INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, seated, completed, cancelled, no_show
    special_requests TEXT,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    seated_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TAXES
-- ============================================

-- Taxes
CREATE TABLE taxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    tax_code VARCHAR(50),
    rate DECIMAL(5, 2) NOT NULL, -- Percentage
    is_active BOOLEAN DEFAULT true,
    applies_to VARCHAR(50) DEFAULT 'order', -- order, category, item
    applies_to_delivery BOOLEAN DEFAULT false,
    applies_to_service_charge BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tax Applications (Many-to-Many for category/item specific taxes)
CREATE TABLE tax_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_id UUID NOT NULL REFERENCES taxes(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    food_item_id UUID REFERENCES food_items(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tax_id, category_id),
    UNIQUE(tax_id, food_item_id),
    CHECK (
        (category_id IS NOT NULL AND food_item_id IS NULL) OR
        (category_id IS NULL AND food_item_id IS NOT NULL)
    )
);

-- ============================================
-- INDEXES
-- ============================================

-- Tenant isolation indexes
CREATE INDEX idx_branches_tenant_id ON branches(tenant_id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX idx_food_items_tenant_id ON food_items(tenant_id);
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_ingredients_tenant_id ON ingredients(tenant_id);
CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_taxes_tenant_id ON taxes(tenant_id);

-- Common query indexes
CREATE INDEX idx_orders_branch_id ON orders(branch_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_food_items_category_id ON food_items(category_id);
CREATE INDEX idx_food_items_is_active ON food_items(is_active);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_stock_transactions_ingredient_id ON stock_transactions(ingredient_id);
CREATE INDEX idx_stock_transactions_transaction_date ON stock_transactions(transaction_date);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_item_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_on_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_item_add_on_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_item_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_item_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_applications ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's tenant_id from JWT
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', true)::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for Tenants
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL
    USING (id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Branches
CREATE POLICY tenant_isolation_branches ON branches
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Users
CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for User Branches
CREATE POLICY tenant_isolation_user_branches ON user_branches
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_branches.user_id
            AND u.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Counters
CREATE POLICY tenant_isolation_counters ON counters
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM branches b
            WHERE b.id = counters.branch_id
            AND b.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Tables
CREATE POLICY tenant_isolation_tables ON tables
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM branches b
            WHERE b.id = tables.branch_id
            AND b.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Categories
CREATE POLICY tenant_isolation_categories ON categories
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Food Items
CREATE POLICY tenant_isolation_food_items ON food_items
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Food Item Variations
CREATE POLICY tenant_isolation_food_item_variations ON food_item_variations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM food_items fi
            WHERE fi.id = food_item_variations.food_item_id
            AND fi.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Add-on Groups
CREATE POLICY tenant_isolation_add_on_groups ON add_on_groups
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Add-ons
CREATE POLICY tenant_isolation_add_ons ON add_ons
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM add_on_groups aog
            WHERE aog.id = add_ons.add_on_group_id
            AND aog.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Food Item Add-on Groups
CREATE POLICY tenant_isolation_food_item_add_on_groups ON food_item_add_on_groups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM food_items fi
            WHERE fi.id = food_item_add_on_groups.food_item_id
            AND fi.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Food Item Labels
CREATE POLICY tenant_isolation_food_item_labels ON food_item_labels
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM food_items fi
            WHERE fi.id = food_item_labels.food_item_id
            AND fi.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Food Item Discounts
CREATE POLICY tenant_isolation_food_item_discounts ON food_item_discounts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM food_items fi
            WHERE fi.id = food_item_discounts.food_item_id
            AND fi.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Orders
CREATE POLICY tenant_isolation_orders ON orders
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Order Items
CREATE POLICY tenant_isolation_order_items ON order_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
            AND o.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Order Item Add-ons
CREATE POLICY tenant_isolation_order_item_add_ons ON order_item_add_ons
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = order_item_add_ons.order_item_id
            AND o.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Payments
CREATE POLICY tenant_isolation_payments ON payments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = payments.order_id
            AND o.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Ingredients
CREATE POLICY tenant_isolation_ingredients ON ingredients
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Recipes
CREATE POLICY tenant_isolation_recipes ON recipes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM food_items fi
            WHERE fi.id = recipes.food_item_id
            AND fi.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Stock Transactions
CREATE POLICY tenant_isolation_stock_transactions ON stock_transactions
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Customers
CREATE POLICY tenant_isolation_customers ON customers
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Customer Addresses
CREATE POLICY tenant_isolation_customer_addresses ON customer_addresses
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM customers c
            WHERE c.id = customer_addresses.customer_id
            AND c.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Deliveries
CREATE POLICY tenant_isolation_deliveries ON deliveries
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = deliveries.order_id
            AND o.tenant_id = get_current_tenant_id()
        )
    );

-- RLS Policies for Reservations
CREATE POLICY tenant_isolation_reservations ON reservations
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Taxes
CREATE POLICY tenant_isolation_taxes ON taxes
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR current_setting('app.is_super_admin', true)::BOOLEAN = true);

-- RLS Policies for Tax Applications
CREATE POLICY tenant_isolation_tax_applications ON tax_applications
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM taxes t
            WHERE t.id = tax_applications.tax_id
            AND t.tenant_id = get_current_tenant_id()
        )
    );

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_counters_updated_at BEFORE UPDATE ON counters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_food_items_updated_at BEFORE UPDATE ON food_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_food_item_variations_updated_at BEFORE UPDATE ON food_item_variations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_add_on_groups_updated_at BEFORE UPDATE ON add_on_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_add_ons_updated_at BEFORE UPDATE ON add_ons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_food_item_discounts_updated_at BEFORE UPDATE ON food_item_discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_taxes_updated_at BEFORE UPDATE ON taxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

