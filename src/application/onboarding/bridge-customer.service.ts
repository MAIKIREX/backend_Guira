import {
  Injectable,
  Inject,
  BadGatewayException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';

/**
 * Servicio interno para registrar clientes en Bridge API tras la aprobación de KYC/KYB.
 * Este servicio NO se expone directamente a clientes — es llamado por el WorkerService
 * o por un admin tras aprobar un compliance_review.
 */
@Injectable()
export class BridgeCustomerService {
  private readonly logger = new Logger(BridgeCustomerService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  private get bridgeBaseUrl(): string {
    return this.config.get<string>('app.bridgeApiUrl') ?? 'https://api.bridge.xyz';
  }

  private get bridgeHeaders(): Record<string, string> {
    const apiKey = this.config.get<string>('app.bridgeApiKey');
    return {
      'Content-Type': 'application/json',
      'Api-Key': apiKey ?? '',
    };
  }

  /**
   * Registra un usuario como Customer en Bridge API.
   * Construye el payload desde people (KYC) o businesses (KYB).
   * Retorna el bridge_customer_id asignado.
   */
  async registerCustomerInBridge(userId: string): Promise<string> {
    const apiKey = this.config.get<string>('app.bridgeApiKey');
    if (!apiKey) {
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
      customerPayload = await this.buildBusinessPayload(business, profile);
    } else {
      throw new NotFoundException(
        'No se encontraron datos personales ni de empresa para este usuario',
      );
    }

    // 3. Llamar Bridge API
    let bridgeCustomer: Record<string, unknown>;
    try {
      const response = await fetch(`${this.bridgeBaseUrl}/v0/customers`, {
        method: 'POST',
        headers: {
          ...this.bridgeHeaders,
          'Idempotency-Key': `register-customer-${userId}`,
        },
        body: JSON.stringify(customerPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        await this.logActivity(
          userId,
          'BRIDGE_CUSTOMER_REGISTRATION_FAILED',
          `Bridge rechazó: HTTP ${response.status} — ${errorBody}`,
        );
        throw new BadGatewayException(
          `Bridge API rechazó customer: [${response.status}] ${errorBody}`,
        );
      }

      bridgeCustomer = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(
        `Error conectando con Bridge API: ${(err as Error).message}`,
      );
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
      `Customer registrado: ${customerId}`,
    );

    this.logger.log(
      `Bridge customer ${customerId} creado para usuario ${userId}`,
    );

    return customerId;
  }

  // ───────────────────────────────────────

  private buildIndividualPayload(
    person: Record<string, unknown>,
    profile: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      type: 'individual',
      first_name: person.first_name,
      last_name: person.last_name,
      email: (person.email as string) ?? (profile.email as string),
      date_of_birth: person.date_of_birth,
      address: {
        street: person.address1,
        city: person.city,
        state: person.state ?? '',
        postal_code: person.postal_code ?? '',
        country: person.country,
      },
    };
  }

  private async buildBusinessPayload(
    business: Record<string, unknown>,
    profile: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Obtener directores y UBOs para el payload
    const { data: directors } = await this.supabase
      .from('business_directors')
      .select('*')
      .eq('business_id', business.id);

    return {
      type: 'business',
      name: business.legal_name,
      email: (business.email as string) ?? (profile.email as string),
      tax_identification_number: business.tax_id,
      address: {
        street: business.address1,
        city: business.city,
        state: business.state ?? '',
        postal_code: business.postal_code ?? '',
        country: business.country,
      },
      representatives: (directors ?? []).map((d) => ({
        first_name: d.first_name,
        last_name: d.last_name,
        title: d.position,
      })),
    };
  }

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
          status: 'active',
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
