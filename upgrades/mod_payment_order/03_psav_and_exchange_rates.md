# Fase 3 — Módulos Auxiliares: PSAV y Exchange Rates

> **Dependencia:** Requiere que `01_database_migration.md` esté completado  
> **Estos módulos se consumen por:** `InterbankService`, `WalletRampService`, `AdminPaymentOrdersController`

---

## 3.1 PsavModule

### Estructura

```
src/application/psav/
├── psav.module.ts
├── psav.service.ts
└── dto/
    └── psav-account.dto.ts
```

### `psav-account.dto.ts`

```typescript
import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PsavAccountType {
  BANK_BO = 'bank_bo',
  BANK_US = 'bank_us',
  CRYPTO = 'crypto',
}

export class CreatePsavAccountDto {
  @ApiProperty({ example: 'PSAV Bolivia - BNB' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: PsavAccountType })
  @IsEnum(PsavAccountType)
  type: PsavAccountType;

  @ApiProperty({ example: 'BOB' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'Banco Nacional de Bolivia' })
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  account_number?: string;

  @ApiPropertyOptional({ example: 'PSAV Trading SRL' })
  @IsOptional()
  @IsString()
  account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qr_url?: string;

  @ApiPropertyOptional({ example: '0xABC...' })
  @IsOptional()
  @IsString()
  crypto_address?: string;

  @ApiPropertyOptional({ example: 'ethereum' })
  @IsOptional()
  @IsString()
  crypto_network?: string;
}

export class UpdatePsavAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  account_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qr_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crypto_address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crypto_network?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
```

### `psav.service.ts`

| Método | Descripción | Acceso |
|--------|-------------|--------|
| `getDepositAccount(type, currency)` | Retorna cuenta PSAV activa para el tipo y moneda. Se usa internamente cuando se crea una orden PSAV. | Interno |
| `listAccounts()` | Lista todas las cuentas PSAV (activas e inactivas). Para panel admin. | Admin |
| `createAccount(dto)` | Crea una nueva cuenta PSAV. | Admin |
| `updateAccount(id, dto)` | Actualiza datos de una cuenta PSAV. | Admin |
| `deactivateAccount(id)` | Marca como inactiva. | Admin |

```typescript
@Injectable()
export class PsavService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /** Obtiene la cuenta PSAV activa para un tipo y moneda específicos.
   *  Se llama internamente al crear una orden que requiere PSAV.
   *  Ejemplo: getDepositAccount('bank_bo', 'BOB') → datos QR/banco del PSAV en Bolivia
   */
  async getDepositAccount(type: string, currency: string) {
    const { data, error } = await this.supabase
      .from('psav_accounts')
      .select('*')
      .eq('type', type)
      .eq('currency', currency.toUpperCase())
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data)
      throw new NotFoundException(
        `No hay cuenta PSAV activa para ${type}/${currency}`,
      );

    return data;
  }

  /** Formatea las instrucciones de depósito que se muestran al usuario */
  formatDepositInstructions(account: any): Record<string, any> {
    if (account.type === 'crypto') {
      return {
        type: 'crypto',
        address: account.crypto_address,
        network: account.crypto_network,
        currency: account.currency,
        label: account.name,
      };
    }

    return {
      type: 'bank',
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_holder: account.account_holder,
      qr_url: account.qr_url,
      currency: account.currency,
      label: account.name,
    };
  }

  async listAccounts() { /* SELECT * FROM psav_accounts ORDER BY ... */ }
  async createAccount(dto: CreatePsavAccountDto) { /* INSERT INTO psav_accounts */ }
  async updateAccount(id: string, dto: UpdatePsavAccountDto) { /* UPDATE psav_accounts */ }
  async deactivateAccount(id: string) { /* UPDATE is_active = false */ }
}
```

### `psav.module.ts`

```typescript
@Module({
  providers: [PsavService],
  exports: [PsavService],
})
export class PsavModule {}
```

### Controller Admin (dentro del `AdminPaymentOrdersController` o separado)

```typescript
// GET /admin/psav-accounts
@Get()
@Roles('staff', 'admin', 'super_admin')
listAccounts()

// POST /admin/psav-accounts
@Post()
@Roles('admin', 'super_admin')
createAccount(@Body() dto: CreatePsavAccountDto)

// PUT /admin/psav-accounts/:id
@Put(':id')
@Roles('admin', 'super_admin')
updateAccount(@Param('id') id, @Body() dto: UpdatePsavAccountDto)

// DELETE /admin/psav-accounts/:id
@Delete(':id')
@Roles('admin', 'super_admin')
deactivateAccount(@Param('id') id)
```

---

## 3.2 ExchangeRatesModule

### Estructura

```
src/application/exchange-rates/
├── exchange-rates.module.ts
├── exchange-rates.service.ts
└── dto/
    └── update-rate.dto.ts
```

### `update-rate.dto.ts`

```typescript
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRateDto {
  @ApiProperty({ example: 6.90 })
  @IsNumber()
  @Min(0.0001)
  rate: number;

  @ApiPropertyOptional({ example: 1.50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  spread_percent?: number;
}
```

### `exchange-rates.service.ts`

| Método | Descripción | Acceso |
|--------|-------------|--------|
| `getRate(pair)` | Obtiene tipo de cambio para un par (ej: 'BOB_USD'). Aplica spread. | Público/Interno |
| `getAllRates()` | Lista todos los pares con sus tipos de cambio. | Público |
| `updateRate(pair, dto, actorId)` | Actualiza tipo de cambio. Genera audit_log. | Admin |
| `convertAmount(amount, fromCurrency, toCurrency)` | Convierte un monto usando el tipo de cambio vigente. Helper que usa `getRate`. | Interno |

```typescript
@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Obtiene el tipo de cambio para un par, aplicando el spread.
   * Ejemplo: getRate('BOB_USD')
   *   → rate: 0.1449, spread: 1.5%
   *   → effectiveRate = 0.1449 * (1 - 0.015) = 0.14273
   *
   * El spread se aplica SIEMPRE en contra del usuario (a favor de la plataforma):
   *   - Para compra (BOB → USD): el usuario recibe menos USD
   *   - Para venta (USD → BOB): el usuario recibe menos BOB
   */
  async getRate(pair: string) {
    const { data, error } = await this.supabase
      .from('exchange_rates_config')
      .select('*')
      .eq('pair', pair.toUpperCase())
      .single();

    if (error || !data)
      throw new NotFoundException(`Tipo de cambio no configurado para ${pair}`);

    const spreadMultiplier = 1 - (parseFloat(data.spread_percent ?? '0') / 100);
    const effectiveRate = parseFloat(data.rate) * spreadMultiplier;

    return {
      pair: data.pair,
      base_rate: parseFloat(data.rate),
      spread_percent: parseFloat(data.spread_percent ?? '0'),
      effective_rate: effectiveRate,
      updated_at: data.updated_at,
    };
  }

  /** Convierte un monto aplicando tipo de cambio con spread */
  async convertAmount(amount: number, fromCurrency: string, toCurrency: string) {
    const pair = `${fromCurrency}_${toCurrency}`.toUpperCase();
    const rateData = await this.getRate(pair);
    const converted = amount * rateData.effective_rate;

    return {
      original_amount: amount,
      original_currency: fromCurrency,
      converted_amount: parseFloat(converted.toFixed(2)),
      destination_currency: toCurrency,
      rate_applied: rateData.effective_rate,
      base_rate: rateData.base_rate,
      spread_percent: rateData.spread_percent,
    };
  }

  async getAllRates() {
    const { data } = await this.supabase
      .from('exchange_rates_config')
      .select('*')
      .order('pair');
    return data;
  }

  async updateRate(pair: string, dto: UpdateRateDto, actorId: string) {
    const old = await this.getRate(pair);

    const { data, error } = await this.supabase
      .from('exchange_rates_config')
      .update({
        rate: dto.rate,
        spread_percent: dto.spread_percent ?? old.spread_percent,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('pair', pair.toUpperCase())
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Audit log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      action: 'UPDATE_EXCHANGE_RATE',
      table_name: 'exchange_rates_config',
      previous_values: { rate: old.base_rate, spread: old.spread_percent },
      new_values: { rate: dto.rate, spread: dto.spread_percent, pair },
      source: 'admin_panel',
    });

    return data;
  }
}
```

### Controller endpoints

```typescript
// ── Público ──
// GET /payment-orders/exchange-rates → ya incluido en PaymentOrdersController

// ── Admin ──
// GET /admin/exchange-rates
@Get()
@Roles('admin', 'super_admin')
getAllRates()

// PUT /admin/exchange-rates/:pair
@Put(':pair')
@Roles('admin', 'super_admin')
updateRate(@Param('pair') pair, @Body() dto: UpdateRateDto, @CurrentUser() actor)
```

### `exchange-rates.module.ts`

```typescript
@Module({
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
```

---

## 3.3 Dependencias entre Módulos

```
PaymentOrdersModule
  ├── imports: [PsavModule, ExchangeRatesModule]
  ├── uses: FeesService (del módulo existente FeesModule)
  ├── uses: BridgeService (del módulo existente BridgeModule)
  └── uses: LedgerService (del módulo existente LedgerModule)

PsavModule
  └── standalone (no depende de otros módulos)

ExchangeRatesModule
  └── standalone (no depende de otros módulos)
```

> **Importante:** Los módulos `FeesModule`, `BridgeModule` y `LedgerModule` ya existen. `PaymentOrdersModule` debe importarlos o inyectar sus servicios vía el inyector global.
