import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RolesModule } from '../roles/roles.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [RolesModule, TranslationsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}

