import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    // Try multiple ways to get the config
    const clientId = 
      configService.get<string>('GOOGLE_CLIENT_ID') || 
      configService.get<string>('google.clientId') ||
      process.env.GOOGLE_CLIENT_ID;
    const clientSecret = 
      configService.get<string>('GOOGLE_CLIENT_SECRET') || 
      configService.get<string>('google.clientSecret') ||
      process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = 
      configService.get<string>('GOOGLE_CALLBACK_URL') || 
      configService.get<string>('google.callbackUrl') ||
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3001/api/v1/auth/google/callback';

    // Debug logging
    if (!clientId || !clientSecret) {
      console.error('Google OAuth Configuration Error:');
      console.error('GOOGLE_CLIENT_ID:', clientId ? 'Found' : 'MISSING');
      console.error('GOOGLE_CLIENT_SECRET:', clientSecret ? 'Found' : 'MISSING');
      console.error('Make sure your .env.local file is in the backend/ directory and contains:');
      console.error('GOOGLE_CLIENT_ID=your_client_id');
      console.error('GOOGLE_CLIENT_SECRET=your_client_secret');
      throw new Error(
        'Google OAuth credentials are missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file.',
      );
    }

    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const user = await this.authService.validateGoogleUser(profile);
    done(null, user || profile);
  }
}

