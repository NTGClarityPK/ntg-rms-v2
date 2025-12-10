import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

export type DeliveryStatus = 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled';

@Injectable()
export class DeliveryService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all delivery orders with filters
   */
  async getDeliveryOrders(
    tenantId: string,
    filters?: {
      status?: DeliveryStatus;
      deliveryPersonId?: string;
      branchId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build query for deliveries
    let query = supabase
      .from('deliveries')
      .select(
        `
        *,
        order:orders(
          id,
          order_number,
          token_number,
          order_type,
          status,
          payment_status,
          subtotal,
          discount_amount,
          tax_amount,
          delivery_charge,
          total_amount,
          special_instructions,
          order_date,
          placed_at,
          customer_id,
          branch_id,
          customer:customers(
            id,
            name_en,
            name_ar,
            phone,
            email
          ),
          branch:branches(
            id,
            name_en,
            name_ar,
            code
          )
        ),
        delivery_person:users!deliveries_delivery_person_id_fkey(
          id,
          name_en,
          name_ar,
          phone,
          email
        ),
        customer_address:customer_addresses(
          id,
          address_en,
          address_ar,
          city,
          state,
          country,
          latitude,
          longitude,
          is_default
        )
      `,
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.deliveryPersonId) {
      query = query.eq('delivery_person_id', filters.deliveryPersonId);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    const { data: deliveries, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch deliveries: ${error.message}`);
    }

    // Filter by tenant (through order relationship) and branch
    let filteredDeliveries = (deliveries || []).filter((delivery: any) => {
      const order = delivery.order;
      if (!order) return false;

      // Check tenant through order
      // Note: We need to check tenant_id from order, but it's not in the select
      // We'll filter this in a second query or add tenant_id to the select
      return true;
    });

    // If branch filter is provided, filter by order branch
    if (filters?.branchId) {
      filteredDeliveries = filteredDeliveries.filter(
        (delivery: any) => delivery.order?.branch_id === filters.branchId,
      );
    }

    // Transform to camelCase and ensure we have tenant isolation
    // We need to verify tenant_id through order, so let's do a more efficient query
    const { data: orders } = await supabase
      .from('orders')
      .select('id, tenant_id, branch_id')
      .eq('tenant_id', tenantId)
      .in(
        'id',
        filteredDeliveries.map((d: any) => d.order_id).filter(Boolean),
      );

    const validOrderIds = new Set(orders?.map((o: any) => o.id) || []);

    return filteredDeliveries
      .filter((delivery: any) => validOrderIds.has(delivery.order_id))
      .map((delivery: any) => ({
        id: delivery.id,
        orderId: delivery.order_id,
        deliveryPersonId: delivery.delivery_person_id || null,
        customerAddressId: delivery.customer_address_id || null,
        status: delivery.status as DeliveryStatus,
        estimatedDeliveryTime: delivery.estimated_delivery_time || null,
        actualDeliveryTime: delivery.actual_delivery_time || null,
        deliveryCharge: Number(delivery.delivery_charge) || 0,
        distanceKm: delivery.distance_km ? Number(delivery.distance_km) : null,
        notes: delivery.notes || null,
        createdAt: delivery.created_at,
        updatedAt: delivery.updated_at,
        order: delivery.order
          ? {
              id: delivery.order.id,
              orderNumber: delivery.order.order_number,
              tokenNumber: delivery.order.token_number || null,
              orderType: delivery.order.order_type,
              status: delivery.order.status,
              paymentStatus: delivery.order.payment_status,
              subtotal: Number(delivery.order.subtotal) || 0,
              discountAmount: Number(delivery.order.discount_amount) || 0,
              taxAmount: Number(delivery.order.tax_amount) || 0,
              deliveryCharge: Number(delivery.order.delivery_charge) || 0,
              totalAmount: Number(delivery.order.total_amount) || 0,
              specialInstructions: delivery.order.special_instructions || null,
              orderDate: delivery.order.order_date || delivery.order.placed_at,
              placedAt: delivery.order.placed_at || null,
              customerId: delivery.order.customer_id || null,
              branchId: delivery.order.branch_id || null,
              customer: delivery.order.customer
                ? {
                    id: delivery.order.customer.id,
                    nameEn: delivery.order.customer.name_en,
                    nameAr: delivery.order.customer.name_ar,
                    phone: delivery.order.customer.phone,
                    email: delivery.order.customer.email,
                  }
                : null,
              branch: delivery.order.branch
                ? {
                    id: delivery.order.branch.id,
                    nameEn: delivery.order.branch.name_en,
                    nameAr: delivery.order.branch.name_ar,
                    code: delivery.order.branch.code,
                  }
                : null,
            }
          : null,
        deliveryPerson: delivery.delivery_person
          ? {
              id: delivery.delivery_person.id,
              nameEn: delivery.delivery_person.name_en,
              nameAr: delivery.delivery_person.name_ar,
              phone: delivery.delivery_person.phone,
              email: delivery.delivery_person.email,
            }
          : null,
        customerAddress: delivery.customer_address
          ? {
              id: delivery.customer_address.id,
              addressEn: delivery.customer_address.address_en || '',
              addressAr: delivery.customer_address.address_ar || null,
              addressLine1: delivery.customer_address.address_en || '', // Keep for backward compatibility
              addressLine2: delivery.customer_address.address_ar || null, // Keep for backward compatibility
              city: delivery.customer_address.city || null,
              state: delivery.customer_address.state || null,
              country: delivery.customer_address.country || null,
              postalCode: null, // postal_code doesn't exist in schema
              latitude: delivery.customer_address.latitude
                ? Number(delivery.customer_address.latitude)
                : null,
              longitude: delivery.customer_address.longitude
                ? Number(delivery.customer_address.longitude)
                : null,
              isDefault: delivery.customer_address.is_default || false,
            }
          : null,
      }));
  }

  /**
   * Get delivery by ID
   */
  async getDeliveryById(tenantId: string, deliveryId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: delivery, error } = await supabase
      .from('deliveries')
      .select(
        `
        *,
        order:orders!inner(
          id,
          tenant_id,
          order_number,
          token_number,
          order_type,
          status,
          payment_status,
          subtotal,
          discount_amount,
          tax_amount,
          delivery_charge,
          total_amount,
          special_instructions,
          order_date,
          placed_at,
          customer_id,
          branch_id
        )
      `,
      )
      .eq('id', deliveryId)
      .eq('order.tenant_id', tenantId)
      .single();

    if (error || !delivery) {
      throw new NotFoundException('Delivery not found');
    }

    // Get related data
    const [deliveryPerson, customerAddress] = await Promise.all([
      delivery.delivery_person_id
        ? supabase
            .from('users')
            .select('id, name_en, name_ar, phone, email')
            .eq('id', delivery.delivery_person_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      delivery.customer_address_id
        ? supabase
            .from('customer_addresses')
            .select('*')
            .eq('id', delivery.customer_address_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    return {
      id: delivery.id,
      orderId: delivery.order_id,
      deliveryPersonId: delivery.delivery_person_id || null,
      customerAddressId: delivery.customer_address_id || null,
      status: delivery.status as DeliveryStatus,
      estimatedDeliveryTime: delivery.estimated_delivery_time || null,
      actualDeliveryTime: delivery.actual_delivery_time || null,
      deliveryCharge: Number(delivery.delivery_charge) || 0,
      distanceKm: delivery.distance_km ? Number(delivery.distance_km) : null,
      notes: delivery.notes || null,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
      order: {
        id: delivery.order.id,
        orderNumber: delivery.order.order_number,
        tokenNumber: delivery.order.token_number || null,
        orderType: delivery.order.order_type,
        status: delivery.order.status,
        paymentStatus: delivery.order.payment_status,
        subtotal: Number(delivery.order.subtotal) || 0,
        discountAmount: Number(delivery.order.discount_amount) || 0,
        taxAmount: Number(delivery.order.tax_amount) || 0,
        deliveryCharge: Number(delivery.order.delivery_charge) || 0,
        totalAmount: Number(delivery.order.total_amount) || 0,
        specialInstructions: delivery.order.special_instructions || null,
        orderDate: delivery.order.order_date || delivery.order.placed_at,
        placedAt: delivery.order.placed_at || null,
        customerId: delivery.order.customer_id || null,
        branchId: delivery.order.branch_id || null,
      },
      deliveryPerson: deliveryPerson.data
        ? {
            id: deliveryPerson.data.id,
            nameEn: deliveryPerson.data.name_en,
            nameAr: deliveryPerson.data.name_ar,
            phone: deliveryPerson.data.phone,
            email: deliveryPerson.data.email,
          }
        : null,
      customerAddress: customerAddress.data
        ? {
            id: customerAddress.data.id,
            addressEn: customerAddress.data.address_en || '',
            addressAr: customerAddress.data.address_ar || null,
            addressLine1: customerAddress.data.address_en || '', // Keep for backward compatibility
            addressLine2: customerAddress.data.address_ar || null, // Keep for backward compatibility
            city: customerAddress.data.city || null,
            state: customerAddress.data.state || null,
            country: customerAddress.data.country || null,
            postalCode: null, // postal_code doesn't exist in schema
            latitude: customerAddress.data.latitude
              ? Number(customerAddress.data.latitude)
              : null,
            longitude: customerAddress.data.longitude
              ? Number(customerAddress.data.longitude)
              : null,
            isDefault: customerAddress.data.is_default || false,
          }
        : null,
    };
  }

  /**
   * Get available delivery personnel (active delivery staff)
   */
  async getAvailableDeliveryPersonnel(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    let query = supabase
      .from('users')
      .select(
        `
        id,
        name_en,
        name_ar,
        phone,
        email,
        is_active,
        user_branches(
          branch:branches(id, name_en, name_ar, code)
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('role', 'delivery')
      .eq('is_active', true)
      .is('deleted_at', null);

    const { data: personnel, error } = await query;

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch delivery personnel: ${error.message}`,
      );
    }

    // Filter by branch if specified
    let filteredPersonnel = personnel || [];
    if (branchId) {
      filteredPersonnel = filteredPersonnel.filter((person: any) =>
        person.user_branches?.some((ub: any) => ub.branch?.id === branchId),
      );
    }

    // Get current active deliveries count for each person
    const personnelIds = filteredPersonnel.map((p: any) => p.id);
    const { data: activeDeliveries } = await supabase
      .from('deliveries')
      .select('delivery_person_id')
      .in('delivery_person_id', personnelIds)
      .in('status', ['assigned', 'out_for_delivery']);

    const deliveryCounts = new Map<string, number>();
    activeDeliveries?.forEach((delivery: any) => {
      if (delivery.delivery_person_id) {
        deliveryCounts.set(
          delivery.delivery_person_id,
          (deliveryCounts.get(delivery.delivery_person_id) || 0) + 1,
        );
      }
    });

    return filteredPersonnel.map((person: any) => ({
      id: person.id,
      nameEn: person.name_en,
      nameAr: person.name_ar,
      phone: person.phone,
      email: person.email,
      isActive: person.is_active,
      activeDeliveriesCount: deliveryCounts.get(person.id) || 0,
      branches: (person.user_branches || []).map((ub: any) => ({
        id: ub.branch?.id,
        nameEn: ub.branch?.name_en,
        nameAr: ub.branch?.name_ar,
        code: ub.branch?.code,
      })),
    }));
  }

  /**
   * Assign delivery to personnel
   */
  async assignDelivery(tenantId: string, userId: string, assignDto: AssignDeliveryDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify order exists and belongs to tenant
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_id, order_type, customer_id')
      .eq('id', assignDto.orderId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Order not found');
    }

    if (order.order_type !== 'delivery') {
      throw new BadRequestException('Order is not a delivery order');
    }

    // Get customer_address_id from delivery record if it exists
    let customerAddressId: string | null = null;
    const { data: existingDelivery } = await supabase
      .from('deliveries')
      .select('customer_address_id')
      .eq('order_id', assignDto.orderId)
      .maybeSingle();
    
    if (existingDelivery) {
      customerAddressId = existingDelivery.customer_address_id || null;
    }

    // Verify delivery person exists and is active
    const { data: deliveryPerson, error: personError } = await supabase
      .from('users')
      .select('id, role, is_active, tenant_id')
      .eq('id', assignDto.deliveryPersonId)
      .eq('tenant_id', tenantId)
      .eq('role', 'delivery')
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (personError || !deliveryPerson) {
      throw new BadRequestException('Invalid or inactive delivery personnel');
    }

    // Check if delivery already exists
    const { data: existingDeliveryRecord } = await supabase
      .from('deliveries')
      .select('id, status')
      .eq('order_id', assignDto.orderId)
      .maybeSingle();

    let deliveryId: string;
    let deliveryCharge = 0;

    // Get delivery charge from order
    const { data: orderDetails } = await supabase
      .from('orders')
      .select('delivery_charge')
      .eq('id', assignDto.orderId)
      .single();

    if (orderDetails) {
      deliveryCharge = Number(orderDetails.delivery_charge) || 0;
    }

    if (existingDeliveryRecord) {
      // Update existing delivery
      const { data: updatedDelivery, error: updateError } = await supabase
        .from('deliveries')
        .update({
          delivery_person_id: assignDto.deliveryPersonId,
          status: 'assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeliveryRecord.id)
        .select()
        .single();

      if (updateError) {
        throw new InternalServerErrorException(
          `Failed to assign delivery: ${updateError.message}`,
        );
      }

      deliveryId = updatedDelivery.id;
    } else {
      // Create new delivery record
      const { data: newDelivery, error: createError } = await supabase
        .from('deliveries')
        .insert({
          order_id: assignDto.orderId,
          delivery_person_id: assignDto.deliveryPersonId,
          customer_address_id: customerAddressId,
          status: 'assigned',
          delivery_charge: deliveryCharge,
        })
        .select()
        .single();

      if (createError) {
        throw new InternalServerErrorException(
          `Failed to create delivery: ${createError.message}`,
        );
      }

      deliveryId = newDelivery.id;
    }

    return this.getDeliveryById(tenantId, deliveryId);
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    tenantId: string,
    userId: string,
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify delivery exists and belongs to tenant
    const delivery = await this.getDeliveryById(tenantId, deliveryId);

    const validStatuses: DeliveryStatus[] = [
      'pending',
      'assigned',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ];
    if (!validStatuses.includes(updateDto.status as DeliveryStatus)) {
      throw new BadRequestException(`Invalid status: ${updateDto.status}`);
    }

    const updateData: any = {
      status: updateDto.status,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on status
    if (updateDto.status === 'out_for_delivery' && !delivery.actualDeliveryTime) {
      // Could set estimated delivery time here if provided
    }

    if (updateDto.status === 'delivered' && !delivery.actualDeliveryTime) {
      updateData.actual_delivery_time = new Date().toISOString();
    }

    if (updateDto.status === 'cancelled') {
      // Could add cancellation reason if needed
    }

    // If restoring from cancelled to pending, clear delivery person assignment
    if (updateDto.status === 'pending' && delivery.status === 'cancelled') {
      updateData.delivery_person_id = null;
      updateData.estimated_delivery_time = null;
    }

    const { data: updatedDelivery, error: updateError } = await supabase
      .from('deliveries')
      .update(updateData)
      .eq('id', deliveryId)
      .select()
      .single();

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to update delivery status: ${updateError.message}`,
      );
    }

    // If delivered, update order status to completed
    if (updateDto.status === 'delivered' && delivery.order) {
      await supabase
        .from('orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.order.id);
    }

    return this.getDeliveryById(tenantId, deliveryId);
  }

  /**
   * Create delivery record when order is created (called from orders service)
   */
  async createDeliveryForOrder(
    tenantId: string,
    orderId: string,
    customerAddressId?: string,
    deliveryCharge: number = 0,
    notes?: string | null,
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if delivery already exists
    const { data: existing } = await supabase
      .from('deliveries')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existing) {
      return existing.id;
    }

    const { data: delivery, error } = await supabase
      .from('deliveries')
      .insert({
        order_id: orderId,
        customer_address_id: customerAddressId || null,
        status: 'pending',
        delivery_charge: deliveryCharge,
        notes: notes || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create delivery record:', error);
      // Don't throw - delivery creation failure shouldn't break order creation
      return null;
    }

    return delivery.id;
  }
}
