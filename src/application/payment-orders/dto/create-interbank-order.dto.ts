import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InterbankFlowType {
  BOLIVIA_TO_WORLD = 'bolivia_to_world',
  WALLET_TO_WALLET = 'wallet_to_wallet',
  BOLIVIA_TO_WALLET = 'bolivia_to_wallet',
  WORLD_TO_BOLIVIA = 'world_to_bolivia',
  WORLD_TO_WALLET = 'world_to_wallet',
}

export class CreateInterbankOrderDto {
  @ApiProperty({ enum: InterbankFlowType })
  @IsEnum(InterbankFlowType)
  flow_type: InterbankFlowType;

  @ApiProperty({ example: 1000.0 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  // ── bolivia_to_world: destino es external_account ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bolivia_to_world')
  @IsUUID()
  external_account_id?: string;

  @ApiPropertyOptional({ example: 'usd' })
  @ValidateIf((o) =>
    ['bolivia_to_world', 'world_to_bolivia', 'wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type),
  )
  @IsOptional()
  @IsString()
  destination_currency?: string;

  // ── wallet_to_wallet: direcciones crypto ad-hoc ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_address?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_network?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_currency?: string;

  // ── destino crypto (wallet_to_wallet, bolivia_to_wallet) ──
  @ApiPropertyOptional()
  @ValidateIf((o) =>
    ['wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type),
  )
  @IsString()
  @IsNotEmpty()
  destination_address?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) =>
    ['wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type),
  )
  @IsString()
  @IsNotEmpty()
  destination_network?: string;

  // ── world_to_bolivia: destino es cuenta boliviana ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_bank_name?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_account_number?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination_qr_url?: string;

  // ── world_to_wallet: VA existente ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'world_to_wallet')
  @IsOptional()
  @IsUUID()
  virtual_account_id?: string;

  // ── Campos comunes ──
  @ApiProperty({ example: 'Pago a proveedor — Factura #2026-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  business_purpose: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supporting_document_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
