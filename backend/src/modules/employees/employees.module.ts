import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RolesModule } from '../roles/roles.module';
import { TranslationsModule } from '../translations/translations.module';
import { DatabaseModule } from '../../database/database.module';
import { BulkImportService } from '../menu/utils/bulk-import.service';

@Module({
  imports: [RolesModule, TranslationsModule, DatabaseModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, BulkImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}

