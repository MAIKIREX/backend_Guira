import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsArray,
  IsEmail,
  Length,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceOfFundsEnum, AccountPurposeEnum } from './create-person.dto';

/**
 * Bridge-accepted values for business_type.
 * H11 — enforced enum to replace loose string (LLC, Corp, SA, etc.)
 */
export enum BusinessTypeEnum {
  COOPERATIVE  = 'cooperative',
  CORPORATION  = 'corporation',
  LLC          = 'llc',
  OTHER        = 'other',
  PARTNERSHIP  = 'partnership',
  SOLE_PROP    = 'sole_prop',
  TRUST        = 'trust',
}

export class CreateBusinessDto {
  @ApiProperty({ example: 'Guira Payments S.A. de C.V.' })
  @IsString()
  @IsNotEmpty()
  legal_name: string;

  @ApiPropertyOptional({ example: 'Guira Pay' })
  @IsOptional()
  @IsString()
  trade_name?: string;

  @ApiPropertyOptional({ example: 'REG-123456' })
  @IsOptional()
  @IsString()
  registration_number?: string;

  @ApiProperty({ example: 'GPY1234567A0' })
  @IsString()
  @IsNotEmpty()
  tax_id: string;

  /**
   * H11 — Bridge accepts strict business_type enum.
   * Use BusinessTypeEnum values: llc, corporation, partnership, sole_prop, trust, cooperative, other.
   */
  @ApiProperty({ enum: BusinessTypeEnum })
  @IsEnum(BusinessTypeEnum)
  entity_type: BusinessTypeEnum;

  @ApiPropertyOptional({ example: '2020-01-15' })
  @IsOptional()
  @IsDateString()
  incorporation_date?: string;

  /**
   * H05/H09 — Updated to allow 2-3 char codes. BridgeCustomerService converts to alpha-3.
   */
  @ApiProperty({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code (3 characters preferred)',
  })
  @IsString()
  @Length(2, 3)
  country_of_incorporation: string;

  @ApiPropertyOptional({ example: 'Jalisco' })
  @IsOptional()
  @IsString()
  state_of_incorporation?: string;

  @ApiPropertyOptional({ example: ['MEX', 'USA', 'CHN'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operating_countries?: string[];

  @ApiPropertyOptional({ example: 'https://guirapay.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ example: 'contacto@guirapay.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+52 33 1234 5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Av. Vallarta 3000' })
  @IsString()
  @IsNotEmpty()
  address1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address2?: string;

  @ApiProperty({ example: 'Guadalajara' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'Jalisco' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '44100' })
  @IsOptional()
  @IsString()
  postal_code?: string;

  /**
   * H05 — Bridge requires ISO alpha-3. BridgeCustomerService converts automatically.
   */
  @ApiProperty({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code (3 characters preferred)',
  })
  @IsString()
  @Length(2, 3)
  country: string;

  @ApiPropertyOptional({ example: 'Plataforma de pagos internacionales' })
  @IsOptional()
  @IsString()
  business_description?: string;

  @ApiPropertyOptional({ example: 'fintech' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  business_industry?: string[];

  /** H10 — enforced Bridge enum */
  @ApiPropertyOptional({ enum: AccountPurposeEnum })
  @IsOptional()
  @IsEnum(AccountPurposeEnum)
  account_purpose?: AccountPurposeEnum;

  /** H10 — enforced Bridge enum */
  @ApiPropertyOptional({ enum: SourceOfFundsEnum })
  @IsOptional()
  @IsEnum(SourceOfFundsEnum)
  source_of_funds?: SourceOfFundsEnum;

  /** Required when account_purpose = 'other' */
  @ApiPropertyOptional({ example: 'Custom purpose description' })
  @IsOptional()
  @IsString()
  account_purpose_other?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  conducts_money_services?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  uses_bridge_for_money_services?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  compliance_explanation?: string;

  // ── P1: High-risk / Enhanced Due Diligence ──────────────────────────

  /**
   * P1 — Bridge high-risk field.
   * Estimated annual revenue of the business.
   * Updated to match Bridge API OpenAPI spec exact enum values.
   */
  @ApiPropertyOptional({
    enum: ['0_99999', '100000_999999', '1000000_9999999', '10000000_49999999', '50000000_249999999', '250000000_plus'],
  })
  @IsOptional()
  @IsEnum(['0_99999', '100000_999999', '1000000_9999999', '10000000_49999999', '50000000_249999999', '250000000_plus'])
  estimated_annual_revenue_usd?: '0_99999' | '100000_999999' | '1000000_9999999' | '10000000_49999999' | '50000000_249999999' | '250000000_plus';

  /**
   * P1 — Bridge high-risk field.
   * Array of activity codes from the Bridge high_risk_activities enum.
   * Updated to match Bridge API OpenAPI spec exact enum values.
   */
  @ApiPropertyOptional({ example: ['money_services', 'gambling'] })
  @IsOptional()
  @IsArray()
  @IsEnum([
    'adult_entertainment', 'gambling', 'hold_client_funds', 'investment_services',
    'lending_banking', 'marijuana_or_related_services', 'money_services',
    'nicotine_tobacco_or_related_services',
    'operate_foreign_exchange_virtual_currencies_brokerage_otc',
    'pharmaceuticals', 'precious_metals_precious_stones_jewelry',
    'safe_deposit_box_rentals', 'third_party_payment_processing',
    'weapons_firearms_and_explosives', 'none_of_the_above',
  ], { each: true })
  high_risk_activities?: string[];

  // ── P2: Physical / Operational Address ─────────────────────────────

  /**
   * P2 — Operational address if different from the registered legal address.
   * Bridge field: physical_address. Sent only when physical_city + physical_country are present.
   */
  @ApiPropertyOptional({ example: 'Calle Industria 55' })
  @IsOptional()
  @IsString()
  physical_address1?: string;

  @ApiPropertyOptional({ example: 'Piso 2' })
  @IsOptional()
  @IsString()
  physical_address2?: string;

  @ApiPropertyOptional({ example: 'Monterrey' })
  @IsOptional()
  @IsString()
  physical_city?: string;

  @ApiPropertyOptional({ example: 'Nuevo León' })
  @IsOptional()
  @IsString()
  physical_state?: string;

  @ApiPropertyOptional({ example: '64000' })
  @IsOptional()
  @IsString()
  physical_postal_code?: string;

  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code for physical location',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  physical_country?: string;
}
