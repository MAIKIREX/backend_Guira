import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmail,
  IsBoolean,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @ApiProperty({ example: 'González' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @ApiProperty({ example: '1990-05-15' })
  @IsDateString()
  date_of_birth: string;

  @ApiProperty({ example: 'MX', description: 'ISO 3166-1 alpha-2' })
  @IsString()
  @MaxLength(2)
  nationality: string;

  @ApiProperty({ example: 'MX' })
  @IsString()
  @MaxLength(2)
  country_of_residence: string;

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

  @ApiProperty({ example: 'MX' })
  @IsString()
  @MaxLength(2)
  country: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tax_id?: string;

  @ApiProperty({ example: 'salary' })
  @IsString()
  source_of_funds: string;

  @ApiProperty({ example: 'international_payments' })
  @IsString()
  account_purpose: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  is_pep: boolean;
}
