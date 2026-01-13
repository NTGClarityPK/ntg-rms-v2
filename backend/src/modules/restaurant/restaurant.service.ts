import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { TranslationService } from '../translations/services/translation.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class RestaurantService {
  constructor(
    private supabaseService: SupabaseService,
    private translationService: TranslationService,
  ) {}

  /**
   * Get restaurant information (tenant details)
   */
  async getRestaurantInfo(tenantId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !tenant) {
      throw new NotFoundException('Restaurant information not found');
    }

    // Get translated name
    let translatedName = tenant.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'restaurant',
        entityId: tenantId,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for restaurant ${tenantId}:`, translationError);
    }

    return {
      id: tenant.id,
      name: translatedName,
      subdomain: tenant.subdomain,
      email: tenant.email,
      phone: tenant.phone,
      logoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      defaultCurrency: tenant.default_currency,
      timezone: tenant.timezone,
      fiscalYearStart: tenant.fiscal_year_start,
      vatNumber: tenant.vat_number,
      isActive: tenant.is_active,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
    };
  }

  /**
   * Update restaurant information (tenant details)
   */
  async updateRestaurantInfo(tenantId: string, updateDto: UpdateTenantDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Get current restaurant info for translation comparison
    const currentRestaurant = await this.getRestaurantInfo(tenantId, 'en');
    
    // Build update object
    const updateData: any = {};
    
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.email !== undefined) updateData.email = updateDto.email;
    if (updateDto.phone !== undefined) updateData.phone = updateDto.phone;
    if (updateDto.logoUrl !== undefined) updateData.logo_url = updateDto.logoUrl;
    if (updateDto.primaryColor !== undefined) updateData.primary_color = updateDto.primaryColor;
    // Currency cannot be changed after registration - do not allow updates
    // if (updateDto.defaultCurrency !== undefined) updateData.default_currency = updateDto.defaultCurrency;
    if (updateDto.timezone !== undefined) updateData.timezone = updateDto.timezone;
    if (updateDto.fiscalYearStart !== undefined) updateData.fiscal_year_start = updateDto.fiscalYearStart;
    if (updateDto.vatNumber !== undefined) updateData.vat_number = updateDto.vatNumber;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    
    updateData.updated_at = new Date().toISOString();

    const { data: tenant, error } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', tenantId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Email or subdomain already exists');
      }
      throw new BadRequestException('Failed to update restaurant information: ' + error.message);
    }

    if (!tenant) {
      throw new NotFoundException('Restaurant not found');
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name !== currentRestaurant.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'restaurant',
            entityId: tenantId,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for restaurant:', translationError);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      email: tenant.email,
      phone: tenant.phone,
      logoUrl: tenant.logo_url,
      primaryColor: tenant.primary_color,
      defaultCurrency: tenant.default_currency,
      timezone: tenant.timezone,
      fiscalYearStart: tenant.fiscal_year_start,
      vatNumber: tenant.vat_number,
      isActive: tenant.is_active,
      updatedAt: tenant.updated_at,
    };
  }

  /**
   * Get all branches for a tenant
   */
  async getBranches(tenantId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new BadRequestException('Failed to fetch branches: ' + error.message);
    }

    // Fetch managers for branches that have manager_id
    const managerIds = branches.filter(b => b.manager_id).map(b => b.manager_id);
    let managersMap: Record<string, any> = {};
    
    if (managerIds.length > 0) {
      const { data: managers } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', managerIds)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      if (managers) {
        managersMap = managers.reduce((acc, manager) => {
          acc[manager.id] = {
            id: manager.id,
            name: manager.name,
            email: manager.email,
          };
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Get translations for each branch
    const branchesWithTranslations = await Promise.all(
      branches.map(async (branch) => {
        let translatedName = branch.name;
        let translatedCity = branch.city;
        let translatedAddress = branch.address;

        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'branch',
            entityId: branch.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;

          if (branch.city) {
            const cityTranslation = await this.translationService.getTranslation({
              entityType: 'branch',
              entityId: branch.id,
              languageCode: language,
              fieldName: 'city',
              fallbackLanguage: 'en',
            });
            if (cityTranslation) translatedCity = cityTranslation;
          }

          if (branch.address) {
            const addressTranslation = await this.translationService.getTranslation({
              entityType: 'branch',
              entityId: branch.id,
              languageCode: language,
              fieldName: 'address',
              fallbackLanguage: 'en',
            });
            if (addressTranslation) translatedAddress = addressTranslation;
          }
        } catch (translationError) {
          console.warn(`Failed to get translations for branch ${branch.id}:`, translationError);
        }

        return {
          id: branch.id,
          tenantId: branch.tenant_id,
          name: translatedName,
          code: branch.code,
          address: translatedAddress,
          city: translatedCity,
          state: branch.state,
          country: branch.country,
          phone: branch.phone,
          email: branch.email,
          latitude: branch.latitude,
          longitude: branch.longitude,
          managerId: branch.manager_id,
          manager: branch.manager_id ? managersMap[branch.manager_id] : null,
          isActive: branch.is_active,
          createdAt: branch.created_at,
          updatedAt: branch.updated_at,
        };
      })
    );

    return branchesWithTranslations;
  }

  /**
   * Get a single branch by ID
   */
  async getBranchById(tenantId: string, branchId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data: branch, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !branch) {
      throw new NotFoundException('Branch not found');
    }

    // Fetch manager if manager_id exists
    let manager = null;
    if (branch.manager_id) {
      const { data: managerData } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          name: managerData.name,
          email: managerData.email,
        };
      }
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phone: branch.phone,
      email: branch.email,
      latitude: branch.latitude,
      longitude: branch.longitude,
      managerId: branch.manager_id,
      manager: manager,
      isActive: branch.is_active,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    };
  }

  /**
   * Create a new branch
   */
  async createBranch(tenantId: string, createDto: CreateBranchDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Check if branch code already exists for this tenant
    const { data: existing } = await supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('code', createDto.code)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Branch code already exists');
    }

    // If manager_id is provided, verify it belongs to the same tenant
    if (createDto.managerId) {
      const { data: manager } = await supabase
        .from('users')
        .select('id')
        .eq('id', createDto.managerId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!manager) {
        throw new BadRequestException('Manager not found or does not belong to this tenant');
      }
    }

    const { data: branch, error } = await supabase
      .from('branches')
      .insert({
        tenant_id: tenantId,
        name: createDto.name,
        code: createDto.code,
        address: createDto.address || null,
        city: createDto.city,
        state: createDto.state,
        country: createDto.country || 'Iraq',
        phone: createDto.phone,
        email: createDto.email,
        latitude: createDto.latitude,
        longitude: createDto.longitude,
        manager_id: createDto.managerId,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Branch code already exists for this tenant');
      }
      throw new BadRequestException('Failed to create branch: ' + error.message);
    }

    // Create translations for name, city, and address asynchronously (fire and forget)
    // Don't block the response - translations will be processed in the background
    this.translationService.createTranslations({
      entityType: 'branch',
      entityId: branch.id,
      fieldName: 'name',
      text: createDto.name,
    }).catch((translationError) => {
      console.error('Failed to create translations for branch name:', translationError);
    });

    if (createDto.city) {
      this.translationService.createTranslations({
        entityType: 'branch',
        entityId: branch.id,
        fieldName: 'city',
        text: createDto.city,
      }).catch((translationError) => {
        console.error('Failed to create translations for branch city:', translationError);
      });
    }

    if (createDto.address) {
      this.translationService.createTranslations({
        entityType: 'branch',
        entityId: branch.id,
        fieldName: 'address',
        text: createDto.address,
      }).catch((translationError) => {
        console.error('Failed to create translations for branch address:', translationError);
      });
    }

    // Create default tables for the branch based on tenant's totalTables setting
    try {
      // Get tenant's totalTables setting
      const { data: settings } = await supabase
        .from('tenant_settings')
        .select('general')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // Get totalTables from settings, default to 5 if not set or 0
      // Supabase automatically parses JSONB columns, so general is an object
      const generalSettings = settings?.general as { totalTables?: number } | null;
      const totalTables = generalSettings?.totalTables && generalSettings.totalTables > 0
        ? generalSettings.totalTables
        : 5;

      // Create default tables
      const defaultTables = [];
      for (let i = 1; i <= totalTables; i++) {
        defaultTables.push({
          branch_id: branch.id,
          table_number: i.toString(),
          seating_capacity: 4,
          table_type: 'regular',
          status: 'available',
        });
      }

      const { data: tablesData, error: tablesError } = await supabase
        .from('tables')
        .insert(defaultTables)
        .select();

      if (tablesError) {
        console.error('Failed to create default tables for branch:', tablesError);
        // Don't fail branch creation if table creation fails, but log it
      } else {
        console.log(`Created ${tablesData?.length || 0} default tables for branch: ${branch.id}`);
      }
    } catch (tablesError) {
      console.error('Error creating default tables for branch:', tablesError);
      // Don't fail branch creation if table creation fails, but log it
    }

    // Fetch manager if manager_id exists
    let manager = null;
    if (branch.manager_id) {
      const { data: managerData } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          name: managerData.name,
          email: managerData.email,
        };
      }
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phone: branch.phone,
      email: branch.email,
      latitude: branch.latitude,
      longitude: branch.longitude,
      managerId: branch.manager_id,
      manager: manager,
      isActive: branch.is_active,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    };
  }

  /**
   * Update a branch
   */
  async updateBranch(tenantId: string, branchId: string, updateDto: UpdateBranchDto, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Verify branch belongs to tenant and get current values for translation comparison
    const currentBranch = await this.getBranchById(tenantId, branchId, 'en');

    // If code is being updated, check for conflicts
    if (updateDto.code) {
      const { data: codeConflict } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('code', updateDto.code)
        .neq('id', branchId)
        .is('deleted_at', null)
        .maybeSingle();

      if (codeConflict) {
        throw new ConflictException('Branch code already exists');
      }
    }

    // If manager_id is provided, verify it belongs to the same tenant
    if (updateDto.managerId) {
      const { data: manager } = await supabase
        .from('users')
        .select('id')
        .eq('id', updateDto.managerId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!manager) {
        throw new BadRequestException('Manager not found or does not belong to this tenant');
      }
    }

    // Build update object
    const updateData: any = {};
    
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.code !== undefined) updateData.code = updateDto.code;
    if (updateDto.address !== undefined) updateData.address = updateDto.address;
    if (updateDto.city !== undefined) updateData.city = updateDto.city;
    if (updateDto.state !== undefined) updateData.state = updateDto.state;
    if (updateDto.country !== undefined) updateData.country = updateDto.country;
    if (updateDto.phone !== undefined) updateData.phone = updateDto.phone;
    if (updateDto.email !== undefined) updateData.email = updateDto.email;
    if (updateDto.latitude !== undefined) updateData.latitude = updateDto.latitude;
    if (updateDto.longitude !== undefined) updateData.longitude = updateDto.longitude;
    if (updateDto.managerId !== undefined) updateData.manager_id = updateDto.managerId;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    
    updateData.updated_at = new Date().toISOString();

    const { data: branch, error } = await supabase
      .from('branches')
      .update(updateData)
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Branch code already exists');
      }
      throw new BadRequestException('Failed to update branch: ' + error.message);
    }

    // Fetch manager if manager_id exists
    let manager = null;
    if (branch.manager_id) {
      const { data: managerData } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          name: managerData.name,
          email: managerData.email,
        };
      }
    }

    // Update translations if name, city, or address changed
    try {
      if (updateDto.name !== undefined && updateDto.name !== currentBranch.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'branch',
            entityId: branchId,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.city !== undefined && updateDto.city !== currentBranch.city) {
        await this.translationService.updateTranslation(
          {
            entityType: 'branch',
            entityId: branchId,
            languageCode: language,
            fieldName: 'city',
            translatedText: updateDto.city,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }

      if (updateDto.address !== undefined && updateDto.address !== currentBranch.address) {
        await this.translationService.updateTranslation(
          {
            entityType: 'branch',
            entityId: branchId,
            languageCode: language,
            fieldName: 'address',
            translatedText: updateDto.address,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for branch:', translationError);
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phone: branch.phone,
      email: branch.email,
      latitude: branch.latitude,
      longitude: branch.longitude,
      managerId: branch.manager_id,
      manager: manager,
      isActive: branch.is_active,
      updatedAt: branch.updated_at,
    };
  }

  /**
   * Delete a branch (soft delete)
   */
  async deleteBranch(tenantId: string, branchId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Verify branch belongs to tenant
    const { data: existingBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existingBranch) {
      throw new NotFoundException('Branch not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('branches')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', branchId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new BadRequestException('Failed to delete branch: ' + error.message);
    }

    // Delete translations for this branch
    try {
      await this.translationService.deleteEntityTranslations('branch', branchId);
    } catch (translationError) {
      console.warn(`Failed to delete translations for branch ${branchId}:`, translationError);
    }

    return { message: 'Branch deleted successfully' };
  }

  /**
   * Get all counters for a tenant (across all branches)
   */
  async getCounters(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    let query = supabase
      .from('counters')
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, name, code)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    // If branchId is provided, filter by branch
    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      // Otherwise, filter by tenant through branch relationship
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (!branches || branches.length === 0) {
        return [];
      }

      const branchIds = branches.map(b => b.id);
      query = query.in('branch_id', branchIds);
    }

    const { data: counters, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to fetch counters: ' + error.message);
    }

    return counters.map(counter => ({
      id: counter.id,
      branchId: counter.branch_id,
      branch: counter.branch,
      name: counter.name,
      code: counter.code,
      isActive: counter.is_active,
      createdAt: counter.created_at,
      updatedAt: counter.updated_at,
    }));
  }

  /**
   * Get a single counter by ID
   */
  async getCounterById(tenantId: string, counterId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the counter with branch info
    const { data: counter, error: counterError } = await supabase
      .from('counters')
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, tenant_id, name, code)
      `)
      .eq('id', counterId)
      .is('deleted_at', null)
      .single();

    if (counterError || !counter) {
      throw new NotFoundException('Counter not found');
    }

    // Verify branch belongs to tenant
    if (counter.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Counter not found');
    }

    return {
      id: counter.id,
      branchId: counter.branch_id,
      branch: {
        id: counter.branch.id,
        name: counter.branch.name,
        code: counter.branch.code,
      },
      name: counter.name,
      code: counter.code,
      isActive: counter.is_active,
      createdAt: counter.created_at,
      updatedAt: counter.updated_at,
    };
  }

  /**
   * Create a new counter
   */
  async createCounter(tenantId: string, createDto: CreateCounterDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Verify branch belongs to tenant
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', createDto.branchId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!branch) {
      throw new BadRequestException('Branch not found or does not belong to this tenant');
    }

    // Check if counter code already exists for this branch
    const { data: existing } = await supabase
      .from('counters')
      .select('id')
      .eq('branch_id', createDto.branchId)
      .eq('code', createDto.code)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Counter code already exists for this branch');
    }

    const { data: counter, error } = await supabase
      .from('counters')
      .insert({
        branch_id: createDto.branchId,
        name: createDto.name,
        code: createDto.code,
        is_active: true,
      })
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, name, code)
      `)
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Counter code already exists for this branch');
      }
      throw new BadRequestException('Failed to create counter: ' + error.message);
    }

    return {
      id: counter.id,
      branchId: counter.branch_id,
      branch: {
        id: counter.branch.id,
        name: counter.branch.name,
        code: counter.branch.code,
      },
      name: counter.name,
      code: counter.code,
      isActive: counter.is_active,
      createdAt: counter.created_at,
      updatedAt: counter.updated_at,
    };
  }

  /**
   * Update a counter
   */
  async updateCounter(tenantId: string, counterId: string, updateDto: UpdateCounterDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the counter with branch info to verify tenant
    const { data: existingCounter } = await supabase
      .from('counters')
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, tenant_id)
      `)
      .eq('id', counterId)
      .is('deleted_at', null)
      .single();

    if (!existingCounter) {
      throw new NotFoundException('Counter not found');
    }

    // Verify branch belongs to tenant
    if (existingCounter.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Counter not found');
    }

    // If code is being updated, check for conflicts
    if (updateDto.code) {
      const { data: codeConflict } = await supabase
        .from('counters')
        .select('id')
        .eq('branch_id', existingCounter.branch_id)
        .eq('code', updateDto.code)
        .neq('id', counterId)
        .is('deleted_at', null)
        .maybeSingle();

      if (codeConflict) {
        throw new ConflictException('Counter code already exists for this branch');
      }
    }

    // Build update object
    const updateData: any = {};
    
    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    if (updateDto.code !== undefined) updateData.code = updateDto.code;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;
    
    updateData.updated_at = new Date().toISOString();

    const { data: counter, error } = await supabase
      .from('counters')
      .update(updateData)
      .eq('id', counterId)
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, name, code)
      `)
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Counter code already exists');
      }
      throw new BadRequestException('Failed to update counter: ' + error.message);
    }

    return {
      id: counter.id,
      branchId: counter.branch_id,
      branch: {
        id: counter.branch.id,
        name: counter.branch.name,
        code: counter.branch.code,
      },
      name: counter.name,
      code: counter.code,
      isActive: counter.is_active,
      updatedAt: counter.updated_at,
    };
  }

  /**
   * Delete a counter (soft delete)
   */
  async deleteCounter(tenantId: string, counterId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the counter with branch info to verify tenant
    const { data: existingCounter } = await supabase
      .from('counters')
      .select(`
        *,
        branch:branches!counters_branch_id_fkey(id, tenant_id)
      `)
      .eq('id', counterId)
      .is('deleted_at', null)
      .single();

    if (!existingCounter) {
      throw new NotFoundException('Counter not found');
    }

    // Verify branch belongs to tenant
    if (existingCounter.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Counter not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('counters')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', counterId);

    if (error) {
      throw new BadRequestException('Failed to delete counter: ' + error.message);
    }

    return { message: 'Counter deleted successfully' };
  }

  /**
   * Get all tables for a tenant (across all branches)
   */
  async getTables(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    let query = supabase
      .from('tables')
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, name, code)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    // If branchId is provided, filter by branch
    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      // Otherwise, filter by tenant through branch relationship
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (!branches || branches.length === 0) {
        return [];
      }

      const branchIds = branches.map(b => b.id);
      query = query.in('branch_id', branchIds);
    }

    const { data: tables, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to fetch tables: ' + error.message);
    }

    return tables.map(table => ({
      id: table.id,
      branchId: table.branch_id,
      branch: table.branch,
      tableNumber: table.table_number,
      seatingCapacity: table.seating_capacity,
      tableType: table.table_type,
      qrCode: table.qr_code,
      status: table.status,
      createdAt: table.created_at,
      updatedAt: table.updated_at,
    }));
  }

  /**
   * Get available tables (tables without active orders) for dine-in
   */
  async getAvailableTables(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Optimize: Build efficient query without branch join - fetch branch data separately if needed
    // This avoids expensive joins and improves query performance
    let tableQuery = supabase
      .from('tables')
      .select(`
        id,
        branch_id,
        table_number,
        seating_capacity,
        table_type,
        qr_code,
        status,
        created_at,
        updated_at
      `)
      .is('deleted_at', null);

    if (branchId) {
      // When branchId is provided, validate it belongs to tenant, then filter directly
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branchId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();

      if (!branch) {
        return [];
      }

      tableQuery = tableQuery.eq('branch_id', branchId);
    } else {
      // When no branchId, get branch IDs first for better query performance
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (!branches || branches.length === 0) {
        return [];
      }

      const branchIds = branches.map(b => b.id);
      tableQuery = tableQuery.in('branch_id', branchIds);
    }

    const { data: tables, error: tablesError } = await tableQuery;

    if (tablesError) {
      throw new BadRequestException('Failed to fetch tables: ' + tablesError.message);
    }

    if (!tables || tables.length === 0) {
      return [];
    }

    const tableIds = tables.map(t => t.id);
    
    if (tableIds.length === 0) {
      return [];
    }

    // Get unique branch IDs for parallel fetching
    const branchIds = [...new Set(tables.map(t => t.branch_id))];
    
    // Optimize: Get active order IDs first, then use them for efficient queries
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, table_id')
      .eq('tenant_id', tenantId)
      .eq('order_type', 'dine_in')
      .not('status', 'in', '(completed,cancelled)')
      .is('deleted_at', null);

    const activeOrderIds = (activeOrders || []).map(o => o.id);
    const activeOrderTableIds = new Set(
      (activeOrders || [])
        .filter(o => o.table_id && tableIds.includes(o.table_id))
        .map(o => o.table_id)
    );

    // Execute remaining queries in parallel
    const [orderTablesResult, branchesResult] = await Promise.all([
      // Get order_tables only for active orders and relevant table IDs
      activeOrderIds.length > 0 && tableIds.length > 0
        ? supabase
            .from('order_tables')
            .select('table_id')
            .in('order_id', activeOrderIds)
            .in('table_id', tableIds)
        : Promise.resolve({ data: [], error: null }),
      // Fetch branch info in parallel
      branchIds.length > 0
        ? supabase
            .from('branches')
            .select('id, tenant_id, name, code')
            .in('id', branchIds)
            .eq('tenant_id', tenantId)
        : Promise.resolve({ data: [], error: null })
    ]);

    // Collect all occupied table IDs
    const occupiedTableIds = new Set<string>();
    activeOrderTableIds.forEach(tableId => occupiedTableIds.add(tableId));
    (orderTablesResult.data || []).forEach((ot: any) => {
      if (ot.table_id) {
        occupiedTableIds.add(ot.table_id);
      }
    });

    // Build branch map
    const branchMap = new Map<string, any>();
    (branchesResult.data || []).forEach(branch => {
      branchMap.set(branch.id, branch);
    });

    // Filter out occupied tables and map to response format
    return tables
      .filter(table => !occupiedTableIds.has(table.id))
      .map(table => ({
        id: table.id,
        branchId: table.branch_id,
        branch: branchMap.get(table.branch_id) || null,
        tableNumber: table.table_number,
        seatingCapacity: table.seating_capacity,
        tableType: table.table_type,
        qrCode: table.qr_code,
        status: table.status,
        createdAt: table.created_at,
        updatedAt: table.updated_at,
      }));
  }

  /**
   * Get a single table by ID
   */
  async getTableById(tenantId: string, tableId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the table with branch info
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, tenant_id, name, code)
      `)
      .eq('id', tableId)
      .is('deleted_at', null)
      .single();

    if (tableError || !table) {
      throw new NotFoundException('Table not found');
    }

    // Verify branch belongs to tenant
    if (table.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Table not found');
    }

    return {
      id: table.id,
      branchId: table.branch_id,
      branch: {
        id: table.branch.id,
        name: table.branch.name,
        code: table.branch.code,
      },
      tableNumber: table.table_number,
      seatingCapacity: table.seating_capacity,
      tableType: table.table_type,
      qrCode: table.qr_code,
      status: table.status,
      createdAt: table.created_at,
      updatedAt: table.updated_at,
    };
  }

  /**
   * Create a new table
   */
  async createTable(tenantId: string, createDto: CreateTableDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Verify branch belongs to tenant
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', createDto.branchId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!branch) {
      throw new BadRequestException('Branch not found or does not belong to this tenant');
    }

    // Check if table number already exists for this branch
    const { data: existing } = await supabase
      .from('tables')
      .select('id')
      .eq('branch_id', createDto.branchId)
      .eq('table_number', createDto.tableNumber)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Table number already exists for this branch');
    }

    const { data: table, error } = await supabase
      .from('tables')
      .insert({
        branch_id: createDto.branchId,
        table_number: createDto.tableNumber,
        seating_capacity: createDto.seatingCapacity || 4,
        table_type: createDto.tableType || 'regular',
        status: 'available',
      })
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, name, code)
      `)
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Table number already exists for this branch');
      }
      throw new BadRequestException('Failed to create table: ' + error.message);
    }

    return {
      id: table.id,
      branchId: table.branch_id,
      branch: {
        id: table.branch.id,
        name: table.branch.name,
        code: table.branch.code,
      },
      tableNumber: table.table_number,
      seatingCapacity: table.seating_capacity,
      tableType: table.table_type,
      qrCode: table.qr_code,
      status: table.status,
      createdAt: table.created_at,
      updatedAt: table.updated_at,
    };
  }

  /**
   * Update a table
   */
  async updateTable(tenantId: string, tableId: string, updateDto: UpdateTableDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the table with branch info to verify tenant
    const { data: existingTable } = await supabase
      .from('tables')
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, tenant_id)
      `)
      .eq('id', tableId)
      .is('deleted_at', null)
      .single();

    if (!existingTable) {
      throw new NotFoundException('Table not found');
    }

    // Verify branch belongs to tenant
    if (existingTable.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Table not found');
    }

    // If table_number is being updated, check for conflicts
    if (updateDto.tableNumber) {
      const { data: numberConflict } = await supabase
        .from('tables')
        .select('id')
        .eq('branch_id', existingTable.branch_id)
        .eq('table_number', updateDto.tableNumber)
        .neq('id', tableId)
        .is('deleted_at', null)
        .maybeSingle();

      if (numberConflict) {
        throw new ConflictException('Table number already exists for this branch');
      }
    }

    // Build update object
    const updateData: any = {};
    
    if (updateDto.tableNumber !== undefined) updateData.table_number = updateDto.tableNumber;
    if (updateDto.seatingCapacity !== undefined) updateData.seating_capacity = updateDto.seatingCapacity;
    if (updateDto.tableType !== undefined) updateData.table_type = updateDto.tableType;
    if (updateDto.status !== undefined) updateData.status = updateDto.status;
    if (updateDto.qrCode !== undefined) updateData.qr_code = updateDto.qrCode;
    
    updateData.updated_at = new Date().toISOString();

    const { data: table, error } = await supabase
      .from('tables')
      .update(updateData)
      .eq('id', tableId)
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, name, code)
      `)
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Table number already exists for this branch');
      }
      throw new BadRequestException('Failed to update table: ' + error.message);
    }

    return {
      id: table.id,
      branchId: table.branch_id,
      branch: {
        id: table.branch.id,
        name: table.branch.name,
        code: table.branch.code,
      },
      tableNumber: table.table_number,
      seatingCapacity: table.seating_capacity,
      tableType: table.table_type,
      qrCode: table.qr_code,
      status: table.status,
      updatedAt: table.updated_at,
    };
  }

  /**
   * Delete a table (soft delete)
   */
  async deleteTable(tenantId: string, tableId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the table with branch info to verify tenant
    const { data: existingTable } = await supabase
      .from('tables')
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, tenant_id)
      `)
      .eq('id', tableId)
      .is('deleted_at', null)
      .single();

    if (!existingTable) {
      throw new NotFoundException('Table not found');
    }

    // Verify branch belongs to tenant
    if (existingTable.branch.tenant_id !== tenantId) {
      throw new NotFoundException('Table not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('tables')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', tableId);

    if (error) {
      throw new BadRequestException('Failed to delete table: ' + error.message);
    }

    return { message: 'Table deleted successfully' };
  }
}
