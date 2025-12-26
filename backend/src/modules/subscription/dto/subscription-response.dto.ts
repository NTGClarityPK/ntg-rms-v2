import { ApiProperty } from '@nestjs/swagger';
import { PlanId } from './create-subscription.dto';
import { SubscriptionStatus } from './update-subscription.dto';

export class SubscriptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: PlanId })
  planId: PlanId;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ required: false })
  trialEndsAt?: Date;

  @ApiProperty()
  currentPeriodStart: Date;

  @ApiProperty()
  currentPeriodEnd: Date;

  @ApiProperty({ required: false })
  paymentMethodLast4?: string;

  @ApiProperty({ required: false })
  paymentMethodBrand?: string;

  @ApiProperty({ required: false })
  cancelledAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SubscriptionUsageDto {
  @ApiProperty()
  subscriptionId: string;

  @ApiProperty()
  branchesUsed: number;

  @ApiProperty()
  usersUsed: number;

  @ApiProperty()
  ordersCount: number;

  @ApiProperty()
  storageUsedMb: number;

  @ApiProperty()
  recordedAt: Date;
}

export class InvoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  subscriptionId: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  invoiceNumber: string;

  @ApiProperty({ required: false })
  invoicePdfUrl?: string;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty({ required: false })
  paidAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}


