import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  getSettings(@CurrentUser() user: any) {
    return this.settingsService.getSettings(user.tenantId);
  }

  @Get(':category')
  @ApiOperation({ summary: 'Get a specific settings category' })
  getSettingCategory(@CurrentUser() user: any, @Param('category') category: string) {
    return this.settingsService.getSettingCategory(user.tenantId, category);
  }

  @Put()
  @ApiOperation({ summary: 'Update settings' })
  updateSettings(@CurrentUser() user: any, @Body() updateDto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(user.tenantId, updateDto);
  }
}

