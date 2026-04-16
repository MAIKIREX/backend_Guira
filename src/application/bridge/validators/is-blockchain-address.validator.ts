import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Patrones de validación para direcciones de blockchain.
 *
 * Soporta:
 * - EVM (Ethereum, Polygon, Arbitrum, Base, etc.): 0x + 40 hex chars
 * - Solana: Base58, 32-44 chars
 * - Tron: T + 33 chars Base58
 * - Bitcoin (Legacy): 1 o 3 + 25-34 chars Base58
 * - Bitcoin (Bech32): bc1 + 39-59 chars alfanuméricos
 *
 * NOTA: Esta validación es de formato, no checksum. Bridge realizará
 * la validación definitiva al recibir la dirección.
 */
const BLOCKCHAIN_ADDRESS_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}> = [
  // EVM-compatible chains (Ethereum, Polygon, Arbitrum, Base, Optimism, Avalanche, BSC)
  { name: 'EVM', pattern: /^0x[0-9a-fA-F]{40}$/ },
  // Solana
  { name: 'Solana', pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
  // Tron
  { name: 'Tron', pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  // Bitcoin Legacy (P2PKH / P2SH)
  { name: 'Bitcoin Legacy', pattern: /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/ },
  // Bitcoin Bech32 (SegWit)
  { name: 'Bitcoin Bech32', pattern: /^bc1[0-9a-z]{39,59}$/ },
];

@ValidatorConstraint({ async: false })
export class IsBlockchainAddressConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return BLOCKCHAIN_ADDRESS_PATTERNS.some((p) => p.pattern.test(value));
  }

  defaultMessage(): string {
    const supported = BLOCKCHAIN_ADDRESS_PATTERNS.map((p) => p.name).join(
      ', ',
    );
    return `La dirección de wallet no tiene un formato válido. Formatos soportados: ${supported}.`;
  }
}

/**
 * Decorador para validar que un string sea una dirección de blockchain válida.
 *
 * Uso:
 * ```typescript
 * @IsBlockchainAddress()
 * destination_address?: string;
 * ```
 */
export function IsBlockchainAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsBlockchainAddressConstraint,
    });
  };
}
