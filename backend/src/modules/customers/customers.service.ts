import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { TranslationService } from '../translations/services/translation.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomersService {
  constructor(
    private supabaseService: SupabaseService,
    private translationService: TranslationService,
  ) {}

  /**
   * Get all customers for a tenant
   */
  async getCustomers(
    tenantId: string,
    filters?: { search?: string; minOrders?: number; minSpent?: number; branchId?: string },
    pagination?: PaginationParams,
    language: string = 'en',
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build count query
    let countQuery = supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    let query = supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Filter by branch if provided (customers are branch-specific)
    if (filters?.branchId) {
      query = query.eq('branch_id', filters.branchId);
      countQuery = countQuery.eq('branch_id', filters.branchId);
    }

    if (filters?.search) {
      const searchFilter = `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`;
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }

    // Get total count
    const { count: totalCount } = await countQuery;

    // Apply pagination if provided
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      query = query.range(offset, offset + limit - 1);
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

    // Transform snake_case to camelCase and calculate loyalty tier, with translations
    const transformedCustomers = await Promise.all(
      filteredCustomers.map(async (customer: any) => {
        const totalOrders = customer.total_orders || 0;
        const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

        // Get translations for name and notes
        let translatedName = customer.name;
        let translatedNotes = customer.notes;

        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'customer',
            entityId: customer.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;

          if (customer.notes) {
            const notesTranslation = await this.translationService.getTranslation({
              entityType: 'customer',
              entityId: customer.id,
              languageCode: language,
              fieldName: 'notes',
              fallbackLanguage: 'en',
            });
            if (notesTranslation) translatedNotes = notesTranslation;
          }
        } catch (translationError) {
          console.warn(`Failed to get translations for customer ${customer.id}:`, translationError);
        }

        return {
          id: customer.id,
          tenantId: customer.tenant_id,
          name: translatedName,
          phone: customer.phone,
          email: customer.email,
          dateOfBirth: customer.date_of_birth,
          preferredLanguage: customer.preferred_language,
          notes: translatedNotes,
          totalOrders,
          totalSpent: Number(customer.total_spent || 0),
          averageOrderValue: totalOrders > 0 ? Number(customer.total_spent || 0) / totalOrders : 0,
          lastOrderDate: customer.last_order_date,
          loyaltyTier,
          createdAt: customer.created_at,
          updatedAt: customer.updated_at,
        };
      })
    );

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedCustomers, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedCustomers;
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
  async getCustomerById(tenantId: string, customerId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Parallelize: Recalculate statistics, fetch customer, addresses, and orders simultaneously
    const [customerResult, addressesResult, ordersResult] = await Promise.all([
      // Get customer
      supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single(),
      // Get customer addresses
      supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
      // Get order history
      supabase
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
        .limit(50), // Limit to last 50 orders
    ]);

    // Recalculate statistics after fetching (non-blocking - can be done in background)
    this.recalculateCustomerStatistics(tenantId, customerId).catch(err => {
      console.error('Failed to recalculate customer statistics:', err);
    });

    if (customerResult.error || !customerResult.data) {
      throw new NotFoundException('Customer not found');
    }

    const customer = customerResult.data;
    const addresses = addressesResult.data || [];
    const orders = ordersResult.data || [];

    // Calculate loyalty tier
    const totalOrders = customer.total_orders || 0;
    const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

    // Get translations for name and notes
    let translatedName = customer.name;
    let translatedNotes = customer.notes;

    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'customer',
        entityId: customer.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;

      if (customer.notes) {
        const notesTranslation = await this.translationService.getTranslation({
          entityType: 'customer',
          entityId: customer.id,
          languageCode: language,
          fieldName: 'notes',
          fallbackLanguage: 'en',
        });
        if (notesTranslation) translatedNotes = notesTranslation;
      }
    } catch (translationError) {
      console.warn(`Failed to get translations for customer ${customer.id}:`, translationError);
    }

    // Get default address for translation (if exists)
    const defaultAddress = addresses.find((addr: any) => addr.is_default) || addresses[0];
    let translatedAddress = defaultAddress?.address;
    let translatedCity = defaultAddress?.city;
    let translatedCountry = defaultAddress?.country;

    if (defaultAddress) {
      try {
        if (defaultAddress.address) {
          const addressTranslation = await this.translationService.getTranslation({
            entityType: 'customer',
            entityId: customer.id,
            languageCode: language,
            fieldName: 'address',
            fallbackLanguage: 'en',
          });
          if (addressTranslation) translatedAddress = addressTranslation;
        }

        if (defaultAddress.city) {
          const cityTranslation = await this.translationService.getTranslation({
            entityType: 'customer',
            entityId: customer.id,
            languageCode: language,
            fieldName: 'city',
            fallbackLanguage: 'en',
          });
          if (cityTranslation) translatedCity = cityTranslation;
        }

        if (defaultAddress.country) {
          const countryTranslation = await this.translationService.getTranslation({
            entityType: 'customer',
            entityId: customer.id,
            languageCode: language,
            fieldName: 'country',
            fallbackLanguage: 'en',
          });
          if (countryTranslation) translatedCountry = countryTranslation;
        }
      } catch (translationError) {
        console.warn(`Failed to get address translations for customer ${customer.id}:`, translationError);
      }
    }

    // Transform snake_case to camelCase
    const translatedAddresses = addresses.map((addr: any) => {
      // Use translated values for default address, otherwise use original
      const isDefaultAddr = addr.is_default || (!defaultAddress && addr.id === addresses[0]?.id);
      return {
        id: addr.id,
        customerId: addr.customer_id,
        addressLabel: addr.address_label,
        address: isDefaultAddr && translatedAddress ? translatedAddress : addr.address,
        city: isDefaultAddr && translatedCity ? translatedCity : addr.city,
        state: addr.state,
        country: isDefaultAddr && translatedCountry ? translatedCountry : addr.country,
        latitude: addr.latitude ? Number(addr.latitude) : undefined,
        longitude: addr.longitude ? Number(addr.longitude) : undefined,
        isDefault: addr.is_default,
        createdAt: addr.created_at,
        updatedAt: addr.updated_at,
      };
    });

    return {
      id: customer.id,
      tenantId: customer.tenant_id,
      name: translatedName,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.date_of_birth,
      preferredLanguage: customer.preferred_language,
      notes: translatedNotes,
      totalOrders,
      totalSpent: Number(customer.total_spent || 0),
      averageOrderValue: totalOrders > 0 ? Number(customer.total_spent || 0) / totalOrders : 0,
      lastOrderDate: customer.last_order_date,
      loyaltyTier,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      addresses: translatedAddresses,
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
  async createCustomer(tenantId: string, createDto: CreateCustomerDto, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if phone already exists in the same branch (or tenant if no branch)
    let phoneCheckQuery = supabase
      .from('customers')
      .select('id')
      .eq('phone', createDto.phone)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    if (branchId) {
      phoneCheckQuery = phoneCheckQuery.eq('branch_id', branchId);
    }
    
    const { data: existingCustomer } = await phoneCheckQuery.maybeSingle();

    if (existingCustomer) {
      throw new BadRequestException('Customer with this phone number already exists');
    }

    // Create customer
    const customerData: any = {
      tenant_id: tenantId,
      name: createDto.name,
      phone: createDto.phone,
      email: createDto.email,
      date_of_birth: createDto.dateOfBirth,
      preferred_language: createDto.preferredLanguage || 'en',
      notes: createDto.notes,
    };
    
    if (branchId) {
      customerData.branch_id = branchId;
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) {
      // Check for duplicate phone number error
      if (error.code === '23505' || 
          error.message?.includes('customers_phone_key') || 
          error.message?.includes('duplicate key') ||
          error.message?.includes('unique constraint')) {
        throw new ConflictException(
          `A customer with phone number ${createDto.phone} already exists. Please use a different phone number or select the existing customer.`
        );
      }
      throw new InternalServerErrorException(`Failed to create customer: ${error.message}`);
    }

    // Create address if provided
    let defaultAddressId: string | undefined;
    if (createDto.address) {
      const { data: addressData } = await supabase.from('customer_addresses').insert({
        customer_id: customer.id,
        address_label: createDto.address.label || 'home',
        address: createDto.address.address,
        city: createDto.address.city,
        state: createDto.address.state,
        country: createDto.address.country || 'Iraq',
        latitude: createDto.address.latitude,
        longitude: createDto.address.longitude,
        is_default: true,
      }).select('id').single();
      
      if (addressData) defaultAddressId = addressData.id;
    }

    // Create translations for name, notes, and address fields
    try {
      await this.translationService.createTranslations({
        entityType: 'customer',
        entityId: customer.id,
        fieldName: 'name',
        text: createDto.name,
      });

      if (createDto.notes) {
        await this.translationService.createTranslations({
          entityType: 'customer',
          entityId: customer.id,
          fieldName: 'notes',
          text: createDto.notes,
        });
      }

      // Create translations for address fields if provided
      if (createDto.address) {
        if (createDto.address.address) {
          await this.translationService.createTranslations({
            entityType: 'customer',
            entityId: customer.id,
            fieldName: 'address',
            text: createDto.address.address,
          });
        }

        if (createDto.address.city) {
          await this.translationService.createTranslations({
            entityType: 'customer',
            entityId: customer.id,
            fieldName: 'city',
            text: createDto.address.city,
          });
        }

        if (createDto.address.country) {
          await this.translationService.createTranslations({
            entityType: 'customer',
            entityId: customer.id,
            fieldName: 'country',
            text: createDto.address.country,
          });
        }
      }
    } catch (translationError) {
      console.warn(`Failed to create translations for customer ${customer.id}:`, translationError);
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
  async updateCustomer(tenantId: string, customerId: string, updateDto: UpdateCustomerDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if customer exists and get current values for translation comparison
    const currentCustomer = await this.getCustomerById(tenantId, customerId, 'en');

    // Check if phone is being changed and if new phone already exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (updateDto.phone && existingCustomer && updateDto.phone !== existingCustomer.phone) {
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

    // Update translations if name, notes, address, city, or country changed
    try {
      // Get default address for address fields translation
      const defaultAddress = currentCustomer.addresses?.find((addr: any) => addr.isDefault) || currentCustomer.addresses?.[0];

      if (updateDto.name !== undefined && updateDto.name !== currentCustomer.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'customer',
            entityId: customerId,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.notes !== undefined && updateDto.notes !== currentCustomer.notes) {
        await this.translationService.updateTranslation(
          {
            entityType: 'customer',
            entityId: customerId,
            languageCode: language,
            fieldName: 'notes',
            translatedText: updateDto.notes,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      // Note: Address, city, and country are stored in customer_addresses table
      // These translations would need to be handled separately if address is updated
      // For now, we only handle name and notes as direct customer fields
    } catch (translationError) {
      console.error('Failed to update translations for customer:', translationError);
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
