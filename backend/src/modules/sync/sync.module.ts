import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { OrdersModule } from '../orders/orders.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [OrdersModule, InventoryModule, RestaurantModule, DeliveryModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}

