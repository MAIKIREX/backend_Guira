import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEmail,
  MaxLength,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDirectorDto {
  @ApiProperty({ example: 'Carlos' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({ example: 'Slim' })
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @ApiProperty({ example: 'CEO' })
  @IsString()
  @IsNotEmpty()
  position: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_signer: boolean;

  @ApiPropertyOptional({ example: '1975-03-10' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  nationality?: string;

  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country_of_residence?: string;

  @ApiPropertyOptional({ enum: ['passport', 'drivers_license', 'national_id'] })
  @IsOptional()
  @IsEnum(['passport', 'drivers_license', 'national_id'])
  id_type?: string;

  @ApiPropertyOptional({ example: 'G98765432' })
  @IsOptional()
  @IsString()
  id_number?: string;

  @ApiPropertyOptional({ example: '2030-12-31' })
  @IsOptional()
  @IsDateString()
  id_expiry_date?: string;

  @ApiPropertyOptional({ example: 'carlos@empresa.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

export class CreateUboDto {
  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({ example: 'Martínez' })
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @ApiProperty({ example: 51.5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  ownership_percent: number;

  @ApiPropertyOptional({ example: '1980-08-22' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  nationality?: string;

  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country_of_residence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['passport', 'drivers_license', 'national_id'])
  id_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  id_expiry_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tax_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postal_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  is_pep: boolean;
}
