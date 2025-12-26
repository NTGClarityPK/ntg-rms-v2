import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler/dist/throttler.module';
import { AuthModule } from './modules/auth/auth.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SyncModule } from './modules/sync/sync.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { TaxesModule } from './modules/taxes/taxes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RolesModule } from './modules/roles/roles.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], // Try .env.local first, then .env
      expandVariables: true,
      // The load function will have access to process.env after env files are loaded
      load: [
        () => {
          // Debug: Log if Google OAuth vars are found
          const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
          const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
          if (!hasGoogleClientId || !hasGoogleClientSecret) {
            console.warn('⚠️  Google OAuth credentials not found in environment variables');
          } else {
            console.log('✅ Google OAuth credentials loaded successfully');
          }
          
          return {
            // Direct environment variables (uppercase)
            JWT_SECRET: process.env.JWT_SECRET,
            JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
            JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
            JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
            GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
            // Nested structure for backward compatibility
            jwt: {
              secret: process.env.JWT_SECRET,
              expiresIn: process.env.JWT_EXPIRES_IN || '24h',
              refreshSecret: process.env.JWT_REFRESH_SECRET,
              refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
            },
            supabase: {
              url: process.env.SUPABASE_URL,
              serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              anonKey: process.env.SUPABASE_ANON_KEY,
            },
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/google/callback',
            },
          };
        },
      ],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    DatabaseModule,
    AuthModule,
    RestaurantModule,
    MenuModule,
    OrdersModule,
    InventoryModule,
    EmployeesModule,
    CustomersModule,
    DeliveryModule,
    ReportsModule,
    SettingsModule,
    SyncModule,
    CouponsModule,
    TaxesModule,
    DashboardModule,
    RolesModule,
    SubscriptionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

