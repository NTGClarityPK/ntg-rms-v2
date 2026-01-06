import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { ReportQueryDto, GroupByPeriod, ExportFormat, TopItemsQueryDto } from './dto/report-query.dto';
import * as ExcelJS from 'exceljs';
import { createObjectCsvWriter } from 'csv-writer';

// Simple in-memory cache (can be upgraded to Redis later)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class ReportsService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get cached data or execute function and cache result
   */
  private async getCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await fn();
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
    return data;
  }

  /**
   * Clear cache for a specific key pattern
   */
  private clearCache(pattern?: string) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Parse and validate date range
   */
  private parseDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (start > end) {
      throw new BadRequestException('Start date must be before end date');
    }

    // Set time boundaries
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  /**
   * Format date for grouping
   */
  private formatDateForGrouping(date: Date, groupBy: GroupByPeriod): string {
    switch (groupBy) {
      case GroupByPeriod.DAY:
        return date.toISOString().split('T')[0];
      case GroupByPeriod.WEEK:
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      case GroupByPeriod.MONTH:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      case GroupByPeriod.YEAR:
        return String(date.getFullYear());
      default:
        return date.toISOString().split('T')[0];
    }
  }

  /**
   * 13.1 Sales Reports
   */
  async getSalesReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `sales:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);
      const supabase = this.supabaseService.getServiceRoleClient();
      const groupBy = query.groupBy || GroupByPeriod.DAY;

      // Build base query
      let baseQuery = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('order_date', start.toISOString())
        .lte('order_date', end.toISOString())
        .eq('status', 'completed')
        .is('deleted_at', null);

      if (query.branchId) {
        baseQuery = baseQuery.eq('branch_id', query.branchId);
      }

      const { data: orders, error } = await baseQuery;

      if (error) {
        throw new InternalServerErrorException(`Failed to fetch sales data: ${error.message}`);
      }

      // Calculate summary
      const summary = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        totalTax: orders.reduce((sum, o) => sum + Number(o.tax_amount || 0), 0),
        totalDiscounts: orders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0),
        totalDeliveryCharges: orders.reduce((sum, o) => sum + Number(o.delivery_charge || 0), 0),
        avgOrderValue: orders.length > 0
          ? orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) / orders.length
          : 0,
        dineInOrders: orders.filter((o) => o.order_type === 'dine_in').length,
        takeawayOrders: orders.filter((o) => o.order_type === 'takeaway').length,
        deliveryOrders: orders.filter((o) => o.order_type === 'delivery').length,
      };

      // Group by period
      const breakdownMap = new Map<string, any>();
      orders.forEach((order) => {
        const date = new Date(order.order_date);
        const period = this.formatDateForGrouping(date, groupBy);
        
        if (!breakdownMap.has(period)) {
          breakdownMap.set(period, {
            period,
            totalOrders: 0,
            totalRevenue: 0,
            avgOrderValue: 0,
          });
        }

        const entry = breakdownMap.get(period);
        entry.totalOrders += 1;
        entry.totalRevenue += Number(order.total_amount || 0);
      });

      // Calculate averages
      breakdownMap.forEach((entry) => {
        entry.avgOrderValue = entry.totalOrders > 0
          ? entry.totalRevenue / entry.totalOrders
          : 0;
      });

      const breakdown = Array.from(breakdownMap.values()).sort((a, b) => 
        a.period.localeCompare(b.period)
      );

      return {
        summary,
        breakdown,
        period: groupBy,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * 13.2 Order Reports
   */
  async getOrdersReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `orders:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);
      const supabase = this.supabaseService.getServiceRoleClient();

      let baseQuery = supabase
        .from('orders')
        .select(`
          *,
          customers:customer_id(id, name, phone),
          branches:branch_id(id, name, code)
        `)
        .eq('tenant_id', tenantId)
        .gte('order_date', start.toISOString())
        .lte('order_date', end.toISOString())
        .is('deleted_at', null);

      if (query.branchId) {
        baseQuery = baseQuery.eq('branch_id', query.branchId);
      }

      const { data: orders, error } = await baseQuery;

      if (error) {
        throw new InternalServerErrorException(`Failed to fetch orders: ${error.message}`);
      }

      // Status breakdown
      const statusBreakdown = orders.reduce((acc, order) => {
        const status = order.status || 'unknown';
        if (!acc[status]) {
          acc[status] = { count: 0, revenue: 0 };
        }
        acc[status].count += 1;
        if (order.status === 'completed') {
          acc[status].revenue += Number(order.total_amount || 0);
        }
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);

      // Order type breakdown
      const typeBreakdown = orders.reduce((acc, order) => {
        const type = order.order_type || 'unknown';
        if (!acc[type]) {
          acc[type] = { count: 0, revenue: 0 };
        }
        acc[type].count += 1;
        if (order.status === 'completed') {
          acc[type].revenue += Number(order.total_amount || 0);
        }
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);

      // Payment status breakdown
      const paymentBreakdown = orders.reduce((acc, order) => {
        const status = order.payment_status || 'unknown';
        if (!acc[status]) {
          acc[status] = { count: 0, revenue: 0 };
        }
        acc[status].count += 1;
        if (order.payment_status === 'paid') {
          acc[status].revenue += Number(order.total_amount || 0);
        }
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);

      return {
        totalOrders: orders.length,
        statusBreakdown,
        typeBreakdown,
        paymentBreakdown,
        orders: orders.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          orderDate: o.order_date,
          customer: o.customers ? {
            name: o.customers.name,
            phone: o.customers.phone,
          } : null,
          branch: o.branches ? {
            name: o.branches.name,
            code: o.branches.code,
          } : null,
          orderType: o.order_type,
          status: o.status,
          paymentStatus: o.payment_status,
          totalAmount: Number(o.total_amount || 0),
        })),
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * 13.3 Customer Reports
   */
  async getCustomersReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `customers:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const supabase = this.supabaseService.getServiceRoleClient();
      const { start, end } = query.startDate && query.endDate
        ? this.parseDateRange(query.startDate, query.endDate)
        : { start: null, end: null };

      // Get all customers
      let customersQuery = supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      const { data: customers, error: customersError } = await customersQuery;

      if (customersError) {
        throw new InternalServerErrorException(`Failed to fetch customers: ${customersError.message}`);
      }

      // Get orders for date range if provided (filter by branch if provided)
      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .is('deleted_at', null);

      if (query.branchId) {
        ordersQuery = ordersQuery.eq('branch_id', query.branchId);
      }

      if (start && end) {
        ordersQuery = ordersQuery
          .gte('order_date', start.toISOString())
          .lte('order_date', end.toISOString());
      }

      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        throw new InternalServerErrorException(`Failed to fetch orders: ${ordersError.message}`);
      }

      // Calculate customer statistics - only include customers who have orders
      // If branch filter is applied, only include customers with orders in that branch
      // If no branch filter, include customers with orders in any branch
      const customerStats = customers
        .map((customer) => {
          const customerOrders = orders.filter((o) => o.customer_id === customer.id);
          
          // Always exclude customers with no orders (regardless of branch filter)
          if (customerOrders.length === 0) {
            return null;
          }
          
          // If branch filter is applied, only include customers with orders in that branch
          // (This is already handled by filtering orders by branch above, so customerOrders
          // will only contain orders from the selected branch if branchId is provided)
          
          const totalSpent = customerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
          const avgOrderValue = customerOrders.length > 0 ? totalSpent / customerOrders.length : 0;

          // Determine loyalty tier
          let loyaltyTier = 'regular';
          if (customerOrders.length >= 50) {
            loyaltyTier = 'platinum';
          } else if (customerOrders.length >= 11) {
            loyaltyTier = 'gold';
          } else if (customerOrders.length >= 3) {
            loyaltyTier = 'silver';
          }

          return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            totalOrders: customerOrders.length,
            totalSpent,
            avgOrderValue,
            loyaltyTier,
            lastOrderDate: customerOrders.length > 0
              ? customerOrders.sort((a, b) => 
                  new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
                )[0].order_date
              : null,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      // Summary statistics - only count customers with orders in the selected branch
      const summary = {
        totalCustomers: customerStats.length,
        activeCustomers: customerStats.filter((c) => c.totalOrders > 0).length,
        totalRevenue: customerStats.reduce((sum, c) => sum + c.totalSpent, 0),
        avgCustomerValue: customerStats.length > 0
          ? customerStats.reduce((sum, c) => sum + c.totalSpent, 0) / customerStats.length
          : 0,
        loyaltyTierBreakdown: {
          regular: customerStats.filter((c) => c.loyaltyTier === 'regular').length,
          silver: customerStats.filter((c) => c.loyaltyTier === 'silver').length,
          gold: customerStats.filter((c) => c.loyaltyTier === 'gold').length,
          platinum: customerStats.filter((c) => c.loyaltyTier === 'platinum').length,
        },
      };

      // Sort by total spent (top customers)
      const topCustomers = [...customerStats]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      return {
        summary,
        customers: customerStats,
        topCustomers,
        dateRange: start && end ? {
          start: start.toISOString(),
          end: end.toISOString(),
        } : null,
      };
    });
  }

  /**
   * 13.4 Inventory Reports
   */
  async getInventoryReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `inventory:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const supabase = this.supabaseService.getServiceRoleClient();
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);

      // Get all ingredients (filter by branch if provided)
      let ingredientsQuery = supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      
      if (query.branchId) {
        ingredientsQuery = ingredientsQuery.eq('branch_id', query.branchId);
      }
      
      const { data: ingredients, error: ingredientsError } = await ingredientsQuery;

      if (ingredientsError) {
        throw new InternalServerErrorException(`Failed to fetch ingredients: ${ingredientsError.message}`);
      }

      // Get stock transactions for date range
      let transactionsQuery = supabase
        .from('stock_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('transaction_date', start.toISOString())
        .lte('transaction_date', end.toISOString());

      if (query.branchId) {
        transactionsQuery = transactionsQuery.eq('branch_id', query.branchId);
      }

      const { data: transactions, error: transactionsError } = await transactionsQuery;

      if (transactionsError) {
        throw new InternalServerErrorException(`Failed to fetch transactions: ${transactionsError.message}`);
      }

      // Calculate ingredient statistics
      const ingredientStats = ingredients.map((ingredient) => {
        const ingredientTransactions = transactions.filter(
          (t) => t.ingredient_id === ingredient.id
        );

        const purchases = ingredientTransactions.filter((t) => t.transaction_type === 'purchase');
        const usage = ingredientTransactions.filter((t) => t.transaction_type === 'usage');
        const adjustments = ingredientTransactions.filter((t) => t.transaction_type === 'adjustment');

        const totalPurchased = purchases.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
        const totalUsed = usage.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
        const totalCost = purchases.reduce((sum, t) => sum + Number(t.total_cost || 0), 0);

        const stockLevel = Number(ingredient.current_stock || 0);
        const minThreshold = Number(ingredient.minimum_threshold || 0);
        const stockStatus = stockLevel < minThreshold ? 'low' : stockLevel < minThreshold * 1.5 ? 'warning' : 'ok';

        return {
          id: ingredient.id,
          name: ingredient.name,
          category: ingredient.category,
          unit: ingredient.unit_of_measurement,
          currentStock: stockLevel,
          minimumThreshold: minThreshold,
          stockStatus,
          totalPurchased,
          totalUsed,
          totalCost,
          avgCostPerUnit: totalPurchased > 0 ? totalCost / totalPurchased : 0,
          transactionCount: ingredientTransactions.length,
        };
      });

      // Summary statistics
      const summary = {
        totalIngredients: ingredients.length,
        lowStockItems: ingredientStats.filter((i) => i.stockStatus === 'low').length,
        warningStockItems: ingredientStats.filter((i) => i.stockStatus === 'warning').length,
        totalInventoryValue: ingredientStats.reduce((sum, i) => 
          sum + (i.currentStock * i.avgCostPerUnit), 0
        ),
        totalPurchases: transactions.filter((t) => t.transaction_type === 'purchase').length,
        totalUsage: transactions.filter((t) => t.transaction_type === 'usage').length,
      };

      // Low stock items
      const lowStockItems = ingredientStats
        .filter((i) => i.stockStatus === 'low')
        .sort((a, b) => a.currentStock - b.currentStock);

      return {
        summary,
        ingredients: ingredientStats,
        lowStockItems,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * 13.5 Financial Reports
   */
  async getFinancialReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `financial:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);
      const supabase = this.supabaseService.getServiceRoleClient();

      // Get paid orders (regardless of order status - pending, preparing, etc.)
      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'paid') // Fetch based on payment_status, not order status
        .gte('order_date', start.toISOString())
        .lte('order_date', end.toISOString())
        .is('deleted_at', null);

      if (query.branchId) {
        ordersQuery = ordersQuery.eq('branch_id', query.branchId);
      }

      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        throw new InternalServerErrorException(`Failed to fetch orders: ${ordersError.message}`);
      }

      // Get payments - for all paid orders
      // Include both 'pending' and 'completed' payments since payments are created with 'pending' status
      // and updated to 'completed' when order is marked as paid
      const paidOrderIds = orders.map((o) => o.id);
      const { data: payments, error: paymentsError } = paidOrderIds.length > 0
        ? await supabase
            .from('payments')
            .select('*')
            .in('order_id', paidOrderIds)
            .in('status', ['pending', 'completed']) // Include both pending and completed payments
        : { data: [], error: null };

      if (paymentsError) {
        throw new InternalServerErrorException(`Failed to fetch payments: ${paymentsError.message}`);
      }

      // Get stock purchase costs
      let stockQuery = supabase
        .from('stock_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('transaction_type', 'purchase')
        .gte('transaction_date', start.toISOString())
        .lte('transaction_date', end.toISOString());

      if (query.branchId) {
        stockQuery = stockQuery.eq('branch_id', query.branchId);
      }

      const { data: stockPurchases, error: stockError } = await stockQuery;

      if (stockError) {
        throw new InternalServerErrorException(`Failed to fetch stock purchases: ${stockError.message}`);
      }

      // Calculate revenue
      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const totalTax = orders.reduce((sum, o) => sum + Number(o.tax_amount || 0), 0);
      const totalDiscounts = orders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0);
      const totalDeliveryCharges = orders.reduce((sum, o) => sum + Number(o.delivery_charge || 0), 0);

      // Calculate costs
      const totalCostOfGoods = stockPurchases.reduce((sum, s) => sum + Number(s.total_cost || 0), 0);

      // Payment method breakdown
      // Initialize with fixed payment methods (card and cash) - always show these
      const paymentMethodBreakdown: Record<string, { count: number; amount: number }> = {
        cash: { count: 0, amount: 0 },
        card: { count: 0, amount: 0 },
      };

      // Add payment methods from payments table
      payments.forEach((payment) => {
        const method = (payment.payment_method || 'cash').toLowerCase();
        // Normalize method names
        const normalizedMethod = method === 'credit_card' || method === 'debit_card' ? 'card' : method;
        
        if (!paymentMethodBreakdown[normalizedMethod]) {
          paymentMethodBreakdown[normalizedMethod] = { count: 0, amount: 0 };
        }
        paymentMethodBreakdown[normalizedMethod].count += 1;
        paymentMethodBreakdown[normalizedMethod].amount += Number(payment.amount || 0);
      });

      // Only count payments from paid orders
      // Payments table should have the correct data now that we create payment records when orders are paid

      // Calculate profit
      const grossProfit = totalRevenue - totalCostOfGoods;
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      return {
        revenue: {
          total: totalRevenue,
          subtotal: totalRevenue - totalTax - totalDeliveryCharges,
          tax: totalTax,
          discounts: totalDiscounts,
          deliveryCharges: totalDeliveryCharges,
        },
        costs: {
          costOfGoods: totalCostOfGoods,
        },
        profit: {
          gross: grossProfit,
          margin: profitMargin,
        },
        paymentMethods: paymentMethodBreakdown,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * 13.6 Tax Reports
   */
  async getTaxReport(tenantId: string, query: ReportQueryDto) {
    const cacheKey = `tax:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);
      const supabase = this.supabaseService.getServiceRoleClient();

      // Get paid orders (based on payment_status, not order status)
      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'paid')
        .gte('order_date', start.toISOString())
        .lte('order_date', end.toISOString())
        .is('deleted_at', null);

      if (query.branchId) {
        ordersQuery = ordersQuery.eq('branch_id', query.branchId);
      }

      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        throw new InternalServerErrorException(`Failed to fetch orders: ${ordersError.message}`);
      }

      // Get tax configuration (filter by branch if provided)
      let taxesQuery = supabase
        .from('taxes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null);
      
      if (query.branchId) {
        taxesQuery = taxesQuery.or(`branch_id.eq.${query.branchId},branch_id.is.null`);
      }
      
      const { data: taxes, error: taxesError } = await taxesQuery;

      if (taxesError) {
        throw new InternalServerErrorException(`Failed to fetch taxes: ${taxesError.message}`);
      }

      // Calculate tax summary
      const totalTax = orders.reduce((sum, o) => sum + Number(o.tax_amount || 0), 0);
      const taxableAmount = orders.reduce((sum, o) => 
        sum + (Number(o.subtotal || 0) - Number(o.discount_amount || 0)), 0
      );

      // Tax breakdown by order type
      const taxByOrderType = orders.reduce((acc, order) => {
        const type = order.order_type || 'unknown';
        if (!acc[type]) {
          acc[type] = { count: 0, tax: 0, taxableAmount: 0 };
        }
        acc[type].count += 1;
        acc[type].tax += Number(order.tax_amount || 0);
        acc[type].taxableAmount += Number(order.subtotal || 0) - Number(order.discount_amount || 0);
        return acc;
      }, {} as Record<string, { count: number; tax: number; taxableAmount: number }>);

      // Group by period for tax breakdown
      const groupBy = query.groupBy || GroupByPeriod.DAY;
      const taxBreakdownMap = new Map<string, { period: string; tax: number; taxableAmount: number; count: number }>();

      orders.forEach((order) => {
        const date = new Date(order.order_date);
        const period = this.formatDateForGrouping(date, groupBy);
        
        if (!taxBreakdownMap.has(period)) {
          taxBreakdownMap.set(period, {
            period,
            tax: 0,
            taxableAmount: 0,
            count: 0,
          });
        }

        const entry = taxBreakdownMap.get(period);
        entry.tax += Number(order.tax_amount || 0);
        entry.taxableAmount += Number(order.subtotal || 0) - Number(order.discount_amount || 0);
        entry.count += 1;
      });

      const taxBreakdown = Array.from(taxBreakdownMap.values()).sort((a, b) => 
        a.period.localeCompare(b.period)
      );

      // Calculate estimated tax breakdown by tax type
      // Since we don't store individual tax breakdowns per order, we estimate based on tax rates
      const taxByType: Array<{ name: string; rate: number; estimatedAmount: number; code?: string }> = [];
      if (taxes.length > 0 && taxableAmount > 0) {
        // Calculate weighted average based on tax rates
        const totalRate = taxes.reduce((sum, t) => sum + Number(t.rate || 0), 0);
        if (totalRate > 0) {
          for (const tax of taxes) {
            const taxRate = Number(tax.rate || 0);
            // Estimate: proportion of total tax based on tax rate
            const estimatedAmount = totalTax > 0 
              ? (taxRate / totalRate) * totalTax 
              : (taxableAmount * taxRate) / 100;
            taxByType.push({
              name: tax.name,
              rate: taxRate,
              estimatedAmount: Math.round(estimatedAmount * 100) / 100,
              code: tax.tax_code || undefined,
            });
          }
        }
      }

      return {
        summary: {
          totalTax: totalTax,
          taxableAmount: taxableAmount,
          taxRate: taxableAmount > 0 ? (totalTax / taxableAmount) * 100 : 0,
          totalOrders: orders.length,
        },
        taxConfiguration: taxes.map((t) => ({
          id: t.id,
          name: t.name,
          rate: Number(t.rate || 0),
          code: t.tax_code,
        })),
        taxByType,
        taxByOrderType,
        taxBreakdown,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * Get top selling items
   */
  async getTopItems(tenantId: string, query: TopItemsQueryDto) {
    const cacheKey = `top-items:${tenantId}:${JSON.stringify(query)}`;
    
    return this.getCached(cacheKey, async () => {
      const { start, end } = this.parseDateRange(query.startDate, query.endDate);
      const supabase = this.supabaseService.getServiceRoleClient();
      const limit = query.limit || 10;

      // Get order items from completed orders
      let ordersQuery = supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('order_date', start.toISOString())
        .lte('order_date', end.toISOString())
        .is('deleted_at', null);

      if (query.branchId) {
        ordersQuery = ordersQuery.eq('branch_id', query.branchId);
      }

      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        throw new InternalServerErrorException(`Failed to fetch orders: ${ordersError.message}`);
      }

      if (orders.length === 0) {
        return { items: [], dateRange: { start: start.toISOString(), end: end.toISOString() } };
      }

      const orderIds = orders.map((o) => o.id);

      // Get order items with food item details
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          food_items:food_item_id(id, name, category_id)
        `)
        .in('order_id', orderIds);

      if (itemsError) {
        throw new InternalServerErrorException(`Failed to fetch order items: ${itemsError.message}`);
      }

      // Aggregate by food item
      const itemMap = new Map<string, {
        id: string;
        name: string;
        quantity: number;
        revenue: number;
        orderCount: number;
      }>();

      orderItems.forEach((item) => {
        const foodItemId = item.food_item_id;
        const foodItem = item.food_items;

        if (!itemMap.has(foodItemId)) {
          itemMap.set(foodItemId, {
            id: foodItemId,
            name: foodItem?.name || 'Unknown',
            quantity: 0,
            revenue: 0,
            orderCount: 0,
          });
        }

        const entry = itemMap.get(foodItemId);
        entry.quantity += Number(item.quantity || 0);
        entry.revenue += Number(item.subtotal || 0);
        entry.orderCount += 1;
      });

      // Sort by quantity and take top N
      const topItems = Array.from(itemMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit);

      return {
        items: topItems,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      };
    });
  }

  /**
   * Export report to CSV
   */
  async exportToCSV(data: any[], filename: string): Promise<Buffer> {
    if (data.length === 0) {
      throw new BadRequestException('No data to export');
    }

    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // Use temp directory
    const tempPath = path.join(os.tmpdir(), filename);

    const headers = Object.keys(data[0]).map((key) => ({
      id: key,
      title: key,
    }));

    const csvWriter = createObjectCsvWriter({
      path: tempPath,
      header: headers,
    });

    await csvWriter.writeRecords(data);

    // Read file and return as buffer
    const buffer = fs.readFileSync(tempPath);
    fs.unlinkSync(tempPath); // Clean up temp file

    return buffer;
  }

  /**
   * Export report to Excel
   */
  async exportToExcel(data: any[], filename: string, sheetName: string = 'Report'): Promise<Buffer> {
    if (data.length === 0) {
      throw new BadRequestException('No data to export');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // Add headers
    const headers = Object.keys(data[0]);
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        // Handle null/undefined
        return value !== null && value !== undefined ? value : '';
      });
      worksheet.addRow(values);
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (column.header) {
        column.width = Math.max(15, (column.header as string).length + 2);
      } else {
        column.width = 15;
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
