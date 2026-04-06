import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmail,
  IsBoolean,
  IsEnum,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Bridge-accepted values for source_of_funds.
 * H10 – validated enum to prevent Bridge HTTP 400 rejections.
 */
export enum SourceOfFundsEnum {
  SALARY            = 'salary',
  BUSINESS_REVENUE  = 'business_revenue',
  INVESTMENT_INCOME = 'investment_income',
  RETIREMENT_INCOME = 'retirement_income',
  GIFT              = 'gift',
  INHERITANCE       = 'inheritance',
  LOAN              = 'loan',
  OTHER             = 'other',
}

/**
 * Bridge-accepted values for account_purpose.
 * H10 – validated enum to prevent Bridge HTTP 400 rejections.
 */
export enum AccountPurposeEnum {
  INTERNATIONAL_PAYMENTS = 'international_payments',
  BUSINESS_PAYMENTS      = 'business_payments',
  PERSONAL_PAYMENTS      = 'personal_payments',
  SAVINGS                = 'savings',
  INVESTMENT             = 'investment',
  PAYROLL                = 'payroll',
  REMITTANCES            = 'remittances',
  OTHER                  = 'other',
}

export class CreatePersonDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  first_name: string;

  @ApiProperty({ example: 'González' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  last_name: string;

  @ApiProperty({ example: '1990-05-15' })
  @IsDateString()
  date_of_birth: string;

  /**
   * H09 — Bridge requires ISO alpha-3 (3 chars, e.g. 'MEX').
   * The BridgeCustomerService will convert alpha-2 to alpha-3 automatically,
   * but accepting Length(3) here enforces the correct format at entry point.
   * Updated MaxLength from 2 to 3.
   */
  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code (3 characters)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  nationality?: string;

  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code of residence (3 characters)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  country_of_residence?: string;

  @ApiProperty({ enum: ['passport', 'drivers_license', 'national_id'] })
  @IsEnum(['passport', 'drivers_license', 'national_id'])
  id_type: string;

  @ApiProperty({ example: 'G12345678' })
  @IsString()
  @IsNotEmpty()
  id_number: string;

  @ApiPropertyOptional({ example: '2030-12-31' })
  @IsOptional()
  @IsDateString()
  id_expiry_date?: string;

  @ApiProperty({ example: 'maria@ejemplo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+52 55 1234 5678' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Av. Reforma 123' })
  @IsString()
  @IsNotEmpty()
  address1: string;

  @ApiPropertyOptional({ example: 'Piso 4' })
  @IsOptional()
  @IsString()
  address2?: string;

  @ApiProperty({ example: 'Ciudad de México' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: 'CDMX' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '06600' })
  @IsOptional()
  @IsString()
  postal_code?: string;

  /**
   * H05 — Bridge requires ISO alpha-3. BridgeCustomerService converts automatically.
   * Updated MaxLength from 2 to 3 to accept alpha-3 at entry too.
   */
  @ApiProperty({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code (3 characters preferred)',
  })
  @IsString()
  @Length(2, 3)
  country: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tax_id?: string;

  /** H10 — enforced Bridge enum */
  @ApiPropertyOptional({ enum: SourceOfFundsEnum })
  @IsOptional()
  @IsEnum(SourceOfFundsEnum)
  source_of_funds?: SourceOfFundsEnum;

  /** H10 — enforced Bridge enum */
  @ApiPropertyOptional({ enum: AccountPurposeEnum })
  @IsOptional()
  @IsEnum(AccountPurposeEnum)
  account_purpose?: AccountPurposeEnum;

  @ApiProperty({ example: false })
  @IsBoolean()
  is_pep: boolean;

  /**
   * P1 — Bridge high-risk field.
   * Required when customer is flagged as high-risk or for enhanced due diligence.
   */
  @ApiPropertyOptional({ enum: ['employed', 'self_employed', 'unemployed', 'student', 'retired', 'other'] })
  @IsOptional()
  @IsEnum(['employed', 'self_employed', 'unemployed', 'student', 'retired', 'other'])
  employment_status?: 'employed' | 'self_employed' | 'unemployed' | 'student' | 'retired' | 'other';

  /**
   * P1 — Bridge high-risk field.
   * Expected monthly transaction volume in USD ranges.
   */
  @ApiPropertyOptional({ enum: ['less_than_1000', '1000_to_10000', '10000_to_50000', '50000_to_100000', 'greater_than_100000'] })
  @IsOptional()
  @IsEnum(['less_than_1000', '1000_to_10000', '10000_to_50000', '50000_to_100000', 'greater_than_100000'])
  expected_monthly_payments_usd?: 'less_than_1000' | '1000_to_10000' | '10000_to_50000' | '50000_to_100000' | 'greater_than_100000';
}
