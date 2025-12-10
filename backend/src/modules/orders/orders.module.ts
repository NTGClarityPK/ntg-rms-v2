import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DatabaseModule } from '../../database/database.module';
import { CouponsModule } from '../coupons/coupons.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { TaxesModule } from '../taxes/taxes.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [DatabaseModule, CouponsModule, InventoryModule, TaxesModule, SettingsModule, forwardRef(() => DeliveryModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

