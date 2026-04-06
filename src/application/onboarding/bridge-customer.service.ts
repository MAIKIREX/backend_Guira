import {
  Injectable,
  Inject,
  BadGatewayException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { BridgeApiClient } from '../bridge/bridge-api.client';

/**
 * Servicio interno para registrar clientes en Bridge API tras la aprobación de KYC/KYB.
 * Este servicio NO se expone directamente a clientes — es llamado por ComplianceActionsService
 * o por un admin tras aprobar un compliance_review.
 *
 * Usa BridgeApiClient centralizado para todas las llamadas HTTP a Bridge.
 *
 * AUDIT FIX (2025-04-05):
 *  H01 – signed_agreement_id se lee de kyc_applications/kyb_applications y se incluye en payload
 *  H02 – identifying_information[] se construye como array de objetos con imágenes base64
 *  H03 – associated_persons[] (directors + UBOs) se incluye en payload KYB
 *  H04 – documents[] se descarga de Storage y se convierten a base64 para Bridge
 *  H05 – country ISO alpha-2 → alpha-3 convertido en todos los campos de dirección
 *  H06 – campo renombrado: address → residential_address (KYC), registered_address (KYB)
 *  H07 – business_name → business_legal_name
 *  H08 – doing_business_as_name → business_trade_name
 *  H09 – nationality también convertido a alpha-3
 *  H14 – state → subdivision en objetos address
 */
@Injectable()
export class BridgeCustomerService {
  private readonly logger = new Logger(BridgeCustomerService.name);

  /** Mapa ISO 3166-1 alpha-2 → alpha-3. Cubre los países relevantes para Guira. */
  private static readonly ALPHA2_TO_ALPHA3: Record<string, string> = {
    AD: 'AND', AE: 'ARE', AF: 'AFG', AG: 'ATG', AI: 'AIA', AL: 'ALB',
    AM: 'ARM', AO: 'AGO', AQ: 'ATA', AR: 'ARG', AS: 'ASM', AT: 'AUT',
    AU: 'AUS', AW: 'ABW', AX: 'ALA', AZ: 'AZE', BA: 'BIH', BB: 'BRB',
    BD: 'BGD', BE: 'BEL', BF: 'BFA', BG: 'BGR', BH: 'BHR', BI: 'BDI',
    BJ: 'BEN', BL: 'BLM', BM: 'BMU', BN: 'BRN', BO: 'BOL', BQ: 'BES',
    BR: 'BRA', BS: 'BHS', BT: 'BTN', BV: 'BVT', BW: 'BWA', BY: 'BLR',
    BZ: 'BLZ', CA: 'CAN', CC: 'CCK', CD: 'COD', CF: 'CAF', CG: 'COG',
    CH: 'CHE', CI: 'CIV', CK: 'COK', CL: 'CHL', CM: 'CMR', CN: 'CHN',
    CO: 'COL', CR: 'CRI', CU: 'CUB', CV: 'CPV', CW: 'CUW', CX: 'CXR',
    CY: 'CYP', CZ: 'CZE', DE: 'DEU', DJ: 'DJI', DK: 'DNK', DM: 'DMA',
    DO: 'DOM', DZ: 'DZA', EC: 'ECU', EE: 'EST', EG: 'EGY', EH: 'ESH',
    ER: 'ERI', ES: 'ESP', ET: 'ETH', FI: 'FIN', FJ: 'FJI', FK: 'FLK',
    FM: 'FSM', FO: 'FRO', FR: 'FRA', GA: 'GAB', GB: 'GBR', GD: 'GRD',
    GE: 'GEO', GF: 'GUF', GG: 'GGY', GH: 'GHA', GI: 'GIB', GL: 'GRL',
    GM: 'GMB', GN: 'GIN', GP: 'GLP', GQ: 'GNQ', GR: 'GRC', GS: 'SGS',
    GT: 'GTM', GU: 'GUM', GW: 'GNB', GY: 'GUY', HK: 'HKG', HM: 'HMD',
    HN: 'HND', HR: 'HRV', HT: 'HTI', HU: 'HUN', ID: 'IDN', IE: 'IRL',
    IL: 'ISR', IM: 'IMN', IN: 'IND', IO: 'IOT', IQ: 'IRQ', IR: 'IRN',
    IS: 'ISL', IT: 'ITA', JE: 'JEY', JM: 'JAM', JO: 'JOR', JP: 'JPN',
    KE: 'KEN', KG: 'KGZ', KH: 'KHM', KI: 'KIR', KM: 'COM', KN: 'KNA',
    KP: 'PRK', KR: 'KOR', KW: 'KWT', KY: 'CYM', KZ: 'KAZ', LA: 'LAO',
    LB: 'LBN', LC: 'LCA', LI: 'LIE', LK: 'LKA', LR: 'LBR', LS: 'LSO',
    LT: 'LTU', LU: 'LUX', LV: 'LVA', LY: 'LBY', MA: 'MAR', MC: 'MCO',
    MD: 'MDA', ME: 'MNE', MF: 'MAF', MG: 'MDG', MH: 'MHL', MK: 'MKD',
    ML: 'MLI', MM: 'MMR', MN: 'MNG', MO: 'MAC', MP: 'MNP', MQ: 'MTQ',
    MR: 'MRT', MS: 'MSR', MT: 'MLT', MU: 'MUS', MV: 'MDV', MW: 'MWI',
    MX: 'MEX', MY: 'MYS', MZ: 'MOZ', NA: 'NAM', NC: 'NCL', NE: 'NER',
    NF: 'NFK', NG: 'NGA', NI: 'NIC', NL: 'NLD', NO: 'NOR', NP: 'NPL',
    NR: 'NRU', NU: 'NIU', NZ: 'NZL', OM: 'OMN', PA: 'PAN', PE: 'PER',
    PF: 'PYF', PG: 'PNG', PH: 'PHL', PK: 'PAK', PL: 'POL', PM: 'SPM',
    PN: 'PCN', PR: 'PRI', PS: 'PSE', PT: 'PRT', PW: 'PLW', PY: 'PRY',
    QA: 'QAT', RE: 'REU', RO: 'ROU', RS: 'SRB', RU: 'RUS', RW: 'RWA',
    SA: 'SAU', SB: 'SLB', SC: 'SYC', SD: 'SDN', SE: 'SWE', SG: 'SGP',
    SH: 'SHN', SI: 'SVN', SJ: 'SJM', SK: 'SVK', SL: 'SLE', SM: 'SMR',
    SN: 'SEN', SO: 'SOM', SR: 'SUR', SS: 'SSD', ST: 'STP', SV: 'SLV',
    SX: 'SXM', SY: 'SYR', SZ: 'SWZ', TC: 'TCA', TD: 'TCD', TF: 'ATF',
    TG: 'TGO', TH: 'THA', TJ: 'TJK', TK: 'TKL', TL: 'TLS', TM: 'TKM',
    TN: 'TUN', TO: 'TON', TR: 'TUR', TT: 'TTO', TV: 'TUV', TW: 'TWN',
    TZ: 'TZA', UA: 'UKR', UG: 'UGA', UM: 'UMI', US: 'USA', UY: 'URY',
    UZ: 'UZB', VA: 'VAT', VC: 'VCT', VE: 'VEN', VG: 'VGB', VI: 'VIR',
    VN: 'VNM', VU: 'VUT', WF: 'WLF', WS: 'WSM', YE: 'YEM', YT: 'MYT',
    ZA: 'ZAF', ZM: 'ZMB', ZW: 'ZWE',
  };

  /** Mapa de document_type interno → purposes de Bridge. */
  private static readonly DOC_TYPE_TO_BRIDGE_PURPOSE: Record<string, string> = {
    passport:              'government_id',
    national_id_front:     'government_id',
    national_id_back:      'government_id',
    drivers_license:       'government_id',
    proof_of_address:      'proof_of_address',
    utility_bill:          'proof_of_address',
    bank_statement:        'proof_of_address',
    selfie:                'selfie',
    source_of_funds:       'source_of_funds_proof',
    business_formation:    'business_formation',
    ownership_information: 'ownership_information',
    operating_agreement:   'operating_agreement',
    tax_certificate:       'tax_certificate',
  };

  /** Mapa de entity_type interno → business_type de Bridge. */
  private static readonly ENTITY_TYPE_TO_BRIDGE: Record<string, string> = {
    LLC:         'llc',
    Corp:        'corporation',
    Corporation: 'corporation',
    SA:          'corporation',
    SAS:         'corporation',
    SRL:         'llc',
    Partnership: 'partnership',
    SoleProprietor: 'sole_prop',
    Trust:       'trust',
    Cooperative: 'cooperative',
    Other:       'other',
  };

  private static readonly STORAGE_BUCKET = 'kyc-documents';

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly bridgeApiClient: BridgeApiClient,
  ) {}

  /**
   * Registra un usuario como Customer en Bridge API.
   * Construye el payload desde people (KYC) o businesses (KYB).
   * Retorna el bridge_customer_id asignado.
   */
  async registerCustomerInBridge(userId: string): Promise<string> {
    if (!this.bridgeApiClient.isConfigured) {
      this.logger.warn('BRIDGE_API_KEY no configurada — registro Bridge omitido');
      return 'bridge_pending_api_key';
    }

    // 1. Obtener datos del usuario
    const { data: profile, error: profileErr } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      throw new NotFoundException(`Perfil ${userId} no encontrado`);
    }

    // Idempotente: si ya tiene bridge_customer_id, retornar
    if (profile.bridge_customer_id) {
      return profile.bridge_customer_id;
    }

    // 2. Determinar tipo de cliente (persona o empresa)
    const { data: person } = await this.supabase
      .from('people')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: business } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let customerPayload: Record<string, unknown>;

    if (person) {
      // Obtener signed_agreement_id desde la kyc_application más reciente (H01)
      const { data: kycApp } = await this.supabase
        .from('kyc_applications')
        .select('tos_contract_id, id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      customerPayload = await this.buildIndividualPayload(
        person,
        profile,
        userId,
        kycApp?.tos_contract_id ?? null,
      );
    } else if (business) {
      // Obtener signed_agreement_id desde la kyb_application más reciente (H01)
      const { data: kybApp } = await this.supabase
        .from('kyb_applications')
        .select('tos_contract_id, id')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      customerPayload = await this.buildBusinessPayload(
        business,
        profile,
        userId,
        kybApp?.tos_contract_id ?? null,
      );
    } else {
      throw new NotFoundException(
        'No se encontraron datos personales ni de empresa para este usuario',
      );
    }

    // 3. Llamar Bridge API usando BridgeApiClient centralizado
    const idempotencyKey = `register-customer-${userId}`;
    let bridgeCustomer: Record<string, unknown>;

    try {
      bridgeCustomer = await this.bridgeApiClient.post<Record<string, unknown>>(
        '/v0/customers',
        customerPayload,
        idempotencyKey,
      );
    } catch (err) {
      await this.logActivity(
        userId,
        'BRIDGE_CUSTOMER_REGISTRATION_FAILED',
        `Bridge rechazó registro: ${(err as Error).message}`,
      );
      throw err;
    }

    const customerId = bridgeCustomer.id as string;
    if (!customerId) {
      throw new BadGatewayException(
        'Bridge no retornó un customer_id válido',
      );
    }

    // 4. Guardar bridge_customer_id en profiles
    await this.supabase
      .from('profiles')
      .update({
        bridge_customer_id: customerId,
        onboarding_status: 'approved',
      })
      .eq('id', userId);

    // 5. Inicializar wallet y balance para el usuario
    await this.initializeWallet(userId);

    // 6. Log de éxito
    await this.logActivity(
      userId,
      'BRIDGE_CUSTOMER_REGISTERED',
      `Customer registrado en Bridge: ${customerId}`,
    );

    this.logger.log(
      `Bridge customer ${customerId} creado para usuario ${userId}`,
    );

    return customerId;
  }

  // ───────────────────────────────────────
  //  Payload Builders — alineados con Bridge API
  // ───────────────────────────────────────

  /**
   * Construye el payload para un customer individual (KYC).
   * Campos alineados con Bridge API POST /v0/customers.
   *
   * Correcciones aplicadas:
   *  H01 – signed_agreement_id incluido
   *  H02 – identifying_information[] construido como array de objetos
   *  H04 – documents[] construido como array con base64
   *  H05 – country convertido a ISO alpha-3
   *  H06 – residential_address (no address)
   *  H09 – nationality convertido a ISO alpha-3
   *  H14 – subdivision (no state)
   *  P1  – employment_status y expected_monthly_payments_usd incluidos
   */
  private async buildIndividualPayload(
    person: Record<string, unknown>,
    profile: Record<string, unknown>,
    userId: string,
    tosContractId: string | null,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      type: 'individual',
      first_name: person.first_name,
      last_name: person.last_name,
      email: (person.email as string) ?? (profile.email as string),
      birth_date: person.date_of_birth,           // Bridge key: birth_date (not date_of_birth)
      phone: person.phone ?? undefined,
      residential_address: this.buildAddress({    // H06: residential_address
        address1: person.address1 as string,
        address2: person.address2 as string | undefined,
        city: person.city as string,
        state: person.state as string | undefined,
        postal_code: person.postal_code as string | undefined,
        country: person.country as string,
      }),
    };

    // Tax ID
    if (person.tax_id) {
      payload.tax_identification_number = person.tax_id;
    }

    // Nationality — H05/H09: convert to alpha-3
    if (person.nationality) {
      payload.nationality = this.toAlpha3(person.nationality as string);
    }

    // Signed Agreement (ToS) — H01
    if (tosContractId) {
      payload.signed_agreement_id = tosContractId;
    }

    // Identifying information [] — H02
    const identifyingInfo = this.buildIdentifyingInformation(person, person.country as string);
    if (identifyingInfo.length > 0) {
      payload.identifying_information = identifyingInfo;
    }

    // Documents [] — H04
    const documents = await this.buildDocumentsArray(userId, 'person');
    if (documents.length > 0) {
      payload.documents = documents;
    }

    // P1: High-risk / enhanced due diligence fields
    if (person.employment_status) {
      payload.employment_status = person.employment_status;
    }
    if (person.expected_monthly_payments_usd) {
      payload.expected_monthly_payments_usd = person.expected_monthly_payments_usd;
    }

    return payload;
  }

  /**
   * Construye el payload para un customer business (KYB).
   * Campos alineados con Bridge API POST /v0/customers.
   *
   * Correcciones aplicadas:
   *  H01 – signed_agreement_id incluido
   *  H03 – associated_persons[] construido desde business_directors + business_ubos
   *  H04 – documents[] construido como array con base64
   *  H05 – country convertido a ISO alpha-3
   *  H06 – registered_address (no address)
   *  H07 – business_legal_name (no business_name)
   *  H08 – business_trade_name (no doing_business_as_name)
   *  H11 – business_type mapeado desde entity_type interno a enum de Bridge
   *  H14 – subdivision (no state)
   *  P1  – estimated_annual_revenue_usd y high_risk_activities incluidos
   *  P2  – physical_address incluida desde columnas physical_address*
   */
  private async buildBusinessPayload(
    business: Record<string, unknown>,
    profile: Record<string, unknown>,
    userId: string,
    tosContractId: string | null,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      type: 'business',
      business_legal_name: business.legal_name,         // H07: business_legal_name
      email: (business.email as string) ?? (profile.email as string),
      tax_identification_number: business.tax_id,
      registered_address: this.buildAddress({            // H06: registered_address
        address1: business.address1 as string,
        address2: business.address2 as string | undefined,
        city: business.city as string,
        state: business.state as string | undefined,
        postal_code: business.postal_code as string | undefined,
        country: business.country as string,
      }),
    };

    // Trade name — H08: business_trade_name
    if (business.trade_name) {
      payload.business_trade_name = business.trade_name;
    }

    // Entity type — H11: map to Bridge enum
    if (business.entity_type) {
      payload.business_type = this.mapEntityType(business.entity_type as string);
    }

    // Incorporation country — H05: alpha-3
    if (business.country_of_incorporation) {
      payload.incorporation_country = this.toAlpha3(business.country_of_incorporation as string);
    }

    if (business.incorporation_date) {
      payload.incorporation_date = business.incorporation_date;
    }

    if (business.website) {
      payload.primary_website = business.website;
    }

    if (business.phone) {
      payload.phone = business.phone;
    }

    if (business.business_description) {
      payload.business_description = business.business_description;
    }

    if (business.account_purpose) {
      payload.account_purpose = business.account_purpose;
    }

    if (business.source_of_funds) {
      payload.source_of_funds = business.source_of_funds;
    }

    if (business.conducts_money_services !== undefined) {
      payload.conducts_money_services = business.conducts_money_services;
    }

    if (business.uses_bridge_for_money_services !== undefined) {
      payload.conducts_money_services_using_bridge = business.uses_bridge_for_money_services;
    }

    if (business.compliance_explanation) {
      payload.compliance_screening_explanation = business.compliance_explanation;
    }

    // P1: High-risk / enhanced due diligence fields
    if (business.estimated_annual_revenue_usd) {
      payload.estimated_annual_revenue_usd = business.estimated_annual_revenue_usd;
    }
    if (business.high_risk_activities && (business.high_risk_activities as unknown[]).length > 0) {
      payload.high_risk_activities = business.high_risk_activities;
    }

    // P2: Physical address (operational location, different from registered)
    if (business.physical_city && business.physical_country) {
      payload.physical_address = this.buildAddress({
        address1: (business.physical_address1 as string) ?? '',
        address2: business.physical_address2 as string | undefined,
        city: business.physical_city as string,
        state: business.physical_state as string | undefined,
        postal_code: business.physical_postal_code as string | undefined,
        country: business.physical_country as string,
      });
    }

    // Signed Agreement (ToS) — H01
    if (tosContractId) {
      payload.signed_agreement_id = tosContractId;
    }

    // Associated Persons (directors + UBOs) — H03
    const associatedPersons = await this.buildAssociatedPersons(business.id as string);
    if (associatedPersons.length > 0) {
      payload.associated_persons = associatedPersons;
    }

    // Documents — H04
    const documents = await this.buildDocumentsArray(userId, 'business');
    if (documents.length > 0) {
      payload.documents = documents;
    }

    return payload;
  }

  // ───────────────────────────────────────
  //  Address Builder
  // ───────────────────────────────────────

  /**
   * Construye un objeto Address compatible con Bridge API.
   * H05: country convertido a ISO alpha-3.
   * H14: state → subdivision.
   */
  private buildAddress(fields: {
    address1: string;
    address2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  }): Record<string, unknown> {
    const address: Record<string, unknown> = {
      street_line_1: fields.address1,
      city: fields.city,
      country: this.toAlpha3(fields.country),      // H05: alpha-3
    };

    if (fields.address2) address.street_line_2 = fields.address2;
    if (fields.state)    address.subdivision = fields.state;  // H14: subdivision
    if (fields.postal_code) address.postal_code = fields.postal_code;

    // Remove empty strings
    Object.keys(address).forEach((k) => {
      if (address[k] === '' || address[k] === undefined) delete address[k];
    });

    return address;
  }

  // ───────────────────────────────────────
  //  Identifying Information Builder — H02
  // ───────────────────────────────────────

  /**
   * Construye el array identifying_information[] que Bridge requiere.
   * Cada elemento tiene: type, issuing_country, number, expiration_date.
   * La imagen (image_front/image_back) se rellena posteriormente desde buildDocumentsArray.
   */
  private buildIdentifyingInformation(
    entity: Record<string, unknown>,
    issuingCountry: string,
  ): Record<string, unknown>[] {
    if (!entity.id_type || !entity.id_number) return [];

    const bridgeIdType = this.mapIdType(entity.id_type as string);
    const item: Record<string, unknown> = {
      type: bridgeIdType,
      issuing_country: this.toAlpha3(issuingCountry),
      number: entity.id_number,
    };

    if (entity.id_expiry_date) {
      item.expiration_date = entity.id_expiry_date;
    }

    return [item];
  }

  // ───────────────────────────────────────
  //  Documents Builder — H04
  // ───────────────────────────────────────

  /**
   * Lee los documentos del usuario desde la tabla `documents`,
   * descarga cada archivo de Supabase Storage, convierte a base64
   * y retorna el array en el formato que Bridge espera.
   */
  private async buildDocumentsArray(
    userId: string,
    subjectType: string,
  ): Promise<Record<string, unknown>[]> {
    const { data: docs, error } = await this.supabase
      .from('documents')
      .select('id, document_type, storage_path, mime_type')
      .eq('user_id', userId)
      .eq('subject_type', subjectType)
      .eq('status', 'pending');

    if (error || !docs || docs.length === 0) return [];

    const result: Record<string, unknown>[] = [];

    for (const doc of docs) {
      try {
        const { data: fileData, error: downloadError } = await this.supabase.storage
          .from(BridgeCustomerService.STORAGE_BUCKET)
          .download(doc.storage_path);

        if (downloadError || !fileData) {
          this.logger.warn(`No se pudo descargar documento ${doc.id}: ${downloadError?.message}`);
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const base64Content = `data:${doc.mime_type};base64,${buffer.toString('base64')}`;
        const bridgePurpose = BridgeCustomerService.DOC_TYPE_TO_BRIDGE_PURPOSE[doc.document_type] ?? 'other';

        result.push({
          purpose: bridgePurpose,
          data: base64Content,
        });
      } catch (err) {
        this.logger.warn(`Error procesando documento ${doc.id}: ${err}`);
      }
    }

    return result;
  }

  // ───────────────────────────────────────
  //  Associated Persons Builder — H03
  // ───────────────────────────────────────

  /**
   * Lee directores y UBOs desde la BD y construye el array
   * associated_persons[] que Bridge requiere para KYB.
   * H12: has_control y has_ownership son inferidos de las tablas.
   */
  private async buildAssociatedPersons(
    businessId: string,
  ): Promise<Record<string, unknown>[]> {
    const persons: Record<string, unknown>[] = [];

    // Directores
    const { data: directors } = await this.supabase
      .from('business_directors')
      .select('*')
      .eq('business_id', businessId);

    if (directors) {
      for (const dir of directors) {
        const person: Record<string, unknown> = {
          first_name: dir.first_name,
          last_name: dir.last_name,
          has_control: true,   // H12: director implica control
          has_ownership: false,
          is_signer: dir.is_signer ?? false,
          is_director: true,
        };

        if (dir.email)    person.email    = dir.email;
        if (dir.phone)    person.phone    = dir.phone;
        if (dir.date_of_birth) person.birth_date = dir.date_of_birth;
        if (dir.position) person.title    = dir.position;  // position → title

        if (dir.nationality) {
          person.nationality = this.toAlpha3(dir.nationality as string);
        }

        if (dir.address1 || dir.city || dir.country) {
          person.residential_address = this.buildAddress({
            address1: dir.address1 as string ?? '',
            city: dir.city as string ?? '',
            country: dir.country as string ?? '',
          });
        }

        // Identifying information
        const idInfo = this.buildIdentifyingInformation(dir, dir.country as string ?? '');
        if (idInfo.length > 0) person.identifying_information = idInfo;

        persons.push(person);
      }
    }

    // UBOs
    const { data: ubos } = await this.supabase
      .from('business_ubos')
      .select('*')
      .eq('business_id', businessId);

    if (ubos) {
      for (const ubo of ubos) {
        const person: Record<string, unknown> = {
          first_name: ubo.first_name,
          last_name: ubo.last_name,
          has_ownership: true,                         // H12: UBO implica ownership
          has_control:   false,
          is_signer:     false,
        };

        if (ubo.ownership_percent !== undefined) {
          person.ownership_percentage = ubo.ownership_percent;  // ownership_percent → ownership_percentage
        }

        if (ubo.email)    person.email    = ubo.email;
        if (ubo.phone)    person.phone    = ubo.phone;
        if (ubo.date_of_birth) person.birth_date = ubo.date_of_birth;

        if (ubo.nationality) {
          person.nationality = this.toAlpha3(ubo.nationality as string);
        }

        if (ubo.address1 || ubo.city || ubo.country) {
          person.residential_address = this.buildAddress({
            address1: ubo.address1 as string ?? '',
            address2: ubo.address2 as string | undefined,
            city: ubo.city as string ?? '',
            state: ubo.state as string | undefined,
            postal_code: ubo.postal_code as string | undefined,
            country: ubo.country as string ?? '',
          });
        }

        // Identifying information
        const idInfo = this.buildIdentifyingInformation(ubo, ubo.country as string ?? '');
        if (idInfo.length > 0) person.identifying_information = idInfo;

        persons.push(person);
      }
    }

    return persons;
  }

  // ───────────────────────────────────────
  //  Value Converters
  // ───────────────────────────────────────

  /**
   * Convierte código ISO alpha-2 a alpha-3.
   * Si ya es alpha-3 (3 chars) o no se encuentra en el mapa, lo retorna tal cual.
   */
  private toAlpha3(code: string): string {
    if (!code) return code;
    const upper = code.toUpperCase().trim();
    if (upper.length === 3) return upper; // Ya es alpha-3
    return BridgeCustomerService.ALPHA2_TO_ALPHA3[upper] ?? upper;
  }

  /** Mapea entity_type interno al enum business_type de Bridge. */
  private mapEntityType(entityType: string): string {
    return BridgeCustomerService.ENTITY_TYPE_TO_BRIDGE[entityType] ?? 'other';
  }

  /** Mapea id_type interno al tipo de documento que Bridge acepta. */
  private mapIdType(idType: string): string {
    const map: Record<string, string> = {
      passport:        'passport',
      drivers_license: 'drivers_license',
      national_id:     'national_id',
    };
    return map[idType] ?? idType;
  }

  // ───────────────────────────────────────
  //  Wallet Initialization
  // ───────────────────────────────────────

  private async initializeWallet(userId: string) {
    try {
      const { data: existingWallet } = await this.supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingWallet) return;

      const { data: wallet } = await this.supabase
        .from('wallets')
        .insert({
          user_id: userId,
          label: 'Principal',
          currency: 'usd',
        })
        .select('id')
        .single();

      if (wallet) {
        await this.supabase.from('balances').insert({
          user_id: userId,
          currency: 'usd',
          amount: 0,
          available_amount: 0,
          reserved_amount: 0,
        });
      }
    } catch (err) {
      this.logger.warn(`Error inicializando wallet para ${userId}: ${err}`);
    }
  }

  // ───────────────────────────────────────
  //  Logging
  // ───────────────────────────────────────

  private async logActivity(
    userId: string,
    action: string,
    description: string,
  ) {
    await this.supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      description,
    });
  }
}
