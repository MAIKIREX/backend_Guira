# FASE 1 — Auth e Identidad
> **Duración estimada:** 2-3 días  
> **Dependencias:** Fase 0 completada (Trigger de auto-perfil activo)  
> **Módulo NestJS:** `auth/` + refactor de `profiles/`

---

## Objetivo

Implementar el sistema completo de autenticación y gestión de identidad para todos los tipos de usuario: **client**, **staff**, **admin**, **super_admin**.

El frontend ya usa Supabase Auth directamente para el login. El backend valida el JWT en cada request y expone endpoints para gestión de perfil, onboarding status y control de cuentas por parte del staff.

---

## 📋 CHECKLIST DE ESTA FASE

### Auth Guards & Decorators (Core)
- [ ] F1.1 — Verificar que `JwtAuthGuard` extrae correctamente el JWT de Supabase
- [ ] F1.2 — Refactorizar `@CurrentUser()` para retornar `userId` + `role` del JWT
- [ ] F1.3 — Implementar `@Roles()` decorator con guard `RolesGuard`
- [ ] F1.4 — Crear middleware de rate limiting de auth (lectura from `auth_rate_limits`)

### Módulo Auth (Nuevo)
- [ ] F1.5 — `POST /auth/register` — crea usuario en Supabase Auth + valida email único
- [ ] F1.6 — `GET /auth/me` — retorna perfil + onboarding_status + role del usuario autenticado
- [ ] F1.7 — `POST /auth/refresh` — proxy a Supabase refresh token
- [ ] F1.8 — `POST /auth/logout` — invalida sesión en Supabase

### Módulo Profiles (Refactor)
- [ ] F1.9 — `GET /profiles/me` — perfil completo del usuario autenticado
- [ ] F1.10 — `PATCH /profiles/me` — actualiza campos básicos editables (phone, avatar_url)
- [ ] F1.11 — `GET /profiles/me/onboarding-status` — retorna estado KYC/KYB resumido
- [ ] F1.12 — `GET /admin/profiles` — lista todos los perfiles (solo Admin/Staff)
- [ ] F1.13 — `GET /admin/profiles/:id` — perfil completo de un usuario (Staff+)
- [ ] F1.14 — `PATCH /admin/profiles/:id/freeze` — congelar/descongelar cuenta (Admin)
- [ ] F1.15 — `PATCH /admin/profiles/:id/activate` — activar/desactivar cuenta (Admin)
- [ ] F1.16 — DTO de respuesta `ProfileResponseDto` con todos los campos relevantes

---

## 🏗️ ARQUITECTURA DE MÓDULOS

### Estructura de archivos

```
src/
├── core/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts       ← REFACTORIZAR (añadir extracción de role)
│   │   └── roles.guard.ts          ← NUEVO
│   └── decorators/
│       ├── current-user.decorator.ts   ← REFACTORIZAR
│       └── roles.decorator.ts          ← NUEVO
│
└── application/
    ├── auth/                           ← NUEVO MÓDULO
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   └── dto/
    │       ├── register.dto.ts
    │       └── auth-response.dto.ts
    │
    └── profiles/                       ← REFACTORIZAR
        ├── profiles.module.ts
        ├── profiles.controller.ts      ← añadir rutas admin
        ├── profiles.service.ts         ← completar lógica
        └── dto/
            ├── update-profile.dto.ts
            ├── profile-response.dto.ts
            └── freeze-account.dto.ts
```

---

## 🔑 ENDPOINTS DETALLADOS

### Auth Controller

```typescript
// POST /auth/register
// Body: { email, password, full_name }
// → Llama a supabase.auth.signUp()
// → Trigger de DB crea profiles automáticamente
// → Retorna: { user_id, email, onboarding_status: 'pending' }
// ⚠️ Nota: No crea nada en DB — el trigger AFTER INSERT ON auth.users lo hace

// GET /auth/me
// Header: Authorization: Bearer <JWT>
// → Extrae JWT, verifica con Supabase, retorna perfil desde profiles
// → Incluye: id, email, role, onboarding_status, bridge_customer_id, is_active, is_frozen
```

### Profiles Controller

```typescript
// GET /profiles/me
@Get('me')
@UseGuards(JwtAuthGuard)
async getMyProfile(@CurrentUser() user: AuthUser) {
  return this.profilesService.getProfile(user.id);
}

// PATCH /profiles/me
@Patch('me')
@UseGuards(JwtAuthGuard)
async updateMyProfile(
  @CurrentUser() user: AuthUser,
  @Body() dto: UpdateProfileDto
) {
  return this.profilesService.updateProfile(user.id, dto);
}

// PATCH /admin/profiles/:id/freeze
@Patch(':id/freeze')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
async freezeAccount(
  @Param('id') targetId: string,
  @Body() dto: FreezeAccountDto,
  @CurrentUser() actor: AuthUser
) {
  return this.profilesService.freezeAccount(targetId, dto.reason, actor.id);
}
```

---

## 📦 DTOs CLAVE

### RegisterDto
```typescript
export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  full_name: string;
}
```

### UpdateProfileDto
```typescript
export class UpdateProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsUrl()   avatar_url?: string;
}
```

### ProfileResponseDto
```typescript
export class ProfileResponseDto {
  id: string;
  email: string;
  full_name: string | null;
  role: 'client' | 'staff' | 'admin' | 'super_admin';
  onboarding_status: string;
  bridge_customer_id: string | null;
  is_active: boolean;
  is_frozen: boolean;
  frozen_reason: string | null;
  daily_limit_usd: number | null;
  monthly_limit_usd: number | null;
  created_at: string;
}
```

---

## 🔒 LÓGICA DE CONTROL DE ACCESO

```
ROLES:
  client      → solo ve sus propios datos
  staff       → ve datos de clientes, puede gestionar compliance
  admin       → puede congelar/desactivar cuentas, ajustar límites
  super_admin → acceso total, puede cambiar roles

REGLAS DE NEGOCIO auth:
  - Un `client` con is_frozen = true → todas sus operaciones retornan 403
  - Un `client` con is_active = false → no puede hacer login
  - Un `client` con onboarding_status != 'approved' → no puede hacer payouts ni virtual accounts
```

---

## 🚨 CASOS DE ERROR IMPORTANTES

| Escenario | HTTP | Mensaje |
|---|---|---|
| JWT inválido o expirado | 401 | "Token inválido o expirado" |
| Usuario no encontrado en profiles | 404 | "Perfil no encontrado" |
| Cuenta congelada intentando operar | 403 | "Cuenta congelada: {frozen_reason}" |
| Cuenta inactiva | 403 | "Cuenta inactiva" |
| Staff intentando acceso super_admin | 403 | "Permisos insuficientes" |

---

## 🔗 SIGUIENTE FASE

Con Auth + Profiles funcional → **[FASE 2: Onboarding KYC/KYB](./03_FASE_2_Onboarding_KYC_KYB.md)**
