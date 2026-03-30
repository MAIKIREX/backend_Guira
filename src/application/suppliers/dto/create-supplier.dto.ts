import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Acme Logistics S.A.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'MX' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'mxn' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 'spei', enum: ['ach', 'wire', 'sepa', 'spei', 'pix'] })
  @IsString()
  @IsNotEmpty()
  payment_rail: string;

  @ApiProperty({
    example: { clabe: '012345678901234567', bank_name: 'BBVA México' },
    description: 'Detalles bancarios del proveedor (CLABE, IBAN, routing, etc.)',
  })
  @IsObject()
  bank_details: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'pagos@acme.com.mx' })
  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @ApiPropertyOptional({ example: 'Proveedor principal de logística' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment_rail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bank_details?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
