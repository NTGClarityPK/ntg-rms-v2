import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

@Injectable()
export class DashboardService {
  constructor(private supabaseService: SupabaseService) {}

  async getDashboard(tenantId: string, branchId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Build base queries (reusable for multiple queries)
    const baseOrderQuery = () => {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      return query;
    };

    // Fetch branches if needed for tables query (only if no branchId)
    const branchesPromise = !branchId
      ? supabase
          .from('branches')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null });

    // Parallelize all independent queries
    const [
      branchesResult,
      todayPaidOrdersResult,
      todayOrdersResult,
      pendingOrdersResult,
      ingredientsResult,
      revenueDataResult,
    ] = await Promise.all([
      branchesPromise,
      // Today's paid sales
      baseOrderQuery()
        .eq('payment_status', 'paid')
        .gte('order_date', today.toISOString())
        .lte('order_date', todayEnd.toISOString())
        .select('total_amount'),
      // Today's orders (for count and popular items)
      baseOrderQuery()
        .gte('order_date', today.toISOString())
        .lte('order_date', todayEnd.toISOString())
        .select('id, order_type, status'),
      // Pending orders
      baseOrderQuery()
        .in('status', ['pending', 'preparing'])
        .select('id, status, order_type'),
      // Ingredients for low stock
      (() => {
        let stockQuery = supabase
          .from('ingredients')
          .select('id, name, current_stock, minimum_threshold')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);
        if (branchId) {
          stockQuery = stockQuery.eq('branch_id', branchId);
        }
        return stockQuery;
      })(),
      // Revenue chart data (last 7 days)
      baseOrderQuery()
        .eq('payment_status', 'paid')
        .gte('order_date', sevenDaysAgo.toISOString())
        .lte('order_date', todayEnd.toISOString())
        .select('order_date, total_amount'),
    ]);

    // Handle errors
    if (todayPaidOrdersResult.error) {
      throw new InternalServerErrorException(`Failed to fetch today's sales: ${todayPaidOrdersResult.error.message}`);
    }
    if (todayOrdersResult.error) {
      throw new InternalServerErrorException(`Failed to fetch today's orders: ${todayOrdersResult.error.message}`);
    }
    if (pendingOrdersResult.error) {
      throw new InternalServerErrorException(`Failed to fetch pending orders: ${pendingOrdersResult.error.message}`);
    }
    if (ingredientsResult.error) {
      throw new InternalServerErrorException(`Failed to fetch ingredients: ${ingredientsResult.error.message}`);
    }
    if (revenueDataResult.error) {
      throw new InternalServerErrorException(`Failed to fetch revenue data: ${revenueDataResult.error.message}`);
    }

    const todayPaidOrders = todayPaidOrdersResult.data || [];
    const todayOrdersData = todayOrdersResult.data || [];
    const pendingOrders = pendingOrdersResult.data || [];
    const ingredients = ingredientsResult.data || [];
    const revenueData = revenueDataResult.data || [];

    // Calculate today's sales
    const todaySales = todayPaidOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    // Calculate today's orders count and by type
    const todayOrdersCount = todayOrdersData.length;
    const ordersByType = todayOrdersData.reduce((acc, order) => {
      const type = order.order_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const pendingOrdersCount = pendingOrders.length;

    // Low stock alerts
    const lowStockAlerts = ingredients
      .filter((ing) => {
        const stock = Number(ing.current_stock || 0);
        const threshold = Number(ing.minimum_threshold || 0);
        return stock <= threshold;
      })
      .map((ing) => ({
        id: ing.id,
        name: ing.name,
        currentStock: Number(ing.current_stock || 0),
        minimumThreshold: Number(ing.minimum_threshold || 0),
      }));

    // Active Tables (fetch after branches if needed)
    let tablesQuery = supabase
      .from('tables')
      .select('id, status, branch_id')
      .eq('status', 'occupied')
      .is('deleted_at', null);

    if (branchId) {
      tablesQuery = tablesQuery.eq('branch_id', branchId);
    } else {
      const branches = branchesResult.data || [];
      if (branches.length > 0) {
        const branchIds = branches.map(b => b.id);
        tablesQuery = tablesQuery.in('branch_id', branchIds);
      } else {
        tablesQuery = tablesQuery.in('branch_id', ['00000000-0000-0000-0000-000000000000']);
      }
    }

    // Popular Items (Today) - fetch in parallel with tables
    const orderIds = todayOrdersData.map((o) => o.id);
    const [tablesResult, orderItemsResult] = await Promise.all([
      tablesQuery,
      supabase
        .from('order_items')
        .select('food_item_id, quantity, food_item:food_items(id, name)')
        .in('order_id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'])
        .limit(1000),
    ]);

    if (tablesResult.error) {
      throw new InternalServerErrorException(`Failed to fetch active tables: ${tablesResult.error.message}`);
    }
    if (orderItemsResult.error) {
      throw new InternalServerErrorException(`Failed to fetch popular items: ${orderItemsResult.error.message}`);
    }

    const activeTablesCount = (tablesResult.data || []).length;

    const orderItems = orderItemsResult.data || [];
    const itemCounts = orderItems.reduce((acc, item) => {
      const foodItem = item.food_item as any;
      if (foodItem) {
        const itemId = foodItem.id;
        if (!acc[itemId]) {
          acc[itemId] = {
            id: itemId,
            name: foodItem.name,
            quantity: 0,
          };
        }
        acc[itemId].quantity += Number(item.quantity || 0);
      }
      return acc;
    }, {} as Record<string, { id: string; name: string; quantity: number }>);

    const popularItems = Object.values(itemCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Group revenue by date
    const revenueByDate = revenueData.reduce((acc, order) => {
      const date = new Date(order.order_date);
      const dateKey = date.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = 0;
      }
      acc[dateKey] += Number(order.total_amount || 0);
      return acc;
    }, {} as Record<string, number>);

    // Fill in missing dates with 0
    const revenueChart = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      revenueChart.push({
        date: dateKey,
        revenue: revenueByDate[dateKey] || 0,
      });
    }

    return {
      todaySales: todaySales,
      todayOrders: {
        total: todayOrdersCount,
        byType: ordersByType,
      },
      activeTables: activeTablesCount,
      pendingOrders: pendingOrdersCount,
      lowStockAlerts: lowStockAlerts,
      popularItems: popularItems,
      revenueChart: revenueChart,
    };
  }
}

