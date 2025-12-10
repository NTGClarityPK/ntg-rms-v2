# Restaurant Management System (RMS) - Cursor Development Prompt

## 📋 OVERVIEW
Build a comprehensive, multi-tenant Restaurant Management System targeting the Iraqi and Middle Eastern markets with full Arabic language support and RTL design. The system should be web-responsive, built with modern tech stack, and deployable on both cloud and self-hosted environments using Supabase as the backend.

---

## 🎯 TARGET MARKET & LOCALIZATION

### Primary Markets
- **Primary**: Iraq
- **Secondary**: Middle East region (Saudi Arabia, UAE, Egypt, Jordan, Lebanon)

### Language & Localization Requirements
- **Dual Language Support**: English and Arabic
- **RTL (Right-to-Left) Layout**: Full RTL support for Arabic interface
- **Dynamic Language Switching**: Users can switch between languages without page reload
- **Localized Content**:
  - Date and time formats (Hijri and Gregorian calendars)
  - Currency support (IQD primary, USD, SAR, AED, EGP)
  - Number formatting (Arabic and Western numerals)
  - Prayer times integration (optional feature)
- **Translation Management**: Easy way to add/edit translations for both languages

---

## 🏗️ TECHNICAL ARCHITECTURE

### ⚠️ CRITICAL: UI/UX Reference from Existing Codebase (ntg-rms-old)
**The UI design, component structure, and styling patterns MUST be copied and adapted from the reference codebase that will be provided.** This includes:
- Page layouts and navigation structure
- Form designs and input patterns
- Table and list view components
- Modal and dialog designs
- Button styles and action patterns
- Color schemes and typography
- Mantine component configurations
- Responsive breakpoints and mobile layouts
- RTL implementation patterns

**Do NOT create new UI patterns from scratch. Follow the established design system in the reference code to maintain consistency.**

### Tech Stack (Reference from existing codebase)

#### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: Mantine UI (v7+)
- **Styling**: Mantine + TailwindCSS for custom styles
- **Form Handling**: React Hook Form + Zod validation
- **State Management**: Zustand or React Context
- **Local Storage**: Dexie.js (IndexedDB wrapper) for offline-first architecture
- **Charts/Analytics**: Recharts or Chart.js
- **Date Handling**: date-fns or dayjs (with Arabic locale)
- **Printing**: react-to-print for invoices and kitchen tickets
- **QR Code Generation**: qrcode.react
- **API Communication**: Axios or Fetch to communicate with NestJS backend

#### Backend (Separate Application)
- **Framework**: NestJS (TypeScript)
- **Database**: Supabase PostgreSQL
  - Direct connection via Supabase client
  - Row Level Security (RLS) policies
  - Real-time subscriptions
- **API Architecture**: RESTful APIs with proper versioning
- **Validation**: class-validator + class-transformer
- **Authentication**: JWT tokens + Supabase Auth integration
- **File Upload**: Supabase Storage
- **Background Jobs**: Bull Queue (for sync operations, reports generation)
- **API Documentation**: Swagger/OpenAPI (auto-generated)
- **Caching**: Redis (optional, for high-traffic scenarios)
- **Payment Gateway**: Stripe + local Iraqi payment providers (ZainCash, Asia Hawala)

#### Project Structure
```
/restaurant-management-system
  /frontend (Next.js)
    /app
    /components
    /lib
    /styles
    /public
  
  /backend (NestJS)
    /src
      /modules
        /auth
        /restaurant
        /menu
        /orders
        /inventory
        /employees
        /customers
        /delivery
        /reports
        /settings
      /common
        /decorators
        /filters
        /guards
        /interceptors
        /pipes
      /config
      /database
        /migrations
        /seeds
    /test
```

#### Communication Flow
```
Frontend (Next.js) → REST API → Backend (NestJS) → Supabase PostgreSQL
                                                  ↓
                                            Supabase Storage
                                                  ↓
                                            Supabase Realtime
```

For offline-first:
```
Frontend UI → IndexedDB (Dexie) → Sync Service → Backend API → Supabase
```

### Multi-Tenancy Architecture
- **Model**: Multi-tenant with shared database and tenant isolation via RLS
- **Tenant Identification**: Subdomain-based (e.g., `restaurant-name.yourdomain.com`)
- **Data Isolation**: Strict Row Level Security policies in Supabase
- **Branch Limit**: Maximum 10 branches per tenant (configurable)
- **Tenant Tiers**: Basic, Professional, Enterprise (future scalability)

### Deployment Options

#### Option 1: Cloud Hosted (Recommended)
**Frontend:**
- Vercel for Next.js application
- Environment variables for backend API URL

**Backend:**
- Railway, Render, or AWS ECS for NestJS API
- Environment variables for Supabase connection
- Auto-scaling enabled

**Database & Storage:**
- Supabase Cloud for PostgreSQL + Storage + Auth

**CDN & DNS:**
- Cloudflare

#### Option 2: Self-Hosted
**Frontend:**
- Docker container for Next.js
- Nginx reverse proxy

**Backend:**
- Docker container for NestJS
- PM2 or container orchestration

**Database:**
- Self-hosted Supabase instance
- PostgreSQL with connection pooling

**Load Balancer:**
- Nginx or HAProxy

### Offline-First Architecture with Local Storage Sync

**CRITICAL REQUIREMENT**: The application must work offline and sync with the database when internet is available. This is essential for reliability in areas with unstable internet connections.

#### Local Storage Strategy
- **IndexedDB as Primary Storage**: Use IndexedDB (via Dexie.js or similar) to store structured data locally
- **JSON-based Data Structure**: All data stored as JSON objects for easy serialization and syncing
- **UI Connects to Local Storage First**: The UI layer always reads from and writes to local storage, NOT directly to Supabase
- **Background Sync Service**: A sync service monitors internet connectivity and syncs local changes with Supabase

#### Data Flow Architecture
```
User Action → UI Component → Local Storage (IndexedDB) → Sync Queue → [When Online] → Supabase Database
                                                                     ← [When Online] ← Supabase Database
```

#### Implementation Details

**1. Local Storage Layer (IndexedDB with Dexie.js)**
- Create local database schema mirroring Supabase tables
- Store all operational data: orders, menu items, customers, inventory, etc.
- Use IndexedDB for structured data (better than localStorage for large datasets)
- Maintain sync metadata: `lastSynced`, `syncStatus`, `conflictFlag`

**2. Sync Queue System**
- **Pending Changes Queue**: Track all local changes that need to be synced
  - Action type: CREATE, UPDATE, DELETE
  - Table name
  - Record ID
  - Timestamp
  - Data payload
  - Sync status: PENDING, SYNCING, SYNCED, FAILED
  
- **Conflict Resolution Strategy**:
  - Last-write-wins for most data
  - Special handling for inventory (additive for stock additions)
  - Flag conflicts for manual resolution when necessary
  - For POS orders: Always accept local order (never reject a placed order)

**3. Online/Offline Detection**
```javascript
// Monitor connection status
window.addEventListener('online', startSync);
window.addEventListener('offline', pauseSync);

// Also poll Supabase health endpoint every 30 seconds
// (as browser online/offline can be unreliable)
```

**4. Sync Service Worker**
- Background process that runs continuously
- Checks connection status every 10 seconds
- When online:
  - Push pending changes to Supabase (in batches)
  - Pull latest changes from Supabase
  - Update local storage with server data
  - Mark synced items in queue
- When offline:
  - Queue all changes locally
  - Show "Offline Mode" indicator in UI
  - All operations continue normally (local only)

**5. Critical Data to Sync (Priority Order)**
1. **High Priority** (Sync immediately when online):
   - New orders (POS sales)
   - Payments received
   - Order status changes
   - Table status updates
   
2. **Medium Priority** (Sync within 5 minutes):
   - Inventory adjustments
   - Customer data
   - Employee actions
   
3. **Low Priority** (Sync when bandwidth available):
   - Menu changes
   - Settings updates
   - Report data pulls

**6. Startup Behavior**
- On app load:
  - Check if online
  - Load all data from local IndexedDB (instant UI rendering)
  - If online: Start background sync to get latest changes
  - If offline: Show "Working Offline" banner
  - Display last sync time in UI footer

**7. Data Consistency Rules**
- **Orders**: Never delete an order from local storage until confirmed synced
- **Inventory**: Keep running total locally, sync adjustments incrementally
- **Menu Items**: Pull from server on startup, cache locally, allow offline edits
- **Reports**: Generate from local data, refresh from server when available

**8. Edge Cases to Handle**
- **Multiple Devices**: Same user on multiple devices (sync data across devices)
- **Token Expiry**: Refresh auth token before sync operations
- **Large Data Sets**: Paginated sync for initial data load
- **Storage Limits**: Clean up old synced data (configurable retention: 30 days)
- **Failed Syncs**: Retry with exponential backoff (1s, 5s, 15s, 30s, 1min)
- **Partial Sync Failures**: Log failed items, continue with successful ones

**9. UI Indicators**
- **Connection Status Badge**: Green (Online & Synced) / Yellow (Online, Syncing) / Red (Offline)
- **Last Synced Timestamp**: "Last synced: 2 minutes ago"
- **Sync Progress**: Show progress bar during active sync
- **Pending Changes Count**: "5 changes waiting to sync"
- **Conflict Alerts**: Notify user of any conflicts requiring resolution

**10. Testing Offline Mode**
- Simulate offline by disabling network
- Place orders, update inventory, add customers (all should work)
- Re-enable network
- Verify all changes sync correctly
- Test conflict scenarios

**11. Libraries to Use**
- **Dexie.js**: IndexedDB wrapper with React hooks
- **react-query** or **SWR**: For server state management and caching
- **zustand** or **redux**: For local app state
- **workbox**: Service worker for PWA and offline support

**12. Sync API Endpoints**
```
POST /api/sync/push      // Push local changes to server
GET  /api/sync/pull      // Pull latest changes from server
GET  /api/sync/status    // Check sync health and conflicts
POST /api/sync/resolve   // Resolve conflicts
```

**13. Performance Considerations**
- Batch sync operations (don't sync each change individually)
- Compress sync payloads (gzip)
- Use websockets or server-sent events for real-time updates when online
- Lazy load historical data (only recent orders on startup)
- Index local database properly for fast queries

**14. Security Considerations**
- Encrypt sensitive data in IndexedDB (payment info, customer data)
- Clear local storage on logout
- Implement session timeout for offline mode
- Validate all synced data on server (never trust client data)

This offline-first architecture ensures the restaurant can continue operations even with unreliable internet, with automatic synchronization when connectivity is restored.

---

## 👥 USER ROLES & PERMISSIONS

### Role Hierarchy
1. **Super Admin** (System Level)
   - Manage all tenants
   - System configuration
   - View all analytics

2. **Tenant Owner** (Restaurant Owner)
   - Full access to their restaurant(s)
   - Manage all branches
   - Manage employees and roles
   - View all reports and analytics
   - Billing and subscription management

3. **Manager**
   - Manage assigned branch(es)
   - Employee management within branch
   - Inventory management
   - Reports for assigned branches
   - Cannot access billing/subscription

4. **Cashier**
   - POS operations
   - Process orders and payments
   - View assigned counter only
   - Print invoices
   - Basic customer management

5. **Kitchen Staff**
   - View kitchen display system
   - Update order status
   - View recipes and ingredients
   - Cannot access financial data

6. **Waiter/Server**
   - Take orders via POS
   - Table management
   - View order status
   - Cannot process payments (optional restriction)

7. **Delivery Personnel**
   - View assigned deliveries
   - Update delivery status
   - Navigation to customer location
   - Cannot access other system features

### Permission Matrix
Create a granular permission system where each role has specific permissions for:
- View, Create, Edit, Delete operations on each module
- Access to specific branches
- Financial data visibility
- Report access levels

---

## 🎨 MVP FEATURES (PHASE 1)

### 1. AUTHENTICATION & ONBOARDING

#### Sign Up Process
- **Step 1: Account Creation**
  - Sign up with Email/Password
  - Sign up with Google OAuth
  - Select user type: "Tenant Owner" or "Employee"
  
- **Step 2: Restaurant Basic Info** (For Tenant Owners)
  - Restaurant Name (Arabic & English)
  - Phone Number (with Iraqi country code +964)
  - Subdomain selection (e.g., `my-restaurant.rms.iq`)
  - Logo upload (max 2MB, square format recommended)
  
- **Step 3: Optional Onboarding Tour**
  - Interactive guide with highlights
  - Skip option available
  - Progress indicators

#### Login System
- Email/Password login
- Google OAuth
- Remember me functionality
- Password reset via email
- Multi-factor authentication (optional for security)

---

### 2. DASHBOARD (Central Hub)

#### Dashboard Layout
- **Top Navigation Bar**:
  - Restaurant logo and name
  - Branch selector (if multiple branches)
  - Language toggle (EN/AR)
  - Notifications bell
  - User profile menu
  
- **Sidebar Navigation** (Collapsible):
  - Dashboard (home)
  - Restaurant Management
  - Menu Setup
  - POS Management
  - Orders Management
  - Kitchen Display
  - Table Management
  - Inventory Management
  - Employee Management
  - Customer Management
  - Delivery Management
  - Reports & Analytics
  - Settings

#### Dashboard Widgets (Overview Cards)
- **Today's Sales**: Total revenue for current day
- **Today's Orders**: Count of orders (Dine-in, Takeaway, Delivery)
- **Active Tables**: Currently occupied tables
- **Pending Orders**: Orders waiting to be prepared/delivered
- **Low Stock Alerts**: Ingredients below threshold
- **Popular Items**: Best-selling dishes today
- **Revenue Chart**: Last 7/30 days revenue trend
- **Quick Actions**: Shortcuts to common tasks

---

### 3. RESTAURANT MANAGEMENT

#### 3.1 Business Information Setup
- **Basic Details**:
  - Restaurant Name (Arabic & English)
  - Phone Number
  - Email Address
  - Website URL (optional)
  
- **Location**:
  - Country (default: Iraq)
  - City/Governorate
  - State/Province
  - Full Address (Arabic & English)
  - Google Maps integration (pin location on map)
  
- **Business Settings**:
  - Time Zone (Iraq Standard Time default)
  - Fiscal Year Start
  - Default Currency (IQD)
  - Business Hours (per day of week)
  - VAT/Tax Registration Number
  
- **Branding**:
  - Logo upload/update
  - Primary brand color
  - Receipt header/footer text
  
- **Save/Update Button**: Save changes with validation

#### 3.2 Branch Management
- **Default Branch**: Created automatically on signup
- **Create New Branch**:
  - Branch Name (Arabic & English)
  - Branch Code (auto-generated, editable)
  - Address & Location
  - Contact Phone
  - Manager assignment
  - Operating Hours
  - Status (Active/Inactive)
  
- **Branch List View**:
  - Table with columns: Name, Code, Manager, City, Status, Actions
  - Search and filter
  - Quick status toggle
  - Edit/Delete options
  
- **Branch Switching**: Easy toggle between branches in header

#### 3.3 Counter Management (POS Stations)
- **Default Counter**: Auto-created with first branch
- **Create Counter**:
  - Counter Name (e.g., "Counter 1", "Drive-Thru Counter")
  - Assigned Branch
  - Assigned Cashier(s)
  - Printer assignment (receipt, kitchen)
  - Status (Active/Inactive)
  
- **Counter List**:
  - View all counters per branch
  - Edit/Delete options
  - Current cashier working status

#### 3.4 Table Management
- **Table Setup**:
  - Table Number
  - Branch assignment
  - Seating Capacity (number of persons)
  - Table Type (Regular, VIP, Outdoor, etc.)
  - QR Code (auto-generated for each table)
  - Status (Available, Occupied, Reserved, Out of Service)

---

### 4. MENU SETUP MANAGEMENT

#### 4.1 Category Management
- **Create Category**:
  - Category Name (Arabic & English)
  - Description (Arabic & English)
  - Category Image (optional)
  - Category Type (Food, Beverage, Dessert, etc.)
  - Menu Selection (if multiple menus exist)
  - Availability Status (Active/Inactive toggle)
  - Display Order (sorting position)
  
- **Subcategories**:
  - Nested under main categories
  - Same fields as category
  - Visual hierarchy in list view
  
- **Category List**:
  - Grid or list view toggle
  - Search and filter
  - Bulk actions (activate/deactivate, delete)
  - Three-dot menu for quick actions:
    - Quick View (modal with details)
    - Edit
    - Duplicate
    - Move to Trash
    - Status Toggle

#### 4.2 Food Item Management
- **Create Food Item - Step 1: Basic Information**:
  - Food Name (Arabic & English)
  - Category Selection (dropdown with option to create new)
  - Description (Arabic & English)
  - Menu Type (All Day, Breakfast, Lunch, Dinner, Kids Special)
  - Age Limit (if applicable, e.g., for items with alcohol)
  - Food Image Upload (multiple images support)
  - Availability Status Toggle
  - Display Order
  
- **Create Food Item - Step 2: Pricing & Variations**:
  - Base Price
  - Stock Type:
    - Unlimited
    - Limited (enter quantity)
    - Daily Limited (resets each day)
  - **Variations** (Size/Options):
    - Enable variations toggle
    - Add variation groups (e.g., "Size")
    - Add variations within group:
      - Variation name (Small, Medium, Large)
      - Additional price (+ or -)
      - Stock status per variation
  - **Discounts**:
    - Discount Type (Percentage or Fixed Amount)
    - Discount Value
    - Start Date & Time
    - End Date & Time
    - Discount reason/label
  
- **Create Food Item - Step 3: Additional Options** (Optional):
  - **Add-on Groups**: Select from pre-created add-on groups
  - **Labels**: Spicy, Vegetarian, Vegan, Gluten-Free, Chef's Special, etc.
  - **Cuisine Type**: Iraqi, Lebanese, Turkish, Italian, Fast Food, etc.
  - **Recipe & Ingredients**: Link to inventory ingredients
  
- **Food List View**:
  - Grid view with images
  - List view with details
  - Search by name
  - Filter by: Category, Status, Menu Type, Label
  - Bulk actions: Update status, Delete, Export
  - Import existing data (CSV/Excel)
  - View Trash: Restore or permanently delete items

#### 4.3 Add-on Setup
- **Create Add-on Group**:
  - Group Name (e.g., "Extra Toppings", "Drinks", "Sides")
  - Selection Type:
    - Single Selection (radio buttons)
    - Multiple Selection (checkboxes)
    - Required or Optional
  - Minimum & Maximum selections
  
- **Create Add-ons**:
  - Add-on Name (Arabic & English)
  - Price
  - Add to specific group
  - Availability status
  
- **Example Structure**:
  ```
  Group: Extra Toppings (Multiple Selection, Optional, Max: 3)
    - Extra Cheese (+500 IQD)
    - Mushrooms (+300 IQD)
    - Olives (+200 IQD)
  
  Group: Drink Size (Single Selection, Required)
    - Small (+0 IQD)
    - Medium (+500 IQD)
    - Large (+1000 IQD)
  ```

#### 4.4 Cuisine Management
- Create cuisine types (Iraqi, Arabic, Turkish, Italian, etc.)
- Assign to food items
- Filter menu by cuisine

#### 4.5 Label Setup
- **Default Labels**: Spicy 🌶️, Vegetarian 🥗, Vegan 🌱, Gluten-Free, Halal, New, Popular, Chef's Special
- **Custom Labels**: Create custom labels with icons/colors
- **Bulk Operations**: Assign/remove labels from multiple items
- **Status Toggle**: Show/hide labels

#### 4.6 Menu Type Setup
- **Create Menu Types**:
  - All Day Menu
  - Breakfast Menu (with time restrictions)
  - Lunch Menu (11 AM - 4 PM)
  - Dinner Menu (4 PM - 11 PM)
  - Kids Special
  - Brunch Special
  - Ramadan Special (seasonal)
  
- **Time-based Activation**: Automatically show/hide based on time

#### 4.7 Menu Management
- **Default Menu**: Auto-created, linked to all food items initially
- **Create Multiple Menus**:
  - Menu Name (e.g., "Summer Menu", "Iftar Menu")
  - Assign food items
  - Assign to specific branches
  - Activate/Deactivate
- **Note**: Only ONE menu can be active per branch at a time
- **Menu Preview**: Visual preview of menu as customers see it

---

### 5. POINT OF SALE (POS) SYSTEM

#### 5.1 POS Layout
- **Left Panel** (60% width):
  - **Top Bar**:
    - Branch selector
    - Counter selector
    - Menu/Category tabs or dropdown
  - **Category Filter**: Horizontal scrollable category buttons
  - **Food Items Grid**:
    - Large, clickable cards with:
      - Food image
      - Name (show selected language)
      - Price
      - Stock status indicator
      - Quick add to cart button
  - **Search Bar**: Search food items by name
  
- **Right Panel** (40% width):
  - **Order Details Section**:
    - Order Type selector (Dine-in, Takeaway, Delivery)
    - Token Number (auto-generated, editable)
    - Customer Information:
      - Walk-in customer (default)
      - Or select existing customer
      - Or create new customer (Name, Phone, Email)
    - Table Selection (if Dine-in):
      - Table selector (shows available tables)
      - Number of persons
  
  - **Cart Items List**:
    - Each item shows:
      - Food name
      - Selected variations
      - Selected add-ons
      - Quantity (+ / - buttons)
      - Unit price
      - Subtotal
      - Remove button
    - Item notes/special instructions field
  
  - **Billing Section**:
    - Subtotal
    - Discounts:
      - Extra discount (manual input - amount or %)
      - Coupon discount (enter coupon code)
    - VAT/Tax (if enabled)
    - Delivery charges (if applicable)
    - **Grand Total** (large, bold)
  
  - **Payment Section**:
    - Payment Timing:
      - Pay First (default)
      - Pay After Eating
    - Payment Method:
      - Cash
      - Card (Visa/MasterCard)
      - Mobile Wallet (ZainCash, etc.)
      - Split Payment (multiple methods)
    - Received Amount (for cash)
    - Change to return
  
  - **Action Buttons** (Bottom):
    - Clear Cart
    - **Place Order** (Primary button)

#### 5.2 Order Placement Flow
1. Click "Place Order" button
2. Validate cart and payment
3. Create order in database
4. Show confirmation popup with options:
   - **Print Invoice** (Customer Copy)
   - **Print Kitchen Ticket** (Kitchen Copy)
   - **Print All**
   - **Skip Printing**
   - **View Order Details**
5. Clear cart after successful order
6. Auto-generate new token number

#### 5.3 Order Types & Configurations
- **Dine-in**:
  - Requires table selection
  - Links order to table
  - Updates table status to "Occupied"
  
- **Takeaway**:
  - No table required
  - Estimated pickup time
  - Customer can wait or return later
  
- **Delivery**:
  - Requires customer full address
  - Delivery charges calculated (flat rate or distance-based)
  - Assign delivery personnel
  - Estimated delivery time
  - Delivery status tracking

#### 5.4 POS Additional Features
- **Keyboard Shortcuts**: Quick navigation and actions
- **Touch-optimized**: Works well on tablets
- **Multiple Concurrent Orders**: Open multiple order tabs
- **Customer Display**: Optional second screen showing order to customer
- **Cash Drawer Integration**: Open cash drawer after payment
- **Receipt Printer Integration**: Direct thermal printer support

---

### 6. ORDER MANAGEMENT

#### 6.1 Orders Dashboard
- **Order List View**:
  - Tabs for order status:
    - All Orders
    - Pending (New)
    - Preparing (Kitchen)
    - Ready
    - Completed
    - Cancelled
  - Table columns:
    - Order ID / Token Number
    - Order Type (icon indicator)
    - Customer Name
    - Table Number (if dine-in)
    - Items Count
    - Total Amount
    - Order Time
    - Status Badge
    - Actions
  - **Filters**:
    - Date range
    - Branch
    - Order type
    - Payment status
    - Search by order ID or customer

#### 6.2 Order Details Page
- **Order Information**:
  - Order ID & Token Number
  - Order date & time
  - Branch and counter
  - Cashier name
  
- **Customer Information**:
  - Customer name and contact
  - Table info (if dine-in)
  - Address (if delivery)
  
- **Order Items**:
  - List of items with:
    - Image thumbnail
    - Name
    - Variations & add-ons
    - Quantity
    - Unit price
    - Subtotal
    - Special notes
  
- **Billing Summary**:
  - Subtotal
  - Discounts applied
  - VAT/Tax
  - Delivery charges
  - **Grand Total**
  
- **Payment Information**:
  - Payment method
  - Payment status (Paid/Unpaid/Partial)
  - Payment time
  
- **Order Timeline/History**:
  - Order placed at [time]
  - Payment received at [time]
  - Sent to kitchen at [time]
  - Preparation started at [time]
  - Order ready at [time]
  - Served/Delivered at [time]
  
- **Actions**:
  - Update order status
  - Print/Re-print invoice
  - Edit order (if not yet prepared)
  - Cancel order (with reason)
  - Refund (full or partial)

#### 6.3 Order Status Management
- Kitchen staff updates status:
  - Preparing → Ready
- Waiter updates:
  - Ready → Served
- Delivery person updates:
  - Out for Delivery → Delivered
- Real-time status updates across all devices

---

### 7. KITCHEN DISPLAY SYSTEM (KDS)

#### 7.1 KDS Layout
- **Full-screen display optimized for kitchen monitor**
- **Order Cards Grid**:
  - Show pending and preparing orders
  - Each card displays:
    - **Token Number** (large)
    - Order Type icon
    - Table Number (if applicable)
    - Order Time (with elapsed time indicator)
    - **Items List**:
      - Item name
      - Quantity
      - Variations & add-ons
      - Special instructions (highlighted)
    - **Action Button**: "Mark as Ready"
  
- **Priority Indicators**:
  - Color-coded based on waiting time:
    - Green: < 5 minutes
    - Yellow: 5-10 minutes
    - Red: > 10 minutes (urgent)
  
- **Sound Alerts**: Notification sound for new orders

#### 7.2 KDS Features
- **Auto-refresh**: Real-time updates without page reload
- **Order Sorting**: By time or priority
- **Filter by Order Type**: Show only dine-in, takeaway, or delivery
- **Completed Orders**: Moves to bottom or auto-hides after 30 seconds
- **Kitchen Printers**: Auto-print new orders
- **Multi-station Support**: Different screens for different kitchen sections (Grill, Salad, Desserts, etc.)

---

### 8. TABLE MANAGEMENT

#### 8.1 Table Overview
- **Table List View**: Shows all tables for selected branch
- **Table Status Colors**:
  - Green: Available
  - Red: Occupied
  - Blue: Reserved
  - Gray: Out of Service
- **Click on Table**:
  - View current order (if occupied)
  - View reservation details (if reserved)
  - Assign new order
  - Change status

#### 8.2 Table Actions
- **Reserve Table**:
  - Customer name and contact
  - Number of persons
  - Reservation date & time
  - Duration
  - Special requests
  - Confirmation via SMS (optional)
  
- **Assign Order to Table**:
  - From POS or order list
  - Automatic status change to "Occupied"
  
- **Transfer Order**:
  - Move order from one table to another
  - Merge orders from multiple tables
  
- **Clear Table**:
  - Mark as available after payment
  - Auto-clear after order completion

#### 8.3 Reservation Management
- **Reservation List**:
  - Upcoming reservations
  - Past reservations
  - Cancelled reservations
- **Actions**:
  - Confirm/Cancel reservation
  - Edit reservation details
  - Send reminder SMS to customer
  - Mark as arrived/no-show

---

### 9. INVENTORY MANAGEMENT

#### 9.1 Ingredient Management
- **Create Ingredient**:
  - Ingredient Name (Arabic & English)
  - Category (Vegetables, Meats, Dairy, Spices, etc.)
  - Unit of Measurement (kg, liter, piece, etc.)
  - Current Stock Quantity
  - Minimum Stock Threshold (alert level)
  - Cost per Unit
  - Storage Location
  - Status (Active/Inactive)
  
- **Ingredient List**:
  - Search and filter by category
  - Low stock alerts highlighted
  - Bulk import from CSV/Excel
  - Export inventory report

#### 9.2 Stock Management
- **Add Stock** (Purchase Entry):
  - Select ingredient
  - Quantity added
  - Unit cost
  - Total cost
  - Purchase date
  - Supplier (optional for Phase 1)
  - Invoice number
  
- **Deduct Stock** (Usage/Waste):
  - Manual deduction
  - Automatic deduction based on recipe usage
  - Reason (Used in production, Damaged, Expired, etc.)
  
- **Stock Adjustment**:
  - Physical count vs system count
  - Adjust with reason
  
- **Stock Transfer**:
  - Transfer between branches
  - Transfer between storage locations

#### 9.3 Recipe Management
- **Link Ingredients to Food Items**:
  - Food item selection
  - Add ingredients with quantities
  - Calculate cost per dish
  - Automatic stock deduction when order placed
  
- **Example**:
  ```
  Food: Chicken Burger
  Recipe:
    - Chicken Breast: 200g
    - Burger Bun: 1 piece
    - Lettuce: 20g
    - Tomato: 30g
    - Cheese: 50g
    - Special Sauce: 30ml
  
  Total Cost: 2,500 IQD
  Selling Price: 8,000 IQD
  Profit Margin: 68.75%
  ```

#### 9.4 Inventory Reports
- **Current Stock Report**: All ingredients with quantities
- **Low Stock Report**: Items below threshold
- **Stock Value Report**: Total inventory value
- **Stock Movement Report**: In/Out transactions over time
- **Waste Report**: Damaged items

---

### 10. EMPLOYEE MANAGEMENT

#### 10.1 Employee Registration
- **Create Employee**:
  - Personal Information:
    - Full Name (Arabic & English)
    - Employee ID (auto-generated)
    - Phone Number
    - Email
    - Date of Birth
    - National ID / Passport Number
    - Photo
  - Employment Details:
    - Role (Manager, Cashier, Kitchen Staff, Waiter, Delivery)
    - Assigned Branch(es)
    - Assigned Counter (for cashiers)
    - Department
    - Employment Type (Full-time, Part-time, Contract)
    - Joining Date
    - Salary (optional, can be hidden from some roles)
  - Login Credentials:
    - Auto-generate email for login
    - Set initial password (employee must change on first login)
  - Status: Active/Inactive

#### 10.2 Employee List & Management
- **Employee Directory**:
  - Search by name, ID, or role
  - Filter by branch, role, status
  - Export employee list
  
- **Employee Profile**:
  - View all details
  - Edit information
  - View work history
  - View attendance (future feature)
  - View sales performance (for cashiers/waiters)
  
- **Actions**:
  - Activate/Deactivate employee
  - Reset password
  - Change role or branch assignment
  - Delete employee (soft delete, keep historical data)

#### 10.3 Employee Permissions
- Set granular permissions per role
- Custom permission sets for specific employees
- Permission categories:
  - POS operations
  - Order management
  - Inventory access
  - Reports viewing
  - Employee management
  - Financial data access
  - Settings modification

#### 10.4 Employee Performance (Basic)
- Total sales processed (for cashiers)
- Total orders served (for waiters)
- Total deliveries completed (for delivery personnel)
- Average order value
- Customer ratings (if feedback system enabled)

---

### 11. CUSTOMER MANAGEMENT

#### 11.1 Customer Registration
- **Add Customer**:
  - Name (Arabic & English)
  - Phone Number (primary identifier)
  - Email (optional)
  - Address (for delivery)
  - Date of Birth (optional, for birthday offers)
  - Preferred language
  - Customer Notes
  
- **Auto-create from POS**:
  - When placing order, option to create customer profile
  - Basic info: name and phone

#### 11.2 Customer Database
- **Customer List**:
  - Search by name or phone
  - Filter by: Registration date, Total orders, Total spent
  - Export customer data (GDPR compliant)
  
- **Customer Profile**:
  - Personal information
  - **Order History**:
    - List of all orders with dates and amounts
    - Favorite items
    - Most ordered items
  - **Statistics**:
    - Total orders
    - Total amount spent
    - Average order value
    - Last order date
    - Frequency (repeat customer indicator)
  - **Addresses**: Multiple delivery addresses
  - **Actions**:
    - Edit information
    - View order history
    - Send SMS/Email notification
    - Apply loyalty discount (if loyalty system enabled)

#### 11.3 Customer Loyalty (Basic)
- **Points System** (Optional):
  - Earn points per order amount (e.g., 1 point per 1000 IQD)
  - Redeem points for discounts
  - Points expiry settings
  
- **Customer Tiers**:
  - Regular: 0-10 orders
  - Silver: 11-50 orders (5% discount)
  - Gold: 51-100 orders (10% discount)
  - Platinum: 100+ orders (15% discount)

#### 11.4 Customer Communications
- **SMS Notifications** (via local SMS gateway):
  - Order confirmation
  - Order ready notification
  - Delivery status updates
  - Special offers
  
- **Email Marketing** (Basic):
  - Welcome email
  - Birthday offers
  - Promotional campaigns

---

### 12. DELIVERY MANAGEMENT

#### 12.1 Delivery Personnel Management
- Register delivery staff (same as employee management)
- Assign delivery zone (area of coverage)
- Vehicle information (bike, car, etc.)
- License details
- Active/Inactive status

#### 12.2 Delivery Order Management
- **Delivery Dashboard**:
  - **New Delivery Orders**: Orders ready for pickup
  - **Assigned Deliveries**: Currently with delivery personnel
  - **Completed Deliveries**: Delivered orders
  - **Cancelled Deliveries**
  
- **Assign Delivery**:
  - Select order
  - Choose delivery personnel (from available staff)
  - Auto-assign based on zone or workload
  - Estimated delivery time
  
- **Delivery Details**:
  - Order information
  - Customer name and contact
  - Delivery address (with map integration)
  - Order items summary
  - COD amount (if payment after delivery)
  - Delivery instructions

#### 12.3 Delivery Tracking
- **Real-time Status Updates**:
  - Order Ready → Out for Delivery → Delivered
  - Delivery person can update status from mobile
  
- **GPS Tracking** (Optional):
  - Live location of delivery personnel
  - Show on map for restaurant and customer
  - ETA updates
  
- **Delivery Performance**:
  - Average delivery time
  - On-time delivery percentage
  - Total deliveries per person
  - Customer ratings

#### 12.4 Delivery Charges
- **Flat Rate**: Fixed charge per delivery
- **Distance-based**: Calculate based on distance from restaurant
- **Zone-based**: Different charges for different areas
- **Free Delivery**: Above minimum order amount
- **Configurable per branch**

---

### 13. REPORTS & ANALYTICS

#### 13.1 Sales Reports
- **Daily Sales Report**:
  - Total revenue
  - Number of orders
  - Average order value
  - Breakdown by order type (Dine-in, Takeaway, Delivery)
  - Payment method breakdown
  - Hourly sales chart
  
- **Sales Summary (Date Range)**:
  - Select date range
  - Total revenue
  - Total orders
  - Top-selling items
  - Revenue by category
  - Revenue by branch
  - Comparison with previous period
  
- **Sales by Employee**:
  - Cashier performance
  - Waiter performance
  - Total sales per employee

#### 13.2 Order Reports
- **Order Statistics**:
  - Total orders
  - Orders by status
  - Orders by type
  - Average order preparation time
  - Order completion rate
  
- **Order Details Report**:
  - Filterable by date, branch, type
  - Exportable to CSV/Excel
  - Each order: ID, Amount, Discount, Tax, Status
  - Click to view full order details

#### 13.3 Customer Reports
- **Customer Statistics**:
  - Total customers
  - New customers (period)
  - Returning customers rate
  - Average customer lifetime value
  
- **Customer Details Report**:
  - Customer name
  - Total orders
  - Total spent
  - Last order date
  - Favorite items
  - Click to view customer profile

#### 13.4 Inventory Reports
- **Current Stock Report**: All ingredients with quantities
- **Stock Movement Report**: In/Out transactions over period
- **Low Stock Report**: Items below threshold
- **Ingredient Purchase Cost Report**:
  - Ingredient name
  - Total quantity purchased
  - Total cost
  - Cost per unit
  - Filter by date range

#### 13.5 Financial Reports
- **Transaction History**:
  - All financial transactions
  - Order payments
  - Purchase payments
  - Filter by type, date, branch
  - Search by transaction ID
  - Export to CSV/Excel
  
- **Income Statement** (Simplified):
  - Revenue
  - Cost of Goods Sold (from recipes)
  - Gross Profit
  - Net Profit

#### 13.6 VAT/Tax Reports
- **Tax Summary**:
  - Total tax collected
  - Tax by order type
  - Tax by branch
  - Filter by date range
  
- **Detailed Tax Report**:
  - Order ID
  - Order value
  - Tax amount
  - Tax rate applied
  - Date and time
  - Breakdown of applicable taxes

#### 13.7 Performance Analytics
- **Dashboard Charts**:
  - Revenue trend (line chart)
  - Sales by category (pie chart)
  - Sales by hour (bar chart)
  - Top 10 items (horizontal bar)
  - Customer acquisition (line chart)
  
- **Peak Hours Analysis**: Identify busiest times
- **Menu Performance**: Best and worst performing items
- **Profitability Analysis**: Profit margin by item/category

#### 13.8 Report Export & Scheduling
- Export formats: PDF, Excel, CSV
- Schedule automatic report generation
- Email reports to management
- Print reports

---

### 14. VAT/TAX SYSTEM

#### 14.1 Tax Setup
- **Create Tax Types**:
  - Tax Name (e.g., VAT, Sales Tax, Service Charge)
  - Tax Rate (percentage)
  - Tax Code/Reference
  - Status (Active/Inactive)
  
- **Example Tax Types for Iraq**:
  - Sales Tax: 15%
  - Service Charge: 5%
  - Tourism Tax: 3%

#### 14.2 Tax Configuration
- **Enable/Disable Tax System**: Global toggle
- **Tax Calculation Method**:
  - **Option 1**: Tax Included in Price
    - Food prices already include tax
    - Tax not shown separately on invoice
  - **Option 2**: Tax Excluded from Price
    - Tax calculated on top of food prices
    - Tax shown as separate line on invoice
  
- **Tax Application Type**:
  - **Order-wise**: Apply single tax rate to entire order
  - **Category-wise**: Different tax rates for different categories
  - **Food-wise**: Individual tax rate per food item
  
- **Additional Tax Options**:
  - Apply tax on delivery charges (toggle)
  - Apply tax on service charges (toggle)
  - Apply tax on table reservations (toggle)
  
- **Tax Exemptions**:
  - Exempt specific categories (e.g., bread, baby food)
  - Exempt specific items

#### 14.3 Tax on Invoices
- **If Tax Excluded**:
  - Show subtotal
  - Show tax line item(s) with rate and amount
  - Show grand total (subtotal + tax)
  
- **If Tax Included**:
  - Show only grand total
  - Optionally show tax breakdown note at bottom
  
- **Multiple Tax Types**:
  - Each tax shown as separate line
  - Total tax amount summed

#### 14.4 Tax Reports
- Already covered in Reports section (13.6)
- VAT return report (summary for tax filing)

---

### 15. SETTINGS & CONFIGURATION

#### 15.1 General Settings
- **Restaurant Information**:
  - Edit from restaurant management section
  
- **System Preferences**:
  - Default Language (Arabic/English)
  - Default Currency
  - Date Format
  - Time Format (12/24 hour)
  - First day of week
  
- **Operational Settings**:
  - Default order type
  - Auto-print invoices
  - Auto-print kitchen tickets
  - Enable table management
  - Enable delivery management
  - Minimum delivery order amount
  
- **Notification Settings**:
  - Email notifications (order confirmations, low stock, etc.)
  - SMS notifications
  - Sound alerts for new orders

#### 15.2 Invoice Settings
- **Invoice Customization**:
  - Header text
  - Footer text
  - Terms & conditions
  - Show/hide logo
  - Show/hide VAT number
  - Show/hide QR code
  - Invoice numbering format
  
- **Receipt Template**:
  - Thermal printer (80mm)
  - A4 format
  - Custom template design

#### 15.3 Payment Method Configuration
- **Enable/Disable Payment Methods**:
  - Cash
  - Credit/Debit Card
  - ZainCash
  - Asia Hawala
  - Bank Transfer
  - Other local payment methods
  
- **Payment Gateway Integration**:
  - API credentials for each gateway
  - Test mode / Live mode toggle
  - Payment confirmation settings

#### 15.4 Printer Configuration
- **Add Printers**:
  - Printer Name
  - Printer Type (Receipt, Kitchen, Invoice)
  - Connection Type (USB, Network, Bluetooth)
  - IP Address (for network printers)
  - Assigned Counter/Station
  - Test print button
  
- **Print Settings**:
  - Auto-print settings
  - Number of copies
  - Paper size

#### 15.5 User Settings (Profile)
- **My Profile**:
  - View/Edit personal information
  - Change password
  - Change profile picture
  - Language preference
  - Notification preferences
  
- **Security**:
  - Enable 2FA
  - Login history
  - Active sessions
  - Logout all devices

#### 15.6 Subscription & Billing
- **Current Plan**:
  - Plan name (Basic, Professional, Enterprise)
  - Monthly/Annual billing
  - Price
  - Renewal date
  - Features included
  
- **Upgrade/Downgrade Plan**
- **Payment History**
- **Invoices**: Download invoices for payments
- **Payment Method**: Add/update card details

#### 15.7 Backup & Data Management
- **Backup Settings**:
  - Auto-backup frequency
  - Download manual backup
  - Restore from backup
  
- **Data Export**:
  - Export all data to CSV/JSON
  - Data retention policy
  
- **Data Import**:
  - Import existing data from CSV/Excel
  - Data import wizard

#### 15.8 System Logs & Audit Trail
- **Activity Logs**:
  - User actions log
  - System changes log
  - Login/logout history
  - Filter by user, action type, date
  
- **Error Logs**:
  - System errors
  - Failed transactions
  - Debug information (for admins)

---

## 🔐 SECURITY & DATA PROTECTION

### Authentication Security
- Secure password hashing (bcrypt)
- JWT tokens for session management
- Token refresh mechanism
- Rate limiting on login attempts
- Account lockout after failed attempts
- Email verification on signup
- Password reset via email with expiring tokens

### Authorization & Access Control
- Role-Based Access Control (RBAC)
- Row Level Security (RLS) in Supabase
- Tenant data isolation
- Branch-level access restrictions
- Permission-based UI rendering (hide features user can't access)

### Data Security
- HTTPS only (SSL/TLS)
- Data encryption at rest (Supabase handles this)
- Encrypted sensitive fields (payment info, personal data)
- PCI DSS compliance for payment processing
- Regular security audits

### Privacy & Compliance
- GDPR compliance (where applicable)
- Data export for customers
- Right to delete customer data
- Privacy policy and terms of service
- Cookie consent

### Audit & Monitoring
- Comprehensive activity logging
- Failed login attempt monitoring
- Suspicious activity alerts
- Regular backup verification
- Disaster recovery plan

---

## 📱 RESPONSIVE DESIGN REQUIREMENTS

### Mobile Responsive (320px - 768px)
- **POS Interface**:
  - Simplified single-column layout
  - Collapsible cart
  - Touch-friendly buttons
  - Swipeable category tabs
  
- **Kitchen Display**:
  - Optimized for tablets (landscape)
  - Large touch targets
  - Simple order cards
  
- **Dashboard & Reports**:
  - Stacked widgets
  - Collapsible sidebar
  - Touch-friendly charts
  
- **All Forms**:
  - Single column layout
  - Large input fields
  - Bottom action buttons

### Tablet (768px - 1024px)
- Two-column layouts where appropriate
- Optimized for POS use in portrait/landscape
- Side-by-side cart and menu

### Desktop (1024px+)
- Full-featured interface
- Multi-column layouts
- Sidebar navigation always visible
- Larger data tables
- More information density

### Progressive Web App (PWA)
- Install as app on mobile/tablet
- Offline support for POS (queue orders when offline)
- Push notifications
- App-like experience

---

## 🎨 UI/UX GUIDELINES

### Design Principles
- **Clean & Modern**: Minimal clutter, focus on functionality
- **Intuitive Navigation**: Clear menu structure, breadcrumbs
- **Consistent**: Unified design language across all modules
- **Accessible**: WCAG 2.1 AA compliance
- **Fast & Responsive**: Optimized performance, loading states

### Color Scheme
- **Primary Color**: Customizable per tenant (brand color)
- **Default Primary**: Blue (#1976D2) - professional, trustworthy
- **Success**: Green (#4CAF50) - confirmations, positive actions
- **Warning**: Orange (#FF9800) - alerts, cautions
- **Error**: Red (#F44336) - errors, critical actions
- **Neutral**: Grays for backgrounds and borders
- **Arabic UI**: Consider warm tones (gold, brown) for cultural relevance

### Typography
- **English**: Roboto or Inter (modern, readable)
- **Arabic**: Cairo or Tajawal (clean, professional Arabic fonts)
- Font sizes: Hierarchy from headings to body text
- Proper line-height for Arabic text
- RTL text rendering handled properly

### Component Library (Mantine)
- Leverage Mantine's extensive component library
- Customize theme for brand colors
- Use Mantine's built-in RTL support
- Consistent spacing using Mantine's spacing scale
- Use Mantine's form components with built-in validation

### Icons
- **Icon Library**: Tabler Icons (Mantine's default) or Lucide Icons
- Consistent icon style throughout
- RTL-aware icons (flip directional icons in RTL)

### Feedback & Loading States
- **Loading**: Skeleton screens, spinners, progress bars
- **Success Messages**: Toast notifications (top-right or top-center)
- **Error Messages**: Inline validation, toast for critical errors
- **Confirmation Dialogs**: Modal for destructive actions
- **Empty States**: Friendly messages with illustrations

### Data Visualization
- Clear, colorful charts
- Responsive charts (mobile-friendly)
- Tooltips on hover
- Arabic number formatting in Arabic locale

---

## 🔧 DEVELOPMENT GUIDELINES

### Code Structure

#### Frontend Structure (Next.js)
```
/frontend
  /app
    /(auth)
      /login
      /signup
    /(dashboard)
      /dashboard
      /restaurant
        /business-info
        /branch-management
        /counter-management
        /table-management
      /menu
        /categories
        /food-items
        /add-ons
        /cuisines
        /labels
        /menu-types
      /pos
        /new-sale
      /orders
        /[orderId]
      /kitchen-display
      /tables
        /[tableId]
        /reservations
      /inventory
        /ingredients
        /recipes
        /stock
        /adjustments
      /employees
        /[employeeId]
      /customers
        /[customerId]
      /delivery
        /personnel
        /orders
      /reports
        /sales
        /orders
        /customers
        /inventory
        /financial
        /tax
      /settings
        /general
        /invoice
        /payment-methods
        /printers
        /profile
        /subscription
  /components
    /layout
    /ui (Mantine components)
    /forms
    /charts
    /pos
    /kitchen
    /tables
  /lib
    /api (API client functions to call backend)
    /indexeddb (Dexie setup and schemas)
    /sync (Offline sync logic)
    /utils
    /validations (Zod schemas for frontend)
    /hooks
    /constants
  /locales
    /en.json
    /ar.json
  /styles
    /globals.css
    /theme.ts (Mantine theme)
  /types
    /api.types.ts
    /app.types.ts
  /public
    /images
    /fonts
```

#### Backend Structure (NestJS)
```
/backend
  /src
    /modules
      /auth
        auth.module.ts
        auth.controller.ts
        auth.service.ts
        /dto
        /guards
        /strategies (JWT, Google OAuth)
      /restaurant
        restaurant.module.ts
        restaurant.controller.ts
        restaurant.service.ts
        /entities
        /dto
      /menu
        menu.module.ts
        /categories
        /food-items
        /add-ons
        /dto
        /entities
      /orders
        orders.module.ts
        orders.controller.ts
        orders.service.ts
        /dto
        /entities
      /inventory
        inventory.module.ts
        /ingredients
        /stock
        /recipes
        /dto
        /entities
      /employees
        employees.module.ts
        employees.controller.ts
        employees.service.ts
        /dto
        /entities
      /customers
        customers.module.ts
        customers.controller.ts
        customers.service.ts
        /dto
        /entities
      /delivery
        delivery.module.ts
        delivery.controller.ts
        delivery.service.ts
        /dto
        /entities
      /reports
        reports.module.ts
        reports.controller.ts
        reports.service.ts
        /dto
      /settings
        settings.module.ts
        settings.controller.ts
        settings.service.ts
        /dto
      /sync
        sync.module.ts
        sync.controller.ts
        sync.service.ts
        /dto (for handling offline sync payloads)
    /common
      /decorators
        current-user.decorator.ts
        roles.decorator.ts
      /filters
        http-exception.filter.ts
      /guards
        jwt-auth.guard.ts
        roles.guard.ts
        tenant.guard.ts
      /interceptors
        logging.interceptor.ts
        transform.interceptor.ts
      /pipes
        validation.pipe.ts
      /middleware
        tenant.middleware.ts
    /config
      app.config.ts
      database.config.ts
      supabase.config.ts
    /database
      /migrations
      /seeds
      supabase.service.ts
    app.module.ts
    main.ts
  /test
    /e2e
    /unit
  .env.example
  nest-cli.json
  package.json
  tsconfig.json
```

### Database Schema (Supabase)
- Use Supabase migrations for version control
- Enable RLS on all tables
- Create policies for tenant isolation
- Use foreign keys for referential integrity
- Index frequently queried columns
- Use views for complex reports
- Implement soft deletes (deleted_at column)

### Key Tables:
1. **tenants**: Restaurant owners
2. **branches**: Multiple locations per tenant
3. **users**: Employees & customers (separate from Supabase auth)
4. **counters**: POS stations
5. **tables**: Dining tables
6. **categories**: Food categories
7. **food_items**: Menu items
8. **add_ons**: Additional options
9. **orders**: All orders
10. **order_items**: Order line items
11. **ingredients**: Inventory items
12. **recipes**: Food-ingredient relationships
13. **stock_transactions**: Stock in/out
14. **employees**: Staff information
15. **customers**: Customer profiles
16. **reservations**: Table bookings
17. **deliveries**: Delivery orders
18. **taxes**: Tax configurations
19. **payments**: Payment transactions

### State Management
- **Global State (Zustand)**:
  - Auth state (user, tenant, permissions)
  - Selected branch
  - Language preference
  - Cart state (POS)
  - Theme settings
  
- **Server State (React Query or SWR)**:
  - API data fetching
  - Caching
  - Optimistic updates
  - Real-time subscriptions (Supabase Realtime)

### API Design (NestJS Backend)

#### RESTful Endpoints Structure
```
Base URL: https://api.yourdomain.com/v1

Authentication:
POST   /auth/signup
POST   /auth/login
POST   /auth/google
POST   /auth/refresh
POST   /auth/logout

Restaurant Management:
GET    /restaurant/info
PUT    /restaurant/info
GET    /restaurant/branches
POST   /restaurant/branches
PUT    /restaurant/branches/:id
DELETE /restaurant/branches/:id

Menu Management:
GET    /menu/categories
POST   /menu/categories
PUT    /menu/categories/:id
DELETE /menu/categories/:id
GET    /menu/food-items
POST   /menu/food-items
PUT    /menu/food-items/:id
DELETE /menu/food-items/:id

Orders:
GET    /orders
POST   /orders
GET    /orders/:id
PUT    /orders/:id/status
DELETE /orders/:id

Inventory:
GET    /inventory/ingredients
POST   /inventory/ingredients
PUT    /inventory/ingredients/:id
POST   /inventory/stock/add
POST   /inventory/stock/deduct

Employees:
GET    /employees
POST   /employees
PUT    /employees/:id
DELETE /employees/:id

Customers:
GET    /customers
POST   /customers
GET    /customers/:id
PUT    /customers/:id

Delivery:
GET    /delivery/orders
POST   /delivery/assign
PUT    /delivery/orders/:id/status

Reports:
GET    /reports/sales?from=&to=
GET    /reports/orders?from=&to=
GET    /reports/customers
GET    /reports/inventory
GET    /reports/financial?from=&to=

Sync (for offline-first):
POST   /sync/push        // Push local changes to server
GET    /sync/pull        // Pull latest changes from server
GET    /sync/status      // Check sync health
POST   /sync/resolve     // Resolve conflicts
```

#### NestJS API Features
- **Swagger Documentation**: Auto-generated at `/api/docs`
- **Request Validation**: Using class-validator DTOs
- **Error Handling**: Global exception filter
- **Logging**: Winston logger with rotation
- **Rate Limiting**: Throttler module (100 requests/minute)
- **CORS**: Configured for frontend domain
- **Compression**: Gzip compression enabled
- **Security Headers**: Helmet middleware
- **API Versioning**: URI versioning (/v1, /v2)

#### Authentication Flow
1. User logs in → Backend issues JWT access + refresh tokens
2. Frontend stores tokens securely (httpOnly cookies or secure storage)
3. Every API request includes Bearer token
4. Backend validates token via JWT guard
5. Token refresh before expiry

#### Tenant Isolation
- All API endpoints automatically filter by tenant ID (from JWT)
- Tenant middleware extracts tenant from token
- Database queries include tenant_id in WHERE clause
- RLS policies in Supabase as backup layer

#### Response Format
**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [...]
  }
}
```

#### Real-time Features
- Use Supabase Realtime for live updates
- Backend can trigger Supabase events
- Frontend subscribes to relevant channels
- Example: Kitchen Display subscribes to new orders

### Real-time Features (Supabase Realtime)
- New order notifications (Kitchen Display)
- Order status updates
- Table status changes
- Stock level alerts
- Multi-device synchronization

### Performance Optimization
- **Images**: Next.js Image component with optimization
- **Code Splitting**: Dynamic imports for large components
- **Lazy Loading**: Load routes and components on demand
- **Caching**: Cache API responses, static assets
- **Database Queries**: Optimize with proper indexes and joins
- **Pagination**: Implement for large lists (orders, customers)
- **Debouncing**: Search inputs, API calls
- **Memoization**: Expensive calculations

### Error Handling
- **Frontend**:
  - Try-catch for async operations
  - Error boundaries for React components
  - User-friendly error messages
  - Automatic error reporting (Sentry or similar)
  
- **Backend**:
  - Structured error responses
  - Logging all errors
  - Graceful degradation

### Testing Strategy
- **Unit Tests**: Critical business logic
- **Integration Tests**: API endpoints
- **E2E Tests**: Critical user flows (Playwright or Cypress)
- **Manual Testing**: UI/UX, cross-browser, mobile

### Internationalization (i18n)
- **next-intl or react-i18next**
- Translation files for EN and AR
- Dynamic language switching
- RTL layout auto-switching
- Number and date localization
- Pluralization support

### Deployment Checklist
- Environment variables configured
- Database migrations run
- RLS policies enabled and tested
- SSL certificate active
- CDN configured
- Monitoring and logging setup
- Backup automation configured
- Domain and subdomain routing working
- Email/SMS services configured
- Payment gateway in live mode

---

## 📄 INVOICE & RECEIPT TEMPLATES

### Customer Invoice
- **Header**:
  - Restaurant logo
  - Restaurant name (bilingual)
  - Branch address and contact
  - Invoice number
  - Date and time
  
- **Customer Info** (if available):
  - Customer name
  - Phone
  - Table number / Order type
  
- **Items Table**:
  - Item name
  - Quantity
  - Unit price
  - Total
  
- **Summary**:
  - Subtotal
  - Discount(s)
  - VAT/Tax
  - Delivery charges (if applicable)
  - **Grand Total**
  
- **Footer**:
  - Thank you message (bilingual)
  - "Visit again" message
  - QR code (optional, for feedback or loyalty)
  - Website and social media

### Kitchen Ticket
- **Header**:
  - "KITCHEN ORDER" (large text)
  - Order number / Token
  - Order type icon
  - Table number (if applicable)
  - Date and time
  
- **Items** (large, clear text):
  - Quantity x Item Name
  - Variations and add-ons (indented)
  - Special instructions (highlighted or boxed)
  
- **Footer**:
  - Prepared by: [Cashier name]

### Thermal Printer Format (80mm)
- Compact layout
- Clear, bold text for totals
- Line separators
- Proper text wrapping

---

## 🚀 FUTURE SCALABILITY (Post Phase 1)

### Phase 2 Features (Deprioritized for MVP)
1. **Supplier Management**
   - Full supplier database
   - Purchase orders
   - Supplier invoices
   - Payment tracking
   - Supplier performance metrics
   
2. **Promotions & Coupons**
   - Coupon code generation
   - Discount campaigns
   - Buy-one-get-one offers
   - Time-limited promotions
   - Customer segment targeting
   
3. **QR Code Menu**
   - Generate QR per table
   - Customers scan and view menu
   - Direct ordering from QR menu
   - Multilingual QR menu
   
4. **Website Builder**
   - Drag-and-drop website builder
   - Online ordering from website
   - Menu display on website
   - Restaurant locator
   - Contact forms
   - SEO optimization
   
5. **Advanced Loyalty Program**
   - Points, tiers, rewards
   - Gamification
   - Referral programs
   
6. **Advanced Analytics**
   - Predictive analytics
   - Customer behavior analysis
   - Menu optimization suggestions
   - Demand forecasting
   
7. **Marketing Automation**
   - Email campaigns
   - SMS marketing
   - Push notifications
   - Birthday/anniversary offers
   
8. **Mobile App** (Native iOS/Android)
   - Customer app for ordering
   - Staff app for operations
   - Delivery app for drivers
   
9. **Third-party Integrations**
   - Food delivery platforms (Talabat, Zomato)
   - Accounting software
   - Payment gateways
   - Social media integration
   
10. **Multi-language Support**
    - Add more languages (Kurdish, Turkish, French)
    - Community translations

### Technical Debt & Improvements
- Comprehensive test coverage
- Performance profiling and optimization
- Accessibility audit and improvements
- Security penetration testing
- Load testing for high traffic
- Microservices architecture (if scaling to large user base)

---

## 📚 DOCUMENTATION REQUIREMENTS

### User Documentation
- **User Guide** (PDF/Online):
  - Getting started guide
  - Feature walkthroughs with screenshots
  - FAQs
  - Troubleshooting
  - Bilingual (English & Arabic)
  
- **Video Tutorials**:
  - Setup walkthrough
  - POS operations
  - Inventory management
  - Reports and analytics

### Developer Documentation
- **Technical Documentation**:
  - Architecture overview
  - Database schema
  - API documentation
  - Deployment guide
  - Environment setup
  
- **Code Comments**:
  - Clear, descriptive comments
  - Function/component documentation
  - Complex logic explained

### Admin Documentation
- **System Administration Guide**:
  - User management
  - System configuration
  - Backup and restore
  - Security best practices
  - Troubleshooting

---

## 🎯 SUCCESS CRITERIA & KPIs

### Performance Metrics
- Page load time < 2 seconds
- API response time < 500ms
- Time to interactive < 3 seconds
- 99.9% uptime

### User Experience Metrics
- POS order completion time < 60 seconds
- System learning curve < 1 hour for basic operations
- Mobile usability score > 90%
- Accessibility score > 90%

### Business Metrics
- User satisfaction rating > 4.5/5
- Feature adoption rate > 70% within 1 month
- Support ticket resolution time < 24 hours
- Customer retention rate > 80%

---

## 🔄 ITERATIVE DEVELOPMENT APPROACH

### Sprint Planning
- 2-week sprints
- Prioritize core POS and order management first
- Then inventory and reports
- Then delivery and customer management
- Then advanced features

### MVP Milestones
1. **Milestone 1**: Authentication, Dashboard, Restaurant Setup
2. **Milestone 2**: Menu Management (Categories, Food Items, Add-ons)
3. **Milestone 3**: POS System, Order Management
4. **Milestone 4**: Kitchen Display, Table Management
5. **Milestone 5**: Inventory Management
6. **Milestone 6**: Employee & Customer Management
7. **Milestone 7**: Delivery Management
8. **Milestone 8**: Reports & Analytics
9. **Milestone 9**: Settings, Invoices, Tax System
10. **Milestone 10**: Testing, Bug Fixes, Performance Optimization

---

## ⚠️ IMPORTANT NOTES FOR CURSOR

1. **COPY UI/UX from reference codebase** - Do not create new UI patterns, follow the established design system
2. **Implement offline-first architecture** - UI connects to local storage (IndexedDB), sync with Supabase when online
3. **Backend is separate NestJS application** - Follow NestJS best practices: modules, services, controllers, DTOs. All business logic in backend, frontend is UI only
4. **Follow the existing codebase structure** that will be provided as reference
5. **Use TypeScript** for type safety
3. **Implement proper error handling** everywhere
4. **Add loading states** for all async operations
5. **Validate all inputs** on frontend and backend
6. **Write clean, self-documenting code**
7. **Use Mantine components** instead of building from scratch
8. **Implement RTL properly** - test all UI in Arabic mode
9. **Make it responsive** - test on mobile, tablet, desktop
10. **Security first** - never trust client-side data
11. **Real-time where needed** - use Supabase Realtime for live updates
12. **Optimize for Iraqi market** - slow internet connections, local payment methods
13. **Print-friendly** - invoices and kitchen tickets must print correctly
14. **Modular code** - easy to add/remove features
15. **Comment complex logic** - especially calculations and business rules

---

## 🎬 GET STARTED

### Backend Setup (NestJS)
1. Create NestJS project: `nest new backend`
2. Install dependencies: Supabase client, class-validator, JWT, etc.
3. Set up Supabase connection configuration
4. Create all modules: auth, restaurant, menu, orders, etc.
5. Implement DTOs and entities
6. Set up JWT authentication and guards
7. Implement RLS bypass (service role key) or direct queries
8. Add Swagger documentation
9. Test all endpoints with Postman/Insomnia
10. Deploy to Railway/Render

### Frontend Setup (Next.js)
1. Create Next.js 14 project with TypeScript
2. Install Mantine UI and configure theme
3. Set up API client to communicate with NestJS backend
4. Implement authentication (store JWT tokens)
5. Create IndexedDB schema with Dexie.js
6. Implement offline-first sync service
7. Build restaurant setup wizard
8. Develop menu management UI
9. Create POS interface
10. Implement order management
11. Continue with remaining features based on milestone plan
12. Deploy to Vercel

### Database Setup (Supabase)
1. Create Supabase project
2. Run database migrations (tables, RLS policies)
3. Set up storage buckets for images
4. Configure authentication providers
5. Get connection string and service role key for backend

---

## 📝 FINAL CHECKLIST BEFORE HANDOFF

- [ ] All Phase 1 features implemented
- [ ] Arabic translation complete
- [ ] RTL layout working correctly
- [ ] Responsive design tested on all devices
- [ ] Database RLS policies tested
- [ ] User roles and permissions working
- [ ] All CRUD operations tested
- [ ] Real-time features working
- [ ] Invoice printing tested
- [ ] Payment integration tested (test mode)
- [ ] Reports generating correctly
- [ ] Performance optimized
- [ ] Security review passed
- [ ] User documentation ready
- [ ] Admin documentation ready
- [ ] Deployment tested on staging
- [ ] Backup and restore tested

---

**END OF PROMPT**

This comprehensive prompt should guide Cursor (and your development team) to build a robust, scalable, and market-ready Restaurant Management System. Each section can be edited, expanded, or removed based on your specific requirements.
