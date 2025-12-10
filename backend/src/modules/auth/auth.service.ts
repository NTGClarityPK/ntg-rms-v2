import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database/supabase.service';
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
          name_en: signupDto.nameEn + "'s Restaurant",
          name_ar: signupDto.nameAr || signupDto.nameEn + "'s Restaurant",
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
    // If only English name is provided, use it as Arabic name too
    console.log('Creating user record in users table...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        supabase_auth_id: authData.user.id,
        email: signupDto.email,
        name_en: signupDto.nameEn,
        name_ar: signupDto.nameAr || signupDto.nameEn, // Use English name as Arabic if not provided
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

    // Create a default branch for the tenant if this is a new tenant
    if (!signupDto.tenantId) {
      try {
        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .insert({
            tenant_id: tenantId,
            name_en: 'Main Branch',
            name_ar: 'الفرع الرئيسي',
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
    }

    // Generate tokens
    const tokens = await this.generateTokens(userData);

    return {
      user: {
        id: userData.id,
        email: userData.email as string,
        nameEn: userData.name_en as string,
        nameAr: userData.name_ar as string | undefined,
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
            name_en: `${userName}'s Restaurant`,
            name_ar: `${userName}'s Restaurant`,
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
      // If only English name is provided, use it as Arabic name too
      const { data: newUser, error: createUserError } = await serviceSupabase
        .from('users')
        .insert({
          supabase_auth_id: authUser.id,
          email: userEmail,
          name_en: userName,
          name_ar: userName, // Use English name as Arabic name if no Arabic name provided
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
              name_en: 'Main Branch',
              name_ar: 'الفرع الرئيسي',
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
        nameEn: user.name_en as string,
        nameAr: user.name_ar as string | undefined,
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
      nameEn: user.name_en as string,
      nameAr: user.name_ar as string | undefined,
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
        nameEn: user.name_en as string,
        nameAr: user.name_ar as string | undefined,
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
      if (!existingUser.name_en || existingUser.name_en === 'User') {
        updateData.name_en = userName;
        updateData.name_ar = existingUser.name_ar || userName; // Use English name as Arabic if not set
        console.log('Updating user name from', existingUser.name_en, 'to', userName);
      } else if (!existingUser.name_ar) {
        // If English name exists but Arabic name is missing, set it to English name
        updateData.name_ar = existingUser.name_en;
      }
      
      await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id);

      // Fetch updated user if we updated the name
      if (updateData.name_en || updateData.name_ar) {
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
          name_en: `${userName}'s Restaurant`,
          name_ar: `${userName}'s Restaurant`,
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
    // If only English name is provided, use it as Arabic name too
    const { data: newUser, error: createUserError } = await supabase
      .from('users')
      .insert({
        supabase_auth_id: supabaseAuthId,
        email: userEmail,
        name_en: userName,
        name_ar: userName, // Use English name as Arabic name if no Arabic name provided
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
            name_en: 'Main Branch',
            name_ar: 'الفرع الرئيسي',
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
      nameEn: user.name_en as string,
      nameAr: user.name_ar as string | undefined,
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
    if (updateProfileDto.nameEn !== undefined) {
      updateData.name_en = updateProfileDto.nameEn;
    }
    if (updateProfileDto.nameAr !== undefined) {
      updateData.name_ar = updateProfileDto.nameAr;
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
      nameEn: updatedUser.name_en as string,
      nameAr: updatedUser.name_ar as string | undefined,
      phone: updatedUser.phone as string | undefined,
      role: updatedUser.role as string,
      tenantId: updatedUser.tenant_id as string,
      updatedAt: updatedUser.updated_at as string,
    };
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

