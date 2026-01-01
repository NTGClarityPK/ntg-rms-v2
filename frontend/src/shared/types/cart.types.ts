export interface CartItem {
  id?: number;
  foodItemId?: string;
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
}


