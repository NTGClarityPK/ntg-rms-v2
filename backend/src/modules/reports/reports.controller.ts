import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
  Header,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportQueryDto, ExportFormat, TopItemsQueryDto } from './dto/report-query.dto';
import { Response } from 'express';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Get sales report (13.1)' })
  async getSalesReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getSalesReport(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.breakdown,
        'sales-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');
      res.send(csv);
      return;
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.breakdown,
        'sales-report.xlsx',
        'Sales Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get orders report (13.2)' })
  async getOrdersReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getOrdersReport(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.orders,
        'orders-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=orders-report.csv');
      return res.send(csv);
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.orders,
        'orders-report.xlsx',
        'Orders Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=orders-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customers report (13.3)' })
  async getCustomersReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getCustomersReport(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.customers,
        'customers-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=customers-report.csv');
      return res.send(csv);
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.customers,
        'customers-report.xlsx',
        'Customers Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=customers-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Get inventory report (13.4)' })
  async getInventoryReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getInventoryReport(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.ingredients,
        'inventory-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.csv');
      return res.send(csv);
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.ingredients,
        'inventory-report.xlsx',
        'Inventory Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('financial')
  @ApiOperation({ summary: 'Get financial report (13.5)' })
  async getFinancialReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getFinancialReport(user.tenantId, query);

    // For financial reports, export summary data
    if (query.export === ExportFormat.CSV) {
      const exportData = [
        {
          'Total Revenue': result.revenue.total,
          'Subtotal': result.revenue.subtotal,
          'Tax': result.revenue.tax,
          'Discounts': result.revenue.discounts,
          'Delivery Charges': result.revenue.deliveryCharges,
          'Cost of Goods': result.costs.costOfGoods,
          'Gross Profit': result.profit.gross,
          'Profit Margin (%)': result.profit.margin,
        },
      ];
      const csv = await this.reportsService.exportToCSV(
        exportData,
        'financial-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=financial-report.csv');
      res.send(csv);
      return;
    }

    if (query.export === ExportFormat.EXCEL) {
      const exportData = [
        {
          'Total Revenue': result.revenue.total,
          'Subtotal': result.revenue.subtotal,
          'Tax': result.revenue.tax,
          'Discounts': result.revenue.discounts,
          'Delivery Charges': result.revenue.deliveryCharges,
          'Cost of Goods': result.costs.costOfGoods,
          'Gross Profit': result.profit.gross,
          'Profit Margin (%)': result.profit.margin,
        },
      ];
      const excel = await this.reportsService.exportToExcel(
        exportData,
        'financial-report.xlsx',
        'Financial Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=financial-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('tax')
  @ApiOperation({ summary: 'Get tax report (13.6)' })
  async getTaxReport(
    @CurrentUser() user: any,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getTaxReport(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.taxBreakdown,
        'tax-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tax-report.csv');
      return res.send(csv);
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.taxBreakdown,
        'tax-report.xlsx',
        'Tax Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=tax-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }

  @Get('top-items')
  @ApiOperation({ summary: 'Get top selling items' })
  async getTopItems(
    @CurrentUser() user: any,
    @Query() query: TopItemsQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.getTopItems(user.tenantId, query);

    if (query.export === ExportFormat.CSV) {
      const csv = await this.reportsService.exportToCSV(
        result.items,
        'top-items-report.csv',
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=top-items-report.csv');
      return res.send(csv);
    }

    if (query.export === ExportFormat.EXCEL) {
      const excel = await this.reportsService.exportToExcel(
        result.items,
        'top-items-report.xlsx',
        'Top Items Report',
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=top-items-report.xlsx');
      res.send(excel);
      return;
    }

    return res.json({ success: true, data: result });
  }
}
