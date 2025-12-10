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

    // Today's Sales
    let salesQuery = supabase
      .from('orders')
      .select('total_amount, payment_status')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .gte('order_date', today.toISOString())
      .lte('order_date', todayEnd.toISOString())
      .is('deleted_at', null);

    if (branchId) {
      salesQuery = salesQuery.eq('branch_id', branchId);
    }

    const { data: todayOrders, error: ordersError } = await salesQuery;

    if (ordersError) {
      throw new InternalServerErrorException(`Failed to fetch today's sales: ${ordersError.message}`);
    }

    const todaySales = todayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    // Today's Orders Count by Type
    let ordersCountQuery = supabase
      .from('orders')
      .select('id, order_type, status')
      .eq('tenant_id', tenantId)
      .gte('order_date', today.toISOString())
      .lte('order_date', todayEnd.toISOString())
      .is('deleted_at', null);

    if (branchId) {
      ordersCountQuery = ordersCountQuery.eq('branch_id', branchId);
    }

    const { data: todayOrdersData, error: ordersCountError } = await ordersCountQuery;

    if (ordersCountError) {
      throw new InternalServerErrorException(`Failed to fetch today's orders: ${ordersCountError.message}`);
    }

    const todayOrdersCount = todayOrdersData.length;
    const ordersByType = todayOrdersData.reduce((acc, order) => {
      const type = order.order_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Active Tables
    // Tables don't have tenant_id directly, they link through branches
    let tablesQuery = supabase
      .from('tables')
      .select('id, status, branch_id')
      .eq('status', 'occupied')
      .is('deleted_at', null);

    if (branchId) {
      tablesQuery = tablesQuery.eq('branch_id', branchId);
    } else {
      // Filter by tenant through branch relationship
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (branches && branches.length > 0) {
        const branchIds = branches.map(b => b.id);
        tablesQuery = tablesQuery.in('branch_id', branchIds);
      } else {
        // No branches, so no tables
        tablesQuery = tablesQuery.in('branch_id', ['00000000-0000-0000-0000-000000000000']);
      }
    }

    const { data: activeTables, error: tablesError } = await tablesQuery;

    if (tablesError) {
      throw new InternalServerErrorException(`Failed to fetch active tables: ${tablesError.message}`);
    }

    const activeTablesCount = activeTables.length;

    // Pending Orders
    let pendingQuery = supabase
      .from('orders')
      .select('id, status, order_type')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'preparing'])
      .is('deleted_at', null);

    if (branchId) {
      pendingQuery = pendingQuery.eq('branch_id', branchId);
    }

    const { data: pendingOrders, error: pendingError } = await pendingQuery;

    if (pendingError) {
      throw new InternalServerErrorException(`Failed to fetch pending orders: ${pendingError.message}`);
    }

    const pendingOrdersCount = pendingOrders.length;

    // Low Stock Alerts
    let stockQuery = supabase
      .from('ingredients')
      .select('id, name_en, name_ar, current_stock, minimum_threshold')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (branchId) {
      stockQuery = stockQuery.eq('branch_id', branchId);
    }

    const { data: ingredients, error: stockError } = await stockQuery;

    if (stockError) {
      throw new InternalServerErrorException(`Failed to fetch ingredients: ${stockError.message}`);
    }

    const lowStockAlerts = ingredients
      .filter((ing) => {
        const stock = Number(ing.current_stock || 0);
        const threshold = Number(ing.minimum_threshold || 0);
        return stock <= threshold;
      })
      .map((ing) => ({
        id: ing.id,
        nameEn: ing.name_en,
        nameAr: ing.name_ar,
        currentStock: Number(ing.current_stock || 0),
        minimumThreshold: Number(ing.minimum_threshold || 0),
      }));

    // Popular Items (Today)
    const orderIds = todayOrdersData.map((o) => o.id);
    let popularItemsQuery = supabase
      .from('order_items')
      .select('food_item_id, quantity, food_item:food_items(id, name_en, name_ar)')
      .in('order_id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1000);

    const { data: orderItems, error: itemsError } = await popularItemsQuery;

    if (itemsError) {
      throw new InternalServerErrorException(`Failed to fetch popular items: ${itemsError.message}`);
    }

    const itemCounts = orderItems.reduce((acc, item) => {
      const foodItem = item.food_item as any;
      if (foodItem) {
        const itemId = foodItem.id;
        if (!acc[itemId]) {
          acc[itemId] = {
            id: itemId,
            nameEn: foodItem.name_en,
            nameAr: foodItem.name_ar,
            quantity: 0,
          };
        }
        acc[itemId].quantity += Number(item.quantity || 0);
      }
      return acc;
    }, {} as Record<string, { id: string; nameEn: string; nameAr: string; quantity: number }>);

    const popularItems = Object.values(itemCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Revenue Chart (Last 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let revenueQuery = supabase
      .from('orders')
      .select('order_date, total_amount, payment_status')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .gte('order_date', sevenDaysAgo.toISOString())
      .lte('order_date', todayEnd.toISOString())
      .is('deleted_at', null);

    if (branchId) {
      revenueQuery = revenueQuery.eq('branch_id', branchId);
    }

    const { data: revenueData, error: revenueError } = await revenueQuery;

    if (revenueError) {
      throw new InternalServerErrorException(`Failed to fetch revenue data: ${revenueError.message}`);
    }

    // Group by date
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

