import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PlanId } from './create-subscription.dto';

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
}

export class UpdateSubscriptionDto {
  @ApiProperty({ enum: PlanId, required: false })
  @IsEnum(PlanId)
  @IsOptional()
  planId?: PlanId;

  @ApiProperty({ enum: SubscriptionStatus, required: false })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;
}


