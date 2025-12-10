import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { StorageService } from '../menu/utils/storage.service';

@Module({
  controllers: [RestaurantController],
  providers: [RestaurantService, StorageService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

