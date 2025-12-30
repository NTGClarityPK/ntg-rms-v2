# Restaurant Management System - Codebase Audit & Restructuring Plan

**Date:** 2024  
**Project:** NTG RMS v2  
**Stack:** NestJS + Supabase (Backend), Next.js + React + Mantine (Frontend)

---

## Executive Summary

This audit identifies significant technical debt, code duplication, and architectural issues that should be addressed to improve maintainability, scalability, and developer experience. The codebase shows signs of rapid development with minimal refactoring, resulting in:

- **High code duplication** across components (especially CRUD pages)
- **Mixed concerns** (UI, business logic, and data access in components)
- **Inconsistent patterns** for error handling, validation, and state management
- **Large service files** (MenuService: 3300+ lines)
- **Hardcoded configuration values** scattered throughout
- **Missing abstraction layers** for common operations

**Estimated Technical Debt:** ~40-50% of codebase could be refactored for better maintainability.

---

## Table of Contents

1. [Code Smells & Anti-Patterns](#1-code-smells--anti-patterns)
2. [Duplication Analysis](#2-duplication-analysis)
3. [Separation of Concerns Issues](#3-separation-of-concerns-issues)
4. [Configuration & Hardcoded Values](#4-configuration--hardcoded-values)
5. [Error Handling & Validation](#5-error-handling--validation)
6. [Database & Query Efficiency](#6-database--query-efficiency)
7. [Restructuring Plan](#7-restructuring-plan)
8. [Prioritized Refactoring Roadmap](#8-prioritized-refactoring-roadmap)

---

## 1. Code Smells & Anti-Patterns

### 1.1 God Objects / Large Files

**Issue:** Several files exceed 1000+ lines, violating Single Responsibility Principle.

**Examples:**
- `Frontend/src/components/menu/FoodItemsPage.tsx` - **1,850 lines**
- `Frontend/src/components/inventory/IngredientsPage.tsx` - **730 lines**
- `Backend/src/modules/menu/menu.service.ts` - **3,300+ lines**
- `Backend/src/modules/orders/orders.service.ts` - **2,900+ lines**

**Impact:** 
- Difficult to navigate and understand
- High risk of merge conflicts
- Hard to test in isolation
- Violates SRP

**Recommendation:** Split into smaller, focused modules:
```typescript
// Instead of one large MenuService
menu/
  ├── services/
  │   ├── category.service.ts
  │   ├── food-item.service.ts
  │   ├── addon.service.ts
  │   └── variation.service.ts
  ├── repositories/
  │   └── menu.repository.ts
  └── menu.module.ts
```

### 1.2 Duplicate Component Logic

**Issue:** Every CRUD page implements similar patterns independently.

**Pattern Found in:**
- `IngredientsPage.tsx`
- `FoodItemsPage.tsx`
- `CustomersPage.tsx`
- `EmployeesPage.tsx`
- `CouponsPage.tsx`
- And 10+ more pages

**Common Duplicated Logic:**
1. **Data Loading Pattern:**
```typescript
// Repeated in every component
const loadData = useCallback(async () => {
  if (!user?.tenantId) return;
  try {
    setLoading(true);
    if (navigator.onLine) {
      try {
        const response = await api.getItems(filters, pagination);
        const items = pagination.extractData(response);
        pagination.extractPagination(response);
        setItems(items);
        await db.items.bulkPut(items.map(transform));
      } catch (err) {
        // Fallback to IndexedDB
        const local = await db.items.where('tenantId').equals(user.tenantId).toArray();
        setItems(local);
      }
    } else {
      // Offline logic
    }
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, [user?.tenantId, filters, pagination]);
```

2. **Form Submission Pattern:**
```typescript
// Repeated in every component
const handleSubmit = async (values) => {
  try {
    let saved;
    if (editing) {
      saved = await api.update(id, values);
      await db.items.update(id, { ...values, updatedAt: new Date() });
      if (!navigator.onLine) {
        await syncService.queueChange('items', 'UPDATE', id, saved);
      }
    } else {
      saved = await api.create(values);
      await db.items.add({ ...values, id: saved.id });
      if (!navigator.onLine) {
        await syncService.queueChange('items', 'CREATE', saved.id, saved);
      }
    }
    notifications.show({ message: 'Success' });
    handleCloseModal();
    loadData();
  } catch (err) {
    notifications.show({ message: err.message, color: 'red' });
  }
};
```

3. **IndexedDB Sync Logic:**
```typescript
// Repeated deduplication logic
const byId = new Map(items.map(item => [item.id, item]));
const byName = new Map();
for (const item of Array.from(byId.values())) {
  const key = item.name?.toLowerCase().trim() || '';
  if (key) {
    const existing = byName.get(key);
    if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
      byName.set(key, item);
    }
  }
}
const uniqueItems = byName.size < byId.size 
  ? Array.from(byName.values())
  : Array.from(byId.values());
```

**Recommendation:** Create reusable hooks and components:
```typescript
// hooks/use-crud-operations.ts
export function useCrudOperations<T>(config: CrudConfig<T>) {
  // Centralized CRUD logic
}

// hooks/use-offline-sync.ts
export function useOfflineSync<T>(entityName: string) {
  // Centralized sync logic
}

// components/common/DataTable.tsx
export function DataTable<T>({ columns, data, onEdit, onDelete }) {
  // Reusable table
}
```

### 1.3 Inconsistent Error Handling

**Issue:** Error handling patterns vary across the codebase.

**Backend Examples:**
```typescript
// Pattern 1: Basic try-catch
try {
  const { data, error } = await supabase.from('table').select();
  if (error) throw new BadRequestException(error.message);
} catch (err) {
  throw new InternalServerErrorException('Failed');
}

// Pattern 2: Direct throw
const { data, error } = await supabase.from('table').select();
if (error) {
  throw new BadRequestException(`Failed to fetch: ${error.message}`);
}

// Pattern 3: No error handling
const { data } = await supabase.from('table').select();
return data;
```

**Frontend Examples:**
```typescript
// Pattern 1: Try-catch with notifications
try {
  await api.create(data);
  notifications.show({ message: 'Success' });
} catch (err) {
  notifications.show({ message: err.message, color: 'red' });
}

// Pattern 2: Error state
try {
  await api.create(data);
} catch (err) {
  setError(err.message);
}

// Pattern 3: Silent failure
await api.create(data).catch(console.error);
```

**Recommendation:** Standardize error handling:
```typescript
// Backend: common/interceptors/error.interceptor.ts
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError(err => {
        // Standardized error transformation
      })
    );
  }
}

// Frontend: lib/utils/error-handler.ts
export function handleApiError(error: AxiosError) {
  // Centralized error handling
}
```

### 1.4 Magic Strings & Numbers

**Issue:** Hardcoded values scattered throughout code.

**Examples:**
```typescript
// Frontend/src/components/inventory/IngredientsPage.tsx
const CATEGORIES = [
  { value: 'vegetables', label: 'Vegetables' },
  { value: 'meats', label: 'Meats' },
  // ... hardcoded in component
];

// Backend/src/main.ts
const port = process.env.PORT || 8001; // Magic number
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';

// Backend/src/main.ts
.addServer('http://192.168.50.50:5001', 'Production Server') // Hardcoded IP
.addServer('http://192.168.50.50:8001', 'Staging Server')
```

**Recommendation:** Extract to constants/config:
```typescript
// constants/ingredient-categories.ts
export const INGREDIENT_CATEGORIES = [
  { value: 'vegetables', label: 'Vegetables' },
  // ...
] as const;

// config/app.config.ts
export const appConfig = {
  port: parseInt(process.env.PORT || '8001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8000',
  servers: {
    production: process.env.PRODUCTION_URL,
    staging: process.env.STAGING_URL,
  },
};
```

---

## 2. Duplication Analysis

### 2.1 Component Structure Duplication

**All CRUD pages follow this structure:**
```typescript
export function SomePage() {
  // 1. Hooks (same pattern)
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const primaryColor = useThemeColor();
  const pagination = usePagination<Type>({ initialPage: 1, initialLimit: 10 });
  
  // 2. State (same pattern)
  const [items, setItems] = useState<Type[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [editingItem, setEditingItem] = useState<Type | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 3. Form (same pattern)
  const form = useForm({ initialValues: {...}, validate: {...} });
  
  // 4. Load function (same pattern with slight variations)
  const loadData = useCallback(async () => { /* ... */ }, []);
  
  // 5. Submit handler (same pattern)
  const handleSubmit = async (values) => { /* ... */ };
  
  // 6. Delete handler (same pattern)
  const handleDelete = (item) => { /* ... */ };
  
  // 7. JSX (same structure)
  return (
    <Stack>
      <Button onClick={() => handleOpenModal()}>Add</Button>
      <Table>...</Table>
      <Modal>...</Modal>
    </Stack>
  );
}
```

**Estimated Duplication:** ~60-70% of component code is duplicated.

**Recommendation:** Create a generic CRUD component:
```typescript
// components/common/GenericCrudPage.tsx
export function GenericCrudPage<T>({
  entityName,
  api,
  columns,
  formFields,
  validationSchema,
}: CrudPageConfig<T>) {
  // All common logic here
}
```

### 2.2 API Client Duplication

**Issue:** Similar API patterns repeated across modules.

**Example from `Frontend/src/lib/api/`:**
```typescript
// inventory.ts
export const inventoryApi = {
  getIngredients: async (filters, pagination) => {
    const response = await apiClient.get('/inventory/ingredients', { params: {...} });
    return response.data;
  },
  createIngredient: async (data) => {
    const response = await apiClient.post('/inventory/ingredients', data);
    return response.data;
  },
  // ... same pattern
};

// menu.ts
export const menuApi = {
  getFoodItems: async (filters, pagination) => {
    const response = await apiClient.get('/menu/food-items', { params: {...} });
    return response.data;
  },
  createFoodItem: async (data) => {
    const response = await apiClient.post('/menu/food-items', data);
    return response.data;
  },
  // ... same pattern
};
```

**Recommendation:** Create generic API factory:
```typescript
// lib/api/factory.ts
export function createCrudApi<T>(endpoint: string) {
  return {
    getAll: (filters?, pagination?) => apiClient.get(endpoint, { params: {...} }),
    getById: (id: string) => apiClient.get(`${endpoint}/${id}`),
    create: (data: Partial<T>) => apiClient.post(endpoint, data),
    update: (id: string, data: Partial<T>) => apiClient.put(`${endpoint}/${id}`, data),
    delete: (id: string) => apiClient.delete(`${endpoint}/${id}`),
  };
}

// Usage
export const inventoryApi = createCrudApi<Ingredient>('/inventory/ingredients');
```

### 2.3 Backend Service Duplication

**Issue:** Similar query patterns in every service.

**Example:**
```typescript
// menu.service.ts
async getCategories(tenantId: string, pagination?: PaginationParams) {
  const supabase = this.supabaseService.getServiceRoleClient();
  const { count: totalCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  
  let query = supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  
  if (pagination) {
    const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
    query = query.range(offset, offset + limit - 1);
  }
  
  const { data, error } = await query;
  if (error) throw new BadRequestException(`Failed: ${error.message}`);
  // ... transform data
}

// orders.service.ts - SAME PATTERN
async getOrders(tenantId: string, pagination?: PaginationParams) {
  const supabase = this.supabaseService.getServiceRoleClient();
  const { count: totalCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  // ... same pattern
}
```

**Recommendation:** Create base repository:
```typescript
// common/repositories/base.repository.ts
export abstract class BaseRepository<T> {
  constructor(
    protected supabase: SupabaseClient,
    protected tableName: string,
  ) {}
  
  async findAll(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResponse<T>> {
    // Common query logic
  }
  
  async findById(tenantId: string, id: string): Promise<T> {
    // Common find logic
  }
  
  // ... other common methods
}
```

---

## 3. Separation of Concerns Issues

### 3.1 Components Doing Too Much

**Issue:** Components mix UI, business logic, and data access.

**Example from `FoodItemsPage.tsx`:**
```typescript
export function FoodItemsPage() {
  // ❌ Data fetching logic in component
  const loadData = useCallback(async () => {
    if (navigator.onLine) {
      const response = await menuApi.getFoodItems(...);
      const items = pagination.extractData(response);
      // ❌ IndexedDB operations in component
      await db.foodItems.bulkPut(items.map(transform));
      // ❌ Sync logic in component
      if (!navigator.onLine) {
        await syncService.queueChange('foodItems', 'CREATE', id, item);
      }
    }
  }, []);
  
  // ❌ Business logic in component
  const handleSubmit = async (values) => {
    // Validation
    // API call
    // IndexedDB update
    // Sync queue
    // Notification
  };
  
  // ❌ Data transformation in component
  const itemsWithRelations = await Promise.all(
    localItems.map(async (item) => {
      const [variations, labels, discounts] = await Promise.all([...]);
      return { ...item, variations, labels, discounts };
    })
  );
}
```

**Recommendation:** Extract to custom hooks and services:
```typescript
// hooks/use-food-items.ts
export function useFoodItems() {
  const { data, loading, error, create, update, delete: remove } = useCrudOperations({
    entityName: 'foodItems',
    api: menuApi,
    db: db.foodItems,
  });
  
  return { data, loading, error, create, update, remove };
}

// services/food-item.service.ts
export class FoodItemService {
  async loadWithRelations(itemId: string) {
    // Business logic here
  }
  
  async transformForDisplay(item: FoodItem) {
    // Transformation logic here
  }
}
```

### 3.2 Business Logic in Services

**Issue:** Services contain both data access and business logic.

**Example:**
```typescript
// orders.service.ts
async createOrder(dto: CreateOrderDto) {
  // ❌ Business logic mixed with data access
  const orderNumber = await this.generateOrderNumber(tenantId, branchId);
  const totals = await this.calculateOrderTotals(...); // Complex business logic
  const taxAmount = await this.calculateTax(...);
  
  // ❌ Inventory deduction logic in order service
  for (const item of dto.items) {
    await this.inventoryService.deductStock(item.ingredientId, item.quantity);
  }
  
  // ❌ Coupon validation in order service
  if (dto.couponCode) {
    const coupon = await this.couponsService.validate(dto.couponCode);
    // Apply discount
  }
  
  // Data access
  const { data, error } = await supabase.from('orders').insert({...});
}
```

**Recommendation:** Separate into domain services:
```typescript
// domain/order/order-calculator.service.ts
export class OrderCalculatorService {
  calculateTotals(items, coupon?, taxRate?) {
    // Pure business logic
  }
}

// domain/order/order-validator.service.ts
export class OrderValidatorService {
  async validateOrder(dto: CreateOrderDto) {
    // Validation logic
  }
}

// services/orders.service.ts
export class OrdersService {
  constructor(
    private calculator: OrderCalculatorService,
    private validator: OrderValidatorService,
    private repository: OrdersRepository,
  ) {}
  
  async createOrder(dto: CreateOrderDto) {
    await this.validator.validateOrder(dto);
    const totals = this.calculator.calculateTotals(...);
    return this.repository.create({ ...dto, ...totals });
  }
}
```

### 3.3 Direct Database Access in Components

**Issue:** Components directly access IndexedDB.

**Example:**
```typescript
// ❌ Direct DB access in component
const localItems = await db.foodItems
  .where('tenantId')
  .equals(user.tenantId)
  .filter((item) => !item.deletedAt)
  .toArray();
```

**Recommendation:** Use repository pattern:
```typescript
// repositories/food-item.repository.ts
export class FoodItemRepository {
  async findAll(tenantId: string): Promise<FoodItem[]> {
    return db.foodItems
      .where('tenantId')
      .equals(tenantId)
      .filter((item) => !item.deletedAt)
      .toArray();
  }
}

// In component
const repository = useFoodItemRepository();
const items = await repository.findAll(user.tenantId);
```

---

## 4. Configuration & Hardcoded Values

### 4.1 Hardcoded URLs & Ports

**Found in:**
- `Backend/src/main.ts` - Lines 17-18, 36-38
- `Backend/src/app.module.ts` - Line 69
- `Backend/src/config/app.config.ts` - Line 4
- `Backend/src/modules/auth/auth.controller.ts` - Lines 74, 80

**Examples:**
```typescript
// ❌ Hardcoded in main.ts
const port = process.env.PORT || 8001;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
.addServer('http://192.168.50.50:5001', 'Production Server')
.addServer('http://192.168.50.50:8001', 'Staging Server')

// ❌ Hardcoded in auth.controller.ts
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
```

**Recommendation:** Centralize configuration:
```typescript
// config/app.config.ts
export const appConfig = () => ({
  port: parseInt(process.env.PORT || '8001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8000',
  apiUrl: process.env.API_URL || 'http://localhost:8001',
  environment: process.env.NODE_ENV || 'development',
  servers: {
    production: process.env.PRODUCTION_URL,
    staging: process.env.STAGING_URL,
    development: process.env.DEVELOPMENT_URL || 'http://localhost:8001',
  },
});
```

### 4.2 Hardcoded Constants in Components

**Found in:**
- `IngredientsPage.tsx` - CATEGORIES, UNITS arrays
- `FoodItemsPage.tsx` - labelOptions array
- Multiple components with similar hardcoded lists

**Recommendation:** Extract to constants:
```typescript
// constants/ingredients.ts
export const INGREDIENT_CATEGORIES = [
  { value: 'vegetables', label: 'Vegetables' },
  { value: 'meats', label: 'Meats' },
  // ...
] as const;

export const MEASUREMENT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  // ...
] as const;

// constants/menu.ts
export const FOOD_ITEM_LABELS = [
  { value: 'spicy', label: 'Spicy' },
  { value: 'vegetarian', label: 'Vegetarian' },
  // ...
] as const;
```

---

## 5. Error Handling & Validation

### 5.1 Inconsistent Error Responses

**Backend Issue:** Error responses vary in structure.

**Examples:**
```typescript
// Pattern 1: Direct exception
throw new NotFoundException('Category not found');

// Pattern 2: Custom message
throw new BadRequestException(`Failed to fetch: ${error.message}`);

// Pattern 3: No error handling
const { data, error } = await supabase.from('table').select();
// error not checked
```

**Frontend Issue:** Error extraction varies.

**Examples:**
```typescript
// Pattern 1
const errorMsg = err.response?.data?.message || err.message;

// Pattern 2
const errorMsg = err.response?.data?.error?.message || 'Failed';

// Pattern 3
const errorMsg = typeof err.response?.data === 'string' 
  ? err.response.data 
  : err.message;
```

**Recommendation:** Standardize error format:
```typescript
// Backend: common/dto/error-response.dto.ts
export class ErrorResponseDto {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

// Frontend: lib/utils/error-handler.ts
export function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data;
  if (data?.error?.message) return data.error.message;
  if (data?.message) return data.message;
  if (typeof data === 'string') return data;
  return error.message || 'An error occurred';
}
```

### 5.2 Missing Input Validation

**Issue:** Some DTOs lack proper validation decorators.

**Example:**
```typescript
// ❌ Missing validation
export class CreateIngredientDto {
  name: string; // No @IsString(), @IsNotEmpty()
  category?: string; // No @IsOptional(), @IsIn([...])
  costPerUnit: number; // No @IsNumber(), @Min(0)
}

// ✅ Should be
export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
  
  @IsOptional()
  @IsIn(['vegetables', 'meats', 'dairy', 'spices', 'beverages', 'other'])
  category?: string;
  
  @IsNumber()
  @Min(0)
  @Max(999999.99)
  costPerUnit: number;
}
```

**Recommendation:** Add comprehensive validation:
```typescript
// common/decorators/validate-tenant-id.decorator.ts
export function IsValidTenantId() {
  return applyDecorators(
    IsUUID(),
    IsNotEmpty(),
  );
}

// Use in DTOs
export class CreateOrderDto {
  @IsValidTenantId()
  tenantId: string;
}
```

### 5.3 Missing Error Boundaries

**Frontend Issue:** No error boundaries to catch React errors.

**Recommendation:** Add error boundaries:
```typescript
// components/common/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component {
  // Catch and display errors gracefully
}

// app/layout.tsx
<ErrorBoundary>
  <Providers>
    {children}
  </Providers>
</ErrorBoundary>
```

---

## 6. Database & Query Efficiency

### 6.1 N+1 Query Problems

**Issue:** Multiple queries in loops.

**Example from `orders.service.ts`:**
```typescript
// ❌ N+1 queries
for (const item of dto.items) {
  const { data: foodItem } = await supabase
    .from('food_items')
    .select('*')
    .eq('id', item.foodItemId)
    .single();
  
  const { data: variations } = await supabase
    .from('food_item_variations')
    .select('*')
    .eq('food_item_id', item.foodItemId);
  
  // Process item...
}
```

**Recommendation:** Batch queries:
```typescript
// ✅ Batch fetch
const foodItemIds = dto.items.map(item => item.foodItemId);
const { data: foodItems } = await supabase
  .from('food_items')
  .select('*')
  .in('id', foodItemIds);

const { data: variations } = await supabase
  .from('food_item_variations')
  .select('*')
  .in('food_item_id', foodItemIds);

// Create lookup maps
const itemsMap = new Map(foodItems.map(item => [item.id, item]));
const variationsMap = new Map(
  variations.map(v => [v.food_item_id, v])
);
```

### 6.2 Missing Database Indexes

**Issue:** No explicit indexes defined for common query patterns.

**Recommendation:** Add indexes:
```sql
-- Add indexes for common queries
CREATE INDEX idx_orders_tenant_branch_date 
  ON orders(tenant_id, branch_id, created_at DESC);

CREATE INDEX idx_food_items_tenant_category 
  ON food_items(tenant_id, category_id, is_active);

CREATE INDEX idx_order_items_order_id 
  ON order_items(order_id);
```

### 6.3 Inefficient Pagination

**Issue:** Some queries fetch all data then paginate in memory.

**Example:**
```typescript
// ❌ Fetch all, then paginate
const { data: allItems } = await supabase
  .from('food_items')
  .select('*')
  .eq('tenant_id', tenantId);

const paginated = allItems.slice(offset, offset + limit);
```

**Recommendation:** Use database-level pagination:
```typescript
// ✅ Database pagination
const { offset, limit } = getPaginationParams(page, limit);
const { data } = await supabase
  .from('food_items')
  .select('*')
  .eq('tenant_id', tenantId)
  .range(offset, offset + limit - 1);
```

---

## 7. Restructuring Plan

### 7.1 Frontend Structure

**Current Structure:**
```
src/
├── app/                    # Next.js app router
├── components/             # All components (flat)
│   ├── common/            # Some common components
│   ├── menu/              # Menu components
│   ├── inventory/         # Inventory components
│   └── ...
├── lib/
│   ├── api/              # API clients (flat)
│   ├── hooks/            # Custom hooks (flat)
│   ├── utils/            # Utilities (flat)
│   └── store/            # Zustand stores
└── types/                # TypeScript types
```

**Recommended Structure:**
```
src/
├── app/                           # Next.js app router
│   └── (dashboard)/              # Route groups
│
├── features/                      # Feature-based modules
│   ├── menu/
│   │   ├── components/
│   │   │   ├── FoodItemsPage.tsx
│   │   │   ├── CategoriesPage.tsx
│   │   │   └── shared/            # Shared within feature
│   │   ├── hooks/
│   │   │   ├── use-food-items.ts
│   │   │   └── use-categories.ts
│   │   ├── services/
│   │   │   └── menu.service.ts
│   │   ├── repositories/
│   │   │   └── menu.repository.ts
│   │   ├── types/
│   │   │   └── menu.types.ts
│   │   └── constants/
│   │       └── menu.constants.ts
│   │
│   ├── inventory/
│   │   └── ... (same structure)
│   │
│   └── orders/
│       └── ... (same structure)
│
├── shared/                        # Shared across features
│   ├── components/
│   │   ├── common/
│   │   │   ├── DataTable/
│   │   │   │   ├── DataTable.tsx
│   │   │   │   ├── DataTable.types.ts
│   │   │   │   └── index.ts
│   │   │   ├── FormModal/
│   │   │   ├── PaginationControls/
│   │   │   └── ErrorBoundary/
│   │   └── layout/
│   │       ├── Header/
│   │       ├── Sidebar/
│   │       └── UserMenu/
│   │
│   ├── hooks/
│   │   ├── use-crud-operations.ts
│   │   ├── use-offline-sync.ts
│   │   ├── use-pagination.ts
│   │   └── use-api-query.ts
│   │
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── factory.ts        # Generic CRUD factory
│   │   │   └── interceptors.ts
│   │   ├── sync/
│   │   │   ├── sync.service.ts
│   │   │   └── offline-storage.service.ts
│   │   └── error-handler.ts
│   │
│   ├── repositories/
│   │   └── base.repository.ts
│   │
│   ├── utils/
│   │   ├── error-handler.ts
│   │   ├── formatters/
│   │   │   ├── currency.ts
│   │   │   ├── date.ts
│   │   │   └── index.ts
│   │   └── validators/
│   │
│   ├── types/
│   │   ├── api.types.ts
│   │   ├── common.types.ts
│   │   └── pagination.types.ts
│   │
│   └── constants/
│       ├── api.constants.ts
│       └── app.constants.ts
│
├── providers/                      # React providers
│   ├── Providers.tsx
│   ├── ThemeProvider.tsx
│   └── DynamicThemeProvider.tsx
│
└── locales/                        # Translations
    ├── en.json
    └── ar.json
```

### 7.2 Backend Structure

**Current Structure:**
```
src/
├── modules/                        # Feature modules (good)
│   ├── menu/
│   │   ├── menu.service.ts        # 3300+ lines ❌
│   │   ├── menu.controller.ts
│   │   └── dto/
│   └── orders/
│       ├── orders.service.ts      # 2900+ lines ❌
│       └── ...
├── common/                         # Shared code
│   ├── decorators/
│   ├── dto/
│   ├── filters/
│   └── guards/
└── database/
    └── supabase.service.ts
```

**Recommended Structure:**
```
src/
├── modules/                        # Feature modules
│   ├── menu/
│   │   ├── menu.module.ts
│   │   ├── controllers/
│   │   │   └── menu.controller.ts
│   │   ├── services/
│   │   │   ├── category.service.ts
│   │   │   ├── food-item.service.ts
│   │   │   ├── addon.service.ts
│   │   │   └── variation.service.ts
│   │   ├── repositories/
│   │   │   ├── category.repository.ts
│   │   │   ├── food-item.repository.ts
│   │   │   └── base-menu.repository.ts
│   │   ├── dto/
│   │   │   ├── category/
│   │   │   ├── food-item/
│   │   │   └── shared/
│   │   ├── domain/                # Business logic
│   │   │   ├── menu-calculator.service.ts
│   │   │   └── menu-validator.service.ts
│   │   └── types/
│   │       └── menu.types.ts
│   │
│   └── orders/
│       └── ... (same structure)
│
├── common/                         # Shared code
│   ├── decorators/
│   ├── dto/
│   │   ├── pagination.dto.ts
│   │   └── error-response.dto.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   ├── interceptors/
│   │   ├── error.interceptor.ts
│   │   └── logging.interceptor.ts
│   ├── repositories/
│   │   └── base.repository.ts
│   └── utils/
│       ├── query-builder.util.ts
│       └── error-handler.util.ts
│
├── database/
│   ├── supabase.service.ts
│   ├── repositories/
│   │   └── base-supabase.repository.ts
│   └── migrations/               # Migration scripts
│
└── config/
    ├── app.config.ts
    ├── database.config.ts
    └── swagger.config.ts
```

### 7.3 Shared Utilities Extraction

**What Should Be Extracted:**

1. **Generic CRUD Hook:**
```typescript
// shared/hooks/use-crud-operations.ts
export function useCrudOperations<T>(config: {
  entityName: string;
  api: CrudApi<T>;
  db: DexieTable;
  transform?: (item: T) => any;
}) {
  // All CRUD logic
  return {
    data,
    loading,
    error,
    create,
    update,
    remove,
    refresh,
  };
}
```

2. **Generic Data Table:**
```typescript
// shared/components/common/DataTable/DataTable.tsx
export function DataTable<T>({
  data,
  columns,
  loading,
  onEdit,
  onDelete,
  pagination,
  searchable,
  filterable,
}: DataTableProps<T>) {
  // Reusable table with all features
}
```

3. **Generic Form Modal:**
```typescript
// shared/components/common/FormModal/FormModal.tsx
export function FormModal<T>({
  opened,
  onClose,
  title,
  fields,
  initialValues,
  onSubmit,
  validationSchema,
}: FormModalProps<T>) {
  // Reusable form modal
}
```

4. **Base Repository:**
```typescript
// Backend: common/repositories/base.repository.ts
export abstract class BaseRepository<T> {
  constructor(
    protected supabase: SupabaseClient,
    protected tableName: string,
  ) {}
  
  async findAll(tenantId: string, filters?, pagination?): Promise<PaginatedResponse<T>> {
    // Common query logic
  }
  
  async findById(tenantId: string, id: string): Promise<T> {
    // Common find logic
  }
  
  async create(tenantId: string, data: Partial<T>): Promise<T> {
    // Common create logic
  }
  
  async update(tenantId: string, id: string, data: Partial<T>): Promise<T> {
    // Common update logic
  }
  
  async delete(tenantId: string, id: string): Promise<void> {
    // Common delete logic
  }
}
```

---

## 8. Prioritized Refactoring Roadmap

### Phase 1: Quick Wins (1-2 weeks)
**Effort:** Low | **Impact:** Medium-High

#### 1.1 Extract Hardcoded Constants
- [ ] Move all hardcoded arrays to constants files
- [ ] Extract magic numbers to config
- [ ] Remove hardcoded URLs/IPs
- **Files:** ~15 files
- **Estimated Time:** 2-3 days

#### 1.2 Standardize Error Handling
- [ ] Create error handler utility (frontend)
- [ ] Create error interceptor (backend)
- [ ] Update all components to use standardized handler
- **Files:** ~30 files
- **Estimated Time:** 3-4 days

#### 1.3 Create Generic API Factory
- [ ] Implement `createCrudApi` function
- [ ] Refactor existing API files to use factory
- [ ] **Files:** ~12 API files
- **Estimated Time:** 2 days

#### 1.4 Add Database Indexes
- [ ] Identify common query patterns
- [ ] Create migration with indexes
- [ ] **Files:** 1 migration file
- **Estimated Time:** 1 day

**Total Phase 1:** ~8-10 days

---

### Phase 2: Foundation (2-3 weeks)
**Effort:** Medium | **Impact:** High

#### 2.1 Create Base Repository Pattern
- [ ] Implement `BaseRepository` class (backend)
- [ ] Refactor 2-3 services to use base repository
- [ ] Document pattern for team
- **Files:** ~5-10 service files
- **Estimated Time:** 5-7 days

#### 2.2 Create Generic CRUD Hook
- [ ] Implement `useCrudOperations` hook
- [ ] Refactor 2-3 components to use hook
- [ ] Test offline sync integration
- **Files:** ~5-10 component files
- **Estimated Time:** 5-7 days

#### 2.3 Create Generic DataTable Component
- [ ] Build reusable DataTable with features:
  - Pagination
  - Sorting
  - Filtering
  - Search
  - Actions (edit/delete)
- [ ] Refactor 2-3 pages to use DataTable
- **Files:** ~5-10 component files
- **Estimated Time:** 5-7 days

#### 2.4 Split Large Service Files
- [ ] Split `MenuService` (3300 lines) into:
  - `CategoryService`
  - `FoodItemService`
  - `AddOnService`
  - `VariationService`
- [ ] Split `OrdersService` (2900 lines) into:
  - `OrderService`
  - `OrderCalculatorService`
  - `OrderValidatorService`
- **Files:** 2 large services
- **Estimated Time:** 7-10 days

**Total Phase 2:** ~22-31 days

---

### Phase 3: Architecture Improvements (3-4 weeks)
**Effort:** High | **Impact:** Very High

#### 3.1 Restructure Frontend to Feature-Based
- [ ] Create new folder structure
- [ ] Move components to features
- [ ] Update imports
- [ ] **Files:** ~50+ files
- **Estimated Time:** 10-14 days

#### 3.2 Implement Repository Pattern (Frontend)
- [ ] Create base repository for IndexedDB
- [ ] Refactor components to use repositories
- [ ] **Files:** ~30 component files
- **Estimated Time:** 7-10 days

#### 3.3 Extract Business Logic
- [ ] Create domain services
- [ ] Move calculation logic out of services
- [ ] Move validation logic out of services
- [ ] **Files:** ~10 service files
- **Estimated Time:** 7-10 days

#### 3.4 Optimize Database Queries
- [ ] Fix N+1 query problems
- [ ] Implement batch fetching
- [ ] Add query caching where appropriate
- [ ] **Files:** ~15 service files
- **Estimated Time:** 5-7 days

**Total Phase 3:** ~29-41 days

---

### Phase 4: Polish & Optimization (2-3 weeks)
**Effort:** Medium | **Impact:** Medium

#### 4.1 Add Comprehensive Validation
- [ ] Add validation decorators to all DTOs
- [ ] Create custom validators
- [ ] **Files:** ~30 DTO files
- **Estimated Time:** 5-7 days

#### 4.2 Add Error Boundaries
- [ ] Implement React error boundaries
- [ ] Add error logging
- [ ] **Files:** ~5 files
- **Estimated Time:** 2-3 days

#### 4.3 Performance Optimization
- [ ] Add React.memo where needed
- [ ] Optimize re-renders
- [ ] Add loading states
- [ ] **Files:** ~20 component files
- **Estimated Time:** 5-7 days

#### 4.4 Documentation
- [ ] Document new patterns
- [ ] Create developer guide
- [ ] Update README
- **Files:** Documentation
- **Estimated Time:** 3-5 days

**Total Phase 4:** ~15-22 days

---

## Summary

### Critical Issues (Fix Immediately)
1. ✅ Hardcoded configuration values
2. ✅ Inconsistent error handling
3. ✅ Missing database indexes
4. ✅ N+1 query problems

### High Priority (Fix in Phase 1-2)
1. ✅ Code duplication in components
2. ✅ Large service files
3. ✅ Missing reusable components
4. ✅ Mixed concerns

### Medium Priority (Fix in Phase 3)
1. ✅ Feature-based restructuring
2. ✅ Repository pattern implementation
3. ✅ Business logic extraction

### Low Priority (Fix in Phase 4)
1. ✅ Comprehensive validation
2. ✅ Error boundaries
3. ✅ Performance optimizations

---

## Estimated Total Effort

- **Phase 1 (Quick Wins):** 8-10 days
- **Phase 2 (Foundation):** 22-31 days
- **Phase 3 (Architecture):** 29-41 days
- **Phase 4 (Polish):** 15-22 days

**Total:** ~74-104 days (~15-21 weeks / ~4-5 months)

**Recommendation:** Start with Phase 1 for immediate improvements, then proceed incrementally. Don't try to refactor everything at once.

---

## Next Steps

1. **Review this report** with the team
2. **Prioritize** based on business needs
3. **Create tickets** for Phase 1 items
4. **Set up** feature branch for refactoring
5. **Start** with Phase 1, item 1.1 (Extract Constants)

---

*Report generated: 2024*  
*For questions or clarifications, please refer to the codebase or create an issue.*

