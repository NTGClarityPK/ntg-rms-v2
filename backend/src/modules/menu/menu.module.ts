import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { StorageService } from './utils/storage.service';

@Module({
  controllers: [MenuController],
  providers: [MenuService, StorageService],
  exports: [MenuService],
})
export class MenuModule {}

