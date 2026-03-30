import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Registra un nuevo usuario en Supabase Auth.
   * El trigger `handle_new_user` crea automáticamente el perfil en `profiles`.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Verificar si el email ya existe
    const { data: existingUsers } =
      await this.supabase.auth.admin.listUsers();

    const users = (existingUsers as { users?: { email?: string }[] })?.users ?? [];
    const emailExists = users.some(
      (u) => u.email?.toLowerCase() === dto.email.toLowerCase(),
    );

    if (emailExists) {
      throw new ConflictException('Ya existe una cuenta con este email');
    }

    // Crear usuario en Supabase Auth
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true, // Auto-confirmar para flujo del backend
      user_metadata: {
        full_name: dto.full_name,
      },
    });

    if (error) {
      this.logger.error(`Error creando usuario: ${error.message}`);
      throw new ConflictException(
        error.message ?? 'Error al crear la cuenta',
      );
    }

    // Actualizar full_name en profiles (el trigger solo inserta email y role)
    await this.supabase
      .from('profiles')
      .update({ full_name: dto.full_name })
      .eq('id', data.user.id);

    // Generar tokens para el usuario recién creado
    const { data: session, error: signInError } =
      await this.supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: dto.email,
      });

    // Si no podemos generar sesión, retornamos sin tokens
    // El usuario podrá hacer login después
    if (signInError || !session) {
      this.logger.warn(
        `Usuario creado pero no se pudo generar sesión: ${signInError?.message}`,
      );
      return {
        user_id: data.user.id,
        email: data.user.email ?? dto.email,
        access_token: '',
        refresh_token: '',
        expires_in: 0,
        onboarding_status: 'pending',
      };
    }

    return {
      user_id: data.user.id,
      email: data.user.email ?? dto.email,
      access_token: '', // El frontend usará signInWithPassword para obtener tokens
      refresh_token: '',
      expires_in: 0,
      onboarding_status: 'pending',
    };
  }

  /**
   * Retorna el perfil completo del usuario autenticado.
   */
  async getMe(userId: string): Promise<MeResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(
        'id, email, full_name, role, onboarding_status, bridge_customer_id, is_active, is_frozen, phone, avatar_url, daily_limit_usd, monthly_limit_usd, created_at',
      )
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Perfil no encontrado');
    }

    return data as MeResponseDto;
  }

  /**
   * Renueva la sesión usando un refresh token.
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(
        'Refresh token inválido o expirado. Inicia sesión nuevamente.',
      );
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
    };
  }

  /**
   * Invalida la sesión del usuario (cierra sesión en Supabase Auth).
   */
  async logout(userId: string): Promise<{ message: string }> {
    const { error } = await this.supabase.auth.admin.signOut(userId);

    if (error) {
      this.logger.warn(
        `Error cerrando sesión para ${userId}: ${error.message}`,
      );
      // No lanzamos error — el token ya podría estar expirado
    }

    return { message: 'Sesión cerrada exitosamente' };
  }
}
