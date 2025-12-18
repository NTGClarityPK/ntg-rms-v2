import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentStatus = 'unpaid' | 'paid';

export interface OrderItem {
  id: string;
  orderId: string;
  foodItemId: string;
  foodItem?: {
    id: string;
    name: string;
    imageUrl?: string;
  };
  variationId?: string;
  variation?: {
    id: string;
    variationGroup: string;
    variationName: string;
    priceAdjustment: number;
  };
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  specialInstructions?: string;
  addOns?: {
    id: string;
    addOnId: string;
    addOn?: {
      id: string;
      name: string;
      price: number;
    };
    quantity: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  counterId?: string;
  counter?: {
    id: string;
    name: string;
    code: string;
  };
  tableId?: string;
  table?: {
    id: string;
    table_number: string;
    seating_capacity: number;
  };
  customerId?: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  orderNumber: string;
  tokenNumber?: string;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  couponCode?: string;
  couponDiscount?: number;
  specialInstructions?: string;
  numberOfPersons?: number;
  orderDate: string;
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GetOrdersParams {
  status?: OrderStatus | OrderStatus[];
  branchId?: string;
  orderType?: OrderType;
  paymentStatus?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  page?: number;
  includeItems?: boolean;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  cancellationReason?: string;
}

export interface UpdatePaymentStatusDto {
  paymentStatus: PaymentStatus;
  amountPaid?: number;
  paymentMethod?: 'cash' | 'card' | 'zainCash' | 'asiaHawala' | 'bankTransfer';
}

export interface CreateOrderItemDto {
  foodItemId: string;
  quantity: number;
  variationId?: string;
  addOns?: {
    addOnId: string;
    quantity?: number;
  }[];
  specialInstructions?: string;
}

export interface CreateOrderDto {
  branchId: string;
  counterId?: string;
  tableId?: string;
  customerId?: string;
  orderType: OrderType;
  items: CreateOrderItemDto[];
  tokenNumber?: string;
  extraDiscountAmount?: number;
  couponCode?: string;
  specialInstructions?: string;
  paymentTiming?: 'pay_first' | 'pay_after';
  paymentMethod?: 'cash' | 'card' | 'zainCash' | 'asiaHawala' | 'bankTransfer';
  customerAddressId?: string;
  deliveryAddress?: string; // For walk-in delivery customers
  deliveryAddressCity?: string; // For walk-in delivery customers
  deliveryAddressState?: string; // For walk-in delivery customers
  deliveryAddressCountry?: string; // For walk-in delivery customers
  numberOfPersons?: number;
}

export interface UpdateOrderDto {
  tableId?: string;
  customerId?: string;
  orderType?: OrderType;
  items?: CreateOrderItemDto[];
  extraDiscountAmount?: number;
  couponCode?: string;
  specialInstructions?: string;
  customerAddressId?: string;
  deliveryAddress?: string; // For walk-in delivery customers
  deliveryAddressCity?: string; // For walk-in delivery customers
  deliveryAddressState?: string; // For walk-in delivery customers
  deliveryAddressCountry?: string; // For walk-in delivery customers
  numberOfPersons?: number;
}

export const ordersApi = {
  async createOrder(data: CreateOrderDto): Promise<Order> {
    const response = await apiClient.post(API_ENDPOINTS.ORDERS, data);
    return response.data;
  },

  async getOrders(params?: GetOrdersParams): Promise<Order[] | PaginatedResponse<Order>> {
    // Convert status array to comma-separated string for query parameter
    const queryParams: any = { ...params };
    if (params?.status && Array.isArray(params.status)) {
      queryParams.status = params.status.join(',');
    }
    // Convert boolean to string for query parameter
    if (params?.includeItems !== undefined) {
      queryParams.includeItems = params.includeItems.toString();
    }
    const response = await apiClient.get<Order[] | PaginatedResponse<Order>>(API_ENDPOINTS.ORDERS, { params: queryParams });
    return response.data;
  },

  async getOrderById(id: string): Promise<Order> {
    const response = await apiClient.get(`${API_ENDPOINTS.ORDERS}/${id}`);
    return response.data;
  },

  async updateOrderStatus(id: string, data: UpdateOrderStatusDto): Promise<Order> {
    const response = await apiClient.put(`${API_ENDPOINTS.ORDERS}/${id}/status`, data);
    return response.data;
  },

  async updateOrder(id: string, data: UpdateOrderDto): Promise<Order> {
    const response = await apiClient.put(`${API_ENDPOINTS.ORDERS}/${id}`, data);
    return response.data;
  },

  async updatePaymentStatus(id: string, data: UpdatePaymentStatusDto): Promise<Order> {
    const response = await apiClient.put(`${API_ENDPOINTS.ORDERS}/${id}/payment`, data);
    return response.data;
  },

  async deleteOrder(id: string, reason?: string): Promise<void> {
    await apiClient.delete(`${API_ENDPOINTS.ORDERS}/${id}`, { params: { reason } });
  },
};

