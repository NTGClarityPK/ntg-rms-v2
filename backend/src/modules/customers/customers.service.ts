import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { TranslationService } from '../translations/services/translation.service';
import { BulkImportService, FieldDefinition } from '../menu/utils/bulk-import.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';
import { EntityType, FieldName } from '../translations/dto/create-translation.dto';

@Injectable()
export class CustomersService {
  constructor(
    private supabaseService: SupabaseService,
    private translationService: TranslationService,
    private bulkImportService: BulkImportService,
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
          // Only fetch translations if language is not English
          if (language !== 'en') {
            const allTranslations = await this.translationService.getEntityTranslations(
              EntityType.CUSTOMER,
              customer.id,
            );
            
            // Check if translation exists for the requested language
            if (allTranslations?.name?.[language]) {
              translatedName = allTranslations.name[language];
            }
            
            if (customer.notes && allTranslations?.notes?.[language]) {
              translatedNotes = allTranslations.notes[language];
            }
          }
        } catch (translationError) {
          // Silently fail - translation might not exist yet (created asynchronously)
          // or there might be an error, but we'll use the original value
        }

        // Fetch default address with translations
        let defaultAddress = null;
        try {
          const { data: addresses } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', customer.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1);

          if (addresses && addresses.length > 0) {
            const address = addresses[0];
            let translatedAddress = address.address;
            let translatedCity = address.city;
            let translatedCountry = address.country;

            // Get address translations if language is not English
            if (language !== 'en') {
              try {
                const addressTranslations = await this.translationService.getEntityTranslations(
                  EntityType.CUSTOMER_ADDRESS,
                  address.id,
                );

                if (addressTranslations?.address?.[language]) {
                  translatedAddress = addressTranslations.address[language];
                }
                if (addressTranslations?.city?.[language]) {
                  translatedCity = addressTranslations.city[language];
                }
                if (addressTranslations?.country?.[language]) {
                  translatedCountry = addressTranslations.country[language];
                }
              } catch (addressTranslationError) {
                // Silently fail - use original values
              }
            }

            defaultAddress = {
              id: address.id,
              address: translatedAddress,
              city: translatedCity,
              country: translatedCountry,
              isDefault: address.is_default,
            };
          }
        } catch (addressError) {
          // Silently fail - address might not exist
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
          defaultAddress,
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
      // Only fetch translations if language is not English
      if (language !== 'en') {
        const allTranslations = await this.translationService.getEntityTranslations(
          EntityType.CUSTOMER,
          customer.id,
        );
        
        // Check if translation exists for the requested language
        if (allTranslations?.name?.[language]) {
          translatedName = allTranslations.name[language];
        }
        
        if (customer.notes && allTranslations?.notes?.[language]) {
          translatedNotes = allTranslations.notes[language];
        }
      }
    } catch (translationError) {
      // Silently fail - translation might not exist yet (created asynchronously)
      // or there might be an error, but we'll use the original value
    }

    // Get default address for translation (if exists)
    const defaultAddress = addresses.find((addr: any) => addr.is_default) || addresses[0];
    let translatedAddress = defaultAddress?.address;
    let translatedCity = defaultAddress?.city;
    let translatedCountry = defaultAddress?.country;

    if (defaultAddress && language !== 'en') {
      try {
        // Address translations are stored with CUSTOMER_ADDRESS entity type and address ID
        const allAddressTranslations = await this.translationService.getEntityTranslations(
          'customer_address' as any,
          defaultAddress.id,
        );
        
        if (defaultAddress.address && allAddressTranslations?.address?.[language]) {
          translatedAddress = allAddressTranslations.address[language];
        }
        
        if (defaultAddress.city && allAddressTranslations?.city?.[language]) {
          translatedCity = allAddressTranslations.city[language];
        }
        
        if (defaultAddress.country && allAddressTranslations?.country?.[language]) {
          translatedCountry = allAddressTranslations.country[language];
        }
      } catch (translationError) {
        // Silently fail - translation might not exist yet (created asynchronously)
        // or there might be an error, but we'll use the original value
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
  async createCustomer(tenantId: string, createDto: CreateCustomerDto, branchId?: string, skipTranslations: boolean = false) {
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

    // Check if customer name already exists for this tenant
    let nameCheckQuery = supabase
      .from('customers')
      .select('id')
      .eq('name', createDto.name.trim())
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    const { data: existingCustomerByName } = await nameCheckQuery.maybeSingle();

    if (existingCustomerByName) {
      throw new ConflictException('A customer with this name already exists in this tenant');
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
      // This handles both the old global constraint (customers_phone_key) and new tenant-scoped constraints
      if (error.code === '23505' || 
          error.message?.includes('customers_phone_key') || 
          error.message?.includes('idx_customers_tenant_phone_unique') ||
          error.message?.includes('idx_customers_tenant_branch_phone_unique') ||
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

    // Create translations for name, notes, and address fields asynchronously (fire and forget)
    // Skip translations if called from bulk import (will be handled in batch)
    if (!skipTranslations) {
      // Use batch translation to handle multiple fields efficiently
      // Don't block the response - translations will be processed in the background
      const customerFieldsToTranslate = [
        { fieldName: 'name', text: createDto.name },
        ...(createDto.notes ? [{ fieldName: 'notes', text: createDto.notes }] : []),
      ];

      this.translationService
        .createBatchTranslations('customer', customer.id, customerFieldsToTranslate, undefined, tenantId)
        .catch((translationError) => {
          console.error('Failed to create batch translations for customer:', translationError);
        });

      // Create translations for address fields if provided
      // Address translations use CUSTOMER_ADDRESS entity type with the address ID
      // Use batch translation for all address fields at once
      if (createDto.address && defaultAddressId) {
        const addressFieldsToTranslate = [
          ...(createDto.address.address ? [{ fieldName: FieldName.ADDRESS, text: createDto.address.address }] : []),
          ...(createDto.address.city ? [{ fieldName: FieldName.CITY, text: createDto.address.city }] : []),
          ...(createDto.address.state ? [{ fieldName: FieldName.STATE, text: createDto.address.state }] : []),
          ...(createDto.address.country ? [{ fieldName: FieldName.COUNTRY, text: createDto.address.country }] : []),
        ];

        if (addressFieldsToTranslate.length > 0) {
          this.translationService
            .createBatchTranslations(
              EntityType.CUSTOMER_ADDRESS,
              defaultAddressId,
              addressFieldsToTranslate,
              undefined,
              tenantId,
            )
            .catch((translationError) => {
              console.error('Failed to create batch translations for customer address:', translationError);
            });
        }
      }
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
      message: 'Customer created successfully. Translations are being processed in the background and will be available shortly.',
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

    // Check if name is being changed and if new name already exists
    if (updateDto.name && updateDto.name.trim() !== '' && updateDto.name.trim() !== currentCustomer.name) {
      const { data: nameExists } = await supabase
        .from('customers')
        .select('id')
        .eq('name', updateDto.name.trim())
        .neq('id', customerId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (nameExists) {
        throw new ConflictException('A customer with this name already exists in this tenant');
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

    // Get translations for name and notes based on language
    let translatedName = customer.name;
    let translatedNotes = customer.notes;

    try {
      // Only fetch translations if language is not English
      if (language !== 'en') {
        const allTranslations = await this.translationService.getEntityTranslations(
          EntityType.CUSTOMER,
          customerId,
        );
        
        // Check if translation exists for the requested language
        if (allTranslations?.name?.[language]) {
          translatedName = allTranslations.name[language];
        }
        
        if (customer.notes && allTranslations?.notes?.[language]) {
          translatedNotes = allTranslations.notes[language];
        }
      }
    } catch (translationError) {
      // Silently fail - translation might not exist yet
    }

    // Fetch addresses with translations
    const { data: addresses } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    const translatedAddresses = (addresses || []).map((addr: any) => ({
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
    }));

    // Fetch address translations asynchronously if language is not English
    if (language !== 'en' && addresses && addresses.length > 0) {
      await Promise.all(
        addresses.map(async (addr: any) => {
          try {
            const addressTranslations = await this.translationService.getEntityTranslations(
              EntityType.CUSTOMER_ADDRESS,
              addr.id,
            );

            const translatedAddr = translatedAddresses.find((a) => a.id === addr.id);
            if (translatedAddr) {
              if (addressTranslations?.address?.[language]) {
                translatedAddr.address = addressTranslations.address[language];
              }
              if (addressTranslations?.city?.[language]) {
                translatedAddr.city = addressTranslations.city[language];
              }
              if (addressTranslations?.country?.[language]) {
                translatedAddr.country = addressTranslations.country[language];
              }
            }
          } catch (addressTranslationError) {
            // Silently fail
          }
        })
      );
    }

    // Transform snake_case to camelCase
    const totalOrders = customer.total_orders || 0;
    const loyaltyTier = this.calculateLoyaltyTier(totalOrders);

    return {
      id: customer.id,
      tenantId: customer.tenant_id,
      name: translatedName,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.date_of_birth,
      preferredLanguage: customer.preferred_language,
      notes: translatedNotes,
      addresses: translatedAddresses,
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

      // Create translations for address fields using batch translation
      // Run translations in background (fire and forget) to not block the response
      (async () => {
        try {
          const addressFieldsToTranslate = [
            ...(addressDto.address ? [{ fieldName: FieldName.ADDRESS, text: addressDto.address }] : []),
            ...(addressDto.city ? [{ fieldName: FieldName.CITY, text: addressDto.city }] : []),
            ...(addressDto.state ? [{ fieldName: FieldName.STATE, text: addressDto.state }] : []),
            ...(addressDto.country ? [{ fieldName: FieldName.COUNTRY, text: addressDto.country }] : []),
          ];

          if (addressFieldsToTranslate.length > 0) {
            await this.translationService.createBatchTranslations(
              EntityType.CUSTOMER_ADDRESS,
              address.id,
              addressFieldsToTranslate,
              undefined,
              tenantId,
            );
          }
        } catch (translationError) {
          console.warn(`Failed to create address translations for address ${address.id}:`, translationError);
          // Don't fail the address creation if translation fails
        }
      })();

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

  // ============================================
  // BULK IMPORT METHODS
  // ============================================

  /**
   * Get field definitions for bulk import
   */
  getBulkImportFields(): FieldDefinition[] {
    return [
      { name: 'name', label: 'Name', required: true, type: 'string', description: 'Customer name' },
      { name: 'phone', label: 'Phone', required: true, type: 'string', description: 'Customer phone number' },
      { name: 'email', label: 'Email', required: false, type: 'string', description: 'Customer email address' },
      { name: 'dateOfBirth', label: 'Date of Birth', required: false, type: 'date', description: 'Date of birth (YYYY-MM-DD)' },
      { name: 'preferredLanguage', label: 'Preferred Language', required: false, type: 'string', description: 'Preferred language code (en, ar, etc.)' },
      { name: 'notes', label: 'Notes', required: false, type: 'string', description: 'Additional notes' },
      { name: 'address', label: 'Address', required: false, type: 'string', description: 'Street address' },
      { name: 'city', label: 'City', required: false, type: 'string', description: 'City name' },
      { name: 'state', label: 'State', required: false, type: 'string', description: 'State/Province' },
      { name: 'country', label: 'Country', required: false, type: 'string', description: 'Country name' },
    ];
  }

  /**
   * Get translated field definitions for export
   */
  private getTranslatedFieldDefinitions(language: string = 'en'): FieldDefinition[] {
    const fields = this.getBulkImportFields();

    // If language is English, return the original fields
    if (language === 'en') {
      return fields;
    }

    // Translation mappings for customer field labels
    const fieldTranslations: Record<string, Record<string, string>> = {
      'name': { 'ar': 'الاسم', 'ku': 'ناو', 'fr': 'Nom' },
      'phone': { 'ar': 'الهاتف', 'ku': 'تەلەفۆن', 'fr': 'Téléphone' },
      'email': { 'ar': 'البريد الإلكتروني', 'ku': 'ئیمەیڵ', 'fr': 'Email' },
      'dateOfBirth': { 'ar': 'تاريخ الميلاد', 'ku': 'بەرواری لەدایکبوون', 'fr': 'Date de naissance' },
      'preferredLanguage': { 'ar': 'اللغة المفضلة', 'ku': 'زمانی پەسەندکراو', 'fr': 'Langue préférée' },
      'notes': { 'ar': 'ملاحظات', 'ku': 'تێبینییەکان', 'fr': 'Notes' },
      'address': { 'ar': 'العنوان', 'ku': 'ناونیشان', 'fr': 'Adresse' },
      'city': { 'ar': 'المدينة', 'ku': 'شار', 'fr': 'Ville' },
      'state': { 'ar': 'الولاية/المقاطعة', 'ku': 'ولایت/پارێزگا', 'fr': 'État/Province' },
      'country': { 'ar': 'البلد', 'ku': 'وڵات', 'fr': 'Pays' },
    };

    // Create translated field definitions
    return fields.map(field => {
      const translations = fieldTranslations[field.name];
      const translatedLabel = translations?.[language] || field.label;

      return {
        ...field,
        label: translatedLabel,
      };
    });
  }

  /**
   * Generate sample Excel file for bulk import
   */
  async generateBulkImportSample(language: string = 'en'): Promise<Buffer> {
    const fields = this.getTranslatedFieldDefinitions(language);

    return this.bulkImportService.generateSampleExcel({
      entityType: 'customer',
      fields,
      translateFields: ['name'], // Only name needs translation for customers
      language,
    });
  }

  /**
   * Export customers to Excel
   */
  async exportCustomers(
    tenantId: string,
    branchId: string | undefined,
    language: string = 'en',
  ): Promise<Buffer> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get all customers (no pagination for export)
    let query = supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: customers, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch customers: ${error.message}`);
    }

    // Transform customers to export format
    const exportData = await Promise.all(
      (customers || []).map(async (customer: any) => {
        // Get translations
        let translatedName = customer.name;
        let translatedNotes = customer.notes;

        if (language !== 'en') {
          try {
            const allTranslations = await this.translationService.getEntityTranslations(
              EntityType.CUSTOMER,
              customer.id,
            );
            if (allTranslations?.name?.[language]) translatedName = allTranslations.name[language];
            if (allTranslations?.notes?.[language]) translatedNotes = allTranslations.notes[language];
          } catch (err) {
            // Use original values if translation fails
          }
        }

        // Get default address
        const { data: addresses } = await supabase
          .from('customer_addresses')
          .select('*')
          .eq('customer_id', customer.id)
          .eq('is_default', true)
          .limit(1)
          .single();

        const address = addresses || null;

        return {
          name: translatedName,
          phone: customer.phone || '',
          email: customer.email || '',
          dateOfBirth: customer.date_of_birth || '',
          preferredLanguage: customer.preferred_language || '',
          notes: translatedNotes || '',
          address: address?.address || '',
          city: address?.city || '',
          state: address?.state || '',
          country: address?.country || '',
          latitude: address?.latitude || '',
          longitude: address?.longitude || '',
        };
      }),
    );

    const fields = this.getBulkImportFields();
    return this.bulkImportService.generateExportExcel(
      {
        entityType: 'customer',
        fields,
        translateFields: ['name'],
      },
      exportData,
      language,
    );
  }

  /**
   * Bulk import customers
   */
  async bulkImportCustomers(
    tenantId: string,
    fileBuffer: Buffer,
    branchId?: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const config = {
      entityType: 'customer',
      fields: this.getBulkImportFields(),
      translateFields: ['name'],
    };

    const rows = await this.bulkImportService.parseExcelFile(fileBuffer, config);
    const supabase = this.supabaseService.getServiceRoleClient();

    // Helper function to normalize phone numbers (remove spaces, dashes, etc.)
    const normalizePhone = (phone: string): string => {
      if (!phone) return '';
      return String(phone).trim().replace(/[\s\-\(\)]/g, '');
    };

    // Get all phones for checking existing customers (batch)
    // Normalize phone numbers from Excel rows  
    const allPhones = rows.map(r => r.phone ? normalizePhone(r.phone) : '').filter(Boolean);
    const allRawPhones = rows.map(r => r.phone ? r.phone.trim() : '').filter(Boolean);
    
    // Fetch customers that match phones we're importing (optimized - only fetch what we need)
    // We fetch by raw phone first, then normalize in memory for matching
    let customerQuery = supabase
      .from('customers')
      .select('id, phone, name')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    // Filter by phones if we have any (Supabase .in() is efficient)
    if (allRawPhones.length > 0) {
      customerQuery = customerQuery.in('phone', allRawPhones);
    }
    
    const { data: existingCustomersData } = await customerQuery;
    
    // Create maps with normalized phone numbers and names as keys
    const phoneToCustomerIdMap = new Map<string, string>();
    const nameToCustomerIdMap = new Map<string, string>(); // Fallback: match by name (case-insensitive)
    (existingCustomersData || []).forEach(cust => {
      if (cust.phone) {
        const normalizedPhone = normalizePhone(cust.phone);
        phoneToCustomerIdMap.set(normalizedPhone, cust.id);
      }
      if (cust.name) {
        const normalizedName = cust.name.trim().toLowerCase();
        // Only set if not already set (prefer phone match)
        if (!nameToCustomerIdMap.has(normalizedName)) {
          nameToCustomerIdMap.set(normalizedName, cust.id);
        }
      }
    });

    // Prepare customer data for processing
    const customerData: Array<{
      index: number;
      row: any;
      isUpdate: boolean;
      customerId?: string;
    }> = [];

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process and validate all rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Validate required fields
        if (!row.phone || row.phone.trim() === '') {
          throw new Error('Phone is required');
        }
        if (!row.name || row.name.trim() === '') {
          throw new Error('Name is required');
        }

        // Normalize phone number for lookup
        const normalizedPhone = normalizePhone(row.phone);
        let existingCustomerId = phoneToCustomerIdMap.get(normalizedPhone);
        
        // Fallback: if phone doesn't match, try matching by name (case-insensitive)
        if (!existingCustomerId && row.name) {
          const normalizedName = row.name.trim().toLowerCase();
          existingCustomerId = nameToCustomerIdMap.get(normalizedName);
        }
        
        const isUpdate = !!existingCustomerId;

        customerData.push({
          index: i,
          row,
          isUpdate,
          customerId: existingCustomerId,
        });
      } catch (error: any) {
        failed++;
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    // Separate customers into updates and creates for batch processing
    const customersToUpdate: Array<{ index: number; row: any; customerId: string }> = [];
    const customersToCreate: Array<{ index: number; row: any }> = [];

    for (const { index, row, isUpdate, customerId } of customerData) {
      if (isUpdate && customerId) {
        customersToUpdate.push({ index, row, customerId });
      } else {
        customersToCreate.push({ index, row });
      }
    }

    const processedCustomers: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];

    // For small batches (< 20), use simpler direct processing to avoid overhead
    const SMALL_BATCH_THRESHOLD = 20;
    const totalCustomers = customersToUpdate.length + customersToCreate.length;
    const useSimpleProcessing = totalCustomers < SMALL_BATCH_THRESHOLD;

    // Process updates and creates in parallel for maximum performance (or sequentially for small batches)
    const [updateResults, createResults] = await (useSimpleProcessing ? Promise.all([
      // Simple processing for small batches
      (async () => {
        if (customersToUpdate.length === 0) {
          return { success: 0, failed: 0, errors: [] as string[], processed: [] as Array<{ id: string; name: string; index: number; isUpdate: boolean }> };
        }

        // Fetch existing addresses in one query
        const customerIdsToUpdate = customersToUpdate.map(c => c.customerId);
        const { data: existingAddresses } = await supabase
          .from('customer_addresses')
          .select('id, customer_id')
          .in('customer_id', customerIdsToUpdate)
          .eq('is_default', true);

        const customerIdToAddressIdMap = new Map<string, string>();
        (existingAddresses || []).forEach(addr => {
          customerIdToAddressIdMap.set(addr.customer_id, addr.id);
        });

        let updateSuccess = 0;
        let updateFailed = 0;
        const updateErrors: string[] = [];
        const updateProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];

        // Process updates directly without batching overhead
        const updatePromises = customersToUpdate.map(async ({ index, row, customerId }) => {
          try {
            // Update customer
            const customerUpdateData: any = {
              name: row.name,
              phone: row.phone || null,
              email: row.email || null,
              date_of_birth: row.dateOfBirth || null,
              preferred_language: row.preferredLanguage || 'en',
              notes: row.notes || null,
            };

            const { error: updateError } = await supabase
              .from('customers')
              .update(customerUpdateData)
              .eq('id', customerId)
              .eq('tenant_id', tenantId);

            if (updateError) {
              throw new Error(updateError.message);
            }

            // Handle address if provided
            if (row.address || row.city || row.state || row.country) {
              const addressData: any = {
                customer_id: customerId,
                address: row.address || null,
                city: row.city || null,
                state: row.state || null,
                country: row.country || null,
                latitude: row.latitude || null,
                longitude: row.longitude || null,
                is_default: true,
              };

              const existingAddressId = customerIdToAddressIdMap.get(customerId);
              if (existingAddressId) {
                const { error: addrError } = await supabase
                  .from('customer_addresses')
                  .update(addressData)
                  .eq('id', existingAddressId);
                if (addrError) throw new Error(`Address update failed: ${addrError.message}`);
              } else {
                const { error: addrError } = await supabase
                  .from('customer_addresses')
                  .insert(addressData);
                if (addrError) throw new Error(`Address insert failed: ${addrError.message}`);
              }
            }

            updateProcessed.push({ id: customerId, name: row.name, index, isUpdate: true });
            return { success: true };
          } catch (error: any) {
            updateErrors.push(`Row ${index + 2}: ${error.message}`);
            return { success: false };
          }
        });

        const results = await Promise.all(updatePromises);
        updateSuccess = results.filter(r => r.success).length;
        updateFailed = results.filter(r => !r.success).length;

        return { success: updateSuccess, failed: updateFailed, errors: updateErrors, processed: updateProcessed };
      })(),
      // Simple processing for creates
      (async () => {
        if (customersToCreate.length === 0) {
          return { success: 0, failed: 0, errors: [] as string[], processed: [] as Array<{ id: string; name: string; index: number; isUpdate: boolean }> };
        }

        let createSuccess = 0;
        let createFailed = 0;
        const createErrors: string[] = [];
        const createProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];

        // Prepare batch insert data
        const customersToInsert = customersToCreate.map(({ row }) => {
          const customerData: any = {
            tenant_id: tenantId,
            name: row.name,
            phone: row.phone,
            email: row.email || null,
            date_of_birth: row.dateOfBirth || null,
            preferred_language: row.preferredLanguage || 'en',
            notes: row.notes || null,
          };
          
          if (branchId) {
            customerData.branch_id = branchId;
          }
          
          return customerData;
        });

        // Batch insert customers
        const { data: insertedCustomers, error: insertError } = await supabase
          .from('customers')
          .insert(customersToInsert)
          .select('id, name');

        if (insertError) {
          // If batch insert fails, try individual inserts
          for (const { index, row } of customersToCreate) {
            try {
              const customerData: any = {
                tenant_id: tenantId,
                name: row.name,
                phone: row.phone,
                email: row.email || null,
                date_of_birth: row.dateOfBirth || null,
                preferred_language: row.preferredLanguage || 'en',
                notes: row.notes || null,
              };
              
              if (branchId) {
                customerData.branch_id = branchId;
              }

              const { data: customer, error: singleError } = await supabase
                .from('customers')
                .insert(customerData)
                .select('id, name')
                .single();

              if (singleError) {
                throw new Error(singleError.message);
              }

              // Insert address if provided
              if (customer && (row.address || row.city || row.state || row.country)) {
                const addressData: any = {
                  customer_id: customer.id,
                  address: row.address || null,
                  city: row.city || null,
                  state: row.state || null,
                  country: row.country || null,
                  latitude: row.latitude || null,
                  longitude: row.longitude || null,
                  is_default: true,
                };

                await supabase.from('customer_addresses').insert(addressData);
              }

              createProcessed.push({ id: customer.id, name: customer.name, index, isUpdate: false });
            } catch (error: any) {
              createErrors.push(`Row ${index + 2}: ${error.message}`);
            }
          }
        } else {
          // Batch insert succeeded, now insert addresses
          const addressesToInsert: any[] = [];
          
          insertedCustomers.forEach((customer, idx) => {
            const { index, row } = customersToCreate[idx];
            createProcessed.push({ id: customer.id, name: customer.name, index, isUpdate: false });
            
            if (row.address || row.city || row.state || row.country) {
              addressesToInsert.push({
                customer_id: customer.id,
                address: row.address || null,
                city: row.city || null,
                state: row.state || null,
                country: row.country || null,
                latitude: row.latitude || null,
                longitude: row.longitude || null,
                is_default: true,
              });
            }
          });

          // Batch insert addresses if any
          if (addressesToInsert.length > 0) {
            await supabase.from('customer_addresses').insert(addressesToInsert);
          }
        }

        createSuccess = createProcessed.length;
        createFailed = createErrors.length;

        return { success: createSuccess, failed: createFailed, errors: createErrors, processed: createProcessed };
      })(),
    ]) : Promise.all([
      // Process updates
      (async () => {
        if (customersToUpdate.length === 0) {
          return { success: 0, failed: 0, errors: [] as string[], processed: [] as Array<{ id: string; name: string; index: number; isUpdate: boolean }> };
        }

        // Fetch all existing addresses for customers being updated (batch query)
        const customerIdsToUpdate = customersToUpdate.map(c => c.customerId);
        const { data: existingAddresses } = await supabase
          .from('customer_addresses')
          .select('id, customer_id')
          .in('customer_id', customerIdsToUpdate)
          .eq('is_default', true);

        const customerIdToAddressIdMap = new Map<string, string>();
        (existingAddresses || []).forEach(addr => {
          customerIdToAddressIdMap.set(addr.customer_id, addr.id);
        });

        let updateSuccess = 0;
        let updateFailed = 0;
        const updateErrors: string[] = [];
        const updateProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];

        // Prepare batch update data - process batches in parallel
        const UPDATE_BATCH_SIZE = 50; // Smaller batches for better parallelization
        const updateBatches: Array<Array<{ index: number; row: any; customerId: string }>> = [];
        for (let i = 0; i < customersToUpdate.length; i += UPDATE_BATCH_SIZE) {
          updateBatches.push(customersToUpdate.slice(i, i + UPDATE_BATCH_SIZE));
        }

        // Process all batches in parallel
        const batchResults = await Promise.allSettled(
          updateBatches.map(async (batch) => {
            const batchErrors: string[] = [];
            const batchProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];
            
            // Separate customers with and without addresses
            const customersWithAddresses: Array<{ index: number; row: any; customerId: string }> = [];
            const customersWithoutAddresses: Array<{ index: number; row: any; customerId: string }> = [];
            
            batch.forEach(({ index, row, customerId }) => {
              if (row.address || row.city || row.state || row.country) {
                customersWithAddresses.push({ index, row, customerId });
              } else {
                customersWithoutAddresses.push({ index, row, customerId });
              }
            });

            // Batch update customers without addresses
            if (customersWithoutAddresses.length > 0) {
              // Note: Supabase doesn't support batch updates with different values per row
              // So we still need to do individual updates, but we can parallelize them
              const updatePromises = customersWithoutAddresses.map(async ({ index, row, customerId }) => {
                try {
                  const customerUpdateData: any = {
                    name: row.name,
                    phone: row.phone || null,
                    email: row.email || null,
                    date_of_birth: row.dateOfBirth || null,
                    preferred_language: row.preferredLanguage || 'en',
                    notes: row.notes || null,
                  };

                  const { error: updateError } = await supabase
                    .from('customers')
                    .update(customerUpdateData)
                    .eq('id', customerId)
                    .eq('tenant_id', tenantId);

                  if (updateError) {
                    throw new Error(updateError.message);
                  }

                  return { success: true, index, customerId, name: row.name, isUpdate: true };
                } catch (error: any) {
                  return { success: false, index, error: error.message };
                }
              });

              const updateResults = await Promise.allSettled(updatePromises);
              for (const result of updateResults) {
                if (result.status === 'fulfilled' && result.value.success) {
                  batchProcessed.push({
                    id: result.value.customerId,
                    name: result.value.name,
                    index: result.value.index,
                    isUpdate: true,
                  });
                } else {
                  const errorMsg = result.status === 'fulfilled' 
                    ? result.value.error 
                    : result.reason?.message || 'Unknown error';
                  const index = result.status === 'fulfilled' 
                    ? result.value.index 
                    : customersWithoutAddresses[0].index;
                  batchErrors.push(`Row ${index + 2}: ${errorMsg}`);
                }
              }
            }

            // Process customers with addresses (update customer + address)
            if (customersWithAddresses.length > 0) {
              // Update customers in parallel
              const customerUpdatePromises = customersWithAddresses.map(async ({ index, row, customerId }) => {
                try {
                  const customerUpdateData: any = {
                    name: row.name,
                    phone: row.phone || null,
                    email: row.email || null,
                    date_of_birth: row.dateOfBirth || null,
                    preferred_language: row.preferredLanguage || 'en',
                    notes: row.notes || null,
                  };

                  const { error: updateError } = await supabase
                    .from('customers')
                    .update(customerUpdateData)
                    .eq('id', customerId)
                    .eq('tenant_id', tenantId);

                  if (updateError) {
                    throw new Error(updateError.message);
                  }

                  return { success: true, index, customerId, name: row.name, row };
                } catch (error: any) {
                  return { success: false, index, error: error.message };
                }
              });

              const customerUpdateResults = await Promise.allSettled(customerUpdatePromises);
              
              // Separate successful and failed updates
              const successfulUpdates: Array<{ index: number; customerId: string; name: string; row: any }> = [];

              for (const result of customerUpdateResults) {
                if (result.status === 'fulfilled' && result.value.success) {
                  successfulUpdates.push({
                    index: result.value.index,
                    customerId: result.value.customerId,
                    name: result.value.name,
                    row: result.value.row,
                  });
                } else {
                  const errorMsg = result.status === 'fulfilled' 
                    ? result.value.error 
                    : result.reason?.message || 'Unknown error';
                  const index = result.status === 'fulfilled' 
                    ? result.value.index 
                    : customersWithAddresses[0].index;
                  batchErrors.push(`Row ${index + 2}: ${errorMsg}`);
                }
              }

              // Batch process addresses: separate updates and inserts
              const addressesToUpdate: Array<{ id: string; customerId: string; index: number; name: string; data: any }> = [];
              const addressesToInsert: Array<{ customerId: string; index: number; name: string; data: any }> = [];

              successfulUpdates.forEach(({ customerId, row, index, name }) => {
                const addressData: any = {
                  customer_id: customerId,
                  address: row.address || null,
                  city: row.city || null,
                  state: row.state || null,
                  country: row.country || null,
                  latitude: row.latitude || null,
                  longitude: row.longitude || null,
                  is_default: true,
                };

                const existingAddressId = customerIdToAddressIdMap.get(customerId);
                if (existingAddressId) {
                  addressesToUpdate.push({
                    id: existingAddressId,
                    customerId,
                    index,
                    name,
                    data: addressData,
                  });
                } else {
                  addressesToInsert.push({
                    customerId,
                    index,
                    name,
                    data: addressData,
                  });
                }
              });

              // Track which customers succeeded (start with all, remove on failure)
              const successfulCustomerMap = new Map<string, { index: number; name: string }>();
              successfulUpdates.forEach(({ customerId, index, name }) => {
                successfulCustomerMap.set(customerId, { index, name });
              });

              // Batch update existing addresses
              if (addressesToUpdate.length > 0) {
                const updatePromises = addressesToUpdate.map(async ({ id, customerId, data }) => {
                  const { error } = await supabase
                    .from('customer_addresses')
                    .update(data)
                    .eq('id', id);
                  return { customerId, error };
                });

                const addressUpdateResults = await Promise.allSettled(updatePromises);
                for (const result of addressUpdateResults) {
                  if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value.error)) {
                    const customerId = result.status === 'fulfilled' 
                      ? result.value.customerId
                      : addressesToUpdate[0].customerId;
                    const customerInfo = successfulCustomerMap.get(customerId);
                    if (customerInfo) {
                      successfulCustomerMap.delete(customerId);
                      batchErrors.push(`Row ${customerInfo.index + 2}: Address update failed`);
                    }
                  }
                }
              }

              // Batch insert new addresses
              if (addressesToInsert.length > 0) {
                const addressesData = addressesToInsert.map(({ data }) => data);
                const { error: insertError } = await supabase
                  .from('customer_addresses')
                  .insert(addressesData);

                if (insertError) {
                  // If batch insert fails, mark all as failed
                  addressesToInsert.forEach(({ customerId, index }) => {
                    successfulCustomerMap.delete(customerId);
                    batchErrors.push(`Row ${index + 2}: Address insert failed: ${insertError.message}`);
                  });
                }
              }

              // Track successful customer updates (only those that passed all operations)
              successfulCustomerMap.forEach(({ index, name }, customerId) => {
                batchProcessed.push({
                  id: customerId,
                  name,
                  index,
                  isUpdate: true,
                });
              });
            }

            return { success: batchProcessed.length, failed: batchErrors.length, errors: batchErrors, processed: batchProcessed };
          })
        );

        // Aggregate results from all batches
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            updateSuccess += result.value.success;
            updateFailed += result.value.failed;
            updateErrors.push(...result.value.errors);
            updateProcessed.push(...result.value.processed);
          } else {
            updateFailed++;
            updateErrors.push(`Batch processing failed: ${result.reason?.message || 'Unknown error'}`);
          }
        }

        return { success: updateSuccess, failed: updateFailed, errors: updateErrors, processed: updateProcessed };
      })(),
      // Process creates
      (async () => {
        if (customersToCreate.length === 0) {
          return { success: 0, failed: 0, errors: [] as string[], processed: [] as Array<{ id: string; name: string; index: number; isUpdate: boolean }> };
        }

        let createSuccess = 0;
        let createFailed = 0;
        const createErrors: string[] = [];
        const createProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];

        const CREATE_BATCH_SIZE = 50;
        const createBatches: Array<Array<{ index: number; row: any }>> = [];
        for (let i = 0; i < customersToCreate.length; i += CREATE_BATCH_SIZE) {
          createBatches.push(customersToCreate.slice(i, i + CREATE_BATCH_SIZE));
        }

        // Process all create batches in parallel
        const createBatchResults = await Promise.allSettled(
          createBatches.map(async (batch) => {
            const batchErrors: string[] = [];
            const batchProcessed: Array<{ id: string; name: string; index: number; isUpdate: boolean }> = [];
            
            // Prepare batch insert data
            const customersToInsert = batch.map(({ row }) => {
              const customerData: any = {
                tenant_id: tenantId,
                name: row.name,
                phone: row.phone,
                email: row.email || null,
                date_of_birth: row.dateOfBirth || null,
                preferred_language: row.preferredLanguage || 'en',
                notes: row.notes || null,
              };
              
              if (branchId) {
                customerData.branch_id = branchId;
              }
              
              return customerData;
            });

            // Batch insert customers
            const { data: insertedCustomers, error: insertError } = await supabase
              .from('customers')
              .insert(customersToInsert)
              .select('id, name');

            if (insertError) {
              // If batch insert fails, try smaller batches first (10 at a time), then individual inserts
              const SMALL_BATCH_SIZE = 10;
              let remainingBatch = [...batch];
              
              // Try smaller batches first
              for (let j = 0; j < remainingBatch.length; j += SMALL_BATCH_SIZE) {
                const smallBatch = remainingBatch.slice(j, j + SMALL_BATCH_SIZE);
                const smallBatchData = smallBatch.map(({ row }) => {
                  const customerData: any = {
                    tenant_id: tenantId,
                    name: row.name,
                    phone: row.phone,
                    email: row.email || null,
                    date_of_birth: row.dateOfBirth || null,
                    preferred_language: row.preferredLanguage || 'en',
                    notes: row.notes || null,
                  };
                  
                  if (branchId) {
                    customerData.branch_id = branchId;
                  }
                  
                  return customerData;
                });

                const { data: smallBatchCustomers, error: smallBatchError } = await supabase
                  .from('customers')
                  .insert(smallBatchData)
                  .select('id, name');

                if (smallBatchError) {
                  // Small batch failed, try individual inserts for this small batch
                  for (const { index, row } of smallBatch) {
                    try {
                      const customerData: any = {
                        tenant_id: tenantId,
                        name: row.name,
                        phone: row.phone,
                        email: row.email || null,
                        date_of_birth: row.dateOfBirth || null,
                        preferred_language: row.preferredLanguage || 'en',
                        notes: row.notes || null,
                      };
                      
                      if (branchId) {
                        customerData.branch_id = branchId;
                      }

                      const { data: customer, error: singleError } = await supabase
                        .from('customers')
                        .insert(customerData)
                        .select('id, name')
                        .single();

                      if (singleError) {
                        throw new Error(singleError.message);
                      }

                      // Insert address if provided
                      if (customer && (row.address || row.city || row.state || row.country)) {
                        const addressData: any = {
                          customer_id: customer.id,
                          address: row.address || null,
                          city: row.city || null,
                          state: row.state || null,
                          country: row.country || null,
                          latitude: row.latitude || null,
                          longitude: row.longitude || null,
                          is_default: true,
                        };

                        await supabase.from('customer_addresses').insert(addressData);
                      }

                      batchProcessed.push({
                        id: customer.id,
                        name: customer.name,
                        index,
                        isUpdate: false,
                      });
                    } catch (error: any) {
                      batchErrors.push(`Row ${index + 2}: ${error.message}`);
                    }
                  }
                } else {
                  // Small batch succeeded, process addresses
                  const addressesToInsert: any[] = [];
                  const customerMap = new Map<string, { id: string; name: string; index: number }>();
                  
                  smallBatchCustomers.forEach((customer, idx) => {
                    const { index, row } = smallBatch[idx];
                    customerMap.set(customer.id, { id: customer.id, name: customer.name, index });
                    
                    if (row.address || row.city || row.state || row.country) {
                      addressesToInsert.push({
                        customer_id: customer.id,
                        address: row.address || null,
                        city: row.city || null,
                        state: row.state || null,
                        country: row.country || null,
                        latitude: row.latitude || null,
                        longitude: row.longitude || null,
                        is_default: true,
                      });
                    }
                  });

                  // Batch insert addresses if any
                  if (addressesToInsert.length > 0) {
                    await supabase.from('customer_addresses').insert(addressesToInsert);
                  }

                  // Track successful creations
                  customerMap.forEach(({ id, name, index }) => {
                    batchProcessed.push({ id, name, index, isUpdate: false });
                  });
                }
              }
            } else {
              // Batch insert succeeded, now insert addresses
              const addressesToInsert: any[] = [];
              const customerMap = new Map<string, { id: string; name: string; index: number }>();
              
              insertedCustomers.forEach((customer, idx) => {
                const { index, row } = batch[idx];
                customerMap.set(customer.id, { id: customer.id, name: customer.name, index });
                
                if (row.address || row.city || row.state || row.country) {
                  addressesToInsert.push({
                    customer_id: customer.id,
                    address: row.address || null,
                    city: row.city || null,
                    state: row.state || null,
                    country: row.country || null,
                    latitude: row.latitude || null,
                    longitude: row.longitude || null,
                    is_default: true,
                  });
                }
              });

              // Batch insert addresses if any
              if (addressesToInsert.length > 0) {
                await supabase.from('customer_addresses').insert(addressesToInsert);
              }

              // Track successful creations
              customerMap.forEach(({ id, name, index }) => {
                batchProcessed.push({ id, name, index, isUpdate: false });
              });
            }

            return { success: batchProcessed.length, failed: batchErrors.length, errors: batchErrors, processed: batchProcessed };
          })
        );

        // Aggregate results from all batches
        for (const result of createBatchResults) {
          if (result.status === 'fulfilled') {
            createSuccess += result.value.success;
            createFailed += result.value.failed;
            createErrors.push(...result.value.errors);
            createProcessed.push(...result.value.processed);
          } else {
            createFailed++;
            createErrors.push(`Batch processing failed: ${result.reason?.message || 'Unknown error'}`);
          }
        }

        return { success: createSuccess, failed: createFailed, errors: createErrors, processed: createProcessed };
      })(),
    ]));

    // Aggregate results
    success = updateResults.success + createResults.success;
    failed = updateResults.failed + createResults.failed;
    errors.push(...updateResults.errors, ...createResults.errors);
    processedCustomers.push(...updateResults.processed, ...createResults.processed);

    // Return response immediately - translations will happen in background
    const response = { success, failed, errors };
    
    // Fire-and-forget: Do translations asynchronously after returning response
    if (processedCustomers.length > 0) {
      const customersToTranslate = processedCustomers.map(pc => ({ name: pc.name }));
      
      this.bulkImportService.batchTranslateEntities(
        customersToTranslate,
        'customer',
        ['name'],
        tenantId,
      ).then((translations) => {
        processedCustomers.forEach(({ id, name }, arrayIndex) => {
          const nameTranslations = translations.get('name')?.get(arrayIndex);
          if (nameTranslations) {
            this.translationService.storePreTranslatedBatch(
              EntityType.CUSTOMER,
              id,
              [{ fieldName: FieldName.NAME, text: name }],
              { name: nameTranslations },
              undefined,
              tenantId,
              'en',
            ).catch((err) => {
              console.warn(`Failed to store translations for customer ${id}:`, err.message);
            });
          }
        });
      }).catch((err) => {
        console.error('Failed to batch translate customers:', err.message);
      });
    }

    return response;
  }
}
