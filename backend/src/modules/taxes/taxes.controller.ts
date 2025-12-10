import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TaxesService } from './taxes.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('taxes')
@Controller('taxes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all taxes' })
  getTaxes(@CurrentUser() user: any) {
    return this.taxesService.getTaxes(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tax by ID' })
  getTaxById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.taxesService.getTaxById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tax' })
  createTax(@CurrentUser() user: any, @Body() createDto: CreateTaxDto) {
    return this.taxesService.createTax(user.tenantId, createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a tax' })
  updateTax(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateTaxDto,
  ) {
    return this.taxesService.updateTax(user.tenantId, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tax' })
  deleteTax(@CurrentUser() user: any, @Param('id') id: string) {
    return this.taxesService.deleteTax(user.tenantId, id);
  }
}

