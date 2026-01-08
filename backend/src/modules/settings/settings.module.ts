import { Module, forwardRef } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [forwardRef(() => RestaurantModule), TranslationsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

