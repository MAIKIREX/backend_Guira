# Flujo 03: Compliance y Sistema de Revisiones

Este documento describe cómo el Staff procesa y audita solicitudes de cumplimiento legal (KYC/KYB y transacciones de alto riesgo) con trazabilidad completa e inmutable.

---

## ⚖️ ¿Qué es el Sistema de Compliance Reviews?

A diferencia de un simple campo `status` mutable, el sistema de revisiones produce un **expediente legal completo** por cada decisión de cumplimiento. Esto permite:

- Demostrar a reguladores (FinCEN, OFAC, AML) quién aprobó qué y cuándo.
- Generar reportes de auditoría interna con historial de comentarios.
- Proteger a la empresa de disputas con clientes rechazados.

---

## 🗂️ Objetos Sujetos a Revisión

El campo `subject_type` en `compliance_reviews` puede apuntar a:

| `subject_type` | `subject_id` apunta a | Cuándo se crea |
|---|---|---|
| `kyc_application` | `kyc_applications.id` | Al enviar expediente KYC de persona natural |
| `kyb_application` | `kyb_applications.id` | Al enviar expediente KYB de empresa |
| `payout_request` | `payout_requests.id` | Para retiros que superan el umbral de `PAYOUT_REVIEW_THRESHOLD` |
| `bridge_transfer` | `bridge_transfers.id` | Para transferencias de alto riesgo |

---

## 🔄 Ciclo de Vida de una Revisión KYC

```
[Trigger Automático] → kyc_applications.status cambia a 'SUBMITTED'
    │
    └── INSERT INTO compliance_reviews (
            subject_type = 'kyc_application',
            subject_id   = kyc_applications.id,
            status       = 'open',
            assigned_to  = NULL
        )

[Staff] → Abre el caso desde el backoffice
    └── UPDATE compliance_reviews SET status = 'in_progress', assigned_to = staff_user_id

[Staff] → Revisa people, documents adjuntos, screening OFAC
    ├── INSERT INTO compliance_review_comments (
    │       review_id, author_id = staff_user_id,
    │       body = "El pasaporte está vencido. Fecha: 2023-12-01. Solicitar documento vigente."
    │   )
    │
    └── (si pide correcciones)
            ├── INSERT INTO compliance_review_events (
            │       review_id, actor_id = staff_user_id,
            │       decision = 'NEEDS_CHANGES',
            │       reason = "Documento de identidad vencido"
            │   )
            ├── UPDATE compliance_reviews SET status = 'needs_changes'
            └── UPDATE kyc_applications SET status = 'NEEDS_CHANGES', observations = "..."
                    └── INSERT INTO notifications (cliente: "Tu expediente necesita correcciones")

[Cliente] → Corrige, sube nuevo documento, reenvía
    └── UPDATE kyc_applications SET status = 'SUBMITTED'
            └── (ciclo vuelve a empezar)

[Staff] → Todo en orden → Decisión final APPROVED
    ├── INSERT INTO compliance_review_events (
    │       decision = 'APPROVED',
    │       reason = "Documento válido. Pasaporte vigente hasta 2032. OFAC: sin coincidencias."
    │   )
    ├── UPDATE compliance_reviews SET status = 'closed', closed_at = NOW()
    ├── UPDATE kyc_applications SET status = 'APPROVED', approved_at = NOW()
    ├── UPDATE profiles SET onboarding_status = 'verified'
    └── [Backend] → Bridge API: crea Customer con datos de people
            └── UPDATE profiles SET bridge_customer_id = 'cust_bridge_xxx'
```

---

## 🏢 Ciclo de Vida de una Revisión KYB

```
[Trigger Automático] → kyb_applications.status cambia a 'SUBMITTED'
    │
    └── INSERT INTO compliance_reviews (
            subject_type = 'kyb_application',
            subject_id   = kyb_applications.id,
            status = 'open', priority = 'normal'
        )

[Staff] → Revisa:
    ├── businesses (razón social, tax_id, directors, ubos, source_of_funds)
    ├── business_directors (identidades y roles de cada director)
    ├── business_ubos (% de propiedad, identificaciones)
    └── documents adjuntos (acta constitutiva, IDs de directores/UBOs, comprobantes)

[Si todo ok] → APPROVED:
    ├── UPDATE kyb_applications SET status = 'APPROVED', provider_id = 'cust_bridge_xxx'
    ├── UPDATE profiles SET onboarding_status = 'verified'
    └── [Sistema activa] → wallets + balances del cliente creados automáticamente
```

---

## 🔐 Inmutabilidad de Decisiones

La tabla `compliance_review_events` **nunca permite UPDATE ni DELETE** (enforced via RLS + triggers). Cada decisión es un registro permanente. Si se necesita revertir una decisión, se crea un nuevo evento con la decisión contraria, dejando el historial completo intacto.

---

## 📊 Estados de una Revisión

```
open → in_progress → NEEDS_CHANGES → (cliente corrige) → in_progress
                  └→ APPROVED → closed
                  └→ REJECTED → closed
```

Estados de `kyc_applications` y `kyb_applications`:
```
DRAFT → SUBMITTED → IN_REVIEW → APPROVED
                 ↘            → NEEDS_CHANGES → (corrección) → SUBMITTED
                              → REJECTED
                              → NEEDS_BRIDGE_KYC_LINK
```

---

## 🛡️ Integración con Audit Logs

Cualquier cambio hecho por Staff en tablas sensibles desde el backoffice **genera automáticamente** una fila en `audit_logs`:

```
UPDATE kyc_applications SET status = 'APPROVED'
    └── Trigger: INSERT INTO audit_logs (
            performed_by = staff_user_id,
            role = 'staff',
            action = 'APPROVE_KYC',
            table_name = 'kyc_applications',
            record_id = kyc_applications.id,
            previous_values = { "status": "IN_REVIEW" },
            new_values = { "status": "APPROVED" },
            reason = "Aprobado por compliance_review_event: evt_xxx",
            source = 'admin_panel'
        )
```

Esto garantiza que **ningún admin pueda alterar datos sensibles sin dejar huella**.
