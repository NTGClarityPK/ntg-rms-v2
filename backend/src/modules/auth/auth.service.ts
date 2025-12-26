import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service';
import { RolesService } from '../roles/roles.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private rolesService: RolesService,
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
    let branchId: string | null = null;
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
          branchId = branchData.id;
          console.log('Default branch created:', branchData.id);
          
          // Seed sample data for new tenant
          try {
            await this.seedSampleData(tenantId, branchId, userData.id);
          } catch (seedError) {
            console.error('Failed to seed sample data:', seedError);
            // Don't fail signup if sample data seeding fails
          }
        }
      } catch (error) {
        console.error('Error creating default branch:', error);
        // Don't fail signup if branch creation fails
      }
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
            
            // Seed sample data for new tenant
            try {
              await this.seedSampleData(tenantId, branchData.id, user.id);
            } catch (seedError) {
              console.error('Failed to seed sample data:', seedError);
              // Don't fail login if sample data seeding fails
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
          
          // Seed sample data for new tenant
          try {
            await this.seedSampleData(tenantId, branchData.id, newUser.id);
          } catch (seedError) {
            console.error('Failed to seed sample data:', seedError);
            // Don't fail user creation if sample data seeding fails
          }
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

  private async seedSampleData(tenantId: string, branchId: string, userId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    console.log('Seeding sample data for new tenant...');

    try {
      // 1. Create Categories (1-2)
      const categories = [
        {
          tenant_id: tenantId,
          name: 'Main Courses',
          description: 'Hearty main dishes',
          category_type: 'food',
          display_order: 1,
          is_active: true,
        },
        {
          tenant_id: tenantId,
          name: 'Beverages',
          description: 'Drinks and beverages',
          category_type: 'beverage',
          display_order: 2,
          is_active: true,
        },
      ];

      const categoryIds: string[] = [];
      for (const category of categories) {
        const { data: newCategory, error } = await supabase
          .from('categories')
          .insert(category)
          .select('id')
          .single();

        if (!error && newCategory) {
          categoryIds.push(newCategory.id);
          console.log(`Created category: ${category.name}`);
        }
      }

      if (categoryIds.length === 0) {
        console.error('No categories created, skipping food items');
        return;
      }

      // 2. Create Food Items (1-2)
      const foodItems = [
        {
          tenant_id: tenantId,
          category_id: categoryIds[0],
          name: 'Grilled Chicken',
          description: 'Tender marinated grilled chicken with rice and salad',
          base_price: 15000,
          stock_type: 'unlimited',
          display_order: 1,
          is_active: true,
          labels: ['popular', 'halal'],
        },
        {
          tenant_id: tenantId,
          category_id: categoryIds[1],
          name: 'Fresh Orange Juice',
          description: 'Freshly squeezed orange juice',
          base_price: 5000,
          stock_type: 'unlimited',
          display_order: 1,
          is_active: true,
          labels: ['popular'],
        },
      ];

      const foodItemIds: string[] = [];
      const foodItemMap = new Map<string, string>();
      for (const foodItem of foodItems) {
        // Extract labels before inserting
        const { labels, ...foodItemData } = foodItem;
        const { data: newFoodItem, error } = await supabase
          .from('food_items')
          .insert(foodItemData)
          .select('id')
          .single();

        if (!error && newFoodItem) {
          foodItemIds.push(newFoodItem.id);
          foodItemMap.set(foodItem.name, newFoodItem.id);
          console.log(`Created food item: ${foodItem.name}`);

          // Add labels if provided
          if (labels && labels.length > 0) {
            for (const label of labels) {
              await supabase.from('food_item_labels').upsert({
                food_item_id: newFoodItem.id,
                label: label,
              }, { onConflict: 'food_item_id,label' });
            }
          }
        }
      }

      // 3. Create Ingredients (1-2)
      const ingredients = [
        {
          tenant_id: tenantId,
          name: 'Chicken',
          category: 'meats',
          unit_of_measurement: 'kg',
          current_stock: 50,
          minimum_threshold: 10,
          cost_per_unit: 8000,
          storage_location: 'Main Storage',
          is_active: true,
        },
        {
          tenant_id: tenantId,
          name: 'Oranges',
          category: 'fruits',
          unit_of_measurement: 'kg',
          current_stock: 20,
          minimum_threshold: 5,
          cost_per_unit: 3000,
          storage_location: 'Main Storage',
          is_active: true,
        },
      ];

      const ingredientIds: string[] = [];
      const ingredientMap = new Map<string, string>();
      for (const ingredient of ingredients) {
        const { data: newIngredient, error } = await supabase
          .from('ingredients')
          .insert(ingredient)
          .select('id')
          .single();

        if (!error && newIngredient) {
          ingredientIds.push(newIngredient.id);
          ingredientMap.set(ingredient.name, newIngredient.id);
          console.log(`Created ingredient: ${ingredient.name}`);
        }
      }

      // 4. Create Recipes (linking food items to ingredients)
      if (foodItemMap.has('Grilled Chicken') && ingredientMap.has('Chicken')) {
        await supabase.from('recipes').insert({
          food_item_id: foodItemMap.get('Grilled Chicken'),
          ingredient_id: ingredientMap.get('Chicken'),
          quantity: 0.3,
          unit: 'kg',
        });
        console.log('Created recipe for Grilled Chicken');
      }

      if (foodItemMap.has('Fresh Orange Juice') && ingredientMap.has('Oranges')) {
        await supabase.from('recipes').insert({
          food_item_id: foodItemMap.get('Fresh Orange Juice'),
          ingredient_id: ingredientMap.get('Oranges'),
          quantity: 0.5,
          unit: 'kg',
        });
        console.log('Created recipe for Fresh Orange Juice');
      }

      // 5. Create Add-ons (1-2 groups with 1-2 add-ons each)
      const addOnGroups = [
        {
          tenant_id: tenantId,
          name: 'Spice Level',
          selection_type: 'single',
          is_required: true,
          category: 'Change',
          display_order: 1,
          is_active: true,
        },
        {
          tenant_id: tenantId,
          name: 'Side Dishes',
          selection_type: 'multiple',
          is_required: false,
          category: 'Add',
          display_order: 2,
          is_active: true,
        },
      ];

      const addOnGroupIds: string[] = [];
      for (const group of addOnGroups) {
        const { data: newGroup, error: groupError } = await supabase
          .from('add_on_groups')
          .insert(group)
          .select('id')
          .single();

        if (!groupError && newGroup) {
          addOnGroupIds.push(newGroup.id);
          console.log(`Created add-on group: ${group.name}`);

          // Create add-ons for this group
          let addOns: Array<{ name: string; price: number }> = [];
          if (group.name === 'Spice Level') {
            addOns = [
              { name: 'Mild', price: 0 },
              { name: 'Hot', price: 0 },
            ];
          } else if (group.name === 'Side Dishes') {
            addOns = [
              { name: 'French Fries', price: 2000 },
              { name: 'Rice', price: 1500 },
            ];
          }

          for (const addOn of addOns) {
            await supabase.from('add_ons').insert({
              add_on_group_id: newGroup.id,
              name: addOn.name,
              price: addOn.price,
              display_order: addOns.indexOf(addOn) + 1,
              is_active: true,
            });
            console.log(`Created add-on: ${addOn.name}`);
          }
        }
      }

      // 6. Create Variation Groups (1-2 groups with variations)
      const variationGroups = [
        {
          tenant_id: tenantId,
          name: 'Size',
        },
      ];

      const variationGroupMap = new Map<string, string>();
      for (const group of variationGroups) {
        const { data: newGroup, error: groupError } = await supabase
          .from('variation_groups')
          .insert(group)
          .select('id')
          .single();

        if (!groupError && newGroup) {
          variationGroupMap.set(group.name, newGroup.id);
          console.log(`Created variation group: ${group.name}`);

          // Create variations for this group
          let variations: Array<{ name: string; pricing_adjustment: number; recipe_multiplier: number }> = [];
          if (group.name === 'Size') {
            variations = [
              { name: 'Small', pricing_adjustment: 0, recipe_multiplier: 1.0 },
              { name: 'Large', pricing_adjustment: 1000, recipe_multiplier: 1.5 },
            ];
          }

          for (const variation of variations) {
            await supabase.from('variations').insert({
              variation_group_id: newGroup.id,
              name: variation.name,
              pricing_adjustment: variation.pricing_adjustment,
              recipe_multiplier: variation.recipe_multiplier,
              display_order: variations.indexOf(variation) + 1,
            });
            console.log(`Created variation: ${variation.name}`);
          }
        }
      }

      // 7. Create Menus and assign food items
      const menus = [
        {
          tenant_id: tenantId,
          menu_type: 'all_day',
          name: 'All Day Menu',
          is_active: true,
        },
      ];

      for (const menu of menus) {
        // Check if menu exists, if not create it
        const { data: existingMenu } = await supabase
          .from('menus')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('menu_type', menu.menu_type)
          .maybeSingle();

        let menuId: string;
        if (existingMenu) {
          menuId = existingMenu.id;
          // Update to ensure it's active
          await supabase
            .from('menus')
            .update({ is_active: true, name: menu.name })
            .eq('id', menuId);
        } else {
          const { data: newMenu, error: menuError } = await supabase
            .from('menus')
            .insert(menu)
            .select('id')
            .single();

          if (!menuError && newMenu) {
            menuId = newMenu.id;
            console.log(`Created menu: ${menu.name}`);
          } else {
            continue;
          }
        }

        // Assign food items to menu via menu_items junction table
        for (const foodItemId of foodItemIds) {
          const { data: existingMenuItem } = await supabase
            .from('menu_items')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('food_item_id', foodItemId)
            .eq('menu_type', menu.menu_type)
            .maybeSingle();

          if (!existingMenuItem) {
            await supabase.from('menu_items').insert({
              tenant_id: tenantId,
              food_item_id: foodItemId,
              menu_type: menu.menu_type,
              display_order: foodItemIds.indexOf(foodItemId) + 1,
            });
          }
        }
        console.log(`Assigned ${foodItemIds.length} food items to ${menu.name}`);
      }

      // 8. Create Buffets (1-2)
      const buffets = [
        {
          tenant_id: tenantId,
          name: 'Weekend Buffet',
          description: 'All-you-can-eat weekend special',
          price_per_person: 25000,
          min_persons: 2,
          max_persons: 20,
          duration: 120, // 2 hours
          menu_types: ['all_day'],
          display_order: 1,
          is_active: true,
        },
      ];

      for (const buffet of buffets) {
        const { data: newBuffet, error: buffetError } = await supabase
          .from('buffets')
          .insert(buffet)
          .select('id')
          .single();

        if (!buffetError && newBuffet) {
          console.log(`Created buffet: ${buffet.name}`);
        }
      }

      // 9. Create Combo Meals (1-2)
      if (foodItemIds.length >= 2) {
        const comboMeals = [
          {
            tenant_id: tenantId,
            name: 'Chicken Combo',
            description: 'Grilled Chicken with Fresh Orange Juice',
            base_price: 18000, // Slightly discounted from individual prices
            food_item_ids: foodItemIds.slice(0, 2), // Use first 2 food items
            menu_types: ['all_day'],
            discount_percentage: 10,
            display_order: 1,
            is_active: true,
          },
        ];

        for (const comboMeal of comboMeals) {
          const { data: newComboMeal, error: comboError } = await supabase
            .from('combo_meals')
            .insert(comboMeal)
            .select('id')
            .single();

          if (!comboError && newComboMeal) {
            console.log(`Created combo meal: ${comboMeal.name}`);
          }
        }
      }

      console.log('Sample data seeding completed successfully');
    } catch (error) {
      console.error('Error seeding sample data:', error);
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

