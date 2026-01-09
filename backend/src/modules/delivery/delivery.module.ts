import { Module, forwardRef } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DatabaseModule } from '../../database/database.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [DatabaseModule, TranslationsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}

