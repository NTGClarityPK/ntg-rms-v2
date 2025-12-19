import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all roles' })
  getRoles() {
    return this.rolesService.getRoles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get all permissions' })
  getPermissions() {
    return this.rolesService.getPermissions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID with permissions' })
  getRoleById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user roles' })
  getUserRoles(@Param('userId') userId: string) {
    return this.rolesService.getUserRoles(userId);
  }

  @Get('user/:userId/permissions')
  @ApiOperation({ summary: 'Get user permissions (aggregated from all roles)' })
  getUserPermissions(@Param('userId') userId: string) {
    return this.rolesService.getUserPermissions(userId);
  }
}

