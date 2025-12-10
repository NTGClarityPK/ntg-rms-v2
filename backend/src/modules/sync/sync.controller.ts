import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushSyncDto } from './dto/push-sync.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sync')
@Controller('sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @ApiOperation({ summary: 'Push local changes to server' })
  pushSync(
    @Body() pushDto: PushSyncDto,
    @CurrentUser() user: any,
  ) {
    return this.syncService.pushSync(pushDto, user.tenantId, user.id);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Pull latest changes from server' })
  pullSync(@CurrentUser() user: any) {
    return this.syncService.pullSync(user.tenantId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get sync status' })
  getSyncStatus() {
    return this.syncService.getSyncStatus();
  }

  @Post('resolve')
  @ApiOperation({ summary: 'Resolve sync conflicts' })
  resolveConflicts(@Body() resolveDto: any) {
    return this.syncService.resolveConflicts(resolveDto);
  }
}

