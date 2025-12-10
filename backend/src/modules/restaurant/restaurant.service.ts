import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
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
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get restaurant information (tenant details)
   */
  async getRestaurantInfo(tenantId: string) {
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

    return {
      id: tenant.id,
      nameEn: tenant.name_en,
      nameAr: tenant.name_ar,
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
  async updateRestaurantInfo(tenantId: string, updateDto: UpdateTenantDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Build update object
    const updateData: any = {};
    
    if (updateDto.nameEn !== undefined) updateData.name_en = updateDto.nameEn;
    if (updateDto.nameAr !== undefined) updateData.name_ar = updateDto.nameAr;
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

    return {
      id: tenant.id,
      nameEn: tenant.name_en,
      nameAr: tenant.name_ar,
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
  async getBranches(tenantId: string) {
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
        .select('id, name_en, name_ar, email')
        .in('id', managerIds)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      if (managers) {
        managersMap = managers.reduce((acc, manager) => {
          acc[manager.id] = {
            id: manager.id,
            nameEn: manager.name_en,
            nameAr: manager.name_ar,
            email: manager.email,
          };
          return acc;
        }, {} as Record<string, any>);
      }
    }

    return branches.map(branch => ({
      id: branch.id,
      tenantId: branch.tenant_id,
      nameEn: branch.name_en,
      nameAr: branch.name_ar,
      code: branch.code,
      addressEn: branch.address_en,
      addressAr: branch.address_ar,
      city: branch.city,
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
    }));
  }

  /**
   * Get a single branch by ID
   */
  async getBranchById(tenantId: string, branchId: string) {
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
        .select('id, name_en, name_ar, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          nameEn: managerData.name_en,
          nameAr: managerData.name_ar,
          email: managerData.email,
        };
      }
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      nameEn: branch.name_en,
      nameAr: branch.name_ar,
      code: branch.code,
      addressEn: branch.address_en,
      addressAr: branch.address_ar,
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
        name_en: createDto.nameEn,
        name_ar: createDto.nameAr || createDto.nameEn,
        code: createDto.code,
        address_en: createDto.addressEn,
        address_ar: createDto.addressAr,
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

    // Fetch manager if manager_id exists
    let manager = null;
    if (branch.manager_id) {
      const { data: managerData } = await supabase
        .from('users')
        .select('id, name_en, name_ar, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          nameEn: managerData.name_en,
          nameAr: managerData.name_ar,
          email: managerData.email,
        };
      }
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      nameEn: branch.name_en,
      nameAr: branch.name_ar,
      code: branch.code,
      addressEn: branch.address_en,
      addressAr: branch.address_ar,
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
  async updateBranch(tenantId: string, branchId: string, updateDto: UpdateBranchDto) {
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
    
    if (updateDto.nameEn !== undefined) updateData.name_en = updateDto.nameEn;
    if (updateDto.nameAr !== undefined) updateData.name_ar = updateDto.nameAr;
    if (updateDto.code !== undefined) updateData.code = updateDto.code;
    if (updateDto.addressEn !== undefined) updateData.address_en = updateDto.addressEn;
    if (updateDto.addressAr !== undefined) updateData.address_ar = updateDto.addressAr;
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
        .select('id, name_en, name_ar, email')
        .eq('id', branch.manager_id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .single();
      
      if (managerData) {
        manager = {
          id: managerData.id,
          nameEn: managerData.name_en,
          nameAr: managerData.name_ar,
          email: managerData.email,
        };
      }
    }

    return {
      id: branch.id,
      tenantId: branch.tenant_id,
      nameEn: branch.name_en,
      nameAr: branch.name_ar,
      code: branch.code,
      addressEn: branch.address_en,
      addressAr: branch.address_ar,
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
        branch:branches!counters_branch_id_fkey(id, name_en, name_ar, code)
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
        branch:branches!counters_branch_id_fkey(id, tenant_id, name_en, name_ar, code)
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
        nameEn: counter.branch.name_en,
        nameAr: counter.branch.name_ar,
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
        branch:branches!counters_branch_id_fkey(id, name_en, name_ar, code)
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
        nameEn: counter.branch.name_en,
        nameAr: counter.branch.name_ar,
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
        branch:branches!counters_branch_id_fkey(id, name_en, name_ar, code)
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
        nameEn: counter.branch.name_en,
        nameAr: counter.branch.name_ar,
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
        branch:branches!tables_branch_id_fkey(id, name_en, name_ar, code)
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
   * Get a single table by ID
   */
  async getTableById(tenantId: string, tableId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // First get the table with branch info
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select(`
        *,
        branch:branches!tables_branch_id_fkey(id, tenant_id, name_en, name_ar, code)
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
        nameEn: table.branch.name_en,
        nameAr: table.branch.name_ar,
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
        branch:branches!tables_branch_id_fkey(id, name_en, name_ar, code)
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
        nameEn: table.branch.name_en,
        nameAr: table.branch.name_ar,
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
        branch:branches!tables_branch_id_fkey(id, name_en, name_ar, code)
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
        nameEn: table.branch.name_en,
        nameAr: table.branch.name_ar,
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
