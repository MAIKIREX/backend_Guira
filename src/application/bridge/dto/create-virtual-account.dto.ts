import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVirtualAccountDto {
  @ApiProperty({ example: 'usd', description: 'Moneda origen del depósito' })
  @IsString()
  @IsNotEmpty()
  source_currency: string;

  @ApiProperty({ example: 'usdc', description: 'Moneda destino de conversión' })
  @IsString()
  @IsNotEmpty()
  destination_currency: string;

  @ApiProperty({ example: 'ethereum', description: 'Red de destino para crypto' })
  @IsString()
  @IsNotEmpty()
  destination_payment_rail: string;

  @ApiPropertyOptional({ description: 'Wallet ID de destino (si aplica)' })
  @IsOptional()
  @IsUUID()
  destination_wallet_id?: string;
}

export class CreateExternalAccountDto {
  @ApiProperty({ example: 'Banco Nacional', description: 'Nombre del banco' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiProperty({ example: 'María González', description: 'Nombre del titular' })
  @IsString()
  @IsNotEmpty()
  account_name: string;

  @ApiProperty({ example: 'usd' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 'wire', enum: ['ach', 'wire', 'sepa', 'spei', 'pix'] })
  @IsEnum(['ach', 'wire', 'sepa', 'spei', 'pix'])
  payment_rail: string;

  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional()
  @IsString()
  country?: string;

  // ACH / Wire
  @ApiPropertyOptional({ example: '021000021' })
  @IsOptional()
  @IsString()
  routing_number?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  account_number?: string;

  @ApiPropertyOptional({ enum: ['checking', 'savings'] })
  @IsOptional()
  @IsString()
  account_type?: string;

  // SEPA
  @ApiPropertyOptional({ example: 'DE89370400440532013000' })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ example: 'COBADEFFXXX' })
  @IsOptional()
  @IsString()
  swift_bic?: string;

  // SPEI
  @ApiPropertyOptional({ example: '012345678901234567' })
  @IsOptional()
  @IsString()
  clabe?: string;

  // PIX
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  br_code?: string;
}

export class CreateLiquidationAddressDto {
  @ApiProperty({ example: 'usdc' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 'ethereum' })
  @IsString()
  chain: string;

  @ApiProperty({ example: 'usd', description: 'Moneda de liquidación fiat' })
  @IsString()
  destination_currency: string;

  @ApiProperty({ example: 'wire' })
  @IsString()
  destination_payment_rail: string;

  @ApiPropertyOptional({ description: 'External account ID de destino' })
  @IsOptional()
  @IsString()
  external_account_id?: string;
}
