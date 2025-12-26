import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // First try to get token from Authorization header (standard)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Fallback to query parameter for SSE (since SSE doesn't support custom headers)
        (request: any) => {
          return request?.query?.token || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Add clock tolerance to handle clock skew and network latency
      // 60 seconds = 1 minute leeway for clock differences and network delays
      // This prevents false 401 errors when tokens are valid but server clock
      // is slightly ahead or network latency causes delays
      clockTolerance: 60, // seconds
    });
  }

  async validate(payload: any) {
    // Log token expiry info for debugging (only in development/staging)
    if (process.env.NODE_ENV !== 'production') {
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp;
      const timeUntilExpiry = exp - now;
      console.log(`[JWT Strategy] Token validation - Expiry in ${timeUntilExpiry}s, Current time: ${now}, Expiry time: ${exp}`);
    }
    
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

