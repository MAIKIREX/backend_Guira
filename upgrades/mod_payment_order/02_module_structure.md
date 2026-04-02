# Fase 2 — Módulo Payment Orders (NestJS)

> **Dependencia:** Requiere que `01_database_migration.md` esté completado  
> **Archivos nuevos:** 9 archivos en `src/application/payment-orders/`

---

## 2.1 Estructura del Módulo

```
src/application/payment-orders/
├── payment-orders.module.ts          # Módulo NestJS
├── payment-orders.controller.ts      # Endpoints usuario + admin
├── payment-orders.service.ts         # Orquestador principal
├── interbank.service.ts              # Lógica específica para flujos 1.x
├── wallet-ramp.service.ts            # Lógica específica para flujos 2.x
└── dto/
    ├── create-interbank-order.dto.ts # DTO para flujos interbancarios
    ├── create-wallet-ramp-order.dto.ts # DTO para flujos rampa
    ├── confirm-deposit.dto.ts        # DTO para confirmar depósito
    └── admin-order-action.dto.ts     # DTOs para acciones admin
```

---

## 2.2 DTOs — Definición Completa

### `create-interbank-order.dto.ts`

```typescript
import {
  IsNumber, IsString, IsNotEmpty, IsOptional, IsUUID,
  IsEnum, Min, MaxLength, ValidateIf,
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

  @ApiProperty({ example: 1000.00 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  // ── bolivia_to_world: destino es external_account ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bolivia_to_world')
  @IsUUID()
  external_account_id?: string;

  @ApiPropertyOptional({ example: 'usd' })
  @ValidateIf(o => ['bolivia_to_world', 'world_to_bolivia'].includes(o.flow_type))
  @IsString()
  destination_currency?: string;

  // ── wallet_to_wallet: direcciones crypto ad-hoc ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_address?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_network?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'wallet_to_wallet')
  @IsString()
  @IsNotEmpty()
  source_currency?: string;

  // ── destino crypto (wallet_to_wallet, bolivia_to_wallet) ──
  @ApiPropertyOptional()
  @ValidateIf(o => ['wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type))
  @IsString()
  @IsNotEmpty()
  destination_address?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => ['wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type))
  @IsString()
  @IsNotEmpty()
  destination_network?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => ['wallet_to_wallet', 'bolivia_to_wallet'].includes(o.flow_type))
  @IsString()
  destination_currency_crypto?: string;

  // ── world_to_bolivia: destino es cuenta boliviana ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_bank_name?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_account_number?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'world_to_bolivia')
  @IsString()
  @IsNotEmpty()
  destination_account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination_qr_url?: string;

  // ── world_to_wallet: VA existente ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'world_to_wallet')
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
```

### `create-wallet-ramp-order.dto.ts`

```typescript
import {
  IsNumber, IsString, IsNotEmpty, IsOptional, IsUUID,
  IsEnum, Min, MaxLength, ValidateIf,
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

  @ApiProperty({ example: 500.00 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  // ── wallet_id: requerido para todos los flujos rampa ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type !== 'fiat_us_to_bridge_wallet')
  @IsUUID()
  wallet_id?: string;

  // ── virtual_account_id: solo fiat_us_to_bridge_wallet ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'fiat_us_to_bridge_wallet')
  @IsUUID()
  virtual_account_id?: string;

  // ── destino crypto (bridge_wallet_to_crypto) ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  @IsNotEmpty()
  destination_address?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  @IsNotEmpty()
  destination_network?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_crypto')
  @IsString()
  destination_currency?: string;

  // ── destino fiat BO (bridge_wallet_to_fiat_bo) ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_bank_name?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_account_number?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_fiat_bo')
  @IsString()
  @IsNotEmpty()
  destination_account_holder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination_qr_url?: string;

  // ── destino fiat US (bridge_wallet_to_fiat_us) ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'bridge_wallet_to_fiat_us')
  @IsUUID()
  external_account_id?: string;

  // ── Campos comunes ──
  @ApiPropertyOptional()
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

  // ── crypto_to_bridge_wallet: origen crypto ──
  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'crypto_to_bridge_wallet')
  @IsString()
  @IsNotEmpty()
  source_network?: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.flow_type === 'crypto_to_bridge_wallet')
  @IsString()
  @IsNotEmpty()
  source_address?: string;
}
```

### `confirm-deposit.dto.ts`

```typescript
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmDepositDto {
  @ApiProperty({ description: 'URL del comprobante de depósito' })
  @IsString()
  @IsNotEmpty()
  deposit_proof_url: string;

  @ApiPropertyOptional({ description: 'Hash de transacción del depósito (si es crypto)' })
  @IsOptional()
  @IsString()
  tx_hash_source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
```

### `admin-order-action.dto.ts`

```typescript
import { IsString, IsNotEmpty, IsOptional, IsNumber, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveOrderDto {
  @ApiPropertyOptional({ example: 6.90 })
  @IsOptional()
  @IsNumber()
  exchange_rate_applied?: number;

  @ApiPropertyOptional({ example: 15.00 })
  @IsOptional()
  @IsNumber()
  fee_final?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class MarkSentDto {
  @ApiProperty({ description: 'Hash de transacción o referencia bancaria' })
  @IsString()
  @IsNotEmpty()
  tx_hash: string;

  @ApiPropertyOptional({ description: 'Referencia interna del PSAV' })
  @IsOptional()
  @IsString()
  provider_reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CompleteOrderDto {
  @ApiPropertyOptional({ description: 'URL del recibo/factura del PSAV' })
  @IsOptional()
  @IsString()
  receipt_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class FailOrderDto {
  @ApiProperty({ description: 'Motivo del fallo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  notify_user?: boolean;
}
```

---

## 2.3 PaymentOrdersService — Orquestador Principal

### Responsabilidades

| Método | Descripción | Invoca |
|--------|-------------|--------|
| `createInterbankOrder(userId, dto)` | Valida perfil y delega | `InterbankService` |
| `createWalletRampOrder(userId, dto)` | Valida perfil y delega | `WalletRampService` |
| `confirmDeposit(orderId, userId, dto)` | Actualiza estado | Directo a DB |
| `cancelOrder(orderId, userId)` | Cancela si está en `created` o `waiting_deposit` | Directo a DB |
| `getMyOrders(userId, filters)` | Lista paginada | Directo a DB |
| `getOrderDetail(orderId, userId)` | Detalle con joins | Directo a DB |
| `getExchangeRates()` | Tipos de cambio públicos | `ExchangeRatesService` |

### Lógica compartida

```typescript
// Método helper para validar perfil antes de crear cualquier orden
private async getVerifiedProfile(userId: string) {
  const { data: profile } = await this.supabase
    .from('profiles')
    .select('id, bridge_customer_id, onboarding_status, is_active, is_frozen')
    .eq('id', userId)
    .single();

  if (!profile) throw new NotFoundException('Perfil no encontrado');
  if (!profile.is_active) throw new ForbiddenException('Cuenta inactiva');
  if (profile.is_frozen) throw new ForbiddenException('Cuenta congelada');
  if (profile.onboarding_status !== 'approved')
    throw new ForbiddenException('KYC/KYB no aprobado');

  return profile;
}

// Método helper para rate limiting
private async checkRateLimit(userId: string) {
  const maxPerHour = await this.getSettingNumber('MAX_PAYMENT_ORDERS_PER_HOUR');
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { count } = await this.supabase
    .from('payment_orders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if ((count ?? 0) >= maxPerHour)
    throw new TooManyRequestsException('Límite de órdenes por hora excedido');
}
```

---

## 2.4 InterbankService — Flujos 1.x

### Método principal: `createOrder(userId, dto, profile)`

```
switch (dto.flow_type):
  case 'bolivia_to_world':
    → validateExternalAccount(dto.external_account_id)
    → calculateFee('interbank_bo_out', 'psav', amount)
    → getExchangeRate('BOB_USD')
    → getPsavAccount('bank_bo', 'BOB')
    → INSERT payment_order (status: 'created', requires_psav: true)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, psav_instructions, fee, exchange_rate }

  case 'wallet_to_wallet':
    → calculateFee('interbank_w2w', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → callBridgeTransferAPI(source, destination)
    → UPDATE bridge_transfer_id, bridge_source_deposit_instructions
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, bridge_deposit_instructions }

  case 'bolivia_to_wallet':
    → calculateFee('interbank_bo_wallet', 'psav', amount)
    → getExchangeRate('BOB_USD')
    → getPsavAccount('bank_bo', 'BOB')
    → INSERT payment_order (status: 'created', requires_psav: true)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, psav_instructions, fee, exchange_rate }

  case 'world_to_bolivia':
    → calculateFee('interbank_bo_in', 'psav', amount)
    → getExchangeRate('USD_BOB')
    → getPsavAccount('bank_us', 'USD')
    → INSERT payment_order (status: 'created', requires_psav: true)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, psav_instructions }

  case 'world_to_wallet':
    → validateVirtualAccount(dto.virtual_account_id)
    → calculateFee('ramp_on_fiat_us', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, va_deposit_instructions }
```

---

## 2.5 WalletRampService — Flujos 2.x

### Método principal: `createOrder(userId, dto, profile)`

```
switch (dto.flow_type):
  case 'fiat_bo_to_bridge_wallet':
    → validateWallet(dto.wallet_id)
    → calculateFee('ramp_on_bo', 'psav', amount)
    → getExchangeRate('BOB_USD')
    → getPsavAccount('bank_bo', 'BOB')
    → INSERT payment_order (status: 'created', requires_psav: true)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, psav_instructions }

  case 'crypto_to_bridge_wallet':
    → validateWallet(dto.wallet_id)
    → calculateFee('ramp_on_crypto', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → callBridgeTransferAPI(source_crypto, destination_wallet)
    → UPDATE bridge_transfer_id, status → 'waiting_deposit'
    → RETURN { order, bridge_deposit_instructions }

  case 'fiat_us_to_bridge_wallet':
    → validateVirtualAccount(dto.virtual_account_id)
    → calculateFee('ramp_on_fiat_us', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, va_deposit_instructions }

  case 'bridge_wallet_to_fiat_bo':
    → validateWallet(dto.wallet_id)
    → validateBalance(wallet, amount)
    → reserveBalance(userId, currency, amount + fee)
    → calculateFee('ramp_off_bo', 'psav', amount)
    → getExchangeRate('USDC_BOB')
    → getPsavAccount('crypto', 'USDC')
    → INSERT payment_order (status: 'created', requires_psav: true)
    → UPDATE status → 'waiting_deposit'
    → RETURN { order, psav_crypto_instructions }

  case 'bridge_wallet_to_crypto':
    → validateWallet(dto.wallet_id)
    → validateBalance(wallet, amount)
    → reserveBalance(userId, currency, amount + fee)
    → calculateFee('ramp_off_crypto', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → callBridgeTransferAPI(source_wallet, destination_crypto)
    → UPDATE bridge_transfer_id, status → 'processing'
    → createLedgerEntry(debit, pending)
    → RETURN { order }

  case 'bridge_wallet_to_fiat_us':
    → validateWallet(dto.wallet_id)
    → validateExternalAccount(dto.external_account_id)
    → validateBalance(wallet, amount)
    → reserveBalance(userId, currency, amount + fee)
    → calculateFee('ramp_off_fiat_us', 'bridge', amount)
    → INSERT payment_order (status: 'created', requires_psav: false)
    → callBridgeTransferAPI(source_wallet, destination_external_account)
    → UPDATE bridge_transfer_id, status → 'processing'
    → createLedgerEntry(debit, pending)
    → RETURN { order }
```

---

## 2.6 PaymentOrdersController — Endpoints

### Endpoints de Usuario

```typescript
@ApiTags('Payment Orders')
@ApiBearerAuth('supabase-jwt')
@Controller('payment-orders')
export class PaymentOrdersController {

  // POST /payment-orders/interbank
  @Post('interbank')
  createInterbankOrder(@CurrentUser() user, @Body() dto: CreateInterbankOrderDto)

  // POST /payment-orders/wallet-ramp
  @Post('wallet-ramp')
  createWalletRampOrder(@CurrentUser() user, @Body() dto: CreateWalletRampOrderDto)

  // GET /payment-orders
  @Get()
  listMyOrders(@CurrentUser() user, @Query() filters)

  // GET /payment-orders/:id
  @Get(':id')
  getOrderDetail(@CurrentUser() user, @Param('id') id)

  // POST /payment-orders/:id/confirm-deposit
  @Post(':id/confirm-deposit')
  confirmDeposit(@CurrentUser() user, @Param('id') id, @Body() dto: ConfirmDepositDto)

  // POST /payment-orders/:id/cancel
  @Post(':id/cancel')
  cancelOrder(@CurrentUser() user, @Param('id') id)

  // GET /payment-orders/exchange-rates
  @Get('exchange-rates')
  getExchangeRates()
}
```

### Endpoints Admin

```typescript
@ApiTags('Admin — Payment Orders')
@ApiBearerAuth('supabase-jwt')
@Controller('admin/payment-orders')
@UseGuards(RolesGuard)
export class AdminPaymentOrdersController {

  // GET /admin/payment-orders
  @Get()
  @Roles('staff', 'admin', 'super_admin')
  listAllOrders(@Query() filters)

  // GET /admin/payment-orders/:id
  @Get(':id')
  @Roles('staff', 'admin', 'super_admin')
  getOrderDetail(@Param('id') id)

  // POST /admin/payment-orders/:id/approve
  @Post(':id/approve')
  @Roles('staff', 'admin', 'super_admin')
  approveOrder(@CurrentUser() actor, @Param('id') id, @Body() dto: ApproveOrderDto)

  // POST /admin/payment-orders/:id/mark-sent
  @Post(':id/mark-sent')
  @Roles('staff', 'admin', 'super_admin')
  markSent(@CurrentUser() actor, @Param('id') id, @Body() dto: MarkSentDto)

  // POST /admin/payment-orders/:id/complete
  @Post(':id/complete')
  @Roles('staff', 'admin', 'super_admin')
  completeOrder(@CurrentUser() actor, @Param('id') id, @Body() dto: CompleteOrderDto)

  // POST /admin/payment-orders/:id/fail
  @Post(':id/fail')
  @Roles('staff', 'admin', 'super_admin')
  failOrder(@CurrentUser() actor, @Param('id') id, @Body() dto: FailOrderDto)
}
```

---

## 2.7 Module Registration

### `payment-orders.module.ts`

```typescript
@Module({
  imports: [],
  controllers: [
    PaymentOrdersController,
    AdminPaymentOrdersController,
  ],
  providers: [
    PaymentOrdersService,
    InterbankService,
    WalletRampService,
  ],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
```

### `app.module.ts` — Agregar import

```typescript
imports: [
  // ... existentes
  PaymentOrdersModule,
  PsavModule,
  ExchangeRatesModule,
]
```
