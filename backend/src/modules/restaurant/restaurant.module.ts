import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { StorageService } from '../menu/utils/storage.service';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [TranslationsModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, StorageService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

