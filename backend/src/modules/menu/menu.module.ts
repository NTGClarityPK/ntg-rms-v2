import { Module, forwardRef } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { StorageService } from './utils/storage.service';
import { BulkImportService } from './utils/bulk-import.service';
import { DatabaseModule } from '../../database/database.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => TranslationsModule)],
  controllers: [MenuController],
  providers: [MenuService, StorageService, BulkImportService],
  exports: [MenuService],
})
export class MenuModule {}

