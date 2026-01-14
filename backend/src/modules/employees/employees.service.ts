import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { RolesService } from '../roles/roles.service';
import { TranslationService } from '../translations/services/translation.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PaginationParams, PaginatedResponse, getPaginationParams, createPaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private supabaseService: SupabaseService,
    private rolesService: RolesService,
    private translationService: TranslationService,
  ) {}

  /**
   * Get all employees for a tenant
   */
  async getEmployees(
    tenantId: string,
    filters?: { branchId?: string; role?: string; status?: string },
    pagination?: PaginationParams,
    language: string = 'en',
  ): Promise<PaginatedResponse<any> | any[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Query users first without nested relations to avoid Supabase relationship ambiguity
    // We need to fetch all employees first to apply branch/role filters correctly
    // Supabase has a default limit of 1000 rows, so we need to fetch in batches or set a high limit
    // First, get the count to know how many we need to fetch (apply status filter if provided)
    let countQuery = supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    
    // Build main query
    let query = supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Apply status filter to both queries if provided
    if (filters?.status) {
      if (filters.status === 'active') {
        query = query.eq('is_active', true);
        countQuery = countQuery.eq('is_active', true);
      } else if (filters.status === 'inactive') {
        query = query.eq('is_active', false);
        countQuery = countQuery.eq('is_active', false);
      }
    }
    
    const { count: totalCountInDb } = await countQuery;
    console.log(`[EmployeesService] Total employees in database (after status filter): ${totalCountInDb}`);
    
    // Set appropriate limit (add buffer to be safe)
    const limitToFetch = totalCountInDb ? totalCountInDb + 1000 : 10000;
    query = query.limit(limitToFetch);

    // Fetch all employees (without pagination) to apply filters correctly
    const { data: employees, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch employees: ${error.message}`);
    }

    console.log(`[EmployeesService] Fetched ${employees?.length || 0} employees from database (expected: ${totalCountInDb})`);
    
    // Verify we got all employees
    if (totalCountInDb && employees && employees.length < totalCountInDb) {
      console.warn(`[EmployeesService] WARNING: Expected ${totalCountInDb} employees but only fetched ${employees.length}. Some employees may be missing.`);
    }

    if (!employees || employees.length === 0) {
      return [];
    }

    // Get all employee IDs
    const employeeIds = employees.map((emp: any) => emp.id);
    console.log(`[EmployeesService] Employee IDs to fetch roles/branches for: ${employeeIds.length} employees`);

    // Fetch user_roles separately
    const { data: userRolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select(
        `
        user_id,
        role:roles(id, name, display_name_en, display_name_ar)
      `,
      )
      .in('user_id', employeeIds);

    if (rolesError) {
      console.error('[EmployeesService] Failed to fetch user roles:', rolesError);
    } else {
      console.log(`[EmployeesService] Fetched ${userRolesData?.length || 0} user_role records`);
    }

    // Fetch user_branches separately
    const { data: userBranchesData, error: branchesError } = await supabase
      .from('user_branches')
      .select(
        `
        user_id,
        branch:branches(id, name, code)
      `,
      )
      .in('user_id', employeeIds);

    if (branchesError) {
      console.error('[EmployeesService] Failed to fetch user branches:', branchesError);
    } else {
      console.log(`[EmployeesService] Fetched ${userBranchesData?.length || 0} user_branch records`);
    }

    // Group roles and branches by user_id
    const rolesByUserId = new Map<string, any[]>();
    (userRolesData || []).forEach((ur: any) => {
      if (!rolesByUserId.has(ur.user_id)) {
        rolesByUserId.set(ur.user_id, []);
      }
      if (ur.role) {
        rolesByUserId.get(ur.user_id)!.push({
          id: ur.role.id,
          name: ur.role.name,
          displayNameEn: ur.role.display_name_en,
          displayNameAr: ur.role.display_name_ar,
        });
      }
    });

    const branchesByUserId = new Map<string, any[]>();
    (userBranchesData || []).forEach((ub: any) => {
      if (!branchesByUserId.has(ub.user_id)) {
        branchesByUserId.set(ub.user_id, []);
      }
      if (ub.branch) {
        branchesByUserId.get(ub.user_id)!.push({
          id: ub.branch.id,
          name: ub.branch.name,
          code: ub.branch.code,
        });
      }
    });

    // Filter by branch and role if specified
    let filteredEmployees = employees || [];
    
    console.log(`[EmployeesService] Before filtering: ${filteredEmployees.length} employees`);
    console.log(`[EmployeesService] Filters applied:`, { branchId: filters?.branchId, role: filters?.role, status: filters?.status });
    
    if (filters?.branchId) {
      filteredEmployees = filteredEmployees.filter((emp: any) => {
        const branches = branchesByUserId.get(emp.id) || [];
        return branches.some((b: any) => b.id === filters.branchId);
      });
      console.log(`[EmployeesService] After branchId filter: ${filteredEmployees.length} employees`);
    }
    if (filters?.role) {
      filteredEmployees = filteredEmployees.filter((emp: any) => {
        const roles = rolesByUserId.get(emp.id) || [];
        return roles.some((r: any) => r.name === filters.role);
      });
      console.log(`[EmployeesService] After role filter: ${filteredEmployees.length} employees`);
    }

    // Calculate total count after filtering (this is the accurate count)
    const totalCount = filteredEmployees.length;
    console.log(`[EmployeesService] Final filtered count: ${totalCount} employees`);

    // Apply pagination to filtered results if provided
    let paginatedEmployees = filteredEmployees;
    if (pagination) {
      const { offset, limit } = getPaginationParams(pagination.page, pagination.limit);
      paginatedEmployees = filteredEmployees.slice(offset, offset + limit);
    }

    // Transform snake_case to camelCase with translations
    console.log(`[EmployeesService] Transforming ${paginatedEmployees.length} employees for response`);
    const transformedEmployees = await Promise.all(
      paginatedEmployees.map(async (emp: any) => {
        const roles = rolesByUserId.get(emp.id) || [];
        const branches = branchesByUserId.get(emp.id) || [];
        console.log(`[EmployeesService] Employee ${emp.id} (${emp.email}): ${roles.length} roles, ${branches.length} branches`);

        // Get translated name
        let translatedName = emp.name;
        try {
          const nameTranslation = await this.translationService.getTranslation({
            entityType: 'employee',
            entityId: emp.id,
            languageCode: language,
            fieldName: 'name',
            fallbackLanguage: 'en',
          });
          if (nameTranslation) translatedName = nameTranslation;
        } catch (translationError) {
          console.warn(`Failed to get translations for employee ${emp.id}:`, translationError);
        }

        return {
        id: emp.id,
        tenantId: emp.tenant_id,
        supabaseAuthId: emp.supabase_auth_id,
        email: emp.email,
        name: translatedName,
        phone: emp.phone,
        role: emp.role, // Keep for backward compatibility
        roles: rolesByUserId.get(emp.id) || [],
        employeeId: emp.employee_id,
        photoUrl: emp.photo_url,
        nationalId: emp.national_id,
        dateOfBirth: emp.date_of_birth,
        employmentType: emp.employment_type,
        joiningDate: emp.joining_date,
        salary: emp.salary ? Number(emp.salary) : undefined,
        isActive: emp.is_active,
        lastLoginAt: emp.last_login_at,
        createdAt: emp.created_at,
        updatedAt: emp.updated_at,
        branches: branchesByUserId.get(emp.id) || [],
        };
      })
    );
    
    console.log(`[EmployeesService] Transformed ${transformedEmployees.length} employees. Returning paginated response with total: ${totalCount}`);

    // Return paginated response if pagination is requested
    if (pagination) {
      return createPaginatedResponse(transformedEmployees, totalCount || 0, pagination.page || 1, pagination.limit || 10);
    }

    return transformedEmployees;
  }

  /**
   * Get employee by ID
   */
  async getEmployeeById(tenantId: string, employeeId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Query user first
    const { data: employee, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', employeeId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !employee) {
      throw new NotFoundException('Employee not found');
    }

    // Fetch user_roles separately
    const { data: userRolesData } = await supabase
      .from('user_roles')
      .select(
        `
        role:roles(id, name, display_name_en, display_name_ar)
      `,
      )
      .eq('user_id', employeeId);

    // Fetch user_branches separately
    const { data: userBranchesData } = await supabase
      .from('user_branches')
      .select(
        `
        branch:branches(id, name, code)
      `,
      )
      .eq('user_id', employeeId);

    // Get translated name
    let translatedName = employee.name;
    try {
      const nameTranslation = await this.translationService.getTranslation({
        entityType: 'employee',
        entityId: employee.id,
        languageCode: language,
        fieldName: 'name',
        fallbackLanguage: 'en',
      });
      if (nameTranslation) translatedName = nameTranslation;
    } catch (translationError) {
      console.warn(`Failed to get translations for employee ${employee.id}:`, translationError);
    }

    // Transform snake_case to camelCase
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      name: translatedName,
      phone: employee.phone,
      role: employee.role, // Keep for backward compatibility
      roles: (userRolesData || []).map((ur: any) => ({
        id: ur.role?.id,
        name: ur.role?.name,
        displayNameEn: ur.role?.display_name_en,
        displayNameAr: ur.role?.display_name_ar,
      })),
      employeeId: employee.employee_id,
      photoUrl: employee.photo_url,
      nationalId: employee.national_id,
      dateOfBirth: employee.date_of_birth,
      employmentType: employee.employment_type,
      joiningDate: employee.joining_date,
      salary: employee.salary ? Number(employee.salary) : undefined,
      isActive: employee.is_active,
      lastLoginAt: employee.last_login_at,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
      branches: (userBranchesData || []).map((ub: any) => ({
        id: ub.branch?.id,
        name: ub.branch?.name,
        code: ub.branch?.code,
      })),
    };
  }

  /**
   * Create a new employee
   */
  async createEmployee(tenantId: string, userId: string, createDto: CreateEmployeeDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate that branchIds is provided and not empty
    if (!createDto.branchIds || createDto.branchIds.length === 0) {
      throw new BadRequestException('At least one branch must be assigned to the employee');
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', createDto.email)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    // Generate employee ID if not provided
    const employeeId = createDto.employeeId || `EMP-${Date.now()}`;

    // Create user in Supabase Auth (optional - for login capability)
    let supabaseAuthId: string | null = null;
    if (createDto.createAuthAccount) {
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: createDto.email,
          password: createDto.password || 'TempPassword123!', // Employee should change on first login
          email_confirm: true,
        });

        if (authError) {
          console.error('Failed to create auth user:', authError);
          // Continue without auth account if it fails
        } else {
          supabaseAuthId = authData.user.id;
        }
      } catch (error) {
        console.error('Error creating auth user:', error);
        // Continue without auth account
      }
    }

    // Get first role name for backward compatibility (keep role field)
    let firstRoleName = '';
    if (createDto.roleIds && createDto.roleIds.length > 0) {
      const roles = await this.rolesService.getRoles();
      const firstRole = roles.find((r) => r.id === createDto.roleIds[0]);
      firstRoleName = firstRole?.name || '';
    }

    // Create employee record
    const { data: employee, error: employeeError } = await supabase
      .from('users')
      .insert({
        tenant_id: tenantId,
        supabase_auth_id: supabaseAuthId,
        email: createDto.email,
        name: createDto.name,
        phone: createDto.phone,
        role: firstRoleName, // Keep for backward compatibility
        employee_id: employeeId,
        photo_url: createDto.photoUrl,
        national_id: createDto.nationalId,
        date_of_birth: createDto.dateOfBirth,
        employment_type: createDto.employmentType,
        joining_date: createDto.joiningDate || new Date().toISOString().split('T')[0],
        salary: createDto.salary,
        is_active: createDto.isActive !== undefined ? createDto.isActive : true,
      })
      .select()
      .single();

    if (employeeError) {
      // Clean up auth user if created
      if (supabaseAuthId) {
        try {
          await supabase.auth.admin.deleteUser(supabaseAuthId);
        } catch (cleanupError) {
          console.error('Failed to cleanup auth user:', cleanupError);
        }
      }
      throw new InternalServerErrorException(`Failed to create employee: ${employeeError.message}`);
    }

    // Assign roles if provided
    let assignedRoles: any[] = [];
    if (createDto.roleIds && createDto.roleIds.length > 0) {
      try {
        const userRoles = await this.rolesService.assignRolesToUser(employee.id, createDto.roleIds, userId);
        assignedRoles = userRoles.map((ur) => ({
          id: ur.role?.id,
          name: ur.role?.name,
          displayNameEn: ur.role?.displayNameEn,
          displayNameAr: ur.role?.displayNameAr,
        }));
      } catch (roleError) {
        console.error('Failed to assign roles:', roleError);
        // Don't fail employee creation if role assignment fails, but log it
      }
    }

    // Assign branches (required)
    const branchAssignments = createDto.branchIds.map((branchId) => ({
      user_id: employee.id,
      branch_id: branchId,
    }));

    const { error: branchError } = await supabase.from('user_branches').insert(branchAssignments);

    if (branchError) {
      // Clean up employee if branch assignment fails
      try {
        await supabase.from('users').delete().eq('id', employee.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup employee after branch assignment failure:', cleanupError);
      }
      throw new InternalServerErrorException(`Failed to assign branches: ${branchError.message}`);
    }

    // Fetch branch details
    const { data: branchesData } = await supabase
      .from('branches')
      .select('id, name, code')
      .in('id', createDto.branchIds);
    const assignedBranches = branchesData || [];

    // Create translations for name (before returning)
    try {
      await this.translationService.createTranslations(
        {
          entityType: 'employee',
          entityId: employee.id,
          fieldName: 'name',
          text: createDto.name,
        },
        userId, // Pass userId
        tenantId, // Pass tenantId to ensure only enabled languages are translated
      );
    } catch (translationError) {
      console.warn(`Failed to create translations for employee ${employee.id}:`, translationError);
    }

    // Return employee data directly instead of calling getEmployeeById
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      name: employee.name,
      phone: employee.phone,
      role: employee.role, // Keep for backward compatibility
      roles: assignedRoles,
      employeeId: employee.employee_id,
      photoUrl: employee.photo_url,
      nationalId: employee.national_id,
      dateOfBirth: employee.date_of_birth,
      employmentType: employee.employment_type,
      joiningDate: employee.joining_date,
      salary: employee.salary ? Number(employee.salary) : undefined,
      isActive: employee.is_active,
      lastLoginAt: employee.last_login_at,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
      branches: assignedBranches,
    };
  }

  /**
   * Update an employee
   */
  async updateEmployee(tenantId: string, employeeId: string, updateDto: UpdateEmployeeDto, userId: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if employee exists and get current values for translation comparison
    const currentEmployee = await this.getEmployeeById(tenantId, employeeId, 'en');

    // Email updates are disabled - email cannot be changed after creation

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Update roles if provided
    let assignedRoles: any[] = [];
    if (updateDto.roleIds !== undefined) {
      try {
        const userRoles = await this.rolesService.assignRolesToUser(employeeId, updateDto.roleIds, userId);
        assignedRoles = userRoles.map((ur) => ({
          id: ur.role?.id,
          name: ur.role?.name,
          displayNameEn: ur.role?.displayNameEn,
          displayNameAr: ur.role?.displayNameAr,
        }));
        // Update role field for backward compatibility (use first role)
        if (updateDto.roleIds.length > 0) {
          const roles = await this.rolesService.getRoles();
          const firstRole = roles.find((r) => r.id === updateDto.roleIds![0]);
          if (firstRole) {
            updateData.role = firstRole.name;
          }
        }
      } catch (roleError) {
        console.error('Failed to update roles:', roleError);
        // Continue with other updates
      }
    }

    if (updateDto.name !== undefined) updateData.name = updateDto.name;
    // Email updates are disabled - email cannot be changed after creation
    if (updateDto.phone !== undefined) updateData.phone = updateDto.phone;
    if (updateDto.employeeId !== undefined) updateData.employee_id = updateDto.employeeId;
    if (updateDto.photoUrl !== undefined) updateData.photo_url = updateDto.photoUrl;
    if (updateDto.nationalId !== undefined) updateData.national_id = updateDto.nationalId;
    if (updateDto.dateOfBirth !== undefined) updateData.date_of_birth = updateDto.dateOfBirth;
    if (updateDto.employmentType !== undefined) updateData.employment_type = updateDto.employmentType;
    if (updateDto.joiningDate !== undefined) updateData.joining_date = updateDto.joiningDate;
    if (updateDto.salary !== undefined) updateData.salary = updateDto.salary;
    if (updateDto.isActive !== undefined) updateData.is_active = updateDto.isActive;

    const { data: employee, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', employeeId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !employee) {
      throw new InternalServerErrorException(
        error ? `Failed to update employee: ${error.message}` : 'Employee not found after update',
      );
    }

    // Update branch assignments if provided
    let assignedBranches: any[] = [];
    if (updateDto.branchIds !== undefined) {
      // Delete existing assignments
      await supabase.from('user_branches').delete().eq('user_id', employeeId);

      // Add new assignments
      if (updateDto.branchIds.length > 0) {
        const branchAssignments = updateDto.branchIds.map((branchId) => ({
          user_id: employeeId,
          branch_id: branchId,
        }));

        const { error: branchError } = await supabase.from('user_branches').insert(branchAssignments);

        if (branchError) {
          console.error('Failed to update branch assignments:', branchError);
        } else {
          // Fetch branch details
          const { data: branchesData } = await supabase
            .from('branches')
            .select('id, name, code')
            .in('id', updateDto.branchIds);
          assignedBranches = branchesData || [];
        }
      }
    }

    // If roles weren't updated, fetch them
    if (assignedRoles.length === 0) {
      try {
        const userRoles = await this.rolesService.getUserRoles(employeeId);
        assignedRoles = userRoles.map((ur) => ({
          id: ur.role?.id,
          name: ur.role?.name,
          displayNameEn: ur.role?.displayNameEn,
          displayNameAr: ur.role?.displayNameAr,
        }));
      } catch (roleError) {
        console.error('Failed to fetch roles:', roleError);
      }
    }

    // If branches weren't updated, fetch them
    if (assignedBranches.length === 0 && updateDto.branchIds === undefined) {
      const { data: userBranches } = await supabase
        .from('user_branches')
        .select('branch:branches(id, name, code)')
        .eq('user_id', employeeId);
      assignedBranches = (userBranches || []).map((ub: any) => ({
        id: ub.branch?.id,
        name: ub.branch?.name,
        code: ub.branch?.code,
      }));
    }

    // Update translations if name changed
    try {
      if (updateDto.name !== undefined && updateDto.name !== currentEmployee.name) {
        await this.translationService.updateTranslation(
          {
            entityType: 'employee',
            entityId: employeeId,
            languageCode: language,
            fieldName: 'name',
            translatedText: updateDto.name,
            isAiGenerated: false, // Manual edit
          },
          userId,
        );
      }
    } catch (translationError) {
      console.error('Failed to update translations for employee:', translationError);
    }

    // Return updated employee data directly instead of calling getEmployeeById
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      name: employee.name,
      phone: employee.phone,
      role: employee.role, // Keep for backward compatibility
      roles: assignedRoles,
      employeeId: employee.employee_id,
      photoUrl: employee.photo_url,
      nationalId: employee.national_id,
      dateOfBirth: employee.date_of_birth,
      employmentType: employee.employment_type,
      joiningDate: employee.joining_date,
      salary: employee.salary ? Number(employee.salary) : undefined,
      isActive: employee.is_active,
      lastLoginAt: employee.last_login_at,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
      branches: assignedBranches,
    };
  }

  /**
   * Delete an employee (soft delete)
   */
  async deleteEmployee(tenantId: string, employeeId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if employee exists
    const { data: employee } = await supabase
      .from('users')
      .select('id')
      .eq('id', employeeId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Soft delete
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', employeeId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete employee: ${error.message}`);
    }

    // Delete translations for this employee
    try {
      await this.translationService.deleteEntityTranslations('employee', employeeId);
    } catch (translationError) {
      console.warn(`Failed to delete translations for employee ${employeeId}:`, translationError);
    }

    return { message: 'Employee deleted successfully' };
  }
}
