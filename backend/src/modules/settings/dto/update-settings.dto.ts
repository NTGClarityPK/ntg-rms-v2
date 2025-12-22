import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GeneralSettingsDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dateFormat?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  timeFormat?: '12' | '24';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firstDayOfWeek?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  defaultOrderType?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  autoPrintInvoices?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  autoPrintKitchenTickets?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableTableManagement?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableDeliveryManagement?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minimumDeliveryOrderAmount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  defaultDeliveryCharge?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  freeDeliveryThreshold?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  smsNotifications?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  soundAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  totalTables?: number;
}

export class InvoiceSettingsDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  headerText?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  footerText?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  termsAndConditions?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  showLogo?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  showVatNumber?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  showQrCode?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  invoiceNumberFormat?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  receiptTemplate?: 'thermal' | 'a4';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customTemplate?: string;
}

export class PaymentMethodSettingsDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableCash?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableCard?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableZainCash?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableAsiaHawala?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableBankTransfer?: boolean;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  paymentGatewayConfig?: Record<string, any>;
}

export class PrinterSettingsDto {
  @ApiProperty({ required: false, type: [Object] })
  @IsObject({ each: true })
  @IsOptional()
  printers?: Array<{
    id?: string;
    name: string;
    type: 'receipt' | 'kitchen' | 'invoice';
    connectionType: 'usb' | 'network' | 'bluetooth';
    ipAddress?: string;
    counterId?: string;
  }>;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  autoPrint?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  numberOfCopies?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  paperSize?: string;
}

export class TaxSettingsDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enableTaxSystem?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  taxCalculationMethod?: 'included' | 'excluded';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  taxApplicationType?: 'order' | 'category' | 'item';

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  applyTaxOnDelivery?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  applyTaxOnServiceCharge?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  applyTaxOnReservations?: boolean;
}

export class UpdateSettingsDto {
  @ApiProperty({ required: false, type: GeneralSettingsDto })
  @ValidateNested()
  @Type(() => GeneralSettingsDto)
  @IsOptional()
  general?: GeneralSettingsDto;

  @ApiProperty({ required: false, type: InvoiceSettingsDto })
  @ValidateNested()
  @Type(() => InvoiceSettingsDto)
  @IsOptional()
  invoice?: InvoiceSettingsDto;

  @ApiProperty({ required: false, type: PaymentMethodSettingsDto })
  @ValidateNested()
  @Type(() => PaymentMethodSettingsDto)
  @IsOptional()
  paymentMethods?: PaymentMethodSettingsDto;

  @ApiProperty({ required: false, type: PrinterSettingsDto })
  @ValidateNested()
  @Type(() => PrinterSettingsDto)
  @IsOptional()
  printers?: PrinterSettingsDto;

  @ApiProperty({ required: false, type: TaxSettingsDto })
  @ValidateNested()
  @Type(() => TaxSettingsDto)
  @IsOptional()
  tax?: TaxSettingsDto;
}
