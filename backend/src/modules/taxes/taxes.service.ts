import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TaxesService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all taxes for a tenant
   */
  async getTaxes(tenantId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: taxes, error } = await supabase
      .from('taxes')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch taxes: ${error.message}`);
    }

    // Get tax applications for each tax
    const taxesWithApplications = await Promise.all(
      taxes.map(async (tax) => {
        const { data: applications } = await supabase
          .from('tax_applications')
          .select('category_id, food_item_id')
          .eq('tax_id', tax.id);

        // Transform snake_case to camelCase
        return {
          id: tax.id,
          tenantId: tax.tenant_id,
          name: tax.name,
          taxCode: tax.tax_code || undefined,
          rate: tax.rate,
          isActive: tax.is_active,
          appliesTo: tax.applies_to,
          appliesToDelivery: tax.applies_to_delivery,
          appliesToServiceCharge: tax.applies_to_service_charge,
          categoryIds: applications
            ?.filter((app) => app.category_id)
            .map((app) => app.category_id) || [],
          foodItemIds: applications
            ?.filter((app) => app.food_item_id)
            .map((app) => app.food_item_id) || [],
          createdAt: tax.created_at,
          updatedAt: tax.updated_at,
        };
      })
    );

    return taxesWithApplications;
  }

  /**
   * Get a single tax by ID
   */
  async getTaxById(tenantId: string, taxId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: tax, error } = await supabase
      .from('taxes')
      .select('*')
      .eq('id', taxId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !tax) {
      throw new NotFoundException('Tax not found');
    }

    // Get tax applications
    const { data: applications } = await supabase
      .from('tax_applications')
      .select('category_id, food_item_id')
      .eq('tax_id', tax.id);

    // Transform snake_case to camelCase
    return {
      id: tax.id,
      tenantId: tax.tenant_id,
      name: tax.name,
      taxCode: tax.tax_code || undefined,
      rate: tax.rate,
      isActive: tax.is_active,
      appliesTo: tax.applies_to,
      appliesToDelivery: tax.applies_to_delivery,
      appliesToServiceCharge: tax.applies_to_service_charge,
      categoryIds: applications
        ?.filter((app) => app.category_id)
        .map((app) => app.category_id) || [],
      foodItemIds: applications
        ?.filter((app) => app.food_item_id)
        .map((app) => app.food_item_id) || [],
      createdAt: tax.created_at,
      updatedAt: tax.updated_at,
    };
  }

  /**
   * Create a new tax
   */
  async createTax(tenantId: string, createDto: CreateTaxDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Insert tax
    const { data: tax, error: taxError } = await supabase
      .from('taxes')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        tax_code: createDto.taxCode,
        rate: createDto.rate,
        is_active: createDto.isActive ?? true,
        applies_to: createDto.appliesTo || 'order',
        applies_to_delivery: createDto.appliesToDelivery ?? false,
        applies_to_service_charge: createDto.appliesToServiceCharge ?? false,
      })
      .select()
      .single();

    if (taxError || !tax) {
      throw new InternalServerErrorException(`Failed to create tax: ${taxError?.message}`);
    }

    // Create tax applications if category/item specific
    if (
      (createDto.appliesTo === 'category' && createDto.categoryIds?.length) ||
      (createDto.appliesTo === 'item' && createDto.foodItemIds?.length)
    ) {
      const applications = [];

      if (createDto.categoryIds?.length) {
        applications.push(
          ...createDto.categoryIds.map((categoryId) => ({
            tax_id: tax.id,
            category_id: categoryId,
            food_item_id: null,
          }))
        );
      }

      if (createDto.foodItemIds?.length) {
        applications.push(
          ...createDto.foodItemIds.map((foodItemId) => ({
            tax_id: tax.id,
            category_id: null,
            food_item_id: foodItemId,
          }))
        );
      }

      if (applications.length > 0) {
        const { error: appError } = await supabase
          .from('tax_applications')
          .insert(applications);

        if (appError) {
          // Rollback tax creation
          await supabase.from('taxes').delete().eq('id', tax.id);
          throw new InternalServerErrorException(
            `Failed to create tax applications: ${appError.message}`
          );
        }
      }
    }

    return this.getTaxById(tenantId, tax.id);
  }

  /**
   * Update a tax
   */
  async updateTax(tenantId: string, taxId: string, updateDto: UpdateTaxDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify tax exists
    const existingTax = await this.getTaxById(tenantId, taxId);

    // Update tax
    const updateData: any = {};
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.taxCode !== undefined) updateData.tax_code = updateDto.taxCode;
    if (updateDto.rate !== undefined) updateData.rate = updateDto.rate;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    if (updateDto.appliesTo !== undefined) updateData.applies_to = updateDto.appliesTo;
    if (updateDto.appliesToDelivery !== undefined)
      updateData.applies_to_delivery = updateDto.appliesToDelivery;
    if (updateDto.appliesToServiceCharge !== undefined)
      updateData.applies_to_service_charge = updateDto.appliesToServiceCharge;

    const { error: updateError } = await supabase
      .from('taxes')
      .update(updateData)
      .eq('id', taxId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(`Failed to update tax: ${updateError.message}`);
    }

    // Update tax applications if provided
    if (updateDto.categoryIds !== undefined || updateDto.foodItemIds !== undefined) {
      // Delete existing applications
      await supabase.from('tax_applications').delete().eq('tax_id', taxId);

      // Create new applications
      const applications = [];

      if (updateDto.categoryIds?.length) {
        applications.push(
          ...updateDto.categoryIds.map((categoryId) => ({
            tax_id: taxId,
            category_id: categoryId,
            food_item_id: null,
          }))
        );
      }

      if (updateDto.foodItemIds?.length) {
        applications.push(
          ...updateDto.foodItemIds.map((foodItemId) => ({
            tax_id: taxId,
            category_id: null,
            food_item_id: foodItemId,
          }))
        );
      }

      if (applications.length > 0) {
        const { error: appError } = await supabase
          .from('tax_applications')
          .insert(applications);

        if (appError) {
          throw new InternalServerErrorException(
            `Failed to update tax applications: ${appError.message}`
          );
        }
      }
    }

    return this.getTaxById(tenantId, taxId);
  }

  /**
   * Delete a tax (soft delete)
   */
  async deleteTax(tenantId: string, taxId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Verify tax exists
    await this.getTaxById(tenantId, taxId);

    const { error } = await supabase
      .from('taxes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taxId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete tax: ${error.message}`);
    }

    return { success: true, message: 'Tax deleted successfully' };
  }

  /**
   * Get active taxes for a tenant (for order calculation)
   */
  async getActiveTaxes(tenantId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: taxes, error } = await supabase
      .from('taxes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch active taxes: ${error.message}`);
    }

    // Get tax applications
    const taxesWithApplications = await Promise.all(
      taxes.map(async (tax) => {
        const { data: applications } = await supabase
          .from('tax_applications')
          .select('category_id, food_item_id')
          .eq('tax_id', tax.id);

        return {
          ...tax,
          categoryIds: applications
            ?.filter((app) => app.category_id)
            .map((app) => app.category_id) || [],
          foodItemIds: applications
            ?.filter((app) => app.food_item_id)
            .map((app) => app.food_item_id) || [],
        };
      })
    );

    return taxesWithApplications;
  }

  /**
   * Calculate tax for an order
   */
  async calculateTaxForOrder(
    tenantId: string,
    orderItems: Array<{
      foodItemId: string;
      categoryId?: string;
      subtotal: number;
    }>,
    subtotal: number,
    deliveryCharge: number = 0,
    serviceCharge: number = 0
  ): Promise<{ taxAmount: number; taxBreakdown: Array<{ name: string; rate: number; amount: number }> }> {
    const activeTaxes = await this.getActiveTaxes(tenantId);

    if (activeTaxes.length === 0) {
      return { taxAmount: 0, taxBreakdown: [] };
    }

    let totalTax = 0;
    const taxBreakdown: Array<{ name: string; rate: number; amount: number }> = [];

    for (const tax of activeTaxes) {
      let taxableAmount = 0;

      if (tax.applies_to === 'order') {
        // Apply to entire order subtotal
        taxableAmount = subtotal;
      } else if (tax.applies_to === 'category') {
        // Apply only to items in specified categories
        const categoryIds = tax.categoryIds || [];
        taxableAmount = orderItems
          .filter((item) => item.categoryId && categoryIds.includes(item.categoryId))
          .reduce((sum, item) => sum + item.subtotal, 0);
      } else if (tax.applies_to === 'item') {
        // Apply only to specified items
        const foodItemIds = tax.foodItemIds || [];
        taxableAmount = orderItems
          .filter((item) => foodItemIds.includes(item.foodItemId))
          .reduce((sum, item) => sum + item.subtotal, 0);
      }

      // Add delivery charge if applicable
      if (tax.applies_to_delivery && deliveryCharge > 0) {
        taxableAmount += deliveryCharge;
      }

      // Add service charge if applicable
      if (tax.applies_to_service_charge && serviceCharge > 0) {
        taxableAmount += serviceCharge;
      }

      if (taxableAmount > 0) {
        const taxAmount = (taxableAmount * Number(tax.rate)) / 100;
        totalTax += taxAmount;
        taxBreakdown.push({
          name: tax.name,
          rate: Number(tax.rate),
          amount: taxAmount,
        });
      }
    }

    return {
      taxAmount: Math.round(totalTax * 100) / 100, // Round to 2 decimal places
      taxBreakdown,
    };
  }
}

