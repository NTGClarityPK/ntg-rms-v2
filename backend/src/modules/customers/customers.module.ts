import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { TranslationsModule } from '../translations/translations.module';
import { DatabaseModule } from '../../database/database.module';
import { BulkImportService } from '../menu/utils/bulk-import.service';

@Module({
  imports: [TranslationsModule, DatabaseModule],
  controllers: [CustomersController],
  providers: [CustomersService, BulkImportService],
  exports: [CustomersService],
})
export class CustomersModule {}

