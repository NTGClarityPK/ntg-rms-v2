import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service';
import { RolesService } from '../roles/roles.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanId } from '../subscription/dto/create-subscription.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MenuService } from '../menu/menu.service';
import { InventoryService } from '../inventory/inventory.service';
import { TranslationService } from '../translations/services/translation.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private rolesService: RolesService,
    private subscriptionService: SubscriptionService,
    private menuService: MenuService,
    private inventoryService: InventoryService,
    private translationService: TranslationService,
  ) {}

  async signup(signupDto: SignupDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    console.log('Starting signup for:', signupDto.email);

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: signupDto.email,
      password: signupDto.password,
      email_confirm: true, // Auto-confirm email for now
    });

    if (authError) {
      console.error('Supabase Auth Signup Error:', authError);
      throw new UnauthorizedException(authError.message || 'Failed to create user');
    }

    if (!authData?.user) {
      console.error('No user data returned from Supabase Auth');
      throw new UnauthorizedException('Failed to create user in authentication system');
    }

    console.log('User created in Supabase Auth:', authData.user.id);

    // If no tenant_id provided, create a new tenant for the first user
    let tenantId = signupDto.tenantId;
    if (!tenantId) {
      // Generate a unique subdomain from email
      const baseSubdomain = signupDto.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      let subdomain = baseSubdomain;
      let counter = 1;
      
      // Check if subdomain exists and make it unique
      while (true) {
        const { data: existingTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('subdomain', subdomain)
          .single();
        
        if (!existingTenant) break;
        subdomain = `${baseSubdomain}${counter}`;
        counter++;
      }

      // Create a new tenant for this user
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: signupDto.name + "'s Restaurant",
          subdomain: subdomain,
          email: signupDto.email,
          phone: signupDto.phone,
          default_currency: signupDto.defaultCurrency || 'IQD', // Set currency during registration
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant creation error:', tenantError);
        // Try to clean up the auth user if tenant creation fails
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup auth user:', cleanupError);
        }
        throw new UnauthorizedException('Failed to create tenant: ' + tenantError.message);
      }

      tenantId = tenantData.id;
      console.log('Tenant created:', tenantId);
    } else {
      console.log('Using existing tenant:', tenantId);
    }

    // Create user record in users table
    console.log('Creating user record in users table...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        supabase_auth_id: authData.user.id,
        email: signupDto.email,
        name: signupDto.name,
        phone: signupDto.phone,
        role: signupDto.role || 'tenant_owner',
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      console.error('Error details:', JSON.stringify(userError, null, 2));
      // Try to clean up the auth user if user creation fails
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
        if (tenantId && !signupDto.tenantId) {
          // Also clean up the tenant we just created
          await supabase.from('tenants').delete().eq('id', tenantId);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup after user creation error:', cleanupError);
      }
      throw new UnauthorizedException('Failed to create user record: ' + userError.message);
    }

    if (!userData) {
      throw new UnauthorizedException('Failed to create user record: No data returned');
    }

    console.log('User record created successfully:', userData.id);

    // Generate tokens immediately to return response quickly
    const tokens = await this.generateTokens(userData);

    // For new tenants, create default branch synchronously so we can return branchId
    // This ensures the frontend has branchId immediately after signup
    const isNewTenant = !signupDto.tenantId;
    let branchId: string | undefined;
    
    if (isNewTenant) {
      try {
        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .insert({
            tenant_id: tenantId,
            name: 'Main Branch',
            code: 'MAIN',
            is_active: true,
          })
          .select()
          .single();

        if (branchError) {
          console.error('Failed to create default branch:', branchError);
        } else {
          branchId = branchData.id;
          console.log('✅ Default branch created:', branchId);

          // Don't create translations on signup - only English is enabled initially
          // Translations will be created when user adds languages
          
          // Create default tables (5 tables) for the branch
          try {
            const defaultTables = [];
            for (let i = 1; i <= 5; i++) {
              defaultTables.push({
                branch_id: branchId,
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
              console.error('Failed to create default tables:', tablesError);
            } else {
              console.log(`✅ Created ${tablesData?.length || 0} default tables for branch:`, branchId);
            }
          } catch (tablesError) {
            console.error('Error creating default tables:', tablesError);
          }
        }
      } catch (error) {
        console.error('Error creating default branch:', error);
      }
    } else {
      // For existing tenants, check if there's exactly one branch (like login does)
      try {
        let branches: any[] = [];
        
        // Check if user has manager role via RBAC (in addition to checking users.role field)
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select(`
            role:roles(name)
          `)
          .eq('user_id', userData.id);

        const hasManagerRole = userRoles?.some((ur: any) => ur.role?.name === 'manager') || false;
        const isTenantOwner = userData.role === 'tenant_owner';
        
        // If tenant owner OR has manager role, check all branches
        if (isTenantOwner || hasManagerRole) {
          const { data: allBranches } = await supabase
            .from('branches')
            .select('id')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .eq('is_active', true)
            .order('created_at', { ascending: true });
          
          branches = allBranches || [];
          
          // If no branches exist and user is tenant owner, create a default branch
          if (branches.length === 0 && isTenantOwner) {
            console.log(`No branches found for tenant ${tenantId}. Creating default branch...`);
            try {
              const { data: newBranch, error: createError } = await supabase
                .from('branches')
                .insert({
                  tenant_id: tenantId,
                  name: 'Main Branch',
                  code: 'MAIN',
                  is_active: true,
                })
                .select('id')
                .single();

              if (createError) {
                console.error('Failed to create default branch:', createError);
              } else {
                console.log('✅ Created default branch:', newBranch.id);
                branches = [{ id: newBranch.id }];
              }
            } catch (createBranchError) {
              console.error('Error creating default branch:', createBranchError);
            }
          }
        } else {
          // For other users, check only assigned branches
          const { data: userBranches } = await supabase
            .from('user_branches')
            .select(`
              branch:branches!inner(id)
            `)
            .eq('user_id', userData.id);
          
          if (userBranches) {
            branches = userBranches.map((ub: any) => ({ id: ub.branch?.id }));
          }
        }

        // If there's exactly one branch, include it in the response
        if (branches.length === 1 && branches[0].id) {
          branchId = branches[0].id;
        }
      } catch (branchError) {
        // Don't fail signup if branch check fails, just log it
        console.warn('Failed to check branches for auto-selection:', branchError);
      }
    }

    // Defer all slow operations to run asynchronously in the background
    // This allows the signup to return quickly without waiting for translations, menus, etc.
    // Pass branchId to avoid creating duplicate branch
    this.handlePostSignupAsyncTasks(
      signupDto,
      userData.id,
      tenantId,
      isNewTenant,
      branchId // Pass branchId so it doesn't create duplicate branch
    ).catch((error) => {
      console.error('❌ Error in post-signup async tasks:', error);
      // Don't throw - these are non-critical operations
    });

    return {
      user: {
        id: userData.id,
        email: userData.email as string,
        name: userData.name as string,
        role: userData.role as string,
        tenantId: userData.tenant_id as string,
      },
      ...tokens,
      ...(branchId && { branchId }), // Include branchId if available
    };
  }

  async login(loginDto: LoginDto) {
    const supabase = this.supabaseService.getClient();

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (authError) {
      console.error('Supabase Auth Error:', authError);
      throw new UnauthorizedException(
        authError.message || 'Invalid email or password'
      );
    }

    if (!authData.user) {
      throw new UnauthorizedException('Authentication failed');
    }

    // Get user from users table using service role client to bypass RLS
    const serviceSupabase = this.supabaseService.getServiceRoleClient();
    let { data: user, error: userError } = await serviceSupabase
      .from('users')
      .select('*')
      .eq('supabase_auth_id', authData.user.id)
      .maybeSingle();

    // Handle database errors (not "no rows" errors)
    if (userError && userError.code !== 'PGRST116') {
      console.error('User lookup error:', userError);
      throw new UnauthorizedException('Database error: ' + userError.message);
    }

    // User exists in Auth but not in users table - auto-create the user record
    if (!user) {
      console.log('User authenticated but not in users table. Auto-creating user record...');
      
      // Get user metadata from Supabase Auth
      const authUser = authData.user;
      const userEmail = authUser.email || loginDto.email;
      const userName = authUser.user_metadata?.name || 
                       authUser.user_metadata?.full_name || 
                       userEmail.split('@')[0];

      // Check if there's an existing tenant for this email (maybe from a previous partial signup)
      let { data: existingTenant } = await serviceSupabase
        .from('tenants')
        .select('id')
        .eq('email', userEmail)
        .maybeSingle();

      let tenantId = existingTenant?.id;

      // If no tenant exists, create one
      if (!tenantId) {
        const baseSubdomain = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let subdomain = baseSubdomain;
        let counter = 1;
        
        // Ensure unique subdomain
        while (true) {
          const { data: existing } = await serviceSupabase
            .from('tenants')
            .select('id')
            .eq('subdomain', subdomain)
            .maybeSingle();
          
          if (!existing) break;
          subdomain = `${baseSubdomain}${counter}`;
          counter++;
        }

        const { data: newTenant, error: tenantError } = await serviceSupabase
          .from('tenants')
          .insert({
            name: `${userName}'s Restaurant`,
            subdomain: subdomain,
            email: userEmail,
          })
          .select()
          .single();

        if (tenantError) {
          console.error('Failed to create tenant:', tenantError);
          throw new UnauthorizedException('Failed to create tenant: ' + tenantError.message);
        }

        tenantId = newTenant.id;
      }

      // Create user record
      const { data: newUser, error: createUserError } = await serviceSupabase
        .from('users')
        .insert({
          supabase_auth_id: authUser.id,
          email: userEmail,
          name: userName,
          tenant_id: tenantId,
          role: 'tenant_owner',
          is_active: true,
        })
        .select()
      .single();

      if (createUserError) {
        console.error('Failed to create user record:', createUserError);
        throw new UnauthorizedException('Failed to create user record: ' + createUserError.message);
      }

      user = newUser;
      console.log('User record created successfully:', user.id);

      // Create a default branch for the tenant if this is a new tenant
      if (!existingTenant) {
        try {
          const { data: branchData, error: branchError } = await serviceSupabase
            .from('branches')
            .insert({
              tenant_id: tenantId,
              name: 'Main Branch',
              code: 'MAIN',
              is_active: true,
            })
            .select()
            .single();

          if (branchError) {
            console.error('Failed to create default branch:', branchError);
            // Don't fail login if branch creation fails, but log it
          } else {
            console.log('Default branch created:', branchData.id);
            
            // Create default tables (5 tables) for the branch
            try {
              const defaultTables = [];
              for (let i = 1; i <= 5; i++) {
                defaultTables.push({
                  branch_id: branchData.id,
                  table_number: i.toString(),
                  seating_capacity: 4,
                  table_type: 'regular',
                  status: 'available',
                });
              }
              
              const { data: tablesData, error: tablesError } = await serviceSupabase
                .from('tables')
                .insert(defaultTables)
                .select();
              
              if (tablesError) {
                console.error('Failed to create default tables:', tablesError);
                // Don't fail login if table creation fails, but log it
              } else {
                console.log(`Created ${tablesData?.length || 0} default tables for branch:`, branchData.id);
              }
            } catch (tablesError) {
              console.error('Error creating default tables:', tablesError);
              // Don't fail login if table creation fails
            }
          }
        } catch (error) {
          console.error('Error creating default branch:', error);
          // Don't fail login if branch creation fails
        }
      }
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Update last login using service role client
    await serviceSupabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Check if there's only one branch available for this user
    // If so, include it in the response to auto-select it on the frontend
    // Use the same logic as getUserAssignedBranches: tenant owners see all branches, others see assigned branches
    let branchId: string | undefined;
    try {
      let branches: any[] = [];
      
      // Check if user has manager role via RBAC (in addition to checking users.role field)
      const { data: userRoles } = await serviceSupabase
        .from('user_roles')
        .select(`
          role:roles(name)
        `)
        .eq('user_id', user.id);

      const hasManagerRole = userRoles?.some((ur: any) => ur.role?.name === 'manager') || false;
      const isTenantOwner = user.role === 'tenant_owner';
      
      // If tenant owner OR has manager role, check all branches
      if (isTenantOwner || hasManagerRole) {
        const { data: allBranches } = await serviceSupabase
          .from('branches')
          .select('id')
          .eq('tenant_id', user.tenant_id)
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('created_at', { ascending: true });
        
        branches = allBranches || [];
        
        // If no branches exist and user is tenant owner, create a default branch
        if (branches.length === 0 && isTenantOwner) {
          console.log(`No branches found for tenant ${user.tenant_id}. Creating default branch...`);
          try {
            const { data: newBranch, error: createError } = await serviceSupabase
              .from('branches')
              .insert({
                tenant_id: user.tenant_id,
                name: 'Main Branch',
                code: 'MAIN',
                is_active: true,
              })
              .select('id')
              .single();

            if (createError) {
              console.error('Failed to create default branch:', createError);
            } else {
              console.log('✅ Created default branch:', newBranch.id);
              branches = [{ id: newBranch.id }];
            }
          } catch (createBranchError) {
            console.error('Error creating default branch:', createBranchError);
          }
        }
      } else {
        // For other users, check only assigned branches using the same pattern as getUserAssignedBranches
        const { data: userBranches } = await serviceSupabase
          .from('user_branches')
          .select(`
            branch:branches!inner(id)
          `)
          .eq('user_id', user.id);
        
        if (userBranches) {
          branches = userBranches.map((ub: any) => ({ id: ub.branch?.id }));
        }
      }

      // If there's exactly one branch, include it in the response
      if (branches.length === 1 && branches[0].id) {
        branchId = branches[0].id;
      }
    } catch (branchError) {
      // Don't fail login if branch check fails, just log it
      console.warn('Failed to check branches for auto-selection:', branchError);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id as string,
        email: user.email as string,
        name: user.name as string,
        role: user.role as string,
        tenantId: user.tenant_id as string,
      },
      ...tokens,
      ...(branchId && { branchId }), // Include branchId only if there's exactly one branch
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        // Add clock tolerance to handle clock skew and network latency (60 seconds)
        clockTolerance: 60,
      });

      // Get user from database
      const supabase = this.supabaseService.getServiceRoleClient();
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', payload.sub)
        .single();

      if (error || !user || !user.is_active) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateUser(userId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user || !user.is_active) {
      return null;
    }

    // Return user in the expected format for frontend
    return {
      id: user.id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as string,
      tenantId: user.tenant_id as string,
    };
  }

  async getUserRoles(userId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const { data: userRoles, error } = await supabase
      .from('user_roles')
      .select(`
        role:roles(id, name, display_name_en, display_name_ar, description, is_system_role, is_active)
      `)
      .eq('user_id', userId);

    if (error || !userRoles) {
      return [];
    }

    return userRoles.map((ur: any) => ur.role).filter(Boolean);
  }

  async handleGoogleAuth(user: any) {
    // This method is called after validateGoogleUser returns a user
    if (!user) {
      throw new UnauthorizedException('Failed to authenticate with Google');
    }

    const serviceSupabase = this.supabaseService.getServiceRoleClient();

    // Update last login
    await serviceSupabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id as string,
        email: user.email as string,
        name: user.name as string,
        role: user.role as string,
        tenantId: user.tenant_id as string,
      },
      ...tokens,
    };
  }

  async validateGoogleUser(profile: any) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const userEmail = profile.emails?.[0]?.value;
    
    // Extract name from Google profile - try multiple sources
    let userName = 'User'; // Default fallback
    if (profile.displayName) {
      userName = profile.displayName;
    } else if (profile.name) {
      // Combine givenName and familyName if both exist
      const givenName = profile.name.givenName || '';
      const familyName = profile.name.familyName || '';
      if (givenName && familyName) {
        userName = `${givenName} ${familyName}`.trim();
      } else if (givenName) {
        userName = givenName;
      } else if (familyName) {
        userName = familyName;
      }
    }
    
    // If still no name, try email prefix
    if (userName === 'User' && userEmail) {
      userName = userEmail.split('@')[0];
      // Capitalize first letter
      userName = userName.charAt(0).toUpperCase() + userName.slice(1);
    }
    
    const userPhoto = profile.photos?.[0]?.value;
    
    // Debug logging
    console.log('Google OAuth Profile:', {
      displayName: profile.displayName,
      name: profile.name,
      email: userEmail,
      extractedName: userName,
    });

    if (!userEmail) {
      console.error('Google OAuth profile missing email');
      return null;
    }

    console.log('Validating Google user:', userEmail);

    // Check if user exists in users table
    let { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .maybeSingle();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking for existing user:', userError);
      return null;
    }

    if (existingUser) {
      console.log('Existing user found:', existingUser.id);
      
      // Update last login and fix name if it's "User"
      const updateData: any = { last_login_at: new Date().toISOString() };
      if (!existingUser.name || existingUser.name === 'User') {
        updateData.name = userName;
        console.log('Updating user name from', existingUser.name, 'to', userName);
      }
      
      await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id);

      // Fetch updated user if we updated the name
      if (updateData.name) {
        const { data: updatedUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', existingUser.id)
          .single();
        return updatedUser || existingUser;
      }

      return existingUser;
    }

    // User doesn't exist - auto-create
    console.log('User not found. Auto-creating user record for Google OAuth...');

    // First, create or get Supabase Auth user
    let supabaseAuthId: string;
    
    // Check if user exists in Supabase Auth
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const existingAuthUser = authUsers?.users?.find((u: any) => u?.email === userEmail);

    if (existingAuthUser) {
      supabaseAuthId = existingAuthUser.id;
      console.log('Found existing Supabase Auth user:', supabaseAuthId);
    } else {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: {
          name: userName,
          full_name: profile.displayName,
          avatar_url: userPhoto,
          provider: 'google',
        },
      });

      if (authError) {
        console.error('Failed to create Supabase Auth user:', authError);
        return null;
      }

      supabaseAuthId = authData.user.id;
      console.log('Created Supabase Auth user:', supabaseAuthId);
    }

    // Check if there's an existing tenant for this email
    let { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();

    let tenantId = existingTenant?.id;

    // If no tenant exists, create one
    if (!tenantId) {
      const baseSubdomain = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      let subdomain = baseSubdomain;
      let counter = 1;
      
      // Ensure unique subdomain
      while (true) {
        const { data: existing } = await supabase
          .from('tenants')
          .select('id')
          .eq('subdomain', subdomain)
          .maybeSingle();
        
        if (!existing) break;
        subdomain = `${baseSubdomain}${counter}`;
        counter++;
      }

      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: `${userName}'s Restaurant`,
          subdomain: subdomain,
          email: userEmail,
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Failed to create tenant:', tenantError);
        return null;
      }

      tenantId = newTenant.id;
      console.log('Created tenant:', tenantId);
    }

    // Create user record
    const { data: newUser, error: createUserError } = await supabase
      .from('users')
      .insert({
        supabase_auth_id: supabaseAuthId,
        email: userEmail,
        name: userName,
        photo_url: userPhoto,
        tenant_id: tenantId,
        role: 'tenant_owner',
        is_active: true,
      })
      .select()
      .single();

    if (createUserError) {
      console.error('Failed to create user record:', createUserError);
    return null;
    }

    console.log('User record created successfully:', newUser.id);

    // Create a default branch for the tenant if this is a new tenant
    if (!existingTenant) {
      try {
        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .insert({
            tenant_id: tenantId,
            name: 'Main Branch',
            code: 'MAIN',
            is_active: true,
          })
          .select()
          .single();

        if (branchError) {
          console.error('Failed to create default branch:', branchError);
          // Don't fail user creation if branch creation fails, but log it
        } else {
          console.log('Default branch created:', branchData.id);
          
          // Create default tables (5 tables) for the branch
          try {
            const defaultTables = [];
            for (let i = 1; i <= 5; i++) {
              defaultTables.push({
                branch_id: branchData.id,
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
              console.error('Failed to create default tables:', tablesError);
              // Don't fail user creation if table creation fails, but log it
            } else {
              console.log(`Created ${tablesData?.length || 0} default tables for branch:`, branchData.id);
            }
          } catch (tablesError) {
            console.error('Error creating default tables:', tablesError);
            // Don't fail user creation if table creation fails
          }
        }
      } catch (error) {
        console.error('Error creating default branch:', error);
        // Don't fail user creation if branch creation fails
      }
    }

    return newUser;
  }

  async getProfile(tenantId: string, userId: string, language?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !user) {
      throw new UnauthorizedException('User not found');
    }

    // Get translated name if language is provided
    let userName = user.name as string;
    if (language) {
      try {
        const translations = await this.translationService.getEntityTranslations('user' as any, userId);
        if (translations?.name && translations.name[language]) {
          userName = translations.name[language];
        }
      } catch (translationError) {
        console.warn('Failed to get user name translation:', translationError);
        // Fallback to original name
      }
    }

    return {
      id: user.id as string,
      email: user.email as string,
      name: userName,
      phone: user.phone as string | undefined,
      role: user.role as string,
      tenantId: user.tenant_id as string,
      createdAt: user.created_at as string,
      updatedAt: user.updated_at as string,
    };
  }

  async getUserAssignedBranches(tenantId: string, userId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Check if user is tenant owner - if so, return all branches
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user has manager role via RBAC (in addition to checking users.role field)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select(`
        role:roles(name)
      `)
      .eq('user_id', userId);

    const hasManagerRole = userRoles?.some((ur: any) => ur.role?.name === 'manager') || false;
    const isTenantOwner = user.role === 'tenant_owner';

    // If tenant owner OR has manager role, return all branches
    if (isTenantOwner || hasManagerRole) {
      const { data: allBranches, error } = await supabase
        .from('branches')
        .select('id, name, code')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw new BadRequestException('Failed to fetch branches: ' + error.message);
      }

      // If no branches exist, create a default branch for tenant owners
      if ((allBranches || []).length === 0 && isTenantOwner) {
        console.log(`No branches found for tenant ${tenantId}. Creating default branch...`);
        try {
          const { data: newBranch, error: createError } = await supabase
            .from('branches')
            .insert({
              tenant_id: tenantId,
              name: 'Main Branch',
              code: 'MAIN',
              is_active: true,
            })
            .select('id, name, code')
            .single();

          if (createError) {
            console.error('Failed to create default branch:', createError);
          } else {
            console.log('✅ Created default branch:', newBranch.id);
            return [newBranch];
          }
        } catch (createBranchError) {
          console.error('Error creating default branch:', createBranchError);
        }
      }

      return allBranches || [];
    }

    // For other users, return only assigned branches
    const { data: userBranches, error } = await supabase
      .from('user_branches')
      .select(`
        branch:branches!inner(id, name, code)
      `)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException('Failed to fetch assigned branches: ' + error.message);
    }

    return (userBranches || []).map((ub: any) => ({
      id: ub.branch.id,
      name: ub.branch.name,
      code: ub.branch.code,
    }));
  }

  async updateProfile(tenantId: string, userId: string, updateProfileDto: UpdateProfileDto) {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    // Build update object
    const updateData: any = {};
    if (updateProfileDto.name !== undefined) {
      updateData.name = updateProfileDto.name;
    }
    if (updateProfileDto.phone !== undefined) {
      updateData.phone = updateProfileDto.phone;
    }
    // Email updates are disabled - email cannot be changed after creation

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new UnauthorizedException(`Failed to update profile: ${error.message}`);
    }

    // Update translations if name was changed
    if (updateProfileDto.name !== undefined) {
      try {
        await this.translationService.createTranslations(
          {
            entityType: 'user' as any,
            entityId: userId,
            fieldName: 'name',
            text: updateProfileDto.name,
          },
          userId,
          tenantId, // Pass tenantId to ensure only enabled languages are translated
        );
        console.log('Translations updated for user name');
      } catch (translationError) {
        console.error('Failed to update translations for user name:', translationError);
        // Don't fail profile update if translation update fails
      }
    }

    // Get translated name for response (use current language if available, otherwise use updated name)
    let userName = updatedUser.name as string;
    // Note: We could accept a language parameter here, but for now just return the updated name
    // The frontend can fetch translations separately if needed

    return {
      id: updatedUser.id as string,
      email: updatedUser.email as string,
      name: userName,
      phone: updatedUser.phone as string | undefined,
      role: updatedUser.role as string,
      tenantId: updatedUser.tenant_id as string,
      updatedAt: updatedUser.updated_at as string,
    };
  }

  /**
   * Handle all slow post-signup operations asynchronously
   * This includes translations, role assignment, branch creation, menus, subscriptions, etc.
   * These operations run in the background to allow signup to return quickly
   */
  private async handlePostSignupAsyncTasks(
    signupDto: SignupDto,
    userId: string,
    tenantId: string,
    isNewTenant: boolean,
    existingBranchId?: string, // If branch already created, use this instead of creating new one
  ) {
    const supabase = this.supabaseService.getServiceRoleClient();

    try {
      // Don't create translations on signup - only English is enabled initially
      // Translations will be created when user adds languages

      // 3. Assign role based on user role field
      try {
        const roles = await this.rolesService.getRoles();
        const userRole = signupDto.role || 'tenant_owner';
        
        // Map tenant_owner to manager role for full access
        const roleToAssign = userRole === 'tenant_owner' ? 'manager' : userRole;
        const role = roles.find((r) => r.name === roleToAssign);
        
        if (role) {
          await this.rolesService.assignRolesToUser(userId, [role.id], userId);
          console.log(`✅ Assigned ${role.name} role to user ${userId}`);
        } else {
          // Fallback: assign manager role if role not found
          const managerRole = roles.find((r) => r.name === 'manager');
          if (managerRole) {
            await this.rolesService.assignRolesToUser(userId, [managerRole.id], userId);
            console.log(`✅ Assigned manager role (fallback) to user ${userId}`);
          }
        }
      } catch (roleError) {
        console.error('Failed to assign role to user:', roleError);
      }

      // 4. Use existing branch or create default branch for new tenant (if needed)
      if (isNewTenant) {
        let defaultBranchId: string | undefined = existingBranchId; // Use existing branch if provided
        
        // Only create branch if it wasn't already created synchronously
        if (!defaultBranchId) {
          try {
            const { data: branchData, error: branchError } = await supabase
              .from('branches')
              .insert({
                tenant_id: tenantId,
                name: 'Main Branch',
                code: 'MAIN',
                is_active: true,
              })
              .select()
              .single();

            if (branchError) {
              console.error('Failed to create default branch:', branchError);
            } else {
              defaultBranchId = branchData.id;
              console.log('✅ Default branch created:', defaultBranchId);

              // Don't create translations on signup - only English is enabled initially
              // Translations will be created when user adds languages
              
              // Create default tables (5 tables) for the branch
              try {
                const defaultTables = [];
                for (let i = 1; i <= 5; i++) {
                  defaultTables.push({
                    branch_id: defaultBranchId,
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
                  console.error('Failed to create default tables:', tablesError);
                } else {
                  console.log(`✅ Created ${tablesData?.length || 0} default tables for branch:`, defaultBranchId);
                }
              } catch (tablesError) {
                console.error('Error creating default tables:', tablesError);
              }
            }
          } catch (error) {
            console.error('Error creating default branch:', error);
          }
        } else {
          console.log('✅ Using existing branch:', defaultBranchId);
        }
        
        // Continue with other async tasks using the branchId
        if (defaultBranchId) {
          // Create default menus with proper names for new tenant (branch-specific)
          try {
            await this.menuService.createDefaultMenus(tenantId, defaultBranchId);
            console.log('✅ Default menus created for branch:', defaultBranchId);
          } catch (menuError) {
            console.warn('⚠️  Failed to create default menus (non-critical):', menuError?.message || menuError);
          }

          // Create trial subscription for new tenant
          try {
            await this.subscriptionService.createTrialSubscription(tenantId, PlanId.STARTER);
            console.log('✅ Trial subscription created for tenant:', tenantId);
          } catch (subscriptionError) {
            console.warn('⚠️  Failed to create trial subscription (non-critical):', subscriptionError?.message || subscriptionError);
          }

          // Create sample data for new tenant (non-blocking - runs in background)
          this.seedSampleData(tenantId, defaultBranchId).catch((seedError) => {
            console.error('❌ Failed to create sample data (background job):', seedError?.message || seedError);
          });
          console.log('📦 Sample data creation started in background for tenant:', tenantId, 'branch:', defaultBranchId);
        }
      }
    } catch (error) {
      console.error('❌ Error in handlePostSignupAsyncTasks:', error);
      // Don't throw - these are background operations
    }
  }

  private async seedSampleData(tenantId: string, branchId?: string) {
    console.log('🚀 Starting optimized sample data creation for tenant:', tenantId, 'branch:', branchId);
    try {
      const supabase = this.supabaseService.getServiceRoleClient();
      const translationsToInsert: Array<{
        entityType: string;
        entityId: string;
        fieldName: string;
        text: string;
      }> = [];

      // 1. Bulk create categories using direct DB insert
      console.log('📁 Creating categories (bulk)...');
      let category1, category2;
      try {
        const categoriesData = [
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            name: 'Main Dishes',
            description: 'Delicious main course options',
            category_type: 'food',
            is_active: true,
            display_order: 0,
          },
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            name: 'Sides & Appetizers',
            description: 'Perfect sides and appetizers to complement your meal',
            category_type: 'food',
            is_active: true,
            display_order: 1,
          },
        ];

        const { data: insertedCategories, error: catError } = await supabase
          .from('categories')
          .insert(categoriesData)
          .select('id, name, description');

        if (catError) {
          console.error('Failed to bulk create categories:', catError);
          // Try to get existing categories
          const categories = await this.menuService.getCategories(tenantId);
          if (Array.isArray(categories) && categories.length > 0) {
            category1 = categories[0];
            category2 = categories.length > 1 ? categories[1] : categories[0];
          } else {
            throw new Error('Could not create or find categories');
          }
        } else {
          category1 = insertedCategories[0];
          category2 = insertedCategories[1];
          console.log('✅ Categories created:', category1.id, category2.id);

          // Prepare translations for bulk insert
          translationsToInsert.push(
            { entityType: 'category', entityId: category1.id, fieldName: 'name', text: 'Main Dishes' },
            { entityType: 'category', entityId: category1.id, fieldName: 'description', text: 'Delicious main course options' },
            { entityType: 'category', entityId: category2.id, fieldName: 'name', text: 'Sides & Appetizers' },
            { entityType: 'category', entityId: category2.id, fieldName: 'description', text: 'Perfect sides and appetizers to complement your meal' },
          );
        }
      } catch (error) {
        console.error('Failed to create sample categories:', error);
        throw error;
      }

      // 2. Bulk create add-on groups and add-ons using direct DB inserts
      console.log('📦 Creating add-on groups and add-ons (bulk)...');
      let addOnGroup1, addOnGroup2;
      try {
        // Bulk insert add-on groups
        const addOnGroupsData = [
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            name: 'Extra Toppings (Sample)',
            selection_type: 'multiple',
            is_required: false,
            min_selections: 0,
            max_selections: null,
            category: 'Add',
            display_order: 0,
            is_active: true,
          },
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            name: 'Customization Options (Sample)',
            selection_type: 'multiple',
            is_required: false,
            min_selections: 0,
            max_selections: null,
            category: 'Change',
            display_order: 1,
            is_active: true,
          },
        ];

        const { data: insertedGroups, error: groupsError } = await supabase
          .from('add_on_groups')
          .insert(addOnGroupsData)
          .select('id, name');

        if (groupsError) {
          console.error('Failed to bulk create add-on groups:', groupsError);
          throw groupsError;
        }

        addOnGroup1 = insertedGroups[0];
        addOnGroup2 = insertedGroups[1];
        console.log('✅ Add-on groups created:', addOnGroup1.id, addOnGroup2.id);

        // Prepare translations for add-on groups
        translationsToInsert.push(
          { entityType: 'addon_group', entityId: addOnGroup1.id, fieldName: 'name', text: 'Extra Toppings (Sample)' },
          { entityType: 'addon_group', entityId: addOnGroup2.id, fieldName: 'name', text: 'Customization Options (Sample)' },
        );

        // Bulk insert add-ons
        const addOnsData = [
          { add_on_group_id: addOnGroup1.id, name: 'Extra Cheese', price: 0, display_order: 1, is_active: true },
          { add_on_group_id: addOnGroup1.id, name: 'Extra Sauce', price: 0, display_order: 2, is_active: true },
          { add_on_group_id: addOnGroup2.id, name: 'Extra Spicy', price: 0, display_order: 1, is_active: true },
          { add_on_group_id: addOnGroup2.id, name: 'No Onions', price: 0, display_order: 2, is_active: true },
          { add_on_group_id: addOnGroup2.id, name: 'Well Done', price: 0, display_order: 3, is_active: true },
        ];

        const { data: insertedAddOns, error: addOnsError } = await supabase
          .from('add_ons')
          .insert(addOnsData)
          .select('id, name');

        if (addOnsError) {
          console.error('Failed to bulk create add-ons:', addOnsError);
        } else {
          console.log('✅ Add-ons created:', insertedAddOns.length);
          // Prepare translations for add-ons
          for (const addon of insertedAddOns) {
            translationsToInsert.push(
              { entityType: 'addon', entityId: addon.id, fieldName: 'name', text: addon.name },
            );
          }
        }
      } catch (error) {
        console.error('Failed to create add-on groups or add-ons:', error);
      }

      // 3. Bulk create variation groups and variations using direct DB inserts
      console.log('🔄 Creating variation groups and variations (bulk)...');
      let variationGroup1, variationGroup2;
      try {
        // Bulk insert variation groups
        const variationGroupsData = [
          { tenant_id: tenantId, branch_id: branchId || null, name: 'Size' },
          { tenant_id: tenantId, branch_id: branchId || null, name: 'Spice Level' },
        ];

        const { data: insertedVarGroups, error: varGroupsError } = await supabase
          .from('variation_groups')
          .insert(variationGroupsData)
          .select('id, name');

        if (varGroupsError) {
          console.error('Failed to bulk create variation groups:', varGroupsError);
          throw varGroupsError;
        }

        variationGroup1 = insertedVarGroups[0];
        variationGroup2 = insertedVarGroups[1];
        console.log('✅ Variation groups created:', variationGroup1.id, variationGroup2.id);

        // Prepare translations for variation groups
        translationsToInsert.push(
          { entityType: 'variation_group', entityId: variationGroup1.id, fieldName: 'name', text: 'Size' },
          { entityType: 'variation_group', entityId: variationGroup2.id, fieldName: 'name', text: 'Spice Level' },
        );

        // Bulk insert variations
        const variationsData = [
          { variation_group_id: variationGroup1.id, name: 'Small', pricing_adjustment: 0, recipe_multiplier: 0.8, display_order: 1 },
          { variation_group_id: variationGroup1.id, name: 'Medium', pricing_adjustment: 500, recipe_multiplier: 1.0, display_order: 2 },
          { variation_group_id: variationGroup1.id, name: 'Large', pricing_adjustment: 1000, recipe_multiplier: 1.2, display_order: 3 },
          { variation_group_id: variationGroup2.id, name: 'Mild', pricing_adjustment: 0, recipe_multiplier: 1.0, display_order: 1 },
          { variation_group_id: variationGroup2.id, name: 'Medium', pricing_adjustment: 0, recipe_multiplier: 1.0, display_order: 2 },
          { variation_group_id: variationGroup2.id, name: 'Hot', pricing_adjustment: 200, recipe_multiplier: 1.0, display_order: 3 },
          { variation_group_id: variationGroup2.id, name: 'Extra Hot', pricing_adjustment: 400, recipe_multiplier: 1.0, display_order: 4 },
        ];

        const { data: insertedVariations, error: variationsError } = await supabase
          .from('variations')
          .insert(variationsData)
          .select('id, name');

        if (variationsError) {
          console.error('Failed to bulk create variations:', variationsError);
        } else {
          console.log('✅ Variations created:', insertedVariations.length);
          // Prepare translations for variations
          for (const variation of insertedVariations) {
            translationsToInsert.push(
              { entityType: 'variation', entityId: variation.id, fieldName: 'name', text: variation.name },
            );
          }
        }
      } catch (error) {
        console.error('Failed to create variation groups:', error);
      }

      // 4. Bulk create sample food items
      console.log('🍔 Creating food items (bulk)...');
      const foodItems = [];
      try {
        const addOnGroupIds = [];
        if (addOnGroup1) addOnGroupIds.push(addOnGroup1.id);
        if (addOnGroup2) addOnGroupIds.push(addOnGroup2.id);

        // Get variation IDs for variations
        let mediumVariationId1 = null;
        let mediumVariationId2 = null;
        if (variationGroup1) {
          const { data: var1 } = await supabase
            .from('variations')
            .select('id')
            .eq('variation_group_id', variationGroup1.id)
            .eq('name', 'Medium')
            .is('deleted_at', null)
            .maybeSingle();
          mediumVariationId1 = var1?.id || null;
        }
        if (variationGroup2) {
          const { data: var2 } = await supabase
            .from('variations')
            .select('id')
            .eq('variation_group_id', variationGroup2.id)
            .eq('name', 'Medium')
            .is('deleted_at', null)
            .maybeSingle();
          mediumVariationId2 = var2?.id || null;
        }

        // Bulk insert food items
        const foodItemsData = [
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            category_id: category1.id,
            name: 'Sample Burger',
            description: 'A delicious sample burger',
            image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
            base_price: 5000,
            stock_type: 'unlimited',
            stock_quantity: 0,
            menu_type: 'all_day',
            display_order: 0,
            is_active: true,
          },
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            category_id: category1.id,
            name: 'Sample Pizza',
            description: 'A tasty sample pizza',
            image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=300&fit=crop',
            base_price: 8000,
            stock_type: 'unlimited',
            stock_quantity: 0,
            menu_type: 'all_day',
            display_order: 1,
            is_active: true,
          },
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            category_id: category2.id,
            name: 'Sample Fries',
            description: 'Crispy sample fries',
            image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop',
            base_price: 2000,
            stock_type: 'unlimited',
            stock_quantity: 0,
            menu_type: 'all_day',
            display_order: 2,
            is_active: true,
          },
          {
            tenant_id: tenantId,
            branch_id: branchId || null,
            category_id: category2.id,
            name: 'Garlic Bread',
            description: 'Freshly baked garlic bread',
            image_url: 'https://plus.unsplash.com/premium_photo-1711752902734-a36167479983?q=80&w=688&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            base_price: 1500,
            stock_type: 'unlimited',
            stock_quantity: 0,
            menu_type: 'all_day',
            display_order: 3,
            is_active: true,
          },
        ];

        const { data: insertedFoodItems, error: foodItemsError } = await supabase
          .from('food_items')
          .insert(foodItemsData)
          .select('id, name');

        if (foodItemsError) {
          console.error('Failed to bulk create food items:', foodItemsError);
          throw foodItemsError;
        }

        foodItems.push(...insertedFoodItems);
        console.log('✅ Food items created:', insertedFoodItems.length);

        // Prepare translations
        for (const item of insertedFoodItems) {
          const itemData = foodItemsData.find(f => f.name === item.name);
          if (itemData) {
            translationsToInsert.push(
              { entityType: 'food_item', entityId: item.id, fieldName: 'name', text: itemData.name },
              { entityType: 'food_item', entityId: item.id, fieldName: 'description', text: itemData.description },
            );
          }
        }

        // Bulk insert food item variations
        const variationsData = [];
        if (mediumVariationId1 && insertedFoodItems[0]) {
          variationsData.push({
            food_item_id: insertedFoodItems[0].id,
            variation_group: variationGroup1.id,
            variation_name: 'Medium',
            variation_id: mediumVariationId1,
            price_adjustment: 0,
            display_order: 1,
          });
        }
        if (mediumVariationId2 && insertedFoodItems[1]) {
          variationsData.push({
            food_item_id: insertedFoodItems[1].id,
            variation_group: variationGroup2.id,
            variation_name: 'Medium',
            variation_id: mediumVariationId2,
            price_adjustment: 0,
            display_order: 1,
          });
        }
        if (variationsData.length > 0) {
          await supabase.from('food_item_variations').insert(variationsData);
        }

        // Bulk insert add-on group links (for first two food items)
        if (addOnGroupIds.length > 0 && insertedFoodItems.length >= 2) {
          const addOnGroupsData = [];
          for (let i = 0; i < 2; i++) {
            for (const groupId of addOnGroupIds) {
              addOnGroupsData.push({
                food_item_id: insertedFoodItems[i].id,
                add_on_group_id: groupId,
              });
            }
          }
          await supabase.from('food_item_add_on_groups').insert(addOnGroupsData);
        }

        // Bulk insert menu items
        const menuItemsData = insertedFoodItems.map((item, index) => ({
          tenant_id: tenantId,
          menu_type: 'all_day',
          food_item_id: item.id,
          display_order: index,
        }));
        await supabase.from('menu_items').insert(menuItemsData);
      } catch (error) {
        console.error('Failed to create food items:', error);
      }

      // 5. Bulk create ingredients and buffets in parallel (both are independent)
      console.log('🥩 Creating ingredients and buffets (bulk, parallel)...');
      let ingredients: any[] = [];
      let buffets: any[] = [];

      await Promise.all([
        // Bulk create all ingredients
        (async () => {
          try {
            const ingredientsData = [
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Beef Patty',
                category: 'Meat',
                unit_of_measurement: 'piece',
                current_stock: 100,
                minimum_threshold: 20,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Burger Bun',
                category: 'Bakery',
                unit_of_measurement: 'piece',
                current_stock: 150,
                minimum_threshold: 30,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Lettuce',
                category: 'Vegetables',
                unit_of_measurement: 'piece',
                current_stock: 200,
                minimum_threshold: 50,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Tomato',
                category: 'Vegetables',
                unit_of_measurement: 'piece',
                current_stock: 150,
                minimum_threshold: 30,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Pizza Dough',
                category: 'Bakery',
                unit_of_measurement: 'piece',
                current_stock: 80,
                minimum_threshold: 15,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Pizza Sauce',
                category: 'Sauces',
                unit_of_measurement: 'cup',
                current_stock: 50,
                minimum_threshold: 10,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Mozzarella Cheese',
                category: 'Dairy',
                unit_of_measurement: 'cup',
                current_stock: 60,
                minimum_threshold: 12,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Pepperoni',
                category: 'Meat',
                unit_of_measurement: 'slice',
                current_stock: 200,
                minimum_threshold: 40,
                is_active: true,
              },
            ];

            const { data: insertedIngredients, error: ingredientsError } = await supabase
              .from('ingredients')
              .insert(ingredientsData)
              .select('id, name');

            if (ingredientsError) {
              console.error('Failed to bulk create ingredients:', ingredientsError);
              throw ingredientsError;
            }

            if (!insertedIngredients || insertedIngredients.length === 0) {
              console.error('No ingredients were created');
              throw new Error('No ingredients were created');
            }

            ingredients = insertedIngredients;
            console.log('✅ Ingredients created:', insertedIngredients.length);
            console.log('📋 Ingredient names:', insertedIngredients.map((ing: any) => ing.name).join(', '));
          } catch (error) {
            console.error('Failed to create ingredients:', error);
            throw error; // Re-throw to prevent continuing with empty ingredients array
          }
        })(),

        // Create buffets in parallel with ingredients
        (async () => {
          try {
            const buffetsData = [
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'All-Day Family Buffet',
                description: 'Unlimited access to our full menu selection including burgers, pizza, fries, and more. Perfect for groups and families!',
                price_per_person: 15000,
                min_persons: 1,
                menu_types: ['all_day'],
                image_url: 'https://images.unsplash.com/photo-1555244162-803834f70033?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YnVmZmV0fGVufDB8fDB8fHww',
                display_order: 1,
                is_active: true,
              },
              {
                tenant_id: tenantId,
                branch_id: branchId || null,
                name: 'Weekend Special Buffet',
                description: 'Premium weekend buffet with all our signature dishes and special items. Available Saturday and Sunday!',
                price_per_person: 20000,
                min_persons: 2,
                menu_types: ['all_day'],
                image_url: 'https://images.unsplash.com/photo-1583338917496-7ea264c374ce?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8YnVmZmV0fGVufDB8fDB8fHww',
                display_order: 2,
                is_active: true,
              },
            ];

            const { data: insertedBuffets, error: buffetsError } = await supabase
              .from('buffets')
              .insert(buffetsData)
              .select('id, name');

            if (buffetsError) {
              console.error('Failed to bulk create buffets:', buffetsError);
              throw buffetsError;
            }

            buffets = insertedBuffets;
            console.log('✅ Buffets created:', insertedBuffets.length);

            // Prepare translations
            for (const buffet of insertedBuffets) {
              const buffetData = buffetsData.find(b => b.name === buffet.name);
              if (buffetData) {
                translationsToInsert.push(
                  { entityType: 'buffet', entityId: buffet.id, fieldName: 'name', text: buffetData.name },
                  { entityType: 'buffet', entityId: buffet.id, fieldName: 'description', text: buffetData.description },
                );
              }
            }
          } catch (error) {
            console.error('Failed to create buffets:', error);
          }
        })(),
      ]);

      // 6. After food items and ingredients are ready, create recipes, combo meals, and menu assignments in parallel
      if (foodItems.length > 0 && ingredients.length >= 8) {
        console.log('⚡ Creating recipes, combo meals, and menu assignments (parallel)...');
        console.log('📋 Available ingredients:', ingredients.map((ing: any) => ing.name).join(', '));
        console.log('🍔 Available food items:', foodItems.map((item: any) => item.name).join(', '));
        
        // Find ingredients by name for robustness
        const beefPatty = ingredients.find((ing: any) => ing.name === 'Beef Patty');
        const burgerBun = ingredients.find((ing: any) => ing.name === 'Burger Bun');
        const lettuce = ingredients.find((ing: any) => ing.name === 'Lettuce');
        const tomato = ingredients.find((ing: any) => ing.name === 'Tomato');
        const pizzaDough = ingredients.find((ing: any) => ing.name === 'Pizza Dough');
        const pizzaSauce = ingredients.find((ing: any) => ing.name === 'Pizza Sauce');
        const mozzarellaCheese = ingredients.find((ing: any) => ing.name === 'Mozzarella Cheese');
        const pepperoni = ingredients.find((ing: any) => ing.name === 'Pepperoni');

        console.log('🔍 Found ingredients:', {
          beefPatty: !!beefPatty,
          burgerBun: !!burgerBun,
          lettuce: !!lettuce,
          tomato: !!tomato,
          pizzaDough: !!pizzaDough,
          pizzaSauce: !!pizzaSauce,
          mozzarellaCheese: !!mozzarellaCheese,
          pepperoni: !!pepperoni,
        });

        await Promise.all([
          // Create recipes
          (async () => {
            try {
              // Validate that we have the required ingredients and food items
              if (!beefPatty || !burgerBun || !lettuce || !tomato || !pizzaDough || !pizzaSauce || !mozzarellaCheese || !pepperoni) {
                console.error('Missing ingredients for recipes:', {
                  beefPatty: !!beefPatty,
                  burgerBun: !!burgerBun,
                  lettuce: !!lettuce,
                  tomato: !!tomato,
                  pizzaDough: !!pizzaDough,
                  pizzaSauce: !!pizzaSauce,
                  mozzarellaCheese: !!mozzarellaCheese,
                  pepperoni: !!pepperoni,
                });
                return;
              }

              if (!foodItems || foodItems.length < 2) {
                console.error('Not enough food items for recipes:', foodItems?.length || 0);
                return;
              }

              const recipesData = [
                // Recipe for burger (foodItems[0])
                { food_item_id: foodItems[0].id, ingredient_id: beefPatty.id, quantity: 1, unit: 'piece' },
                { food_item_id: foodItems[0].id, ingredient_id: burgerBun.id, quantity: 1, unit: 'piece' },
                { food_item_id: foodItems[0].id, ingredient_id: lettuce.id, quantity: 2, unit: 'piece' },
                { food_item_id: foodItems[0].id, ingredient_id: tomato.id, quantity: 2, unit: 'piece' },
                // Recipe for pizza (foodItems[1])
                { food_item_id: foodItems[1].id, ingredient_id: pizzaDough.id, quantity: 1, unit: 'piece' },
                { food_item_id: foodItems[1].id, ingredient_id: pizzaSauce.id, quantity: 1, unit: 'cup' },
                { food_item_id: foodItems[1].id, ingredient_id: mozzarellaCheese.id, quantity: 1.5, unit: 'cup' },
                { food_item_id: foodItems[1].id, ingredient_id: pepperoni.id, quantity: 10, unit: 'slice' },
              ];

              const { data: insertedRecipes, error: recipesError } = await supabase
                .from('recipes')
                .insert(recipesData)
                .select('id, food_item_id, ingredient_id');

              if (recipesError) {
                console.error('Failed to bulk create recipes:', recipesError);
                throw recipesError;
              }

              if (!insertedRecipes || insertedRecipes.length === 0) {
                console.error('No recipes were created');
                throw new Error('No recipes were created');
              }

              console.log('✅ Recipes created:', insertedRecipes.length, 'ingredient entries');
              console.log('📋 Recipe details:', JSON.stringify(insertedRecipes, null, 2));
            } catch (error) {
              console.error('Failed to create recipes:', error);
              throw error; // Re-throw to ensure we know if recipes failed
            }
          })(),

          // Create combo meals
          (async () => {
            if (foodItems.length >= 4) {
              try {
                const comboMealsData = [
                  {
                    tenant_id: tenantId,
                    branch_id: branchId || null,
                    name: 'Classic Burger Combo',
                    description: 'Delicious burger paired with crispy golden fries. A perfect meal combination at a great value!',
                    base_price: 6000,
                    food_item_ids: [foodItems[0].id, foodItems[2].id], // Burger and Fries
                    menu_types: ['all_day'],
                    image_url: 'https://plus.unsplash.com/premium_photo-1683619761468-b06992704398?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8YnVyZ2VyfGVufDB8fDB8fHww',
                    display_order: 1,
                    is_active: true,
                  },
                  {
                    tenant_id: tenantId,
                    branch_id: branchId || null,
                    name: 'Pizza & Garlic Bread Combo',
                    description: 'Tasty pizza served with freshly baked garlic bread. A classic Italian combination!',
                    base_price: 8500,
                    food_item_ids: [foodItems[1].id, foodItems[3].id], // Pizza and Garlic Bread
                    menu_types: ['all_day'],
                    image_url: 'https://media.istockphoto.com/id/1151446369/photo/tasty-supreme-pizza-with-olives-peppers-onions-and-sausage.webp?a=1&b=1&s=612x612&w=0&k=20&c=LprgiVWgVb5nJ6psO3R2bAYLPBV6V9gLVW9PlTbtGLU=',
                    display_order: 2,
                    is_active: true,
                  },
                ];

                const { data: insertedComboMeals, error: comboMealsError } = await supabase
                  .from('combo_meals')
                  .insert(comboMealsData)
                  .select('id, name');

                if (comboMealsError) {
                  console.error('Failed to bulk create combo meals:', comboMealsError);
                  throw comboMealsError;
                }

                console.log('✅ Combo meals created:', insertedComboMeals.length);

                // Prepare translations
                for (const combo of insertedComboMeals) {
                  const comboData = comboMealsData.find(c => c.name === combo.name);
                  if (comboData) {
                    translationsToInsert.push(
                      { entityType: 'combo_meal', entityId: combo.id, fieldName: 'name', text: comboData.name },
                      { entityType: 'combo_meal', entityId: combo.id, fieldName: 'description', text: comboData.description },
                    );
                  }
                }
              } catch (error) {
                console.error('Failed to create combo meals:', error);
              }
            }
          })(),

          // Assign food items to menu
          (async () => {
            try {
              const foodItemIds = foodItems.map(item => item.id);
              await this.menuService.assignItemsToMenu(tenantId, 'all_day', foodItemIds);
              console.log('✅ Food items assigned to menu');
            } catch (error) {
              console.error('Failed to assign items to menu:', error);
            }
          })(),
        ]);
      }


      // Don't create translations on signup - only English is enabled initially
      // Translations will be created when user adds languages
      // Note: Sample data will be created without translations, users can add languages later

      console.log('✅ Sample data creation completed successfully for tenant:', tenantId);
    } catch (error) {
      console.error('❌ Error in seedSampleData:', error);
      throw error;
    }
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id as string,
      email: (user.email as string) || '',
      role: user.role as string,
      tenantId: user.tenant_id as string,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') || '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}

