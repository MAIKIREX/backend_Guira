import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LIQUIDATION_CURRENCIES = [
  'usdb', 'usdc', 'usdt', 'dai', 'pyusd', 'eurc',
] as const;

const LIQUIDATION_CHAINS = [
  'arbitrum', 'avalanche_c_chain', 'base', 'celo', 'ethereum',
  'optimism', 'polygon', 'solana', 'stellar', 'tempo', 'tron', 'evm',
] as const;

export class CreateLiquidationAddressDto {
  @ApiProperty({ example: 'usdc', enum: LIQUIDATION_CURRENCIES })
  @IsEnum(LIQUIDATION_CURRENCIES, {
    message: `currency debe ser una de: ${LIQUIDATION_CURRENCIES.join(', ')}`,
  })
  currency: string;

  @ApiProperty({ example: 'base', enum: LIQUIDATION_CHAINS })
  @IsEnum(LIQUIDATION_CHAINS, {
    message: `chain debe ser una de: ${LIQUIDATION_CHAINS.join(', ')}`,
  })
  chain: string;

  @ApiProperty({ example: 'usd', description: 'Moneda fiat de liquidación destino' })
  @IsString()
  destination_currency: string;

  @ApiProperty({ example: 'wire', description: 'Rail de pago destino' })
  @IsString()
  destination_payment_rail: string;

  @ApiPropertyOptional({ description: 'ID de external account de Bridge (destino fiat)' })
  @IsOptional()
  @IsString()
  external_account_id?: string;

  @ApiPropertyOptional({
    description: 'Wallet address crypto de destino (para liquidaciones crypto → crypto)',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  })
  @IsOptional()
  @IsString()
  destination_address?: string;
}
