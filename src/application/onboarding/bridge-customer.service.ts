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
 */
@Injectable()
export class BridgeCustomerService {
  private readonly logger = new Logger(BridgeCustomerService.name);

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
      customerPayload = this.buildIndividualPayload(person, profile);
    } else if (business) {
      customerPayload = this.buildBusinessPayload(business, profile);
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
   * @see https://apidocs.bridge.xyz/reference/post_customers
   */
  private buildIndividualPayload(
    person: Record<string, unknown>,
    profile: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type: 'individual',
      first_name: person.first_name,
      last_name: person.last_name,
      email: (person.email as string) ?? (profile.email as string),
      date_of_birth: person.date_of_birth,
      phone: person.phone ?? null,
      address: {
        street_line_1: person.address1,
        street_line_2: person.address2 ?? undefined,
        city: person.city,
        state: person.state ?? undefined,
        postal_code: person.postal_code ?? undefined,
        country: person.country,
      },
    };

    // Tax ID (SSN para US, RFC para MX, etc.) — opcional según país
    if (person.tax_id) {
      payload.tax_identification_number = person.tax_id;
    }

    // Limpiar undefined del address para no enviar campos vacíos
    const address = payload.address as Record<string, unknown>;
    Object.keys(address).forEach((key) => {
      if (address[key] === undefined || address[key] === '') {
        delete address[key];
      }
    });

    return payload;
  }

  /**
   * Construye el payload para un customer business (KYB).
   * Campos alineados con Bridge API POST /v0/customers.
   *
   * NOTA: Los directores/UBOs no se envían en el customer payload.
   * Bridge los gestiona por separado vía endorsements o KYC Links.
   */
  private buildBusinessPayload(
    business: Record<string, unknown>,
    profile: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type: 'business',
      business_name: business.legal_name,
      email: (business.email as string) ?? (profile.email as string),
      phone: business.phone ?? null,
      tax_identification_number: business.tax_id,
      address: {
        street_line_1: business.address1,
        street_line_2: business.address2 ?? undefined,
        city: business.city,
        state: business.state ?? undefined,
        postal_code: business.postal_code ?? undefined,
        country: business.country,
      },
    };

    // Campos opcionales pero recomendados para KYB approval
    if (business.trade_name) {
      payload.doing_business_as_name = business.trade_name;
    }
    if (business.entity_type) {
      payload.entity_type = business.entity_type;
    }
    if (business.country_of_incorporation) {
      payload.incorporation_country = business.country_of_incorporation;
    }
    if (business.incorporation_date) {
      payload.incorporation_date = business.incorporation_date;
    }
    if (business.website) {
      payload.website = business.website;
    }

    // Limpiar undefined del address para no enviar campos vacíos
    const address = payload.address as Record<string, unknown>;
    Object.keys(address).forEach((key) => {
      if (address[key] === undefined || address[key] === '') {
        delete address[key];
      }
    });

    return payload;
  }

  // ───────────────────────────────────────
  //  Wallet Initialization
  // ───────────────────────────────────────

  private async initializeWallet(userId: string) {
    try {
      // Crear wallet si no existe
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
        // Crear balance inicial en USD
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
