# FASE 8 — Testing, Seguridad y Deployment
> **Duración estimada:** 3-5 días  
> **Dependencias:** Todas las fases anteriores  
> **Cobertura objetivo:** > 80% en servicios críticos (Bridge, Webhooks, Ledger)

---

## Objetivo

Garantizar que el backend es seguro, confiable y deployable en producción. Esta fase cubre las pruebas automatizadas, las validaciones de seguridad, y el pipeline de deployment.

---

## 📋 CHECKLIST DE ESTA FASE

### Testing
- [ ] F8.1 — Unit Tests: `FeesService.calculateFee()` — todos los casos (percent, fixed, mixed, override)
- [ ] F8.2 — Unit Tests: `WebhooksService.verifyBridgeSignature()` — válida e inválida
- [ ] F8.3 — Unit Tests: `WebhooksService.handleFundsReceived()` — happy path + VA no encontrada
- [ ] F8.4 — Unit Tests: `WebhooksService.handleTransferFailed()` — verifica liberación de reserved_amount
- [ ] F8.5 — Unit Tests: `ComplianceActionsService.approveReview()` — KYC y payout flows
- [ ] F8.6 — Unit Tests: `ReconciliationService.runReconciliation()` — detección de discrepancias
- [ ] F8.7 — Integration Tests: Registro → KYC → Approval → Wallet creada → Balance = 0
- [ ] F8.8 — Integration Tests: Deposit Webhook → Ledger entry → Balance actualizado
- [ ] F8.9 — Integration Tests: Payout → Reserve balance → Execute Bridge → Complete → Ledger
- [ ] F8.10 — E2E Test: Flow completo de onboarding KYC desde `/auth/register` hasta `onboarding_status = approved`

### Seguridad
- [ ] F8.11 — Rate limiting global: `@nestjs/throttler` — 100 req/min por IP
- [ ] F8.12 — Rate limiting específico: `/auth/register` — 5 req/15min por IP
- [ ] F8.13 — Rate limiting: `/webhooks/bridge` — 1000 req/min (Bridge puede enviar muchos)
- [ ] F8.14 — Helmet: configurar headers de seguridad en NestJS
- [ ] F8.15 — CORS: configurar dominios del frontend (producción + staging)
- [ ] F8.16 — Variable injection: asegurar que `app.bridgeApiKey` no se expone en logs
- [ ] F8.17 — Audit de Supabase: verificar que RLS es exhaustiva (usar `get_advisors`)
- [ ] F8.18 — Verificar que `service_role` key no está expuesta en respuestas HTTP
- [ ] F8.19 — Revisar que todos los endpoints protegidos con `@UseGuards(JwtAuthGuard)` no tienen bypasses

### Variables de Entorno (Producción)
- [ ] F8.20 — Documentar todas las env vars requeridas en `.env.example`
- [ ] F8.21 — Validar env vars al startup con `class-validator` en ConfigService

### Performance
- [ ] F8.22 — Verificar índices en Supabase para queries frecuentes:
  - `ledger_entries (wallet_id, created_at DESC)` para historiales
  - `webhook_events (status, received_at ASC)` para el CRON worker
  - `compliance_reviews (status, opened_at DESC)` para el dashboard admin
  - `notifications (user_id, is_read, created_at DESC)` para feeds
- [ ] F8.23 — Pagination en todos los endpoints de lista (no retornar resultados ilimitados)
- [ ] F8.24 — Conexiones paralelas: verificar que el CRON no tiene race conditions
  - Usar `FOR UPDATE SKIP LOCKED` si se escala a múltiples instancias

### Deployment
- [ ] F8.25 — Crear `Dockerfile` optimizado (multi-stage build)
- [ ] F8.26 — Crear `docker-compose.yml` para desarrollo local
- [ ] F8.27 — Configurar Railway / Render / Fly.io para producción
- [ ] F8.28 — Health check endpoint: `GET /health` — retorna status de DB y servicios
- [ ] F8.29 — Graceful shutdown: asegurar que el CRON termina su iteración antes de apagar

---

## 🔒 VALIDACIÓN DE SEGURIDAD — CHECKLIST OWASP

### A01: Broken Access Control
```
✅ JwtAuthGuard en todos los endpoints protegidos
✅ RolesGuard para endpoints Admin/Staff
✅ RLS en todas las tablas de Supabase
✅ Usuario solo puede acceder a sus propios recursos (user_id checks)
✅ Compliance reviews: solo Staff puede ver datos de otros clientes
```

### A02: Cryptographic Failures
```
✅ Firma HMAC-SHA256 para webhooks de Bridge
✅ Supabase maneja passwords con bcrypt
✅ Signed URLs para documentos KYC (expiración en 1h)
✅ JWT con expiración configurada
✅ Variabled secretas NUNCA en logs
```

### A03: Injection
```
✅ @supabase/supabase-js usa prepared statements internamente
✅ class-validator en todos los DTOs
✅ No se construyen queries SQL con concatenación de strings
```

### A07: Authentication Failures
```
✅ Rate limiting en endpoints de auth
✅ auth_rate_limits en DB para control manual
✅ Tokens expirados → 401 (JwtAuthGuard)
✅ Log de accesos fallidos en audit_logs
```

---

## 🧪 CONFIGURACIÓN DE TESTING

### Estructura de Tests

```
src/
├── application/
│   ├── bridge/
│   │   ├── bridge.service.spec.ts          ← Unit
│   │   └── bridge-api.client.spec.ts       ← Unit (mock fetch)
│   ├── webhooks/
│   │   ├── webhooks.service.spec.ts        ← Unit
│   │   └── handlers/
│   │       ├── funds-received.handler.spec.ts
│   │       └── transfer-failed.handler.spec.ts
│   ├── fees/
│   │   └── fees.service.spec.ts            ← Unit (crítico)
│   └── compliance/
│       └── compliance-actions.service.spec.ts
│
└── test/
    ├── setup.ts                            ← Config global de pruebas
    ├── auth.e2e-spec.ts                    ← E2E: Register → Login
    ├── onboarding.e2e-spec.ts              ← E2E: KYC flow
    └── payout.e2e-spec.ts                  ← E2E: Payout completo
```

### Mock de Supabase para Unit Tests

```typescript
// test/mocks/supabase.mock.ts
export const createSupabaseMock = () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
});
```

### Ejemplo de Test Crítico: calculateFee

```typescript
describe('FeesService', () => {
  it('should apply client VIP override over global fee', async () => {
    // Setup mock: override del 0.1% en lugar del 1% global
    mockSupabase.from('customer_fee_overrides').select().returns({
      data: { fee_type: 'percent', fee_percent: 0.1, min_fee: 1 },
    });

    const result = await feesService.calculateFee(userId, 'payout', 'wire', 1000);

    expect(result.fee_amount).toBe(1.00);  // 0.1% pero mínimo $1
    expect(result.net_amount).toBe(999.00);
  });

  it('should use global fee when no override exists', async () => {
    mockSupabase.from('customer_fee_overrides').select().returns({ data: null });
    mockSupabase.from('fees_config').select().returns({
      data: { fee_type: 'percent', fee_percent: 1.0, min_fee: 5 }
    });

    const result = await feesService.calculateFee(userId, 'payout', 'wire', 1000);

    expect(result.fee_amount).toBe(10.00);  // 1%
    expect(result.net_amount).toBe(990.00);
  });
});
```

---

## 🐳 DOCKERFILE

```dockerfile
# Multi-stage build para optimizar imagen
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

---

## 🏥 HEALTH CHECK ENDPOINT

```typescript
@Get('health')
async healthCheck(): Promise<object> {
  // Verificar DB
  const { error } = await this.supabase
    .from('app_settings').select('key').limit(1);

  return {
    status: error ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    services: {
      database: error ? 'unreachable' : 'connected',
      bridge_api: this.config.get('app.bridgeApiKey') ? 'configured' : 'not_configured',
    },
  };
}
```

---

## 📊 ÍNDICES RECOMENDADOS EN SUPABASE

```sql
-- Performance crítico
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_date
  ON ledger_entries(wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_status_date
  ON webhook_events(status, received_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_compliance_reviews_status
  ON compliance_reviews(status, opened_at DESC)
  WHERE status NOT IN ('closed', 'escalated');

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user
  ON payout_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_user
  ON bridge_transfers(user_id, created_at DESC);
```

---

## ✅ DEFINICIÓN DE "PRODUCTION READY"

El backend está listo para producción cuando:

- [ ] Todos los endpoints críticos tienen cobertura de tests > 80%
- [ ] Ningún secreto (BRIDGE_API_KEY, SUPABASE_KEY) aparece en logs
- [ ] RLS habilitada y auditada en todas las tablas con datos de usuarios
- [ ] Health check responde < 200ms
- [ ] Webhook Sink procesa 50 eventos en < 5 segundos
- [ ] FeesService calcula correctamente para todos los tipos de tarifas
- [ ] Audit logs registran todas las mutaciones del Staff
- [ ] Rate limiting funciona (429 después del límite)
- [ ] Dockerfile construye sin errores y la app arranca en < 10 segundos

---

## 📅 ESTIMACIÓN TOTAL DEL PROYECTO

| Fase | Días estimados |
|---|---|
| Fase 0 — DB Triggers + Seed | 1-2 |
| Fase 1 — Auth e Identidad | 2-3 |
| Fase 2 — Onboarding KYC/KYB | 4-5 |
| Fase 3 — Core Financiero | 3-4 |
| Fase 4 — Bridge Integración | 5-6 |
| Fase 5 — Webhooks Worker | 3-4 |
| Fase 6 — Compliance Admin | 3-4 |
| Fase 7 — Notificaciones y Soporte | 2-3 |
| **Fase 8 — Testing y Deploy** | **3-5** |
| **TOTAL** | **~30-38 días** ≈ **6-8 semanas** |

> ⚠️ Estimaciones para un desarrollador solo. Con 2 devs paralelos → 4-5 semanas.
