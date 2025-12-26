import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum PlanId {
  STARTER = 'starter',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}

export class CreateSubscriptionDto {
  @ApiProperty({ enum: PlanId, example: PlanId.STARTER })
  @IsEnum(PlanId)
  @IsNotEmpty()
  planId: PlanId;
}


