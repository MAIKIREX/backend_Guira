import {
  IsString, IsNotEmpty, IsNumber, IsOptional,
  IsEnum, Min, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PayoutType {
  WIRE = 'wire',
  CRYPTO = 'crypto',
  SEPA = 'sepa',
}

export class CreatePayoutRequestDto {
  @ApiProperty({ example: 'wallet-uuid' })
  @IsString()
  @IsNotEmpty()
  wallet_id: string;

  @ApiProperty({ enum: PayoutType })
  @IsEnum(PayoutType)
  payout_type: PayoutType;

  @ApiProperty({ example: 1500.00 })
  @IsNumber()
  @Min(1)
  amount_usd: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  source_currency: string;

  @ApiProperty({ example: 'MXN' })
  @IsString()
  destination_currency: string;

  @ApiProperty({ description: 'Datos de destino (cuenta bancaria o dirección crypto)' })
  @IsObject()
  destination_details: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Pago a proveedor Guangzhou Electronics' })
  @IsOptional()
  @IsString()
  description?: string;
}
