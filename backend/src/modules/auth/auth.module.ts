import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleOAuthStrategy } from '../auth/strategies/google-oauth.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesModule } from '../roles/roles.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET') || configService.get<string>('jwt.secret');
        if (!secret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }
        return {
          secret: secret,
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || configService.get<string>('jwt.expiresIn') || '24h',
          },
        };
      },
      inject: [ConfigService],
    }),
    RolesModule,
    SubscriptionModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleOAuthStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

