import Dexie, { Table as DexieTable } from 'dexie';

// Define interfaces for all tables
export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  email: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultCurrency: string;
  timezone: string;
  fiscalYearStart?: string;
  vatNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  managerId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryType: string;
  parentId?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface FoodItem {
  id: string;
  tenantId: string;
  categoryId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  stockType: string;
  stockQuantity: number;
  menuType?: string; // Legacy field
  menuTypes?: string[]; // Array of menu types
  ageLimit?: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  counterId?: string;
  tableId?: string;
  customerId?: string;
  orderNumber: string;
  tokenNumber?: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  orderDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface OrderItem {
  id: string;
  orderId: string;
  foodItemId?: string;
  buffetId?: string;
  comboMealId?: string;
  variationId?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface RestaurantTable {
  id: string;
  tenantId: string;
  branchId: string;
  tableNumber?: string;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'out_of_service';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Employee {
  id: string;
  tenantId: string;
  supabaseAuthId?: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  employeeId?: string;
  photoUrl?: string;
  nationalId?: string;
  dateOfBirth?: string;
  employmentType?: string;
  joiningDate?: string;
  salary?: number;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  preferredLanguage?: string;
  notes?: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate?: string;
  loyaltyTier: 'regular' | 'silver' | 'gold' | 'platinum';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Ingredient {
  id: string;
  tenantId: string;
  name: string;
  category?: string;
  unitOfMeasurement: string;
  currentStock: number;
  minimumThreshold: number;
  costPerUnit: number;
  storageLocation?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface StockTransaction {
  id: string;
  tenantId: string;
  branchId?: string;
  ingredientId: string;
  transactionType: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  reason?: string;
  supplierName?: string;
  invoiceNumber?: string;
  referenceId?: string;
  transactionDate: string;
  createdAt: string;
  createdBy?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface Recipe {
  id: string;
  foodItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  createdAt: string;
  updatedAt: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface FoodItemVariation {
  id?: string;
  foodItemId: string;
  variationGroup: string;
  variationName: string;
  priceAdjustment: number;
  stockQuantity?: number;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FoodItemLabel {
  id?: string;
  foodItemId: string;
  label: string;
  createdAt?: string;
}

export interface FoodItemDiscount {
  id?: string;
  foodItemId: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate: string;
  endDate: string;
  reason?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AddOn {
  id: string;
  addOnGroupId: string;
  name: string;
  price: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface AddOnGroup {
  id: string;
  tenantId: string;
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  minSelections: number;
  maxSelections?: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface FoodItemAddOnGroup {
  id?: string;
  foodItemId: string;
  addOnGroupId: string;
  createdAt?: string;
}

export interface CartItem {
  id?: number;
  foodItemId?: string; // Optional since items can be buffets or combo meals
  buffetId?: string;
  comboMealId?: string;
  foodItemName: string;
  foodItemImageUrl?: string;
  variationId?: string;
  variationGroup?: string;
  variationName?: string;
  variationPriceAdjustment?: number;
  addOns?: {
    addOnId: string;
    addOnName: string;
    price: number;
    quantity: number;
  }[];
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions?: string;
  createdAt?: string;
  // Additional properties for compatibility
  foodItem?: any;
  buffet?: any;
  comboMeal?: any;
}

export interface SyncQueue {
  id?: number;
  table: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  recordId: string;
  data: any;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  error?: string;
}

export interface Tax {
  id: string;
  tenantId: string;
  name: string;
  taxCode?: string;
  rate: number;
  isActive: boolean;
  appliesTo: 'order' | 'category' | 'item';
  appliesToDelivery: boolean;
  appliesToServiceCharge: boolean;
  categoryIds?: string[];
  foodItemIds?: string[];
  createdAt: string;
  updatedAt: string;
  lastSynced?: string;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

export interface ReportCache {
  id: string;
  type: string;
  data: string;
  filters: string;
  updatedAt: string;
}

// Database class
export class RMSDatabase extends Dexie {
  tenants!: DexieTable<Tenant, string>;
  branches!: DexieTable<Branch, string>;
  users!: DexieTable<User, string>;
  employees!: DexieTable<Employee, string>;
  categories!: DexieTable<Category, string>;
  foodItems!: DexieTable<FoodItem, string>;
  foodItemVariations!: DexieTable<FoodItemVariation, string>;
  foodItemLabels!: DexieTable<FoodItemLabel, string>;
  foodItemDiscounts!: DexieTable<FoodItemDiscount, string>;
  addOnGroups!: DexieTable<AddOnGroup, string>;
  addOns!: DexieTable<AddOn, string>;
  foodItemAddOnGroups!: DexieTable<FoodItemAddOnGroup, string>;
  orders!: DexieTable<Order, string>;
  orderItems!: DexieTable<OrderItem, string>;
  restaurantTables!: DexieTable<RestaurantTable, string>;
  customers!: DexieTable<Customer, string>;
  ingredients!: DexieTable<Ingredient, string>;
  stockTransactions!: DexieTable<StockTransaction, string>;
  recipes!: DexieTable<Recipe, string>;
  cart!: DexieTable<CartItem, number>;
  syncQueue!: DexieTable<SyncQueue, number>;
  reports!: DexieTable<ReportCache, string>;
  taxes!: DexieTable<Tax, string>;

  constructor() {
    super('RMSDatabase');
    this.version(8).stores({
      tenants: 'id, tenantId, subdomain, email, lastSynced, syncStatus',
      branches: 'id, tenantId, code, lastSynced, syncStatus',
      users: 'id, tenantId, email, role, lastSynced, syncStatus',
      employees: 'id, tenantId, email, role, employeeId, lastSynced, syncStatus',
      categories: 'id, tenantId, parentId, lastSynced, syncStatus',
      foodItems: 'id, tenantId, categoryId, lastSynced, syncStatus',
      foodItemVariations: 'id, foodItemId',
      foodItemLabels: 'id, foodItemId, label',
      foodItemDiscounts: 'id, foodItemId',
      addOnGroups: 'id, tenantId, lastSynced, syncStatus',
      addOns: 'id, addOnGroupId, lastSynced, syncStatus',
      foodItemAddOnGroups: 'id, foodItemId, addOnGroupId',
      orders: 'id, tenantId, branchId, orderNumber, orderDate, lastSynced, syncStatus',
      orderItems: 'id, orderId, foodItemId, lastSynced, syncStatus',
      restaurantTables: 'id, tenantId, branchId, tableNumber, status, lastSynced, syncStatus',
      customers: 'id, tenantId, phone, lastSynced, syncStatus',
      ingredients: 'id, tenantId, lastSynced, syncStatus',
      stockTransactions: 'id, tenantId, ingredientId, transactionDate, lastSynced, syncStatus',
      recipes: 'id, foodItemId, ingredientId, lastSynced, syncStatus',
      cart: '++id, foodItemId, createdAt',
      syncQueue: '++id, table, recordId, status, timestamp',
      reports: 'id, type, updatedAt',
      taxes: 'id, tenantId, lastSynced, syncStatus',
    });
  }
}

export const db = new RMSDatabase();


