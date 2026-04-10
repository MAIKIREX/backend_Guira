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

export enum WalletRampFlowType {
  FIAT_BO_TO_BRIDGE_WALLET = 'fiat_bo_to_bridge_wallet',
  CRYPTO_TO_BRIDGE_WALLET = 'crypto_to_bridge_wallet',
  FIAT_US_TO_BRIDGE_WALLET = 'fiat_us_to_bridge_wallet',
  BRIDGE_WALLET_TO_FIAT_BO = 'bridge_wallet_to_fiat_bo',
  BRIDGE_WALLET_TO_CRYPTO = 'bridge_wallet_to_crypto',
  BRIDGE_WALLET_TO_FIAT_US = 'bridge_wallet_to_fiat_us',
}

export class CreateWalletRampOrderDto {
  @ApiProperty({ enum: WalletRampFlowType })
  @IsEnum(WalletRampFlowType)
  flow_type: WalletRampFlowType;

  @ApiProperty({ example: 500.0 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  // ── wallet_id: requerido para la mayoría de flujos rampa ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type !== 'fiat_us_to_bridge_wallet')
  @IsUUID()
  wallet_id?: string;

  // ── virtual_account_id: solo fiat_us_to_bridge_wallet ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'fiat_us_to_bridge_wallet')
  @IsUUID()
  virtual_account_id?: string;

  // ── destino crypto (bridge_wallet_to_crypto) ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  @IsNotEmpty()
  destination_address?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  @IsNotEmpty()
  destination_network?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  @IsNotEmpty()
  destination_currency?: string;

  // ── destino fiat BO (bridge_wallet_to_fiat_bo) ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_bank_name?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_account_number?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination_qr_url?: string;

  // ── destino fiat US (bridge_wallet_to_fiat_us) ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_fiat_us')
  @IsUUID()
  external_account_id?: string;

  // ── crypto_to_bridge_wallet: origen crypto ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'crypto_to_bridge_wallet')
  @IsString()
  @IsNotEmpty()
  source_network?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'crypto_to_bridge_wallet')
  @IsString()
  @IsNotEmpty()
  source_address?: string;

  // ── Campos comunes ──
  @ApiPropertyOptional()
  @ValidateIf((o) => o.flow_type === 'bridge_wallet_to_fiat_us')
  @IsNotEmpty({ message: 'El motivo del retiro es obligatorio para retiros a cuenta bancaria US' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  business_purpose?: string;

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
