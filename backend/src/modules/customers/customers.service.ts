import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all customers for a tenant
   */
  async getCustomers(tenantId: string, filters?: { search?: string; minOrders?: number; minSpent?: number }) {
    const supabase = this.supabaseService.getServiceRoleClient();

    let query = supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`,
      );
    }

    const { data: customers, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch customers: ${error.message}`);
    }

    // Filter by min orders and min spent
    let filteredCustomers = customers || [];
    if (filters?.minOrders) {
      filteredCustomers = filteredCustomers.filter((c: any) => (c.total_orders || 0) >= filters.minOrders!);
    }
    if (filters?.minSpent) {
      filteredCustomers = filteredCustomers.filter((c: any) => Number(c.total_spent || 0) >= filters.minSpent!);
    }

    // Transform snake_case to camelCase and calculate loyalty tier
    return filteredCustomers.map((customer: any) => {
      const totalOrders = customer.total_orders || 0;
      const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

      return {
        id: customer.id,
        tenantId: customer.tenant_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        dateOfBirth: customer.date_of_birth,
        preferredLanguage: customer.preferred_language,
        notes: customer.notes,
        totalOrders,
        totalSpent: Number(customer.total_spent || 0),
        averageOrderValue: totalOrders > 0 ? Number(customer.total_spent || 0) / totalOrders : 0,
        lastOrderDate: customer.last_order_date,
        loyaltyTier,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
      };
    });
  }

  /**
   * Recalculate customer statistics from completed orders
   */
  private async recalculateCustomerStatistics(tenantId: string, customerId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get all completed orders for this customer
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('total_amount, order_date, completed_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .is('deleted_at', null);

    if (!completedOrders || completedOrders.length === 0) {
      // No completed orders, reset statistics
      await supabase
        .from('customers')
        .update({
          total_orders: 0,
          total_spent: 0,
          last_order_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .eq('tenant_id', tenantId);
      return;
    }

    // Calculate statistics
    const totalOrders = completedOrders.length;
    const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    
    // Get the most recent order date
    const orderDates = completedOrders
      .map((order) => order.completed_at || order.order_date)
      .filter(Boolean)
      .sort()
      .reverse();
    const lastOrderDate = orderDates.length > 0 ? orderDates[0] : null;

    // Update customer statistics
    await supabase
      .from('customers')
      .update({
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('tenant_id', tenantId);
  }

  /**
   * Get customer by ID with order history
   */
  async getCustomerById(tenantId: string, customerId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Recalculate customer statistics to ensure they're up to date
    await this.recalculateCustomerStatistics(tenantId, customerId);

    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get customer addresses
    const { data: addresses } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    // Get order history
    const { data: orders } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        order_type,
        status,
        payment_status,
        total_amount,
        order_date,
        created_at
      `,
      )
      .eq('customer_id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('order_date', { ascending: false })
      .limit(50); // Limit to last 50 orders

    // Calculate loyalty tier
    const totalOrders = customer.total_orders || 0;
    const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

    // Transform snake_case to camelCase
    return {
      id: customer.id,
      tenantId: customer.tenant_id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.date_of_birth,
      preferredLanguage: customer.preferred_language,
      notes: customer.notes,
      totalOrders,
      totalSpent: Number(customer.total_spent || 0),
      averageOrderValue: totalOrders > 0 ? Number(customer.total_spent || 0) / totalOrders : 0,
      lastOrderDate: customer.last_order_date,
      loyaltyTier,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      addresses: (addresses || []).map((addr: any) => ({
        id: addr.id,
        customerId: addr.customer_id,
        addressLabel: addr.address_label,
        address: addr.address,
        city: addr.city,
        state: addr.state,
        country: addr.country,
        latitude: addr.latitude ? Number(addr.latitude) : undefined,
        longitude: addr.longitude ? Number(addr.longitude) : undefined,
        isDefault: addr.is_default,
        createdAt: addr.created_at,
        updatedAt: addr.updated_at,
      })),
      orderHistory: (orders || []).map((order: any) => ({
        id: order.id,
        orderNumber: order.order_number,
        orderType: order.order_type,
        status: order.status,
        paymentStatus: order.payment_status,
        totalAmount: Number(order.total_amount || 0),
        orderDate: order.order_date,
        createdAt: order.created_at,
      })),
    };
  }

  /**
   * Create a new customer
   */
  async createCustomer(tenantId: string, createDto: CreateCustomerDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if phone already exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', createDto.phone)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingCustomer) {
      throw new BadRequestException('Customer with this phone number already exists');
    }

    // Create customer
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        phone: createDto.phone,
        email: createDto.email,
        date_of_birth: createDto.dateOfBirth,
        preferred_language: createDto.preferredLanguage || 'en',
        notes: createDto.notes,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create customer: ${error.message}`);
    }

    // Create address if provided
    if (createDto.address) {
      await supabase.from('customer_addresses').insert({
        customer_id: customer.id,
        address_label: createDto.address.label || 'home',
        address: createDto.address.address,
        city: createDto.address.city,
        state: createDto.address.state,
        country: createDto.address.country || 'Iraq',
        latitude: createDto.address.latitude,
        longitude: createDto.address.longitude,
        is_default: true,
      });
    }

    // Transform snake_case to camelCase
    return {
      id: customer.id,
      tenantId: customer.tenant_id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.date_of_birth,
      preferredLanguage: customer.preferred_language,
      notes: customer.notes,
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      lastOrderDate: null,
      loyaltyTier: 'regular',
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    };
  }

  /**
   * Update a customer
   */
  async updateCustomer(tenantId: string, customerId: string, updateDto: UpdateCustomerDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if customer exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existingCustomer) {
      throw new NotFoundException('Customer not found');
    }

    // Check if phone is being changed and if new phone already exists
    if (updateDto.phone && updateDto.phone !== existingCustomer.phone) {
      const { data: phoneExists } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', updateDto.phone)
        .neq('id', customerId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (phoneExists) {
        throw new BadRequestException('Phone number already exists');
      }
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.phone !== undefined) updateData.phone = updateDto.phone;
    if (updateDto.email !== undefined) updateData.email = updateDto.email;
    if (updateDto.dateOfBirth !== undefined) updateData.date_of_birth = updateDto.dateOfBirth;
    if (updateDto.preferredLanguage !== undefined) updateData.preferred_language = updateDto.preferredLanguage;
    if (updateDto.notes !== undefined) updateData.notes = updateDto.notes;

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to update customer: ${error.message}`);
    }

    // Transform snake_case to camelCase
    const totalOrders = customer.total_orders || 0;
    const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

    return {
      id: customer.id,
      tenantId: customer.tenant_id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.date_of_birth,
      preferredLanguage: customer.preferred_language,
      notes: customer.notes,
      totalOrders,
      totalSpent: Number(customer.total_spent || 0),
      averageOrderValue: totalOrders > 0 ? Number(customer.total_spent || 0) / totalOrders : 0,
      lastOrderDate: customer.last_order_date,
      loyaltyTier,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    };
  }

  /**
   * Create a customer address
   */
  async createCustomerAddress(tenantId: string, customerId: string, addressDto: {
    label?: string;
    address: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify customer exists and belongs to tenant
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // Create address
    const { data: address, error } = await supabase
      .from('customer_addresses')
      .insert({
        customer_id: customerId,
        address_label: addressDto.label || 'home',
        address: addressDto.address,
        city: addressDto.city || null,
        state: addressDto.state || null,
        country: addressDto.country || 'Iraq',
        latitude: addressDto.latitude || null,
        longitude: addressDto.longitude || null,
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create address: ${error.message}`);
    }

    // Transform snake_case to camelCase
    return {
      id: address.id,
      customerId: address.customer_id,
      addressLabel: address.address_label,
      address: address.address,
      city: address.city,
      state: address.state,
      country: address.country,
      latitude: address.latitude ? Number(address.latitude) : undefined,
      longitude: address.longitude ? Number(address.longitude) : undefined,
      isDefault: address.is_default,
      createdAt: address.created_at,
      updatedAt: address.updated_at,
    };
  }

  /**
   * Calculate loyalty tier based on order count
   */
  private calculateLoyaltyTier(totalOrders: number): 'regular' | 'silver' | 'gold' | 'platinum' {
    if (totalOrders >= 100) return 'platinum';
    if (totalOrders >= 51) return 'gold';
    if (totalOrders >= 3) return 'silver';
    return 'regular';
  }
}
