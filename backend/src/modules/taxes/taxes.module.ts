import { Module } from '@nestjs/common';
import { TaxesController } from './taxes.controller';
import { TaxesService } from './taxes.service';
import { DatabaseModule } from '../../database/database.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [DatabaseModule, TranslationsModule],
  controllers: [TaxesController],
  providers: [TaxesService],
  exports: [TaxesService],
})
export class TaxesModule {}

