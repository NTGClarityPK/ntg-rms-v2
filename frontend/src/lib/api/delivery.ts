import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { PaginationParams, PaginatedResponse } from '../types/pagination.types';

export type DeliveryStatus = 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface DeliveryPersonnel {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  activeDeliveriesCount: number;
  branches?: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

export interface CustomerAddress {
  id: string;
  address: string;
  addressLine1?: string; // Backward compatibility
  addressLine2?: string; // Backward compatibility
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface DeliveryOrder {
  id: string;
  orderId: string;
  deliveryPersonId?: string;
  customerAddressId?: string;
  status: DeliveryStatus;
  estimatedDeliveryTime?: string;
  actualDeliveryTime?: string;
  deliveryCharge: number;
  distanceKm?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: string;
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
    specialInstructions?: string;
    orderDate: string;
    placedAt?: string;
    customerId?: string;
    branchId?: string;
    customer?: {
      id: string;
      name: string;
      phone?: string;
      email?: string;
    };
    branch?: {
      id: string;
      name: string;
      code: string;
    };
  };
  deliveryPerson?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  customerAddress?: CustomerAddress;
}

export interface AssignDeliveryDto {
  orderId: string;
  deliveryPersonId: string;
  estimatedDeliveryTime?: string;
}

export interface UpdateDeliveryStatusDto {
  status: DeliveryStatus;
}

export const deliveryApi = {
  /**
   * Get delivery orders with filters
   */
  async getDeliveryOrders(filters?: {
    status?: DeliveryStatus;
    deliveryPersonId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
  } & PaginationParams): Promise<DeliveryOrder[] | PaginatedResponse<DeliveryOrder>> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.deliveryPersonId) params.append('deliveryPersonId', filters.deliveryPersonId);
    if (filters?.branchId) params.append('branchId', filters.branchId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await apiClient.get<DeliveryOrder[] | PaginatedResponse<DeliveryOrder>>(
      `${API_ENDPOINTS.DELIVERY}/orders?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Get delivery by ID
   */
  async getDeliveryById(id: string): Promise<DeliveryOrder> {
    const response = await apiClient.get<DeliveryOrder>(`${API_ENDPOINTS.DELIVERY}/orders/${id}`);
    return response.data;
  },

  /**
   * Get available delivery personnel
   */
  async getAvailableDeliveryPersonnel(branchId?: string): Promise<DeliveryPersonnel[]> {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);

    const response = await apiClient.get<DeliveryPersonnel[]>(
      `${API_ENDPOINTS.DELIVERY}/personnel?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Assign delivery to personnel
   */
  async assignDelivery(data: AssignDeliveryDto): Promise<DeliveryOrder> {
    const response = await apiClient.post<DeliveryOrder>(`${API_ENDPOINTS.DELIVERY}/assign`, data);
    return response.data;
  },

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(id: string, data: UpdateDeliveryStatusDto): Promise<DeliveryOrder> {
    const response = await apiClient.put<DeliveryOrder>(
      `${API_ENDPOINTS.DELIVERY}/orders/${id}/status`,
      data,
    );
    return response.data;
  },
};

