# Resumen Ejecutivo y Endpoints Clave

## Checklist Rápido KYC (Personas)
1. `POST /auth/register`
2. Login (Supabase SDK)
3. `POST /onboarding/kyc/person` 
4. `POST /onboarding/kyc/application`
5. `POST /onboarding/documents/upload` 
6. `POST /onboarding/kyc/tos-accept`
7. `PATCH /onboarding/kyc/application/submit`

## Checklist Rápido KYB (Empresas)
1. `POST /auth/register`
2. Login (Supabase SDK)
3. `POST /onboarding/kyb/business`
4. `POST /onboarding/kyb/business/directors`
5. `POST /onboarding/kyb/business/ubos` (Opcional, según participación)
6. `POST /onboarding/kyb/application`
7. `POST /onboarding/documents/upload` (Acta Constitutiva y Constancia Fiscal)
8. `POST /onboarding/kyb/tos-accept`
9. `PATCH /onboarding/kyb/application/submit`

---

## Tipos de Documentos Permitidos
### Personas (KYC)
- `passport`
- `drivers_license`
- `national_id` (DNI, INE, etc.)

### Empresas (KYB)
- `incorporation_certificate` (Acta constitutiva)
- `tax_registration` (Constancia fiscal / RFC)
- `bank_statement` (Estado de cuenta)

---

## Monitoreo y Consultas Post-Onboarding

Endpoints útiles para la aplicación móvil / web:

- `GET /auth/me` (**El más importante**: contiene el `onboarding_status` y el `bridge_customer_id` de forma consolidada).
- `GET /onboarding/kyc/application`
- `GET /onboarding/kyb/application`
- `GET /wallets` (Solo dará respuesta exitosa una vez finalizado el onboarding).
- `GET /wallets/balances`

---

## Límites Transaccionales
Los límites de depósitos y retiros son personalizables e hidratados por el equipo administrativo pero parten de una base que evalúa Bridge. Los campos relevantes del perfil son:
- `daily_limit_usd`
- `monthly_limit_usd`
- `daily_deposit_limit`
- `daily_payout_limit`
- `single_txn_limit`

> [!TIP]
> Cualquier actualización a los límites debe pasar por el endpoint de Admin `POST /admin/users/{id}/limits`.
