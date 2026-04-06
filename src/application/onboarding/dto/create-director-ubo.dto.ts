import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEmail,
  Length,
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

  /**
   * Position/title of the director (maps to Bridge `title` field).
   * H03 — bridge associated_person uses `title`; stored as `position` in DB.
   */
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

  /**
   * H09 — Updated to accept alpha-3 (3 chars). BridgeCustomerService converts.
   */
  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 nationality code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  nationality?: string;

  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country of residence',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
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

  /**
   * H03 — Bridge requires email for associated_persons. Kept optional for
   * backward compatibility but validation enforces format when provided.
   */
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

  /**
   * H05 — Updated to accept alpha-3. BridgeCustomerService converts.
   */
  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
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

  /** ownership_percentage on Bridge side; stored as ownership_percent in DB. */
  @ApiProperty({ example: 51.5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  ownership_percent: number;

  @ApiPropertyOptional({ example: '1980-08-22' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 nationality code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  nationality?: string;

  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country of residence',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
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

  /** H03 — Bridge requires email for associated_persons. */
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
  address2?: string;

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

  /**
   * H05 — Updated to accept alpha-3. BridgeCustomerService converts.
   */
  @ApiPropertyOptional({
    example: 'MEX',
    description: 'ISO 3166-1 alpha-3 country code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  country?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  is_pep: boolean;
}
