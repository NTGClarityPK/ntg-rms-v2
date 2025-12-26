import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { CreateSubscriptionDto, PlanId } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import {
  SubscriptionResponseDto,
  SubscriptionUsageDto,
  InvoiceDto,
} from './dto/subscription-response.dto';

// Plan configurations
const PLAN_CONFIGS = {
  [PlanId.STARTER]: {
    price: 99,
    branches: 1,
    users: 5,
    storageGb: 10,
  },
  [PlanId.BUSINESS]: {
    price: 149,
    branches: 3,
    users: 15,
    storageGb: 100,
  },
  [PlanId.ENTERPRISE]: {
    price: 249,
    branches: 10,
    users: 50,
    storageGb: 500,
  },
};

@Injectable()
export class SubscriptionService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get current subscription for tenant
   */
  async getSubscription(tenantId: string): Promise<SubscriptionResponseDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch subscription: ${error.message}`
      );
    }

    if (!subscription) {
      throw new NotFoundException('No subscription found for this tenant');
    }

    return this.mapToSubscriptionResponse(subscription);
  }

  /**
   * Create trial subscription for new tenant
   */
  async createTrialSubscription(
    tenantId: string,
    planId: PlanId = PlanId.STARTER
  ): Promise<SubscriptionResponseDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if subscription already exists
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existing) {
      throw new BadRequestException('Subscription already exists for this tenant');
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: planId,
        status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: trialEndsAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create subscription: ${error.message}`
      );
    }

    // Initialize usage tracking
    await this.initializeUsage(subscription.id);

    return this.mapToSubscriptionResponse(subscription);
  }

  /**
   * Initialize usage tracking for subscription
   */
  private async initializeUsage(subscriptionId: string): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { error } = await supabase.from('subscription_usage').insert({
      subscription_id: subscriptionId,
      branches_used: 0,
      users_used: 0,
      orders_count: 0,
      storage_used_mb: 0,
    });

    if (error) {
      console.error('Failed to initialize usage tracking:', error);
      // Don't throw, just log - subscription was created successfully
    }
  }

  /**
   * Process dummy payment and activate subscription
   */
  async processPayment(
    tenantId: string,
    paymentDto: ProcessPaymentDto
  ): Promise<{ subscription: SubscriptionResponseDto; invoice: InvoiceDto }> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (subError || !subscription) {
      throw new NotFoundException('No subscription found for this tenant');
    }

    // Simulate payment processing (always succeed for dummy system)
    // Extract last 4 digits and card brand from card number
    const cardNumber = paymentDto.cardNumber.replace(/\s/g, '');
    const last4 = cardNumber.slice(-4);
    const brand = this.detectCardBrand(cardNumber);

    // Update subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1); // Monthly billing

    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: paymentDto.planId,
        status: 'active',
        trial_ends_at: null, // Remove trial
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        payment_method_last4: last4,
        payment_method_brand: brand,
        updated_at: now.toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to update subscription: ${updateError.message}`
      );
    }

    // Create invoice
    const planConfig = PLAN_CONFIGS[paymentDto.planId];
    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        subscription_id: updatedSubscription.id,
        tenant_id: tenantId,
        amount: planConfig.price,
        status: 'paid',
        invoice_number: invoiceNumber,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        paid_at: now.toISOString(),
      })
      .select()
      .single();

    if (invoiceError) {
      console.error('Failed to create invoice:', invoiceError);
      // Don't throw - subscription was updated successfully
    }

    return {
      subscription: this.mapToSubscriptionResponse(updatedSubscription),
      invoice: invoice ? this.mapToInvoiceResponse(invoice) : null,
    };
  }

  /**
   * Upgrade subscription plan
   */
  async upgradePlan(
    tenantId: string,
    newPlanId: PlanId
  ): Promise<SubscriptionResponseDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (subError || !subscription) {
      throw new NotFoundException('No subscription found');
    }

    const currentPlanOrder = this.getPlanOrder(subscription.plan_id);
    const newPlanOrder = this.getPlanOrder(newPlanId);

    if (newPlanOrder <= currentPlanOrder) {
      throw new BadRequestException('New plan must be higher tier than current plan');
    }

    // Update plan
    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlanId,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to upgrade subscription: ${updateError.message}`
      );
    }

    return this.mapToSubscriptionResponse(updated);
  }

  /**
   * Downgrade subscription plan
   */
  async downgradePlan(
    tenantId: string,
    newPlanId: PlanId
  ): Promise<SubscriptionResponseDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (subError || !subscription) {
      throw new NotFoundException('No subscription found');
    }

    const currentPlanOrder = this.getPlanOrder(subscription.plan_id);
    const newPlanOrder = this.getPlanOrder(newPlanId);

    if (newPlanOrder >= currentPlanOrder) {
      throw new BadRequestException('New plan must be lower tier than current plan');
    }

    // Update plan (takes effect at next billing period)
    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlanId,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to downgrade subscription: ${updateError.message}`
      );
    }

    return this.mapToSubscriptionResponse(updated);
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(tenantId: string): Promise<SubscriptionResponseDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (subError || !subscription) {
      throw new NotFoundException('No subscription found');
    }

    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      throw new InternalServerErrorException(
        `Failed to cancel subscription: ${updateError.message}`
      );
    }

    return this.mapToSubscriptionResponse(updated);
  }

  /**
   * Get usage metrics for subscription
   */
  async getUsage(tenantId: string): Promise<SubscriptionUsageDto> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    // Get actual usage from database
    const branchesCount = await this.countBranches(tenantId);
    const usersCount = await this.countUsers(tenantId);
    const ordersCount = await this.countOrders(tenantId);
    const storageMb = await this.calculateStorage(tenantId);

    // Get or create usage record
    let { data: usage } = await supabase
      .from('subscription_usage')
      .select('*')
      .eq('subscription_id', subscription.id)
      .maybeSingle();

    if (!usage) {
      // Create usage record if it doesn't exist
      const { data: newUsage } = await supabase
        .from('subscription_usage')
        .insert({
          subscription_id: subscription.id,
          branches_used: branchesCount,
          users_used: usersCount,
          orders_count: ordersCount,
          storage_used_mb: storageMb,
        })
        .select()
        .single();
      usage = newUsage;
    } else {
      // Update usage record
      const { data: updatedUsage } = await supabase
        .from('subscription_usage')
        .update({
          branches_used: branchesCount,
          users_used: usersCount,
          orders_count: ordersCount,
          storage_used_mb: storageMb,
          recorded_at: new Date().toISOString(),
        })
        .eq('subscription_id', subscription.id)
        .select()
        .single();
      usage = updatedUsage;
    }

    return this.mapToUsageResponse(usage);
  }

  /**
   * Get invoices for subscription
   */
  async getInvoices(tenantId: string): Promise<InvoiceDto[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to fetch invoices: ${error.message}`
      );
    }

    return invoices.map((invoice) => this.mapToInvoiceResponse(invoice));
  }

  /**
   * Get plan limits for a plan
   */
  getPlanLimits(planId: PlanId) {
    return PLAN_CONFIGS[planId];
  }

  // Helper methods

  private async countBranches(tenantId: string): Promise<number> {
    const supabase = this.supabaseService.getServiceRoleClient();
    const { count } = await supabase
      .from('branches')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    return count || 0;
  }

  private async countUsers(tenantId: string): Promise<number> {
    const supabase = this.supabaseService.getServiceRoleClient();
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    return count || 0;
  }

  private async countOrders(tenantId: string): Promise<number> {
    const supabase = this.supabaseService.getServiceRoleClient();
    // Count orders from current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth.toISOString())
      .is('deleted_at', null);
    return count || 0;
  }

  private async calculateStorage(tenantId: string): Promise<number> {
    // For now, return 0. In production, calculate from uploaded files
    // This would require querying Supabase Storage
    return 0;
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get count of invoices for this tenant
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const invoiceNum = count ? count + 1 : 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${dateStr}-${String(invoiceNum).padStart(4, '0')}`;
  }

  private detectCardBrand(cardNumber: string): string {
    const num = cardNumber.replace(/\s/g, '');
    if (/^4/.test(num)) return 'visa';
    if (/^5[1-5]/.test(num)) return 'mastercard';
    if (/^3[47]/.test(num)) return 'amex';
    if (/^6(?:011|5)/.test(num)) return 'discover';
    return 'unknown';
  }

  private getPlanOrder(planId: string): number {
    const order = { [PlanId.STARTER]: 1, [PlanId.BUSINESS]: 2, [PlanId.ENTERPRISE]: 3 };
    return order[planId] || 0;
  }

  private mapToSubscriptionResponse(subscription: any): SubscriptionResponseDto {
    return {
      id: subscription.id,
      tenantId: subscription.tenant_id,
      planId: subscription.plan_id,
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : undefined,
      currentPeriodStart: new Date(subscription.current_period_start),
      currentPeriodEnd: new Date(subscription.current_period_end),
      paymentMethodLast4: subscription.payment_method_last4,
      paymentMethodBrand: subscription.payment_method_brand,
      cancelledAt: subscription.cancelled_at ? new Date(subscription.cancelled_at) : undefined,
      createdAt: new Date(subscription.created_at),
      updatedAt: new Date(subscription.updated_at),
    };
  }

  private mapToUsageResponse(usage: any): SubscriptionUsageDto {
    return {
      subscriptionId: usage.subscription_id,
      branchesUsed: usage.branches_used,
      usersUsed: usage.users_used,
      ordersCount: usage.orders_count,
      storageUsedMb: usage.storage_used_mb,
      recordedAt: new Date(usage.recorded_at),
    };
  }

  private mapToInvoiceResponse(invoice: any): InvoiceDto {
    return {
      id: invoice.id,
      subscriptionId: invoice.subscription_id,
      tenantId: invoice.tenant_id,
      amount: parseFloat(invoice.amount),
      status: invoice.status,
      invoiceNumber: invoice.invoice_number,
      invoicePdfUrl: invoice.invoice_pdf_url,
      periodStart: new Date(invoice.period_start),
      periodEnd: new Date(invoice.period_end),
      paidAt: invoice.paid_at ? new Date(invoice.paid_at) : undefined,
      createdAt: new Date(invoice.created_at),
      updatedAt: new Date(invoice.updated_at),
    };
  }
}


