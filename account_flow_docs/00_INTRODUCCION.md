# Guía de Alta de Cuenta en Guira

> **Versión:** 1.0.0
> **Generado desde:** backend_Guira (NestJS + Supabase)
> **Fecha:** 2026-03-29
> **Base URL:** `https://api.guira.app/v1`

Esta documentación describe paso a paso el flujo completo para dar de alta una cuenta en la plataforma Guira, desde el registro inicial hasta la activación de la wallet con acceso al sistema de pagos internacionales.

---

## 🚀 Flujos Disponibles

1. **[Alta Persona Natural (KYC)](./01_FLUJO_KYC_PERSONA_NATURAL.md)**
   - Para usuarios individuales que desean operar en Guira por cuenta propia.
2. **[Alta Empresa (KYB)](./02_FLUJO_KYB_EMPRESA.md)**
   - Para empresas o negocios que operarán en la plataforma. Incluye directores y beneficiarios finales (UBOs).

---

## 🚦 Estados de Onboarding

El campo `onboarding_status` en el perfil del usuario refleja la etapa en que se encuentra el proceso de registro:

| Estado | Descripción |
| :--- | :--- |
| `pending` | Cuenta creada, aún no ha iniciado el proceso de verificación. |
| `kyc_started` | El usuario inició el proceso KYC (aplicación creada). |
| `kyb_started` | La empresa inició el proceso KYB (aplicación creada). |
| `in_review` | El expediente fue enviado y está siendo revisado por el equipo de compliance. |
| `approved` | Cuenta aprobada. Se generó el `bridge_customer_id` y la wallet está activa. |
| `rejected` | El expediente fue rechazado. El usuario recibirá notificación con la razón. |
| `needs_review` | El equipo de compliance solicitó correcciones en el expediente. |

---

## 🔐 Autenticación

- **Tipo:** Bearer Token (JWT Supabase)
- **Header:** `Authorization: Bearer <access_token>`

> [!IMPORTANT]
> Todos los endpoints (excepto `/auth/register` y `/auth/refresh`) requieren el token de acceso obtenido al iniciar sesión.

---

## ✅ Precondiciones Globales

- El usuario debe tener **18 años o más**.
- Los documentos de identidad deben ser en formato **PDF, JPG o PNG**.
- El tamaño máximo por documento es **10 MB**.
- El correo electrónico **no puede estar previamente registrado** en la plataforma.
