import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all employees for a tenant
   */
  async getEmployees(tenantId: string, filters?: { branchId?: string; role?: string; status?: string }) {
    const supabase = this.supabaseService.getServiceRoleClient();

    let query = supabase
      .from('users')
      .select(
        `
        *,
        user_branches(
          branch:branches(id, name_en, name_ar, code)
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters?.role) {
      query = query.eq('role', filters.role);
    }

    if (filters?.status) {
      if (filters.status === 'active') {
        query = query.eq('is_active', true);
      } else if (filters.status === 'inactive') {
        query = query.eq('is_active', false);
      }
    }

    const { data: employees, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch employees: ${error.message}`);
    }

    // Filter by branch if specified
    let filteredEmployees = employees || [];
    if (filters?.branchId) {
      filteredEmployees = filteredEmployees.filter((emp: any) =>
        emp.user_branches?.some((ub: any) => ub.branch?.id === filters.branchId),
      );
    }

    // Transform snake_case to camelCase
    return filteredEmployees.map((emp: any) => ({
      id: emp.id,
      tenantId: emp.tenant_id,
      supabaseAuthId: emp.supabase_auth_id,
      email: emp.email,
      nameEn: emp.name_en,
      nameAr: emp.name_ar,
      phone: emp.phone,
      role: emp.role,
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
      branches: (emp.user_branches || []).map((ub: any) => ({
        id: ub.branch?.id,
        nameEn: ub.branch?.name_en,
        nameAr: ub.branch?.name_ar,
        code: ub.branch?.code,
      })),
    }));
  }

  /**
   * Get employee by ID
   */
  async getEmployeeById(tenantId: string, employeeId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: employee, error } = await supabase
      .from('users')
      .select(
        `
        *,
        user_branches(
          branch:branches(id, name_en, name_ar, code)
        )
      `,
      )
      .eq('id', employeeId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error || !employee) {
      throw new NotFoundException('Employee not found');
    }

    // Transform snake_case to camelCase
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      nameEn: employee.name_en,
      nameAr: employee.name_ar,
      phone: employee.phone,
      role: employee.role,
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
      branches: (employee.user_branches || []).map((ub: any) => ({
        id: ub.branch?.id,
        nameEn: ub.branch?.name_en,
        nameAr: ub.branch?.name_ar,
        code: ub.branch?.code,
      })),
    };
  }

  /**
   * Create a new employee
   */
  async createEmployee(tenantId: string, userId: string, createDto: CreateEmployeeDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

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

    // Create employee record
    const { data: employee, error: employeeError } = await supabase
      .from('users')
      .insert({
        tenant_id: tenantId,
        supabase_auth_id: supabaseAuthId,
        email: createDto.email,
        name_en: createDto.nameEn,
        name_ar: createDto.nameAr || createDto.nameEn,
        phone: createDto.phone,
        role: createDto.role,
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

    // Assign branches if provided
    if (createDto.branchIds && createDto.branchIds.length > 0) {
      const branchAssignments = createDto.branchIds.map((branchId) => ({
        user_id: employee.id,
        branch_id: branchId,
      }));

      const { error: branchError } = await supabase.from('user_branches').insert(branchAssignments);

      if (branchError) {
        console.error('Failed to assign branches:', branchError);
        // Don't fail employee creation if branch assignment fails
      }
    }

    // Transform snake_case to camelCase
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      nameEn: employee.name_en,
      nameAr: employee.name_ar,
      phone: employee.phone,
      role: employee.role,
      employeeId: employee.employee_id,
      photoUrl: employee.photo_url,
      nationalId: employee.national_id,
      dateOfBirth: employee.date_of_birth,
      employmentType: employee.employment_type,
      joiningDate: employee.joining_date,
      salary: employee.salary ? Number(employee.salary) : undefined,
      isActive: employee.is_active,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
    };
  }

  /**
   * Update an employee
   */
  async updateEmployee(tenantId: string, employeeId: string, updateDto: UpdateEmployeeDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if employee exists
    const { data: existingEmployee } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', employeeId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found');
    }

    // Check if email is being changed and if new email already exists
    if (updateDto.email && updateDto.email !== existingEmployee.email) {
      const { data: emailExists } = await supabase
        .from('users')
        .select('id')
        .eq('email', updateDto.email)
        .neq('id', employeeId)
        .is('deleted_at', null)
        .maybeSingle();

      if (emailExists) {
        throw new BadRequestException('Email already exists');
      }
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateDto.nameEn !== undefined) updateData.name_en = updateDto.nameEn;
    if (updateDto.nameAr !== undefined) updateData.name_ar = updateDto.nameAr;
    if (updateDto.email !== undefined) updateData.email = updateDto.email;
    if (updateDto.phone !== undefined) updateData.phone = updateDto.phone;
    if (updateDto.role !== undefined) updateData.role = updateDto.role;
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

    if (error) {
      throw new InternalServerErrorException(`Failed to update employee: ${error.message}`);
    }

    // Update branch assignments if provided
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
        }
      }
    }

    // Transform snake_case to camelCase
    return {
      id: employee.id,
      tenantId: employee.tenant_id,
      supabaseAuthId: employee.supabase_auth_id,
      email: employee.email,
      nameEn: employee.name_en,
      nameAr: employee.name_ar,
      phone: employee.phone,
      role: employee.role,
      employeeId: employee.employee_id,
      photoUrl: employee.photo_url,
      nationalId: employee.national_id,
      dateOfBirth: employee.date_of_birth,
      employmentType: employee.employment_type,
      joiningDate: employee.joining_date,
      salary: employee.salary ? Number(employee.salary) : undefined,
      isActive: employee.is_active,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
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

    return { message: 'Employee deleted successfully' };
  }
}
