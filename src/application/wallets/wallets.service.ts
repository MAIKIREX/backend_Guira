import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';

@Injectable()
export class WalletsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /** Lista todas las wallets del usuario */
  async findAllByUser(userId: string) {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Obtiene balances del usuario (todas las monedas) */
  async getBalances(userId: string) {
    const { data, error } = await this.supabase
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .order('currency', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Historial de ledger (transacciones inmutables) */
  async getLedger(userId: string, limit = 50, offset = 0) {
    const { data, error, count } = await this.supabase
      .from('ledger_entries')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { entries: data ?? [], total: count ?? 0 };
  }

  /** Obtiene las rutas de pago disponibles (payin_routes) del usuario */
  async getPayinRoutes(userId: string) {
    const { data, error } = await this.supabase
      .from('payin_routes')
      .select(`
        *,
        bridge_virtual_accounts (
          id, va_id, currency, status, bank_name, account_number, routing_number
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Obtiene una wallet específica por id, verificando que pertenece al usuario */
  async findOne(walletId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Wallet no encontrada');
    return data;
  }
}
