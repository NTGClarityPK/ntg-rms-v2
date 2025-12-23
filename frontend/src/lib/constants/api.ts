export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    SIGNUP: '/auth/signup',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
    PROFILE: '/auth/profile',
    GOOGLE: '/auth/google',
  },
  // Dashboard
  DASHBOARD: '/dashboard',
  // Restaurant
  RESTAURANT: {
    INFO: '/restaurant/info',
    BRANCHES: '/restaurant/branches',
    COUNTERS: '/restaurant/counters',
    TABLES: '/restaurant/tables',
  },
  // Menu
  MENU: {
    CATEGORIES: '/menu/categories',
    FOOD_ITEMS: '/menu/food-items',
    ADD_ON_GROUPS: '/menu/add-on-groups',
  },
  // Orders
  ORDERS: '/orders',
  // Inventory
  INVENTORY: {
    INGREDIENTS: '/inventory/ingredients',
    STOCK_TRANSACTIONS: '/inventory/stock-transactions',
    RECIPES: '/inventory/recipes',
  },
  // Employees
  EMPLOYEES: '/employees',
  // Customers
  CUSTOMERS: '/customers',
  // Delivery
  DELIVERY: '/delivery',
  // Reports
  REPORTS: {
    SALES: '/reports/sales',
    ORDERS: '/reports/orders',
    CUSTOMERS: '/reports/customers',
    INVENTORY: '/reports/inventory',
    FINANCIAL: '/reports/financial',
    TAX: '/reports/tax',
    TOP_ITEMS: '/reports/top-items',
  },
  // Settings
  SETTINGS: '/settings',
  // Sync
  SYNC: {
    PUSH: '/sync/push',
    PULL: '/sync/pull',
    STATUS: '/sync/status',
    RESOLVE: '/sync/resolve',
  },
  // Coupons
  COUPONS: {
    BASE: '/coupons',
    VALIDATE: '/coupons/validate',
  },
  // Taxes
  TAXES: {
    BASE: '/taxes',
  },
} as const;

