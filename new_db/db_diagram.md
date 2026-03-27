# Diagrama ER — Guira New DB

> 37 tablas · 5 dominios · PostgreSQL vía Supabase

```mermaid
erDiagram

    %% ─── DOMINIO 1: IDENTIDAD Y AUTENTICACIÓN ───────────────────────
    AUTH_USERS {
        uuid id PK
        text email
        timestamptz created_at
    }

    profiles {
        uuid id PK
        text email
        text full_name
        text role
        text onboarding_status
        text bridge_customer_id
        boolean is_active
        boolean is_frozen
        text frozen_reason
        timestamptz frozen_at
        numeric daily_limit_usd
        numeric monthly_limit_usd
        text phone
        text avatar_url
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    auth_rate_limits {
        uuid id PK
        text identifier
        text identifier_type
        text action
        int attempt_count
        timestamptz first_attempt_at
        timestamptz blocked_until
        timestamptz last_attempt_at
    }

    %% ─── DOMINIO 2: ONBOARDING Y COMPLIANCE ─────────────────────────
    people {
        uuid id PK
        uuid user_id FK
        text first_name
        text last_name
        date date_of_birth
        text nationality
        text country_of_residence
        text tax_id
        text id_type
        text id_number
        date id_expiry_date
        text email
        text phone
        text address1
        text address2
        text city
        text state
        text postal_code
        text country
        text source_of_funds
        text account_purpose
        boolean is_pep
        timestamptz created_at
        timestamptz updated_at
    }

    businesses {
        uuid id PK
        uuid user_id FK
        text legal_name
        text trade_name
        text registration_number
        text tax_id
        text entity_type
        date incorporation_date
        text country_of_incorporation
        text state_of_incorporation
        text[] operating_countries
        text website
        text email
        text phone
        text address1
        text address2
        text city
        text state
        text postal_code
        text country
        text business_description
        text business_industry
        text account_purpose
        text source_of_funds
        boolean conducts_money_services
        boolean uses_bridge_for_money_services
        text compliance_explanation
        timestamptz created_at
        timestamptz updated_at
    }

    business_directors {
        uuid id PK
        uuid business_id FK
        text first_name
        text last_name
        text position
        boolean is_signer
        date date_of_birth
        text nationality
        text country_of_residence
        text id_type
        text id_number
        date id_expiry_date
        text email
        text phone
        text address1
        text city
        text country
        uuid document_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    business_ubos {
        uuid id PK
        uuid business_id FK
        text first_name
        text last_name
        date date_of_birth
        text nationality
        text country_of_residence
        numeric ownership_percent
        text id_type
        text id_number
        date id_expiry_date
        text tax_id
        text email
        text phone
        text address1
        text address2
        text city
        text state
        text postal_code
        text country
        boolean is_pep
        uuid document_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    kyc_applications {
        uuid id PK
        uuid user_id FK
        uuid person_id FK
        text status
        text provider
        text provider_id
        jsonb screening
        timestamptz last_screened_at
        timestamptz tos_accepted_at
        text tos_contract_id
        text source
        text observations
        timestamptz submitted_at
        timestamptz approved_at
        timestamptz created_at
        timestamptz updated_at
    }

    kyb_applications {
        uuid id PK
        uuid business_id FK
        uuid requester_user_id FK
        text status
        text provider
        text provider_id
        jsonb screening
        timestamptz last_screened_at
        timestamptz tos_accepted_at
        text tos_contract_id
        text source
        text observations
        boolean directors_complete
        boolean ubos_complete
        boolean documents_complete
        timestamptz submitted_at
        timestamptz approved_at
        timestamptz created_at
        timestamptz updated_at
    }

    documents {
        uuid id PK
        uuid user_id FK
        text subject_type
        uuid subject_id
        text document_type
        text description
        text storage_path
        text file_name
        text mime_type
        bigint file_size_bytes
        text status
        text rejection_reason
        timestamptz created_at
        timestamptz updated_at
    }

    suppliers {
        uuid id PK
        uuid user_id FK
        text name
        text country
        text currency
        text payment_rail
        jsonb bank_details
        text contact_email
        boolean is_verified
        boolean is_active
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    transaction_limits {
        uuid id PK
        uuid user_id FK
        text tier
        numeric daily_deposit_limit
        numeric daily_payout_limit
        numeric weekly_deposit_limit
        numeric weekly_payout_limit
        numeric monthly_deposit_limit
        numeric monthly_payout_limit
        numeric single_txn_limit
        numeric single_txn_above_review
        uuid applied_by FK
        text reason
        timestamptz effective_from
        timestamptz created_at
        timestamptz updated_at
    }

    compliance_reviews {
        uuid id PK
        text subject_type
        uuid subject_id
        uuid assigned_to FK
        text status
        text priority
        date due_date
        timestamptz opened_at
        timestamptz closed_at
    }

    compliance_review_comments {
        uuid id PK
        uuid review_id FK
        uuid author_id FK
        text body
        boolean is_internal
        timestamptz created_at
    }

    compliance_review_events {
        uuid id PK
        uuid review_id FK
        uuid actor_id FK
        text decision
        text reason
        jsonb metadata
        timestamptz created_at
    }

    %% ─── DOMINIO 3: CORE FINANCIERO ──────────────────────────────────
    wallets {
        uuid id PK
        uuid user_id FK
        text currency
        text address
        text network
        text provider_key
        text provider_wallet_id
        text label
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    balances {
        uuid id PK
        uuid user_id FK
        text currency
        numeric amount
        numeric pending_amount
        numeric reserved_amount
        numeric available_amount
        timestamptz created_at
        timestamptz updated_at
    }

    ledger_entries {
        uuid id PK
        uuid wallet_id FK
        text type
        numeric amount
        text currency
        text status
        text reference_type
        uuid reference_id
        uuid bridge_transfer_id FK
        text description
        jsonb metadata
        timestamptz created_at
    }

    payin_routes {
        uuid id PK
        text name
        text payment_rail
        text currency
        boolean is_active
        numeric min_amount
        numeric max_amount
        boolean requires_review
        text fee_type
        numeric fee_value
        text description
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    payment_orders {
        uuid id PK
        uuid user_id FK
        uuid wallet_id FK
        uuid payin_route_id FK
        text source_type
        text source_reference_id
        numeric amount
        numeric fee_amount
        numeric net_amount
        text currency
        text source_currency
        text sender_name
        text sender_bank_name
        text deposit_message
        numeric exchange_rate
        numeric exchange_fee
        text status
        text bridge_event_id
        text notes
        timestamptz completed_at
        timestamptz created_at
    }

    payout_requests {
        uuid id PK
        uuid user_id FK
        uuid wallet_id FK
        uuid bridge_external_account_id FK
        uuid supplier_id FK
        text payment_rail
        numeric amount
        numeric fee_amount
        numeric net_amount
        text currency
        text status
        text idempotency_key
        uuid bridge_transfer_id FK
        text business_purpose
        text notes
        boolean documents_required
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    fees_config {
        uuid id PK
        text operation_type
        text payment_rail
        text currency
        text fee_type
        numeric fee_percent
        numeric fee_fixed
        numeric min_fee
        numeric max_fee
        boolean is_active
        text description
        timestamptz updated_at
    }

    customer_fee_overrides {
        uuid id PK
        uuid user_id FK
        text operation_type
        text payment_rail
        text currency
        text fee_type
        numeric fee_percent
        numeric fee_fixed
        numeric min_fee
        numeric max_fee
        boolean is_active
        date valid_from
        date valid_until
        text notes
        uuid created_by FK
        timestamptz created_at
    }

    certificates {
        uuid id PK
        uuid user_id FK
        text subject_type
        uuid subject_id
        text certificate_number
        text pdf_storage_path
        text content_hash
        numeric amount
        text currency
        timestamptz issued_at
        jsonb metadata
    }

    reconciliation_runs {
        uuid id PK
        uuid initiated_by FK
        text run_type
        text status
        int users_checked
        text[] currencies_checked
        int discrepancies_found
        jsonb discrepancies_detail
        boolean auto_corrected
        jsonb auto_corrections_detail
        boolean requires_manual_review
        text error_message
        timestamptz started_at
        timestamptz completed_at
        int duration_ms
    }

    %% ─── DOMINIO 4: INTEGRACIÓN BRIDGE ───────────────────────────────
    bridge_virtual_accounts {
        uuid id PK
        uuid user_id FK
        text bridge_virtual_account_id
        text bridge_customer_id
        text source_currency
        text destination_currency
        text destination_payment_rail
        text destination_address
        uuid destination_wallet_id FK
        text destination_external_account_id
        text bank_name
        text bank_address
        text beneficiary_name
        text beneficiary_address
        text routing_number
        text account_number
        text iban
        text clabe
        text br_code
        text sort_code
        text[] payment_rails
        numeric developer_fee_percent
        text status
        timestamptz deactivated_at
        timestamptz created_at
    }

    bridge_virtual_account_events {
        uuid id PK
        text bridge_event_id
        text bridge_virtual_account_id
        text event_type
        numeric amount
        text currency
        text sender_name
        text sender_reference
        jsonb raw_payload
        timestamptz processed_at
        timestamptz created_at
    }

    bridge_external_accounts {
        uuid id PK
        uuid user_id FK
        text bridge_external_account_id
        text bridge_customer_id
        text bank_name
        text account_name
        text account_last_4
        text currency
        text payment_rail
        text account_type
        text routing_number
        text iban
        text swift_bic
        text country
        boolean is_active
        boolean is_default
        timestamptz verified_at
        timestamptz created_at
    }

    bridge_transfers {
        uuid id PK
        uuid user_id FK
        uuid payout_request_id FK
        text bridge_transfer_id
        text idempotency_key
        text transfer_kind
        text business_purpose
        text source_payment_rail
        text source_currency
        text source_type
        text source_id
        text destination_payment_rail
        text destination_currency
        text destination_type
        text destination_id
        numeric amount
        numeric developer_fee_amount
        numeric developer_fee_percent
        numeric net_amount
        text bridge_state
        text status
        jsonb source_deposit_instructions
        text deposit_message
        numeric receipt_initial_amount
        numeric receipt_exchange_fee
        numeric receipt_developer_fee
        numeric receipt_final_amount
        text destination_tx_hash
        numeric exchange_rate
        timestamptz exchange_rate_at
        jsonb bridge_raw_response
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    bridge_liquidation_addresses {
        uuid id PK
        uuid user_id FK
        text bridge_liquidation_address_id
        text bridge_customer_id
        text chain
        text currency
        text address
        text destination_payment_rail
        text destination_currency
        text destination_external_account_id
        numeric developer_fee_percent
        boolean is_active
        timestamptz created_at
    }

    bridge_kyc_links {
        uuid id PK
        uuid user_id FK
        uuid kyc_application_id FK
        text bridge_kyc_link_id
        text link_url
        text type
        text status
        text bridge_customer_id
        timestamptz expires_at
        timestamptz completed_at
        timestamptz approved_at
        text rejection_reason
        timestamptz created_at
        timestamptz updated_at
    }

    bridge_pull_jobs {
        uuid id PK
        uuid initiated_by FK
        text job_type
        uuid target_user_id FK
        timestamptz date_range_from
        timestamptz date_range_to
        text status
        int records_checked
        int gaps_found
        jsonb gaps_detail
        jsonb actions_taken
        text error_message
        timestamptz started_at
        timestamptz completed_at
    }

    webhook_events {
        uuid id PK
        text provider
        text event_type
        text provider_event_id
        jsonb raw_payload
        jsonb headers
        boolean signature_verified
        text status
        int retry_count
        text last_error
        text bridge_api_version
        timestamptz received_at
        timestamptz processing_started_at
        timestamptz processed_at
    }

    %% ─── DOMINIO 5: SISTEMA Y OBSERVABILIDAD ─────────────────────────
    audit_logs {
        uuid id PK
        uuid performed_by FK
        text role
        text action
        text table_name
        uuid record_id
        text[] affected_fields
        jsonb previous_values
        jsonb new_values
        text reason
        text source
        text ip_address
        timestamptz created_at
    }

    activity_logs {
        uuid id PK
        uuid user_id FK
        text action
        text description
        jsonb metadata
        timestamptz created_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        text type
        text title
        text message
        text link
        text reference_type
        uuid reference_id
        boolean is_read
        timestamptz created_at
        timestamptz read_at
    }

    support_tickets {
        uuid id PK
        uuid user_id FK
        uuid assigned_to FK
        text subject
        text message
        text contact_email
        text contact_phone
        text reference_type
        uuid reference_id
        text priority
        text status
        text resolution_notes
        timestamptz created_at
        timestamptz updated_at
        timestamptz resolved_at
    }

    app_settings {
        text key PK
        text value
        text type
        text description
        boolean is_public
        uuid updated_by FK
        timestamptz updated_at
    }

    %% ─── RELACIONES ──────────────────────────────────────────────────

    %% Identidad
    AUTH_USERS ||--|| profiles : "triggers"

    %% profiles → todo
    profiles ||--o| people : "user_id"
    profiles ||--o{ businesses : "user_id"
    profiles ||--o{ kyc_applications : "user_id"
    profiles ||--o{ kyb_applications : "requester_user_id"
    profiles ||--o{ wallets : "user_id"
    profiles ||--o{ balances : "user_id"
    profiles ||--o{ payin_routes : "user_id (via payment_orders)"
    profiles ||--o{ payment_orders : "user_id"
    profiles ||--o{ payout_requests : "user_id"
    profiles ||--o{ customer_fee_overrides : "user_id"
    profiles ||--o{ customer_fee_overrides : "created_by"
    profiles ||--o{ bridge_virtual_accounts : "user_id"
    profiles ||--o{ bridge_external_accounts : "user_id"
    profiles ||--o{ bridge_transfers : "user_id"
    profiles ||--o{ bridge_liquidation_addresses : "user_id"
    profiles ||--o{ bridge_kyc_links : "user_id"
    profiles ||--o{ suppliers : "user_id"
    profiles ||--o{ transaction_limits : "user_id"
    profiles ||--o{ transaction_limits : "applied_by"
    profiles ||--o{ documents : "user_id"
    profiles ||--o{ compliance_reviews : "assigned_to"
    profiles ||--o{ compliance_review_comments : "author_id"
    profiles ||--o{ compliance_review_events : "actor_id"
    profiles ||--o{ reconciliation_runs : "initiated_by"
    profiles ||--o{ bridge_pull_jobs : "initiated_by"
    profiles ||--o{ bridge_pull_jobs : "target_user_id"
    profiles ||--o{ certificates : "user_id"
    profiles ||--o{ activity_logs : "user_id"
    profiles ||--o{ notifications : "user_id"
    profiles ||--o{ support_tickets : "user_id"
    profiles ||--o{ support_tickets : "assigned_to"
    profiles ||--o{ audit_logs : "performed_by"
    profiles ||--o| app_settings : "updated_by"

    %% Onboarding & Compliance
    people ||--o{ kyc_applications : "person_id"

    businesses ||--o{ business_directors : "business_id"
    businesses ||--o{ business_ubos : "business_id"
    businesses ||--o{ kyb_applications : "business_id"

    documents ||--o| business_directors : "document_id"
    documents ||--o| business_ubos : "document_id"

    compliance_reviews ||--o{ compliance_review_comments : "review_id"
    compliance_reviews ||--o{ compliance_review_events : "review_id"

    kyc_applications ||--o{ bridge_kyc_links : "kyc_application_id"

    %% Core Financiero
    wallets ||--o{ ledger_entries : "wallet_id"
    wallets ||--o{ payment_orders : "wallet_id"
    wallets ||--o{ payout_requests : "wallet_id"
    wallets ||--o| bridge_virtual_accounts : "destination_wallet_id"

    payin_routes ||--o{ payment_orders : "payin_route_id"

    bridge_transfers ||--o{ ledger_entries : "bridge_transfer_id"
    bridge_transfers ||--o{ payout_requests : "bridge_transfer_id"

    ledger_entries ||--o{ certificates : "subject_id (subject_type=bridge_transfer)"

    %% Integración Bridge
    bridge_virtual_accounts ||--o{ bridge_virtual_account_events : "bridge_virtual_account_id"
    bridge_virtual_accounts ||--o{ payment_orders : "source_reference_id"

    bridge_external_accounts ||--o{ payout_requests : "bridge_external_account_id"

    payout_requests ||--o{ bridge_transfers : "payout_request_id"

    suppliers ||--o{ payout_requests : "supplier_id"
```

---

## Leyenda de Dominios

| Color (conceptual) | Dominio | Tablas |
|---|---|---|
| 🔵 Azul | Identidad y Auth | `profiles`, `auth_rate_limits` |
| 🟣 Morado | Onboarding y Compliance | `people`, `businesses`, `business_directors`, `business_ubos`, `kyc_applications`, `kyb_applications`, `documents`, `suppliers`, `transaction_limits`, `compliance_reviews`, `compliance_review_comments`, `compliance_review_events` |
| 🟢 Verde | Core Financiero | `wallets`, `balances`, `ledger_entries`, `payin_routes`, `payment_orders`, `payout_requests`, `fees_config`, `customer_fee_overrides`, `certificates`, `reconciliation_runs` |
| 🟠 Naranja | Integración Bridge | `bridge_virtual_accounts`, `bridge_virtual_account_events`, `bridge_external_accounts`, `bridge_transfers`, `bridge_liquidation_addresses`, `bridge_kyc_links`, `bridge_pull_jobs`, `webhook_events` |
| ⚪ Gris | Sistema y Observabilidad | `audit_logs`, `activity_logs`, `notifications`, `support_tickets`, `app_settings` |

---

## Columnas Agregadas vs Versión Anterior

| Tabla | Columnas nuevas añadidas |
|---|---|
| `profiles` | `frozen_at`, `phone`, `avatar_url`, `metadata`, `updated_at` |
| `auth_rate_limits` | `first_attempt_at`, `last_attempt_at` (renombrado `window_start`) |
| `people` | `country_of_residence`, `tax_id`, `id_expiry_date`, `address2`, `state`, `postal_code`, `account_purpose`, `updated_at` |
| `businesses` | `registration_number`, `state_of_incorporation`, `operating_countries`, `website`, `address2`, `state`, `postal_code`, `business_description`, `uses_bridge_for_money_services`, `compliance_explanation`, `updated_at` |
| `business_directors` | `position`, `is_signer`, `date_of_birth`, `country_of_residence`, `id_expiry_date`, `email`, `phone`, `document_id`, `updated_at` (renombrado `title`→`position`, eliminado `is_control_prong`) |
| `business_ubos` | `date_of_birth`, `country_of_residence`, `id_expiry_date`, `tax_id`, `email`, `phone`, `address2`, `state`, `postal_code`, `document_id`, `updated_at` (renombrado `ownership_percentage`→`ownership_percent`) |
| `kyc_applications` | `provider`, `provider_id`, `screening`, `last_screened_at`, `tos_accepted_at`, `tos_contract_id`, `source`, `observations`, `updated_at` (eliminados `bridge_kyc_id`, `rejection_reasons`) |
| `kyb_applications` | `provider`, `provider_id`, `screening`, `last_screened_at`, `tos_accepted_at`, `tos_contract_id`, `source`, `observations`, `directors_complete`, `ubos_complete`, `documents_complete`, `updated_at` (renombrado `user_id`→`requester_user_id`, eliminados `bridge_kyb_id`, `rejection_reasons`) |
| `documents` | `description`, `storage_path`, `mime_type`, `file_size_bytes`, `rejection_reason`, `updated_at` (renombrado `doc_type`→`document_type`, `file_url`→`storage_path`) |
| `suppliers` | `payment_rail`, `bank_details`, `contact_email`, `is_verified`, `is_active`, `notes`, `updated_at` (reemplazó columnas bancarias individuales por `bank_details jsonb`) |
| `transaction_limits` | `daily_deposit_limit`, `daily_payout_limit`, `weekly_deposit_limit`, `weekly_payout_limit`, `monthly_deposit_limit`, `monthly_payout_limit`, `single_txn_limit`, `single_txn_above_review`, `applied_by`, `reason`, `effective_from`, `updated_at` (reemplazó columnas anteriores) |
| `compliance_reviews` | `subject_type`, `subject_id`, `priority`, `due_date`, `opened_at`, `closed_at` (eliminados `user_id`, `kyc_application_id`, `kyb_application_id`, `entity_type`, `assigned_to`→FK de profiles, `resolved_at`) |
| `compliance_review_comments` | `body` (renombrado `content`→`body`) |
| `compliance_review_events` | `decision` (renombrado `event_type`→`decision`, eliminado `reason` era nullable→NOT NULL) |
| `wallets` | `currency`, `provider_key`, `provider_wallet_id`, `label`, `updated_at` (eliminado `provider`, renombrado columnas) |
| `balances` | `pending_amount`, `available_amount` (renombrados), `created_at`, `updated_at` |
| `ledger_entries` | `wallet_id`, `reference_type`, `reference_id`, `bridge_transfer_id`, `metadata` (reorganizadas) |
| `payin_routes` | `name`, `payment_rail`, `min_amount`, `max_amount`, `requires_review`, `fee_type`, `fee_value`, `description`, `metadata`, `updated_at` (antes solo tenía 5 columnas) |
| `payment_orders` | `wallet_id`, `payin_route_id`, `source_type`, `source_reference_id`, `fee_amount`, `net_amount`, `source_currency`, `sender_bank_name`, `deposit_message`, `exchange_fee`, `bridge_event_id`, `notes`, `completed_at` (renombradas y extendidas) |
| `payout_requests` | `wallet_id`, `supplier_id`, `payment_rail`, `fee_amount`, `net_amount`, `idempotency_key`, `bridge_transfer_id`, `business_purpose`, `notes`, `documents_required`, `completed_at`, `updated_at` |
| `fees_config` | `operation_type`, `payment_rail`, `currency`, `fee_percent`, `fee_fixed`, `description` (renombradas columnas) |
| `customer_fee_overrides` | `operation_type`, `payment_rail`, `currency`, `fee_percent`, `fee_fixed`, `min_fee`, `max_fee`, `is_active`, `valid_from`, `valid_until`, `notes`, `created_by` |
| `certificates` | `subject_type`, `subject_id`, `certificate_number`, `pdf_storage_path`, `content_hash`, `amount`, `currency`, `metadata` (reemplazadas columnas anteriores) |
| `reconciliation_runs` | `initiated_by`, `run_type`, `users_checked`, `currencies_checked`, `auto_corrected`, `auto_corrections_detail`, `requires_manual_review`, `error_message`, `duration_ms` |
| `bridge_virtual_accounts` | `bridge_virtual_account_id`, `bridge_customer_id`, `source_currency`, `destination_currency`, `destination_payment_rail`, `destination_address`, `destination_wallet_id`, `bank_address`, `beneficiary_name`, `beneficiary_address`, `sort_code`, `payment_rails`, `developer_fee_percent`, `deactivated_at` |
| `bridge_virtual_account_events` | `bridge_event_id`, `bridge_virtual_account_id`, `sender_name`, `sender_reference`, `raw_payload`, `processed_at` |
| `bridge_external_accounts` | `bridge_external_account_id`, `bridge_customer_id`, `account_name`, `account_last_4`, `payment_rail`, `swift_bic`, `is_active`, `is_default`, `verified_at` |
| `bridge_transfers` | `transfer_kind`, `business_purpose`, `source_payment_rail`, `source_currency`, `source_type`, `source_id`, `destination_payment_rail`, `destination_currency`, `destination_type`, `destination_id`, `developer_fee_amount`, `developer_fee_percent`, `net_amount`, `bridge_state`, `source_deposit_instructions`, `deposit_message`, `receipt_*`, `exchange_rate`, `exchange_rate_at`, `bridge_raw_response`, `updated_at` |
| `bridge_liquidation_addresses` | `bridge_liquidation_address_id`, `bridge_customer_id`, `chain`, `destination_payment_rail`, `destination_currency`, `destination_external_account_id`, `developer_fee_percent` |
| `bridge_kyc_links` | `kyc_application_id`, `bridge_kyc_link_id`, `link_url`, `bridge_customer_id`, `approved_at`, `rejection_reason`, `updated_at` (renombrados `bridge_link_id`→`bridge_kyc_link_id`, `url`→`link_url`, `kyc_type`→`type`) |
| `bridge_pull_jobs` | `initiated_by`, `job_type`, `target_user_id`, `date_range_from`, `date_range_to`, `records_checked`, `gaps_found`, `gaps_detail`, `actions_taken`, `completed_at` |
| `webhook_events` | `provider`, `provider_event_id`, `raw_payload`, `headers`, `signature_verified`, `last_error`, `bridge_api_version`, `processing_started_at` (renombradas columnas) |
| `audit_logs` | `performed_by`, `role`, `table_name`, `record_id`, `affected_fields`, `previous_values`, `new_values`, `reason`, `source` (reorganizadas vs versión anterior) |
| `notifications` | `message`, `link`, `reference_type`, `reference_id` (renombrado `body`→`message`, extendidas) |
| `support_tickets` | `message`, `contact_email`, `contact_phone`, `reference_type`, `reference_id`, `resolution_notes`, `updated_at` |
| `app_settings` | `type`, `is_public`, `updated_by` (PK ahora es `key` en lugar de `uuid id`) |
