import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsArray,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ enum: ['LLC', 'Corp', 'SA', 'SAS', 'SRL', 'Other'] })
  @IsString()
  entity_type: string;

  @ApiPropertyOptional({ example: '2020-01-15' })
  @IsOptional()
  @IsDateString()
  incorporation_date?: string;

  @ApiProperty({ example: 'MX' })
  @IsString()
  @MaxLength(2)
  country_of_incorporation: string;

  @ApiPropertyOptional({ example: 'Jalisco' })
  @IsOptional()
  @IsString()
  state_of_incorporation?: string;

  @ApiPropertyOptional({ example: ['MX', 'US', 'CN'] })
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

  @ApiProperty({ example: 'MX' })
  @IsString()
  @MaxLength(2)
  country: string;

  @ApiProperty({ example: 'Plataforma de pagos internacionales' })
  @IsString()
  business_description: string;

  @ApiPropertyOptional({ example: 'fintech' })
  @IsOptional()
  @IsString()
  business_industry?: string;

  @ApiPropertyOptional({ example: 'international_payments' })
  @IsOptional()
  @IsString()
  account_purpose?: string;

  @ApiProperty({ example: 'business_revenue' })
  @IsString()
  source_of_funds: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  conducts_money_services: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  uses_bridge_for_money_services?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  compliance_explanation?: string;
}
