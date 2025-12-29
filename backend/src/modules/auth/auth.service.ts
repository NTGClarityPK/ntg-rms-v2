import { Injectable, UnauthorizedException } from '@nestjs/common';
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

    // Assign role based on user role field
    try {
      const roles = await this.rolesService.getRoles();
      const userRole = signupDto.role || 'tenant_owner';
      
      // Map tenant_owner to manager role for full access
      const roleToAssign = userRole === 'tenant_owner' ? 'manager' : userRole;
      const role = roles.find((r) => r.name === roleToAssign);
      
      if (role) {
        await this.rolesService.assignRolesToUser(userData.id, [role.id], userData.id);
        console.log(`Assigned ${role.name} role to user ${userData.id}`);
      } else {
        // Fallback: assign manager role if role not found
        const managerRole = roles.find((r) => r.name === 'manager');
        if (managerRole) {
          await this.rolesService.assignRolesToUser(userData.id, [managerRole.id], userData.id);
          console.log(`Assigned manager role (fallback) to user ${userData.id}`);
        }
      }
    } catch (roleError) {
      console.error('Failed to assign role to user:', roleError);
      // Don't fail signup if role assignment fails, but log it
    }

    // Create a default branch for the tenant if this is a new tenant
    if (!signupDto.tenantId) {
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
          // Don't fail signup if branch creation fails, but log it
        } else {
          console.log('Default branch created:', branchData.id);
        }
      } catch (error) {
        console.error('Error creating default branch:', error);
        // Don't fail signup if branch creation fails
      }

      // Create trial subscription for new tenant
      try {
        await this.subscriptionService.createTrialSubscription(tenantId, PlanId.STARTER);
        console.log('Trial subscription created for tenant:', tenantId);
      } catch (subscriptionError) {
        console.warn('⚠️  Failed to create trial subscription (non-critical, signup will continue):', subscriptionError?.message || subscriptionError);
        // Don't fail signup if subscription creation fails - this is non-critical
        // The subscriptions table may not exist yet, which is fine for initial setup
      }

      // Create sample data for new tenant (non-blocking - runs in background)
      // Don't await this to avoid timeout issues - let it run asynchronously
      this.seedSampleData(tenantId).catch((seedError) => {
        console.error('❌ Failed to create sample data (background job):', seedError?.message || seedError);
        console.error('Stack trace:', seedError);
      });
      console.log('📦 Sample data creation started in background for tenant:', tenantId);
    }

    // Generate tokens
    const tokens = await this.generateTokens(userData);

    return {
      user: {
        id: userData.id,
        email: userData.email as string,
        name: userData.name as string,
        role: userData.role as string,
        tenantId: userData.tenant_id as string,
      },
      ...tokens,
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
        }
      } catch (error) {
        console.error('Error creating default branch:', error);
        // Don't fail user creation if branch creation fails
      }
    }

    return newUser;
  }

  async getProfile(tenantId: string, userId: string) {
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

    return {
      id: user.id as string,
      email: user.email as string,
      name: user.name as string,
      phone: user.phone as string | undefined,
      role: user.role as string,
      tenantId: user.tenant_id as string,
      createdAt: user.created_at as string,
      updatedAt: user.updated_at as string,
    };
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
    if (updateProfileDto.email !== undefined) {
      updateData.email = updateProfileDto.email;
      // Also update email in Supabase Auth
      const { data: user } = await supabase
        .from('users')
        .select('supabase_auth_id')
        .eq('id', userId)
        .single();
      
      if (user?.supabase_auth_id) {
        await supabase.auth.admin.updateUserById(user.supabase_auth_id, {
          email: updateProfileDto.email,
        });
      }
    }

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

    return {
      id: updatedUser.id as string,
      email: updatedUser.email as string,
      name: updatedUser.name as string,
      phone: updatedUser.phone as string | undefined,
      role: updatedUser.role as string,
      tenantId: updatedUser.tenant_id as string,
      updatedAt: updatedUser.updated_at as string,
    };
  }

  private async seedSampleData(tenantId: string) {
    console.log('🚀 Starting sample data creation for tenant:', tenantId);
    try {
      const supabase = this.supabaseService.getServiceRoleClient();

      // 1. Create two sample categories for food items
      console.log('📁 Creating categories...');
      let category1, category2;
      try {
        category1 = await this.menuService.createCategory(tenantId, {
          name: 'Main Dishes',
          description: 'Delicious main course options',
          categoryType: 'food',
          isActive: true,
        });
        console.log('Category 1 created:', category1.id);

        category2 = await this.menuService.createCategory(tenantId, {
          name: 'Sides & Appetizers',
          description: 'Perfect sides and appetizers to complement your meal',
          categoryType: 'food',
          isActive: true,
        });
        console.log('Category 2 created:', category2.id);
      } catch (error) {
        console.error('Failed to create sample categories:', error);
        // Try to get existing categories
        const categories = await this.menuService.getCategories(tenantId);
        if (Array.isArray(categories) && categories.length > 0) {
          category1 = categories[0];
          category2 = categories.length > 1 ? categories[1] : categories[0];
        } else {
          throw new Error('Could not create or find categories');
        }
      }

      // 2. Create two add-on groups with appropriate items
      let addOnGroup1, addOnGroup2;
      try {
        // First add-on group: Extra Toppings (Add category)
        addOnGroup1 = await this.menuService.createAddOnGroup(tenantId, {
          name: 'Extra Toppings (Sample)',
          selectionType: 'multiple',
          isRequired: false,
          minSelections: 0,
          category: 'Add',
        });
        console.log('Add-on group 1 created:', addOnGroup1.id);

        // Create add-ons for first group
        await this.menuService.createAddOn(tenantId, {
          addOnGroupId: addOnGroup1.id,
          name: 'Extra Cheese',
          price: 0,
          displayOrder: 1,
          isActive: true,
        });

        await this.menuService.createAddOn(tenantId, {
          addOnGroupId: addOnGroup1.id,
          name: 'Extra Sauce',
          price: 0,
          displayOrder: 2,
          isActive: true,
        });
        console.log('Add-ons for group 1 created');

        // Second add-on group: Customization Options (Change category)
        addOnGroup2 = await this.menuService.createAddOnGroup(tenantId, {
          name: 'Customization Options (Sample)',
          selectionType: 'multiple',
          isRequired: false,
          minSelections: 0,
          category: 'Change',
        });
        console.log('Add-on group 2 created:', addOnGroup2.id);

        // Create add-ons for second group
        await this.menuService.createAddOn(tenantId, {
          addOnGroupId: addOnGroup2.id,
          name: 'Extra Spicy',
          price: 0,
          displayOrder: 1,
          isActive: true,
        });

        await this.menuService.createAddOn(tenantId, {
          addOnGroupId: addOnGroup2.id,
          name: 'No Onions',
          price: 0,
          displayOrder: 2,
          isActive: true,
        });

        await this.menuService.createAddOn(tenantId, {
          addOnGroupId: addOnGroup2.id,
          name: 'Well Done',
          price: 0,
          displayOrder: 3,
          isActive: true,
        });
        console.log('Add-ons for group 2 created');
      } catch (error) {
        console.error('Failed to create add-on groups or add-ons:', error);
      }

      // 3. Create two variation groups
      let variationGroup1, variationGroup2;
      try {
        // First variation group: Size
        variationGroup1 = await this.menuService.createVariationGroup(tenantId, {
          name: 'Size',
        });
        console.log('Variation group 1 created:', variationGroup1.id);

        // Create variations for Size group
        await this.menuService.createVariation(tenantId, variationGroup1.id, {
          name: 'Small',
          pricingAdjustment: 0,
          recipeMultiplier: 0.8,
          displayOrder: 1,
        });

        await this.menuService.createVariation(tenantId, variationGroup1.id, {
          name: 'Medium',
          pricingAdjustment: 500,
          recipeMultiplier: 1.0,
          displayOrder: 2,
        });

        await this.menuService.createVariation(tenantId, variationGroup1.id, {
          name: 'Large',
          pricingAdjustment: 1000,
          recipeMultiplier: 1.2,
          displayOrder: 3,
        });
        console.log('Variations for group 1 created');

        // Second variation group: Spice Level
        variationGroup2 = await this.menuService.createVariationGroup(tenantId, {
          name: 'Spice Level',
        });
        console.log('Variation group 2 created:', variationGroup2.id);

        // Create variations for Spice Level group
        await this.menuService.createVariation(tenantId, variationGroup2.id, {
          name: 'Mild',
          pricingAdjustment: 0,
          recipeMultiplier: 1.0,
          displayOrder: 1,
        });

        await this.menuService.createVariation(tenantId, variationGroup2.id, {
          name: 'Medium',
          pricingAdjustment: 0,
          recipeMultiplier: 1.0,
          displayOrder: 2,
        });

        await this.menuService.createVariation(tenantId, variationGroup2.id, {
          name: 'Hot',
          pricingAdjustment: 200,
          recipeMultiplier: 1.0,
          displayOrder: 3,
        });

        await this.menuService.createVariation(tenantId, variationGroup2.id, {
          name: 'Extra Hot',
          pricingAdjustment: 400,
          recipeMultiplier: 1.0,
          displayOrder: 4,
        });
        console.log('Variations for group 2 created');
      } catch (error) {
        console.error('Failed to create variation groups:', error);
      }

      // 4. Create sample food items
      const foodItems = [];
      try {
        // First food item
        const addOnGroupIds = [];
        if (addOnGroup1) addOnGroupIds.push(addOnGroup1.id);
        if (addOnGroup2) addOnGroupIds.push(addOnGroup2.id);

        const foodItem1 = await this.menuService.createFoodItem(tenantId, {
          name: 'Sample Burger',
          description: 'A delicious sample burger',
          categoryId: category1.id,
          basePrice: 5000,
          stockType: 'unlimited',
          menuTypes: ['all_day'],
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
          addOnGroupIds: addOnGroupIds,
          variations: variationGroup1 ? [{
            variationGroup: variationGroup1.id,
            variationName: 'Medium',
            priceAdjustment: 0,
            displayOrder: 1,
          }] : [],
        });
        foodItems.push(foodItem1);
        console.log('Food item 1 created:', foodItem1.id);

        // Second food item
        const foodItem2 = await this.menuService.createFoodItem(tenantId, {
          name: 'Sample Pizza',
          description: 'A tasty sample pizza',
          categoryId: category1.id,
          basePrice: 8000,
          stockType: 'unlimited',
          menuTypes: ['all_day'],
          imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=300&fit=crop',
          addOnGroupIds: addOnGroupIds,
          variations: variationGroup2 ? [{
            variationGroup: variationGroup2.id,
            variationName: 'Medium',
            priceAdjustment: 0,
            displayOrder: 1,
          }] : [],
        });
        foodItems.push(foodItem2);
        console.log('Food item 2 created:', foodItem2.id);

        // Third food item for combo
        const foodItem3 = await this.menuService.createFoodItem(tenantId, {
          name: 'Sample Fries',
          description: 'Crispy sample fries',
          categoryId: category2.id,
          basePrice: 2000,
          stockType: 'unlimited',
          menuTypes: ['all_day'],
          imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop',
        });
        foodItems.push(foodItem3);
        console.log('Food item 3 created:', foodItem3.id);

        // Fourth food item for second combo
        const foodItem4 = await this.menuService.createFoodItem(tenantId, {
          name: 'Garlic Bread',
          description: 'Freshly baked garlic bread',
          categoryId: category2.id,
          basePrice: 1500,
          stockType: 'unlimited',
          menuTypes: ['all_day'],
          imageUrl: 'https://plus.unsplash.com/premium_photo-1711752902734-a36167479983?q=80&w=688&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        });
        foodItems.push(foodItem4);
        console.log('Food item 4 created:', foodItem4.id);
      } catch (error) {
        console.error('Failed to create food items:', error);
      }

      // 5. Create sample ingredients and recipes for food items
      if (foodItems.length > 0) {
        try {
        // Create ingredients for burger
        const beefPatty = await this.inventoryService.createIngredient(tenantId, {
          name: 'Beef Patty',
          category: 'Meat',
          unitOfMeasurement: 'piece',
          currentStock: 100,
          minimumThreshold: 20,
          isActive: true,
        });

        const burgerBun = await this.inventoryService.createIngredient(tenantId, {
          name: 'Burger Bun',
          category: 'Bakery',
          unitOfMeasurement: 'piece',
          currentStock: 150,
          minimumThreshold: 30,
          isActive: true,
        });

        const lettuce = await this.inventoryService.createIngredient(tenantId, {
          name: 'Lettuce',
          category: 'Vegetables',
          unitOfMeasurement: 'piece',
          currentStock: 200,
          minimumThreshold: 50,
          isActive: true,
        });

        const tomato = await this.inventoryService.createIngredient(tenantId, {
          name: 'Tomato',
          category: 'Vegetables',
          unitOfMeasurement: 'piece',
          currentStock: 150,
          minimumThreshold: 30,
          isActive: true,
        });

        // Create ingredients for pizza
        const pizzaDough = await this.inventoryService.createIngredient(tenantId, {
          name: 'Pizza Dough',
          category: 'Bakery',
          unitOfMeasurement: 'piece',
          currentStock: 80,
          minimumThreshold: 15,
          isActive: true,
        });

        const pizzaSauce = await this.inventoryService.createIngredient(tenantId, {
          name: 'Pizza Sauce',
          category: 'Sauces',
          unitOfMeasurement: 'cup',
          currentStock: 50,
          minimumThreshold: 10,
          isActive: true,
        });

        const mozzarellaCheese = await this.inventoryService.createIngredient(tenantId, {
          name: 'Mozzarella Cheese',
          category: 'Dairy',
          unitOfMeasurement: 'cup',
          currentStock: 60,
          minimumThreshold: 12,
          isActive: true,
        });

        const pepperoni = await this.inventoryService.createIngredient(tenantId, {
          name: 'Pepperoni',
          category: 'Meat',
          unitOfMeasurement: 'slice',
          currentStock: 200,
          minimumThreshold: 40,
          isActive: true,
        });

        // Create recipe for burger
        await this.inventoryService.createOrUpdateRecipe(tenantId, {
          foodItemId: foodItems[0].id,
          ingredients: [
            {
              ingredientId: beefPatty.id,
              quantity: 1,
              unit: 'piece',
            },
            {
              ingredientId: burgerBun.id,
              quantity: 1,
              unit: 'piece',
            },
            {
              ingredientId: lettuce.id,
              quantity: 2,
              unit: 'piece',
            },
            {
              ingredientId: tomato.id,
              quantity: 2,
              unit: 'piece',
            },
          ],
        });
        console.log('Recipe 1 created for burger');

        // Create recipe for pizza
        if (foodItems.length > 1) {
          await this.inventoryService.createOrUpdateRecipe(tenantId, {
            foodItemId: foodItems[1].id,
            ingredients: [
              {
                ingredientId: pizzaDough.id,
                quantity: 1,
                unit: 'piece',
              },
              {
                ingredientId: pizzaSauce.id,
                quantity: 1,
                unit: 'cup',
              },
              {
                ingredientId: mozzarellaCheese.id,
                quantity: 1.5,
                unit: 'cup',
              },
              {
                ingredientId: pepperoni.id,
                quantity: 10,
                unit: 'slice',
              },
            ],
          });
          console.log('Recipe 2 created for pizza');
        }
        } catch (error) {
          console.error('Failed to create recipes:', error);
        }
      }

      // 6. Create two buffet combo meals
      try {
        const buffet1 = await this.menuService.createBuffet(tenantId, {
          name: 'All-Day Family Buffet',
          description: 'Unlimited access to our full menu selection including burgers, pizza, fries, and more. Perfect for groups and families!',
          pricePerPerson: 15000,
          minPersons: 1,
          menuTypes: ['all_day'],
          imageUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YnVmZmV0fGVufDB8fDB8fHww',
          displayOrder: 1,
          isActive: true,
        });
        console.log('Buffet 1 created:', buffet1.id);

        const buffet2 = await this.menuService.createBuffet(tenantId, {
          name: 'Weekend Special Buffet',
          description: 'Premium weekend buffet with all our signature dishes and special items. Available Saturday and Sunday!',
          pricePerPerson: 20000,
          minPersons: 2,
          menuTypes: ['all_day'],
          imageUrl: 'https://images.unsplash.com/photo-1583338917496-7ea264c374ce?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8YnVmZmV0fGVufDB8fDB8fHww',
          displayOrder: 2,
          isActive: true,
        });
        console.log('Buffet 2 created:', buffet2.id);
      } catch (error) {
        console.error('Failed to create buffets:', error);
      }

      // 7. Create two combo meals with food items
      if (foodItems.length >= 3) {
        try {
          // First combo meal
          const comboMeal1 = await this.menuService.createComboMeal(tenantId, {
            name: 'Classic Burger Combo',
            description: 'Delicious burger paired with crispy golden fries. A perfect meal combination at a great value!',
            basePrice: 6000, // Discounted price
            foodItemIds: [foodItems[0].id, foodItems[2].id], // Burger and Fries
            menuTypes: ['all_day'],
            imageUrl: 'https://plus.unsplash.com/premium_photo-1683619761468-b06992704398?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8YnVyZ2VyfGVufDB8fDB8fHww',
            displayOrder: 1,
            isActive: true,
          });
          console.log('Combo meal 1 created:', comboMeal1.id);

          // Second combo meal
          const comboMeal2 = await this.menuService.createComboMeal(tenantId, {
            name: 'Pizza & Garlic Bread Combo',
            description: 'Tasty pizza served with freshly baked garlic bread. A classic Italian combination!',
            basePrice: 8500, // Discounted price
            foodItemIds: [foodItems[1].id, foodItems[3].id], // Pizza and Garlic Bread
            menuTypes: ['all_day'],
            imageUrl: 'https://media.istockphoto.com/id/1151446369/photo/tasty-supreme-pizza-with-olives-peppers-onions-and-sausage.webp?a=1&b=1&s=612x612&w=0&k=20&c=LprgiVWgVb5nJ6psO3R2bAYLPBV6V9gLVW9PlTbtGLU=',
            displayOrder: 2,
            isActive: true,
          });
          console.log('Combo meal 2 created:', comboMeal2.id);
        } catch (error) {
          console.error('Failed to create combo meals:', error);
        }
      }

      // 8. Assign food items to menu
      if (foodItems.length > 0) {
        try {
          const foodItemIds = foodItems.map(item => item.id);
          await this.menuService.assignItemsToMenu(tenantId, 'all_day', foodItemIds);
          console.log('Food items assigned to menu');
        } catch (error) {
          console.error('Failed to assign items to menu:', error);
        }
      }

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

