import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { StorageService } from './utils/storage.service';
import { DatabaseModule } from '../../database/database.module';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [DatabaseModule, TranslationsModule],
  controllers: [MenuController],
  providers: [MenuService, StorageService],
  exports: [MenuService],
})
export class MenuModule {}

